//! Store locations from OpenStreetMap via the Overpass API.

use rigmy_core::{Branch, BranchSource};
use serde_json::Value;

use crate::config::RetailerConf;
use crate::hours::parse_opening_hours;

/// Server-side Overpass timeout in seconds (the whole of Malaysia is a large area).
pub const OVERPASS_TIMEOUT_S: u32 = 180;

/// Overpass QL: computer / electronics shops in Malaysia, with centre points for ways/relations.
pub fn overpass_query() -> String {
    format!(
        r#"[out:json][timeout:{OVERPASS_TIMEOUT_S}];
area["ISO3166-1"="MY"][admin_level=2]->.my;
nwr["shop"~"^(computer|electronics)$"](area.my);
out center tags;"#
    )
}

fn tag<'a>(tags: &'a Value, k: &str) -> Option<&'a str> {
    tags.get(k)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

fn address(tags: &Value) -> String {
    if let Some(full) = tag(tags, "addr:full") {
        return full.to_string();
    }
    let street = [
        tag(tags, "addr:unit"),
        tag(tags, "addr:housenumber"),
        tag(tags, "addr:street"),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join(" ");
    let place = [tag(tags, "addr:postcode"), tag(tags, "addr:city")]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join(" ");
    [
        street.as_str(),
        tag(tags, "addr:place").unwrap_or(""),
        place.as_str(),
    ]
    .into_iter()
    .filter(|s| !s.is_empty())
    .collect::<Vec<_>>()
    .join(", ")
}

/// First retailer whose `osm_match` pattern occurs in the element's name / brand / operator.
fn match_retailer<'a>(tags: &Value, retailers: &'a [RetailerConf]) -> Option<&'a RetailerConf> {
    let hay: Vec<String> = ["name", "brand", "operator", "name:en"]
        .iter()
        .filter_map(|k| tag(tags, k))
        .map(str::to_lowercase)
        .collect();
    retailers.iter().filter(|r| r.enabled).find(|r| {
        r.osm_match
            .iter()
            .map(|p| p.trim().to_lowercase())
            .filter(|p| !p.is_empty())
            .any(|p| hay.iter().any(|h| h.contains(&p)))
    })
}

/// Convert an Overpass JSON response into branches for the configured retailers.
pub fn branches_from_overpass(
    body: &str,
    retailers: &[RetailerConf],
) -> anyhow::Result<Vec<Branch>> {
    let v: Value = serde_json::from_str(body)?;
    let elements = v
        .get("elements")
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow::anyhow!("no elements in Overpass response"))?;
    let mut out = vec![];
    for e in elements {
        let Some(tags) = e.get("tags") else { continue };
        let Some(r) = match_retailer(tags, retailers) else {
            continue;
        };
        let (lat, lon) = match (
            e.get("lat").and_then(Value::as_f64),
            e.get("lon").and_then(Value::as_f64),
        ) {
            (Some(a), Some(b)) => (a, b),
            _ => match (
                e.pointer("/center/lat").and_then(Value::as_f64),
                e.pointer("/center/lon").and_then(Value::as_f64),
            ) {
                (Some(a), Some(b)) => (a, b),
                _ => continue,
            },
        };
        let kind = e.get("type").and_then(Value::as_str).unwrap_or("node");
        let id = e.get("id").and_then(Value::as_i64).unwrap_or_default();
        let raw_hours = tag(tags, "opening_hours").map(str::to_string);
        let name = tag(tags, "branch")
            .map(str::to_string)
            .or_else(|| tag(tags, "name").map(str::to_string))
            .unwrap_or_else(|| r.name.clone());
        out.push(Branch {
            id: format!("osm-{kind}-{id}"),
            retailer_id: r.id.clone(),
            name,
            addr: address(tags),
            lat,
            lon,
            phone: tag(tags, "phone")
                .or_else(|| tag(tags, "contact:phone"))
                .map(str::to_string),
            hours: raw_hours.as_deref().and_then(parse_opening_hours),
            hours_raw: raw_hours,
            services: vec![],
            source: BranchSource::Osm,
        });
    }
    Ok(out)
}
