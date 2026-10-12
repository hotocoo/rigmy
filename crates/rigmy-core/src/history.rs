//! Price history from real ingest snapshots, sale calendar, part stats and category index.

use std::collections::BTreeMap;

use crate::time::{myt_date, myt_day_start, myt_midnight, DAY_MS};
use crate::types::*;

/// One observation stored by the ingester: a retailer's price for a product on a (MYT) day.
#[derive(Debug, Clone, PartialEq)]
pub struct Snapshot {
    /// MYT day start, epoch ms.
    pub day: i64,
    pub retailer_id: String,
    pub price: f64,
    pub in_stock: bool,
}

/// Fixed-date Malaysian online mega-sale days (month, day, label). Moving festivals
/// (CNY, Hari Raya, …) are not included; add them per year through `config/events.toml`.
pub const FIXED_SALES: &[(u32, u32, &str)] = &[
    (6, 6, "6.6"),
    (7, 7, "7.7"),
    (8, 8, "8.8"),
    (9, 9, "9.9"),
    (10, 10, "10.10"),
    (11, 11, "11.11"),
    (12, 12, "12.12"),
];

/// Sale events for the previous, current and next calendar year (MYT) around `now_ms`,
/// merged with `extra` (configured one-off events), de-duplicated by day and sorted.
pub fn sale_events(now_ms: i64, extra: &[SaleEvent]) -> Vec<SaleEvent> {
    let (y, _, _) = myt_date(now_ms);
    let mut out: Vec<SaleEvent> = (y - 1..=y + 1)
        .flat_map(|yy| {
            FIXED_SALES.iter().map(move |&(m, d, l)| SaleEvent {
                t: myt_midnight(yy, m, d),
                label: l.to_string(),
            })
        })
        .collect();
    out.extend(extra.iter().cloned());
    out.sort_by_key(|e| e.t);
    out.dedup_by_key(|e| e.t);
    out
}

// ---------- price-verdict rules (named so the thresholds are visible in one place) ----------

/// Days of history considered for the low / high ("12-month low").
pub const YEAR_DAYS: usize = 365;
/// Window of the moving average the verdict compares against.
pub const AVG_WINDOW_DAYS: usize = 90;
/// Minimum days of history before the average is reported.
pub const AVG_MIN_DAYS: usize = 30;
/// Minimum days of history before any verdict other than "Tracking started".
pub const MIN_VERDICT_DAYS: usize = 7;
/// Look-back of the short and long price change (`d7`, `d30`).
pub const SHORT_CHANGE_DAYS: usize = 7;
pub const LONG_CHANGE_DAYS: usize = 30;
/// Daily lows kept for sparklines.
pub const SPARK_DAYS: usize = 60;
/// A price within this factor of the period low counts as "at its low" (0.5 %).
pub const AT_LOW_TOLERANCE: f64 = 1.005;
/// Below `avg × this` is a good price (2.5 % under the average).
pub const BELOW_AVG_FACTOR: f64 = 0.975;
/// Above `avg × this` is an expensive price (2 % over the average).
pub const ABOVE_AVG_FACTOR: f64 = 1.02;
/// An expensive verdict mentions the next sale when it is fewer than this many days away.
pub const SALE_HINT_DAYS: i64 = 45;
/// Mover score = weekly drop (fraction) × this + builds / [`SCORE_BUILDS_PER_POINT`].
pub const SCORE_DROP_WEIGHT: f64 = 900.0;
pub const SCORE_BUILDS_PER_POINT: f64 = 30.0;

fn round2(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}

/// Daily series: `low` = min in-stock price, `avg` = mean in-stock price across retailers.
/// Days without any in-stock observation are forward-filled, but only between the first and
/// last day that had one (no extrapolation). `ev` marks an event day, `sale` its ±1 day window.
pub fn build_history(snaps: &[Snapshot], events: &[SaleEvent]) -> Vec<HistoryPoint> {
    let mut by_day: BTreeMap<i64, Vec<f64>> = BTreeMap::new();
    for s in snaps
        .iter()
        .filter(|s| s.in_stock && s.price.is_finite() && s.price > 0.0)
    {
        by_day
            .entry(myt_day_start(s.day))
            .or_default()
            .push(s.price);
    }
    let (Some(&first), Some(&last)) = (by_day.keys().next(), by_day.keys().next_back()) else {
        return vec![];
    };
    let mut out = Vec::new();
    let mut prev: Option<(f64, f64)> = None;
    let mut t = first;
    while t <= last {
        let la = match by_day.get(&t) {
            Some(ps) => {
                let low = ps.iter().copied().fold(f64::INFINITY, f64::min);
                let avg = ps.iter().sum::<f64>() / ps.len() as f64;
                Some((low, round2(avg)))
            }
            None => prev,
        };
        if let Some((low, avg)) = la {
            let ev = events.iter().find(|e| e.t == t).map(|e| e.label.clone());
            let sale = events.iter().any(|e| (t - e.t).abs() <= DAY_MS);
            out.push(HistoryPoint {
                t,
                low,
                avg,
                ev,
                sale: sale.then_some(true),
            });
            prev = la;
        }
        t += DAY_MS;
    }
    out
}

fn plural_days(n: i64) -> String {
    match n {
        0 => "today".to_string(),
        1 => "1 day ago".to_string(),
        n => format!("{n} days ago"),
    }
}

/// Part stats with the prototype's verdict wording. `cur` is the current lowest in-stock price
/// across retailers (None when nobody has it in stock). Metrics needing more history than is
/// available are `None`: d7 needs 8 daily points, d30 needs 31, avg90 needs 30 (averaged over
/// up to the last 90). Thresholds are the constants above.
pub fn stats(
    history: &[HistoryPoint],
    cur: Option<f64>,
    events: &[SaleEvent],
    now_ms: i64,
    builds: u32,
) -> PartStats {
    let today = myt_day_start(now_ms);
    let n = history.len();
    let year = &history[n.saturating_sub(YEAR_DAYS)..];
    let mut low: Option<&HistoryPoint> = None;
    let mut high: Option<&HistoryPoint> = None;
    for x in year {
        if low.is_none_or(|l| x.low <= l.low) {
            low = Some(x);
        }
        if high.is_none_or(|h| x.low > h.low) {
            high = Some(x);
        }
    }
    let avg90 = (n >= AVG_MIN_DAYS).then(|| {
        let w = &history[n.saturating_sub(AVG_WINDOW_DAYS)..];
        (w.iter().map(|x| x.low).sum::<f64>() / w.len() as f64).round()
    });
    let change = |back: usize| -> Option<f64> {
        let c = cur?;
        let base = history.get(n.checked_sub(back + 1)?)?.low;
        (base > 0.0).then(|| (c - base) / base)
    };
    let (d7, d30) = (change(SHORT_CHANGE_DAYS), change(LONG_CHANGE_DAYS));
    let next = events.iter().find(|e| e.t > today).cloned();
    let next_in = next
        .as_ref()
        .map(|e| ((e.t - today) as f64 / DAY_MS as f64).round() as i64);
    let tracked = history
        .first()
        .map(|h| (today - h.t).div_euclid(DAY_MS).max(0))
        .unwrap_or(0);
    let tracking = || {
        (
            format!("Tracking started {}", plural_days(tracked)),
            Tone::Info,
        )
    };

    let (verdict, tone) = match cur {
        None if history.is_empty() => ("No price yet".to_string(), Tone::Pending),
        None => (
            "Not in stock at any tracked retailer".to_string(),
            Tone::Warn,
        ),
        Some(_) if n < MIN_VERDICT_DAYS => tracking(),
        Some(c) => {
            let lo = low.map(|l| l.low).unwrap_or(c).min(c);
            if c <= lo * AT_LOW_TOLERANCE {
                let v = if n >= YEAR_DAYS {
                    "At its 12-month low".to_string()
                } else {
                    format!("At its lowest in {n} days")
                };
                (v, Tone::Ok)
            } else if let Some(a) = avg90 {
                if c < a * BELOW_AVG_FACTOR {
                    (
                        format!(
                            "{}% below its 90-day average",
                            ((1.0 - c / a) * 100.0).round()
                        ),
                        Tone::Ok,
                    )
                } else if c > a * ABOVE_AVG_FACTOR {
                    let soon = match (&next, next_in) {
                        (Some(e), Some(d)) if d < SALE_HINT_DAYS => {
                            format!(" · {} sale in {} days", e.label, d)
                        }
                        _ => String::new(),
                    };
                    (format!("Above its 90-day average{soon}"), Tone::Warn)
                } else {
                    ("Close to its 90-day average".to_string(), Tone::Info)
                }
            } else {
                tracking()
            }
        }
    };
    let score = d7.map(|d| (-d).max(0.0) * SCORE_DROP_WEIGHT).unwrap_or(0.0)
        + builds as f64 / SCORE_BUILDS_PER_POINT;
    PartStats {
        cur,
        low: low.map(|l| l.low),
        low_t: low.map(|l| l.t),
        high: high.map(|h| h.low),
        avg90,
        d7,
        d30,
        verdict,
        tone,
        next,
        next_in,
        builds,
        days: n as u32,
        score,
        spark: history[n.saturating_sub(SPARK_DAYS)..]
            .iter()
            .map(|x| x.low)
            .collect(),
    }
}

/// Category price index: each product's daily low divided by its first available low, averaged
/// over the products that have a point that day, scaled so 100 = first point. Empty if no history.
pub fn cat_index(histories: &[Vec<HistoryPoint>]) -> Vec<IndexPoint> {
    let mut acc: BTreeMap<i64, (f64, u32, Option<String>)> = BTreeMap::new();
    for h in histories {
        let Some(base) = h.first().map(|p| p.low).filter(|b| *b > 0.0) else {
            continue;
        };
        for p in h {
            let e = acc.entry(p.t).or_insert((0.0, 0, None));
            e.0 += p.low / base;
            e.1 += 1;
            if e.2.is_none() {
                e.2 = p.ev.clone();
            }
        }
    }
    acc.into_iter()
        .map(|(t, (s, c, ev))| IndexPoint {
            t,
            v: s / c as f64 * 100.0,
            ev,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::time::{ms_from_iso, myt_midnight};

    fn snap(day: i64, r: &str, price: f64, in_stock: bool) -> Snapshot {
        Snapshot {
            day,
            retailer_id: r.into(),
            price,
            in_stock,
        }
    }

    #[test]
    fn events_fixed_dates() {
        let now = ms_from_iso("2026-10-12T12:00:00+08:00").unwrap();
        let ev = sale_events(now, &[]);
        assert_eq!(ev.len(), 21);
        assert_eq!(ev[0].label, "6.6");
        assert_eq!(ev[0].t, myt_midnight(2025, 6, 6));
        let next = ev.iter().find(|e| e.t > myt_day_start(now)).unwrap();
        assert_eq!(next.label, "11.11");
        let extra = [SaleEvent {
            t: myt_midnight(2027, 2, 6),
            label: "CNY".into(),
        }];
        assert!(sale_events(now, &extra).iter().any(|e| e.label == "CNY"));
    }

    #[test]
    fn history_low_avg_and_ffill() {
        let d0 = myt_midnight(2026, 11, 9);
        let snaps = vec![
            snap(d0, "a", 1000.0, true),
            snap(d0, "b", 1100.0, true),
            snap(d0, "c", 500.0, false), // out of stock: ignored
            // d0+1 missing entirely -> forward-filled
            snap(d0 + 2 * DAY_MS, "a", 900.0, true),
            snap(d0 + 3 * DAY_MS, "a", 800.0, false), // only OOS -> forward-filled? no: last in-stock day is d0+2
        ];
        let ev = sale_events(d0, &[]);
        let h = build_history(&snaps, &ev);
        assert_eq!(h.len(), 3);
        assert_eq!((h[0].low, h[0].avg), (1000.0, 1050.0));
        assert_eq!((h[1].low, h[1].avg), (1000.0, 1050.0));
        assert_eq!(h[2].low, 900.0);
        assert_eq!(h[2].t, myt_midnight(2026, 11, 11));
        assert_eq!(h[2].ev.as_deref(), Some("11.11"));
        assert_eq!(h[1].sale, Some(true));
        assert_eq!(h[0].sale, None);
        assert!(build_history(&[], &ev).is_empty());
    }

    fn series(start: i64, lows: &[f64]) -> Vec<HistoryPoint> {
        lows.iter()
            .enumerate()
            .map(|(i, &l)| HistoryPoint {
                t: start + i as i64 * DAY_MS,
                low: l,
                avg: l,
                ev: None,
                sale: None,
            })
            .collect()
    }

    #[test]
    fn stats_without_data() {
        let now = ms_from_iso("2026-10-12T12:00:00+08:00").unwrap();
        let s = stats(&[], None, &[], now, 0);
        assert_eq!(s.verdict, "No price yet");
        assert_eq!(s.tone, Tone::Pending);
        assert!(s.cur.is_none() && s.d7.is_none() && s.avg90.is_none() && s.low.is_none());
        assert_eq!(s.days, 0);
        assert!(s.spark.is_empty());

        let today = myt_day_start(now);
        let h = series(today - 2 * DAY_MS, &[100.0, 99.0, 98.0]);
        let s = stats(&h, Some(98.0), &[], now, 3);
        assert_eq!(s.verdict, "Tracking started 2 days ago");
        assert_eq!(s.tone, Tone::Info);
        assert!(s.d7.is_none() && s.d30.is_none() && s.avg90.is_none());
        assert_eq!(s.low, Some(98.0));
        assert_eq!(s.days, 3);
        assert_eq!(s.builds, 3);
        assert!((s.score - 0.1).abs() < 1e-9);

        let s = stats(&h, None, &[], now, 0);
        assert_eq!(s.tone, Tone::Warn);
    }

    #[test]
    fn stats_verdicts() {
        let now = ms_from_iso("2026-10-12T12:00:00+08:00").unwrap();
        let today = myt_day_start(now);
        let evs = sale_events(now, &[]);
        // 100 days at 1000, today 900 -> 10% below 90-day avg? avg90 = (89*1000+900)/90 = 998.9
        let mut lows = vec![1000.0; 99];
        lows.push(950.0);
        let mut h = series(today - 99 * DAY_MS, &lows);
        // make an earlier deeper low so "lowest" doesn't trigger
        h[5].low = 800.0;
        let s = stats(&h, Some(950.0), &evs, now, 0);
        assert_eq!(s.avg90, Some(999.0));
        assert_eq!(s.verdict, "5% below its 90-day average");
        assert_eq!(s.tone, Tone::Ok);
        assert!((s.d7.unwrap() - (-0.05)).abs() < 1e-9);
        assert!((s.d30.unwrap() - (-0.05)).abs() < 1e-9);
        assert_eq!(s.low, Some(800.0));
        assert_eq!(s.high, Some(1000.0));
        assert_eq!(s.spark.len(), 60);
        assert_eq!(s.next.as_ref().unwrap().label, "11.11");
        assert_eq!(s.next_in, Some(30));

        let s = stats(&h, Some(1100.0), &evs, now, 0);
        assert_eq!(
            s.verdict,
            "Above its 90-day average · 11.11 sale in 30 days"
        );
        assert_eq!(s.tone, Tone::Warn);

        let s = stats(&h, Some(1001.0), &evs, now, 0);
        assert_eq!(s.verdict, "Close to its 90-day average");

        let s = stats(&h, Some(790.0), &evs, now, 0);
        assert_eq!(s.verdict, "At its lowest in 100 days");

        let long = series(today - 399 * DAY_MS, &vec![500.0; 400]);
        assert_eq!(
            stats(&long, Some(500.0), &evs, now, 0).verdict,
            "At its 12-month low"
        );

        // between 7 and 29 days: no avg90 yet
        let short = series(
            today - 9 * DAY_MS,
            &[
                1000.0, 1000.0, 1000.0, 1000.0, 1000.0, 990.0, 990.0, 990.0, 990.0, 995.0,
            ],
        );
        let s = stats(&short, Some(995.0), &evs, now, 0);
        assert_eq!(s.verdict, "Tracking started 9 days ago");
        assert!(s.d7.is_some() && s.d30.is_none());
    }

    #[test]
    fn index_normalised() {
        let t0 = myt_midnight(2026, 1, 1);
        assert!(cat_index(&[]).is_empty());
        let a = series(t0, &[100.0, 110.0, 120.0]);
        let b = series(t0 + DAY_MS, &[50.0, 40.0]);
        let idx = cat_index(&[a, b, vec![]]);
        assert_eq!(idx.len(), 3);
        assert!((idx[0].v - 100.0).abs() < 1e-9);
        assert!((idx[1].v - 105.0).abs() < 1e-9); // (1.1 + 1.0) / 2
        assert!((idx[2].v - 100.0).abs() < 1e-9); // (1.2 + 0.8) / 2
    }
}
