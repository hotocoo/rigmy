//! Geography: regions, postcodes, distance, store opening state.

use serde::{Deserialize, Serialize};

use crate::content::ContentError;
use crate::time::{myt_hour, myt_weekday};
use crate::types::*;

/// East of this longitude is Borneo (Sabah & Sarawak).
pub const EAST_MY_MIN_LON: f64 = 109.0;
/// North of this latitude on the peninsula is served from Penang (northern states).
pub const NORTH_MIN_LAT: f64 = 3.9;
/// South of this latitude on the peninsula is served from Johor (southern states).
pub const SOUTH_MAX_LAT: f64 = 2.6;

/// Coarse delivery region for a coordinate: Borneo by longitude, then the peninsula in three
/// latitude bands (north / central / south) using the constants above.
pub fn region_of(lat: f64, lon: f64) -> RegionId {
    if lon > EAST_MY_MIN_LON {
        RegionId::East
    } else if lat > NORTH_MIN_LAT {
        RegionId::Pen
    } else if lat < SOUTH_MAX_LAT {
        RegionId::Jhr
    } else {
        RegionId::Kv
    }
}

/// Accuracy radius in metres reported for a postcode location (the town centre of a 2-digit
/// postcode area, so only roughly right).
pub const POSTCODE_ACC_M: f64 = 3000.0;
/// `OpenState.closing` is set when a branch closes within this many hours.
pub const CLOSING_SOON_H: f64 = 1.0;

/// `config/postcodes.toml`.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PostcodesFile {
    pub postcode: Vec<Postcode>,
}

/// Check the postcode table: non-empty, 2-digit unique prefixes, a town name and valid coordinates.
pub fn validate_postcodes(table: &[Postcode]) -> Result<(), ContentError> {
    let err = |m: String| Err(ContentError(m));
    if table.is_empty() {
        return err("postcodes: the table is empty".into());
    }
    let mut seen = std::collections::HashSet::new();
    for p in table {
        if p.prefix.len() != 2 || !p.prefix.chars().all(|c| c.is_ascii_digit()) {
            return err(format!(
                "postcodes: prefix '{}' must be exactly 2 digits",
                p.prefix
            ));
        }
        if !seen.insert(p.prefix.as_str()) {
            return err(format!("postcodes: prefix '{}' is listed twice", p.prefix));
        }
        if p.town.trim().is_empty() {
            return err(format!("postcodes: prefix '{}' needs a town", p.prefix));
        }
        if !(p.lat.is_finite() && (-90.0..=90.0).contains(&p.lat))
            || !(p.lon.is_finite() && (-180.0..=180.0).contains(&p.lon))
        {
            return err(format!(
                "postcodes: prefix '{}' has invalid coordinates ({}, {})",
                p.prefix, p.lat, p.lon
            ));
        }
    }
    Ok(())
}

/// Look up a 5-digit Malaysian postcode (non-digits ignored) in `table` by its 2-digit prefix.
pub fn postcode(table: &[Postcode], pc: &str) -> Option<UserLoc> {
    let pc: String = pc.chars().filter(|c| c.is_ascii_digit()).collect();
    if pc.len() != 5 {
        return None;
    }
    let e = table.iter().find(|e| e.prefix == pc[..2])?;
    Some(UserLoc {
        lat: e.lat,
        lon: e.lon,
        label: e.town.clone(),
        source: LocSource::Postcode,
        acc: POSTCODE_ACC_M,
        postcode: Some(pc),
        city: Some(e.town.clone()),
        road: None,
        region: Some(region_of(e.lat, e.lon)),
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct LatLon {
    pub lat: f64,
    pub lon: f64,
}

/// Great-circle (haversine) distance in km.
pub fn dist(a: LatLon, b: LatLon) -> f64 {
    let r = 6371.0;
    let t = std::f64::consts::PI / 180.0;
    let (dla, dlo) = ((b.lat - a.lat) * t, (b.lon - a.lon) * t);
    let x = (dla / 2.0).sin().powi(2)
        + (a.lat * t).cos() * (b.lat * t).cos() * (dlo / 2.0).sin().powi(2);
    2.0 * r * x.sqrt().asin()
}

fn group_thousands(n: i64) -> String {
    let s = n.abs().to_string();
    let mut out = String::new();
    for (i, ch) in s.chars().enumerate() {
        if i > 0 && (s.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(ch);
    }
    if n < 0 {
        format!("-{out}")
    } else {
        out
    }
}

/// "850 m", "4.2 km", "1,234 km".
pub fn fmt_km(k: f64) -> String {
    if k < 1.0 {
        format!("{} m", (k * 1000.0).round() as i64)
    } else if k < 20.0 {
        format!("{:.1} km", k)
    } else {
        format!("{} km", group_thousands(k.round() as i64))
    }
}

/// 12-hour label: 10 -> "10 am", 21.5 -> "9:30 pm", 24 -> "12 am", 26 -> "2 am".
pub fn h12(x: f64) -> String {
    let x = if x > 24.0 { x - 24.0 } else { x };
    let mut h = x.floor() as i64;
    let mut m = ((x - x.floor()) * 60.0).round() as i64;
    if m == 60 {
        h += 1;
        m = 0;
    }
    let disp = if h % 12 == 0 { 12 } else { h % 12 };
    let suffix = if h < 12 || h == 24 { "am" } else { "pm" };
    if m == 0 {
        format!("{disp} {suffix}")
    } else {
        format!("{disp}:{m:02} {suffix}")
    }
}

const DAY_NAMES: [&str; 7] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/// Open/closed state at `now_ms`, evaluated in Malaysia time (UTC+8).
pub fn open_state(hours: Option<&WeekHours>, now_ms: i64) -> OpenState {
    let Some(h) = hours.filter(|h| h.week.len() == 7) else {
        return OpenState {
            open: false,
            text: "Hours not listed".into(),
            closing: None,
            unknown: Some(true),
        };
    };
    let dow = myt_weekday(now_ms);
    let hr = myt_hour(now_ms);
    let day = |i: usize| h.week[i % 7];
    let open_until = |close: f64, hr: f64| OpenState {
        open: true,
        text: format!("Open until {}", h12(close)),
        closing: Some(close - hr < CLOSING_SOON_H),
        unknown: None,
    };

    // Yesterday's hours running past midnight.
    if let Some([_, c]) = day(dow + 6) {
        if c > 24.0 && hr < c - 24.0 {
            return open_until(c - 24.0, hr);
        }
    }
    let today = day(dow);
    if let Some([o, c]) = today {
        if o <= 0.0 && c >= 24.0 {
            // Continues into tomorrow without a break -> round the clock.
            if matches!(day(dow + 1), Some([no, _]) if no <= 0.0) {
                return OpenState {
                    open: true,
                    text: "Open 24 hours".into(),
                    closing: Some(false),
                    unknown: None,
                };
            }
            return open_until(24.0, hr);
        }
        if hr >= o && hr < c {
            return open_until(c, hr);
        }
        if hr < o {
            return OpenState {
                open: false,
                text: format!("Opens {}", h12(o)),
                closing: None,
                unknown: None,
            };
        }
    }
    let next = (1..=7).find_map(|i| day(dow + i).map(|[o, _]| (i, o)));
    let text = match (today.is_some(), next) {
        (_, None) => "Closed".to_string(),
        (true, Some((1, o))) => format!("Closed · opens {} tomorrow", h12(o)),
        (true, Some((i, o))) => format!("Closed · opens {} {}", DAY_NAMES[(dow + i) % 7], h12(o)),
        (false, Some((i, o))) => format!(
            "Closed today · opens {} {}",
            DAY_NAMES[(dow + i) % 7],
            h12(o)
        ),
    };
    OpenState {
        open: false,
        text,
        closing: None,
        unknown: None,
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Nearby {
    pub branch_id: String,
    pub km: f64,
}

/// Branches sorted by distance from `loc`.
pub fn nearby(branches: &[Branch], loc: LatLon) -> Vec<Nearby> {
    let mut v: Vec<Nearby> = branches
        .iter()
        .map(|b| Nearby {
            branch_id: b.id.clone(),
            km: dist(
                loc,
                LatLon {
                    lat: b.lat,
                    lon: b.lon,
                },
            ),
        })
        .collect();
    v.sort_by(|a, b| a.km.total_cmp(&b.km));
    v
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::time::ms_from_iso;

    fn wk(f: impl Fn(usize) -> Option<[f64; 2]>) -> WeekHours {
        WeekHours {
            week: (0..7).map(f).collect(),
        }
    }
    fn at(s: &str) -> i64 {
        ms_from_iso(s).unwrap()
    }

    #[test]
    fn distance_and_format() {
        let kl = LatLon {
            lat: 3.147,
            lon: 101.695,
        };
        let pg = LatLon {
            lat: 5.414,
            lon: 100.329,
        };
        let d = dist(kl, pg);
        assert!((d - 294.0).abs() < 5.0, "{d}");
        assert_eq!(fmt_km(0.4567), "457 m");
        assert_eq!(fmt_km(4.25), "4.2 km");
        assert_eq!(fmt_km(1633.4), "1,633 km");
        assert_eq!(region_of(5.98, 116.07), RegionId::East);
    }

    #[test]
    fn h12_labels() {
        assert_eq!(h12(10.0), "10 am");
        assert_eq!(h12(12.0), "12 pm");
        assert_eq!(h12(22.0), "10 pm");
        assert_eq!(h12(24.0), "12 am");
        assert_eq!(h12(21.5), "9:30 pm");
        assert_eq!(h12(26.0), "2 am");
    }

    #[test]
    fn open_state_cases() {
        let mall = wk(|_| Some([10.0, 22.0]));
        // Monday 2026-10-12 15:00 MYT
        let s = open_state(Some(&mall), at("2026-10-12T15:00:00+08:00"));
        assert_eq!(
            s,
            OpenState {
                open: true,
                text: "Open until 10 pm".into(),
                closing: Some(false),
                unknown: None
            }
        );
        let s = open_state(Some(&mall), at("2026-10-12T21:30:00+08:00"));
        assert!(s.open && s.closing == Some(true));
        let s = open_state(Some(&mall), at("2026-10-12T08:00:00+08:00"));
        assert_eq!(s.text, "Opens 10 am");
        assert!(!s.open);
        let s = open_state(Some(&mall), at("2026-10-12T23:00:00+08:00"));
        assert_eq!(s.text, "Closed · opens 10 am tomorrow");

        // Closed Sundays (2026-10-11 is a Sunday)
        let wh = wk(|d| if d == 0 { None } else { Some([9.0, 18.0]) });
        let s = open_state(Some(&wh), at("2026-10-11T12:00:00+08:00"));
        assert_eq!(s.text, "Closed today · opens Mon 9 am");
        // Saturday evening -> next opening Monday
        let s = open_state(Some(&wh), at("2026-10-10T19:00:00+08:00"));
        assert_eq!(s.text, "Closed · opens Mon 9 am");

        let s = open_state(None, 0);
        assert_eq!(
            s,
            OpenState {
                open: false,
                text: "Hours not listed".into(),
                closing: None,
                unknown: Some(true)
            }
        );

        let all = wk(|_| Some([0.0, 24.0]));
        assert_eq!(
            open_state(Some(&all), at("2026-10-12T03:00:00+08:00")).text,
            "Open 24 hours"
        );

        // Past midnight: Fri 18:00-02:00 (26)
        let late = wk(|d| if d == 5 { Some([18.0, 26.0]) } else { None });
        let s = open_state(Some(&late), at("2026-10-17T01:00:00+08:00")); // Saturday 1am
        assert_eq!(s.text, "Open until 2 am");
        assert!(s.open);
    }

    #[test]
    fn nearby_sorted() {
        let mk = |id: &str, lat, lon| Branch {
            id: id.into(),
            retailer_id: "r".into(),
            name: id.into(),
            addr: String::new(),
            lat,
            lon,
            phone: None,
            hours: None,
            hours_raw: None,
            services: vec![],
            source: BranchSource::Config,
        };
        let v = nearby(
            &[mk("far", 5.98, 116.07), mk("near", 3.15, 101.7)],
            LatLon {
                lat: 3.145,
                lon: 101.71,
            },
        );
        assert_eq!(v[0].branch_id, "near");
        assert_eq!(v[1].branch_id, "far");
    }
}
