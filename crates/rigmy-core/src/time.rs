//! Calendar helpers without a date library. Malaysia has no DST: local time = UTC+8 all year.

pub const DAY_MS: i64 = 86_400_000;
pub const MYT_OFFSET_MS: i64 = 8 * 3_600_000;

/// Days since 1970-01-01 for a proleptic Gregorian date (Howard Hinnant's algorithm).
pub fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let m = m as i64;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d as i64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// Inverse of [`days_from_civil`]: (year, month 1-12, day 1-31).
pub fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// Epoch ms of local (MYT) midnight on the given date.
pub fn myt_midnight(y: i64, m: u32, d: u32) -> i64 {
    days_from_civil(y, m, d) * DAY_MS - MYT_OFFSET_MS
}

/// Epoch ms of the MYT midnight that starts the day containing `ms`.
pub fn myt_day_start(ms: i64) -> i64 {
    (ms + MYT_OFFSET_MS).div_euclid(DAY_MS) * DAY_MS - MYT_OFFSET_MS
}

/// Local (MYT) calendar date of `ms`.
pub fn myt_date(ms: i64) -> (i64, u32, u32) {
    civil_from_days((ms + MYT_OFFSET_MS).div_euclid(DAY_MS))
}

/// Local (MYT) weekday of `ms`, 0 = Sunday.
pub fn myt_weekday(ms: i64) -> usize {
    // 1970-01-01 was a Thursday (4).
    ((ms + MYT_OFFSET_MS).div_euclid(DAY_MS) + 4).rem_euclid(7) as usize
}

/// Local (MYT) fractional hour of day of `ms`, e.g. 13.5 for 13:30.
pub fn myt_hour(ms: i64) -> f64 {
    let in_day = (ms + MYT_OFFSET_MS).rem_euclid(DAY_MS);
    // Truncate to whole minutes like `getHours() + getMinutes() / 60`.
    (in_day / 60_000) as f64 / 60.0
}

/// RFC 3339 / ISO 8601 UTC timestamp with millisecond precision, like JS `toISOString()`.
pub fn iso_from_ms(ms: i64) -> String {
    let days = ms.div_euclid(DAY_MS);
    let rem = ms.rem_euclid(DAY_MS);
    let (y, m, d) = civil_from_days(days);
    let (h, mi, s, milli) = (
        rem / 3_600_000,
        rem / 60_000 % 60,
        rem / 1000 % 60,
        rem % 1000,
    );
    format!("{y:04}-{m:02}-{d:02}T{h:02}:{mi:02}:{s:02}.{milli:03}Z")
}

/// Parse `YYYY-MM-DDTHH:MM:SS(.fff)?(Z|±HH:MM)` or a bare `YYYY-MM-DD` (taken as MYT midnight).
pub fn ms_from_iso(s: &str) -> Option<i64> {
    let s = s.trim();
    let num = |a: usize, b: usize| -> Option<i64> { s.get(a..b)?.parse().ok() };
    let (y, m, d) = (num(0, 4)?, num(5, 7)? as u32, num(8, 10)? as u32);
    if s.get(4..5)? != "-"
        || s.get(7..8)? != "-"
        || !(1..=12).contains(&m)
        || !(1..=31).contains(&d)
    {
        return None;
    }
    if s.len() == 10 {
        return Some(myt_midnight(y, m, d));
    }
    if !matches!(s.get(10..11)?, "T" | " ") {
        return None;
    }
    let (h, mi, sec) = (num(11, 13)?, num(14, 16)?, num(17, 19)?);
    let mut rest = &s[19..];
    let mut milli = 0i64;
    if let Some(frac) = rest.strip_prefix('.') {
        let digits: String = frac.chars().take_while(|c| c.is_ascii_digit()).collect();
        rest = &frac[digits.len()..];
        let padded = format!("{:0<3}", &digits[..digits.len().min(3)]);
        milli = padded.parse().ok()?;
    }
    let offset_ms = match rest {
        "" | "Z" | "z" => 0,
        o if o.len() == 6 && (o.starts_with('+') || o.starts_with('-')) => {
            let oh: i64 = o.get(1..3)?.parse().ok()?;
            let om: i64 = o.get(4..6)?.parse().ok()?;
            let v = (oh * 60 + om) * 60_000;
            if o.starts_with('-') {
                -v
            } else {
                v
            }
        }
        _ => return None,
    };
    Some(days_from_civil(y, m, d) * DAY_MS + ((h * 60 + mi) * 60 + sec) * 1000 + milli - offset_ms)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn civil_roundtrip() {
        for z in [-1000i64, 0, 19_000, 20_738, 30_000] {
            let (y, m, d) = civil_from_days(z);
            assert_eq!(days_from_civil(y, m, d), z);
        }
        assert_eq!(days_from_civil(1970, 1, 1), 0);
        assert_eq!(civil_from_days(days_from_civil(2024, 2, 29)), (2024, 2, 29));
    }

    #[test]
    fn myt_helpers() {
        // 2026-10-12 00:30 MYT == 2026-10-11T16:30Z
        let ms = ms_from_iso("2026-10-11T16:30:00Z").unwrap();
        assert_eq!(myt_date(ms), (2026, 10, 12));
        assert_eq!(myt_day_start(ms), myt_midnight(2026, 10, 12));
        assert_eq!(myt_weekday(ms), 1); // Monday
        assert!((myt_hour(ms) - 0.5).abs() < 1e-9);
        assert_eq!(iso_from_ms(ms), "2026-10-11T16:30:00.000Z");
        assert_eq!(ms_from_iso("2026-10-12T00:30:00+08:00"), Some(ms));
        assert_eq!(ms_from_iso("2026-10-12T00:30:00.250+08:00"), Some(ms + 250));
        assert_eq!(ms_from_iso("2026-10-12"), Some(myt_midnight(2026, 10, 12)));
        assert_eq!(ms_from_iso("garbage"), None);
    }
}
