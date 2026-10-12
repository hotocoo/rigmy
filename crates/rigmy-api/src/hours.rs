//! Parser for the common subset of OSM `opening_hours` into [`WeekHours`].
//!
//! Supported: `24/7`; rules separated by `;`, each `<days> <time>[,…]` / `<days> off|closed`
//! / `<time>` (every day). Days are `Mo Tu We Th Fr Sa Su`, ranges (`Mo-Fr`, wrapping `Fr-Mo`)
//! and lists (`Mo,We,Fr`). Times are `HH:MM-HH:MM`; a close at or before the open time means
//! past midnight (`18:00-02:00` → `[18, 26]`). Later rules override earlier ones for their days
//! (OSM semantics); days no rule mentions are closed. `PH`/`SH` rules are ignored.
//! Anything else (months, weeks, split shifts, comments…) → `None` so the raw string is shown.

use rigmy_core::WeekHours;

const DAYS: [&str; 7] = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

fn day_idx(s: &str) -> Option<usize> {
    DAYS.iter().position(|d| *d == s)
}

fn parse_days(spec: &str) -> Option<Vec<usize>> {
    let mut out = Vec::new();
    for part in spec.split(',') {
        let part = part.trim();
        if let Some((a, b)) = part.split_once('-') {
            let (a, b) = (day_idx(a)?, day_idx(b)?);
            // Walk Monday-first so `Mo-Su` / `Fr-Mo` are natural.
            let mut i = a;
            loop {
                out.push(i);
                if i == b {
                    break;
                }
                i = (i + 1) % 7;
            }
        } else {
            out.push(day_idx(part)?);
        }
    }
    Some(out)
}

fn parse_hm(s: &str) -> Option<f64> {
    let (h, m) = s.trim().split_once(':')?;
    if h.is_empty() || h.len() > 2 || m.len() != 2 {
        return None;
    }
    let (h, m): (u32, u32) = (h.parse().ok()?, m.parse().ok()?);
    if h > 24 || m > 59 || (h == 24 && m != 0) {
        return None;
    }
    Some(h as f64 + m as f64 / 60.0)
}

fn parse_range(s: &str) -> Option<[f64; 2]> {
    if s.contains(',') {
        return None; // split shifts cannot be represented as one [open, close] per day
    }
    let (a, b) = s.split_once('-')?;
    let (o, mut c) = (parse_hm(a)?, parse_hm(b)?);
    if c <= o {
        c += 24.0;
    }
    Some([o, c])
}

pub fn parse_opening_hours(raw: &str) -> Option<WeekHours> {
    let s = raw.trim();
    if s.is_empty() {
        return None;
    }
    if s == "24/7" {
        return Some(WeekHours {
            week: vec![Some([0.0, 24.0]); 7],
        });
    }
    let mut week: Vec<Option<[f64; 2]>> = vec![None; 7];
    let mut any = false;
    for rule in s.split(';').map(str::trim).filter(|r| !r.is_empty()) {
        let (days_part, time_part) = match rule.split_once(' ') {
            Some((d, t)) if d.chars().next().is_some_and(|c| c.is_ascii_alphabetic()) => {
                (Some(d), t.trim())
            }
            _ => (None, rule),
        };
        if let Some(d) = days_part {
            if d == "PH" || d == "SH" || d.starts_with("PH") || d.starts_with("SH") {
                continue;
            }
        }
        let days = match days_part {
            Some(d) => parse_days(d)?,
            None => (0..7).collect(),
        };
        let value = match time_part {
            "off" | "closed" => None,
            t => Some(parse_range(t)?),
        };
        for d in days {
            week[d] = value;
        }
        any = true;
    }
    any.then_some(WeekHours { week })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn w(raw: &str) -> Vec<Option<[f64; 2]>> {
        parse_opening_hours(raw).unwrap().week
    }

    #[test]
    fn common_forms() {
        assert_eq!(w("Mo-Su 10:00-22:00"), vec![Some([10.0, 22.0]); 7]);
        assert_eq!(w("24/7"), vec![Some([0.0, 24.0]); 7]);
        let x = w("Mo-Fr 09:00-18:00; Sa 10:00-16:00");
        assert_eq!(x[0], None);
        assert_eq!(x[1], Some([9.0, 18.0]));
        assert_eq!(x[5], Some([9.0, 18.0]));
        assert_eq!(x[6], Some([10.0, 16.0]));
        let x = w("Mo-Sa 10:00-21:00; Su off");
        assert_eq!(x[0], None);
        assert_eq!(x[3], Some([10.0, 21.0]));
        let x = w("Mo-Su 10:00-22:00; Tu closed");
        assert_eq!(x[2], None);
        assert_eq!(x[4], Some([10.0, 22.0]));
        assert_eq!(w("10:00-21:30")[0], Some([10.0, 21.5]));
        assert_eq!(w("Fr-Mo 18:00-02:00")[0], Some([18.0, 26.0]));
        assert_eq!(w("Fr-Mo 18:00-02:00")[3], None);
        assert_eq!(w("Mo,We,Fr 11:00-20:00")[3], Some([11.0, 20.0]));
        assert_eq!(w("Mo-Sa 10:00-22:00; PH off")[6], Some([10.0, 22.0]));
        assert_eq!(w("Mo-Su 10:00-24:00")[1], Some([10.0, 24.0]));
    }

    #[test]
    fn unparseable() {
        for s in [
            "",
            "by appointment",
            "Mo-Fr 09:00-12:00,14:00-18:00",
            "Jan-Mar Mo-Fr 10:00-18:00",
            "Mo-Fr 9am-6pm",
            "sunrise-sunset",
            "Mo-Fr 10:00-25:00",
        ] {
            assert!(parse_opening_hours(s).is_none(), "{s}");
        }
    }
}
