//! Browser engine: wraps `rigmy_core::Catalog` for the Next.js client.
//!
//! Construct once from the `/api/bootstrap` JSON text, then call the methods. All values are
//! returned as plain JS objects/arrays (maps become objects) matching `web/src/lib/types.ts`.

use std::collections::{BTreeMap, HashMap};

use rigmy_core::{self as core, Catalog, Eta, LatLon, RegionId};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[wasm_bindgen(typescript_custom_section)]
const TS_IMPORTS: &'static str = r#"
import type { Build, Check, Choice, Eta, EtaDef, Offer, OpenState, Plan, Power, RegionId, SlotSwaps, UserLoc } from '../lib/types';
export interface NearbyBranch { branchId: string; km: number }
export interface LatLon { lat: number; lon: number }
"#;

fn to_js<T: Serialize + ?Sized>(v: &T) -> Result<JsValue, JsError> {
    v.serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .map_err(|e| JsError::new(&e.to_string()))
}

fn from_js<T: for<'de> Deserialize<'de>>(v: JsValue, what: &str) -> Result<T, JsError> {
    serde_wasm_bindgen::from_value(v).map_err(|e| JsError::new(&format!("invalid {what}: {e}")))
}

fn region(r: &str) -> Result<RegionId, JsError> {
    RegionId::from_str(r).ok_or_else(|| JsError::new(&format!("unknown region '{r}'")))
}

fn eta(e: &str) -> Result<Eta, JsError> {
    Eta::from_str(e).ok_or_else(|| JsError::new(&format!("unknown eta '{e}'")))
}

fn build(v: JsValue) -> Result<core::Build, JsError> {
    if v.is_null() || v.is_undefined() {
        return Ok(core::Build::new());
    }
    let m: BTreeMap<String, Option<String>> = from_js(v, "build")?;
    Ok(core::build_from_map(&m))
}

#[derive(Deserialize)]
struct EtaOnly {
    #[serde(default)]
    eta: Option<Eta>,
}

#[wasm_bindgen]
pub struct Engine {
    cat: Catalog,
}

#[wasm_bindgen]
impl Engine {
    /// `new Engine(JSON.stringify(bootstrap))`. Throws on invalid JSON or invalid `content`
    /// (for example an ETA table that does not list every label exactly once).
    #[wasm_bindgen(constructor)]
    pub fn new(
        #[wasm_bindgen(js_name = bootstrapJson)] bootstrap_json: &str,
    ) -> Result<Engine, JsError> {
        let cat = Catalog::from_json(bootstrap_json)
            .map_err(|e| JsError::new(&format!("invalid bootstrap: {e}")))?;
        Ok(Engine { cat })
    }

    /// All listings for a product resolved for a delivery region, in retailer order.
    #[wasm_bindgen(unchecked_return_type = "Offer[]")]
    pub fn offers(
        &self,
        #[wasm_bindgen(js_name = productId)] product_id: &str,
        #[wasm_bindgen(js_name = region, unchecked_param_type = "RegionId")] region_id: &str,
    ) -> Result<JsValue, JsError> {
        to_js(&self.cat.offers(product_id, region(region_id)?))
    }

    /// Cheapest available offer, or `null`.
    #[wasm_bindgen(unchecked_return_type = "Offer | null")]
    pub fn lowest(
        &self,
        #[wasm_bindgen(js_name = productId)] product_id: &str,
        #[wasm_bindgen(js_name = region, unchecked_param_type = "RegionId")] region_id: &str,
    ) -> Result<JsValue, JsError> {
        to_js(&self.cat.lowest(product_id, region(region_id)?))
    }

    /// Compatibility checks. `region` (default 'kv') prices the suggested fixes.
    #[wasm_bindgen(unchecked_return_type = "Check[]")]
    pub fn compat(
        &self,
        #[wasm_bindgen(js_name = build, unchecked_param_type = "Build")] build_: JsValue,
        #[wasm_bindgen(js_name = region, unchecked_param_type = "RegionId")] region_id: Option<
            String,
        >,
    ) -> Result<JsValue, JsError> {
        let r = region(region_id.as_deref().unwrap_or("kv"))?;
        to_js(&self.cat.compat(&build(build_)?, r))
    }

    #[wasm_bindgen(unchecked_return_type = "Power")]
    pub fn power(
        &self,
        #[wasm_bindgen(js_name = build, unchecked_param_type = "Build")] build_: JsValue,
    ) -> Result<JsValue, JsError> {
        to_js(&self.cat.power(&build(build_)?))
    }

    /// Purchase plan. `picks` maps productId -> retailerId for the custom strategy.
    #[wasm_bindgen(unchecked_return_type = "Plan")]
    pub fn plan(
        &self,
        #[wasm_bindgen(js_name = build, unchecked_param_type = "Build")] build_: JsValue,
        #[wasm_bindgen(js_name = region, unchecked_param_type = "RegionId")] region_id: &str,
        #[wasm_bindgen(unchecked_param_type = "Record<string, string>")] picks: Option<JsValue>,
    ) -> Result<JsValue, JsError> {
        let picks: HashMap<String, String> =
            match picks.filter(|p| !p.is_null() && !p.is_undefined()) {
                None => HashMap::new(),
                Some(picks) => {
                    let m: HashMap<String, Option<String>> = from_js(picks, "picks")?;
                    m.into_iter().filter_map(|(k, v)| Some((k, v?))).collect()
                }
            };
        to_js(&self.cat.plan(&build(build_)?, region(region_id)?, &picks))
    }

    /// Swap/upgrade suggestions: for each filled slot, the other catalogue parts in the same
    /// category that keep the build free of compatibility errors, with their lowest regional
    /// price (priced ascending, unpriced last). Not a quality ranking.
    #[wasm_bindgen(unchecked_return_type = "SlotSwaps[]")]
    pub fn swaps(
        &self,
        #[wasm_bindgen(js_name = build, unchecked_param_type = "Build")] build_: JsValue,
        #[wasm_bindgen(js_name = region, unchecked_param_type = "RegionId")] region_id: &str,
    ) -> Result<JsValue, JsError> {
        to_js(&self.cat.swaps(&build(build_)?, region(region_id)?))
    }

    /// Slowest ETA among the chosen offers, ranked by `content.etas` (the fastest ETA when empty).
    #[wasm_bindgen(js_name = maxEta, unchecked_return_type = "Eta")]
    pub fn max_eta(
        &self,
        #[wasm_bindgen(unchecked_param_type = "Choice")] choice: JsValue,
    ) -> Result<JsValue, JsError> {
        let m: HashMap<String, Option<EtaOnly>> = from_js(choice, "choice")?;
        to_js(
            &self
                .cat
                .etas()
                .max_of(m.into_values().flatten().filter_map(|o| o.eta)),
        )
    }

    /// The delivery-time table from `content.etas`, fastest first.
    #[wasm_bindgen(unchecked_return_type = "EtaDef[]")]
    pub fn etas(&self) -> Result<JsValue, JsError> {
        to_js(self.cat.etas().defs())
    }

    /// Speed rank of an ETA (0 = fastest). Throws on an unknown label.
    #[wasm_bindgen(js_name = etaRank)]
    pub fn eta_rank(
        &self,
        #[wasm_bindgen(js_name = eta, unchecked_param_type = "Eta")] e: &str,
    ) -> Result<u32, JsError> {
        Ok(self.cat.etas().rank(eta(e)?))
    }

    /// Worst-case working days for an ETA. Throws on an unknown label.
    #[wasm_bindgen(js_name = etaDays)]
    pub fn eta_days(
        &self,
        #[wasm_bindgen(js_name = eta, unchecked_param_type = "Eta")] e: &str,
    ) -> Result<u32, JsError> {
        Ok(self.cat.etas().days(eta(e)?))
    }

    /// Tracking link for a courier from `content.couriers`, or `undefined` when the courier is unknown
    /// or has no `trackingUrl`. The tracking number is URL-encoded.
    #[wasm_bindgen(js_name = trackingUrl)]
    pub fn tracking_url(&self, courier: &str, tracking: &str) -> Option<String> {
        let t = tracking.trim();
        if t.is_empty() {
            return None;
        }
        self.cat.data.content.courier(courier)?.tracking_link(t)
    }

    #[wasm_bindgen(js_name = regionOf, unchecked_return_type = "RegionId")]
    pub fn region_of(&self, lat: f64, lon: f64) -> String {
        core::region_of(lat, lon).as_str().to_string()
    }

    /// 5-digit Malaysian postcode -> approximate location from `bootstrap.postcodes`, or `null`.
    #[wasm_bindgen(unchecked_return_type = "UserLoc | null")]
    pub fn postcode(&self, pc: &str) -> Result<JsValue, JsError> {
        to_js(&self.cat.postcode(pc))
    }

    /// Haversine distance in km between two `{lat, lon}` objects.
    pub fn dist(
        &self,
        #[wasm_bindgen(unchecked_param_type = "LatLon")] a: JsValue,
        #[wasm_bindgen(unchecked_param_type = "LatLon")] b: JsValue,
    ) -> Result<f64, JsError> {
        let a: LatLon = from_js(a, "point a")?;
        let b: LatLon = from_js(b, "point b")?;
        Ok(core::dist(a, b))
    }

    #[wasm_bindgen(js_name = fmtKm)]
    pub fn fmt_km(&self, km: f64) -> String {
        core::fmt_km(km)
    }

    /// Opening state of a branch at `nowMs` (Malaysia time). Unknown branch -> "Hours not listed".
    #[wasm_bindgen(js_name = openState, unchecked_return_type = "OpenState")]
    pub fn open_state(
        &self,
        #[wasm_bindgen(js_name = branchId)] branch_id: &str,
        #[wasm_bindgen(js_name = nowMs)] now_ms: f64,
    ) -> Result<JsValue, JsError> {
        let hours = self.cat.branch(branch_id).and_then(|b| b.hours.as_ref());
        to_js(&core::open_state(hours, now_ms as i64))
    }

    /// All branches sorted by distance from `loc`.
    #[wasm_bindgen(unchecked_return_type = "NearbyBranch[]")]
    pub fn nearby(
        &self,
        #[wasm_bindgen(unchecked_param_type = "LatLon")] loc: JsValue,
    ) -> Result<JsValue, JsError> {
        let loc: LatLon = from_js(loc, "location")?;
        to_js(&core::nearby(&self.cat.data.branches, loc))
    }
}

/// Native tests for the methods whose arguments and results are plain Rust values. Methods that
/// return `JsValue` delegate to `rigmy_core` functions tested there.
#[cfg(test)]
mod tests {
    use super::*;

    fn engine() -> Engine {
        let cfg = concat!(env!("CARGO_MANIFEST_DIR"), "/../../config/");
        let catalog = std::fs::read_to_string(format!("{cfg}catalog.json")).unwrap();
        let content = std::fs::read_to_string(format!("{cfg}content.toml")).unwrap();
        let mut b: serde_json::Value = serde_json::from_str(&catalog).unwrap();
        let content: core::ContentFile = toml::from_str(&content).unwrap();
        b["content"] = serde_json::to_value(content.into_content()).unwrap();
        let pcs = std::fs::read_to_string(format!("{cfg}postcodes.toml")).unwrap();
        let pcs: core::PostcodesFile = toml::from_str(&pcs).unwrap();
        b["postcodes"] = serde_json::to_value(pcs.postcode).unwrap();
        Engine::new(&b.to_string()).unwrap_or_else(|_| panic!("bootstrap rejected"))
    }

    #[test]
    fn eta_rank_and_days_follow_the_content_table() {
        let e = engine();
        let table: Vec<(u32, u32)> = Eta::ALL
            .iter()
            .map(|x| {
                let r = e.eta_rank(x.as_str()).unwrap_or_else(|_| unreachable!());
                let d = e.eta_days(x.as_str()).unwrap_or_else(|_| unreachable!());
                (r, d)
            })
            .collect();
        assert_eq!(table, [(0, 0), (1, 1), (2, 2), (3, 3), (4, 5), (5, 7)]);
        assert_eq!(e.cat.etas().defs().len(), 6);
    }

    #[test]
    fn tracking_url_needs_a_template() {
        let mut e = engine();
        assert_eq!(e.tracking_url("Pos Laju", "EE123"), None);
        assert_eq!(e.tracking_url("Nobody", "EE123"), None);
        e.cat.data.content.couriers[0].tracking_url =
            Some("https://t.example/q?no={tracking}".into());
        assert_eq!(
            e.tracking_url("Pos Laju", " EE 1/2 ").as_deref(),
            Some("https://t.example/q?no=EE%201%2F2")
        );
        assert_eq!(e.tracking_url("Pos Laju", "  "), None);
    }
}
