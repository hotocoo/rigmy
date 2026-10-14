//! Promote retailer listings into buildable parts.
//!
//! A market listing (an imported feed product that matched no verified catalogue part) becomes
//! buildable when its title states the specs that define the part in one unambiguous way: one
//! socket, one capacity, one wattage. Only what the title says (or what follows from it by a
//! fixed rule: a B850 chipset is an AM5 board) is recorded; everything else stays unset, and the
//! compatibility engine reports unset specs as "Not listed" instead of guessing. Titles that list
//! alternatives ("1TB / 2TB", "750W / 850W") are left as market listings, because the listing
//! price belongs to just one of them.
//!
//! Promoted parts carry `source = "listing"` so the app can say where their specs came from.

use std::sync::LazyLock;

use regex::Regex;
use rigmy_core::{CatId, Product};
use serde_json::{json, Map, Value};

/// What a listing title says about the part, ready to merge into its [`Product`].
#[derive(Debug, Default, PartialEq)]
pub struct Promoted {
    pub cat: Option<CatId>,
    pub glyph: String,
    pub facet: String,
    pub specs: Map<String, Value>,
    pub socket: Option<String>,
    pub tdp: Option<f64>,
    pub ff: Option<String>,
    pub mem: Option<String>,
    pub ffs: Option<Vec<String>>,
    pub ctype: Option<String>,
    pub rad: Option<f64>,
    pub tgp: Option<f64>,
    pub watt: Option<f64>,
}

impl Promoted {
    /// Write the promoted specs into a market product, making it buildable.
    pub fn apply(self, p: &mut Product) {
        p.cat = self.cat;
        p.glyph = self.glyph;
        p.facet = self.facet;
        p.specs = self.specs;
        p.socket = self.socket;
        p.tdp = self.tdp;
        p.ff = self.ff;
        p.mem = self.mem;
        p.ffs = self.ffs;
        p.ctype = self.ctype;
        p.rad = self.rad;
        p.tgp = self.tgp;
        p.watt = self.watt;
        p.source = Some("listing".to_string());
    }
}

fn re(p: &str) -> Regex {
    Regex::new(p).expect("static pattern")
}

/// Listings that are not one PC part even when filed under a PC category.
static NOT_A_PART: LazyLock<Regex> = LazyLock::new(|| {
    re(
        r"(?i)\b(package|bundle|combo|gaming pc|laptop|notebook|refurb\w*|used|switch|phone|ipad|tablet|carrying|bag|sleeve|stand|bracket only|external|portable|enclosure|adapter|cable|riser|thermal paste|fan hub)\b",
    )
});

/// Distinct values of capture group 1 (normalized by `f`) across all matches.
fn distinct<T: PartialEq>(
    rx: &Regex,
    s: &str,
    f: impl Fn(&regex::Captures) -> Option<T>,
) -> Vec<T> {
    let mut out: Vec<T> = Vec::new();
    for c in rx.captures_iter(s) {
        if let Some(v) = f(&c) {
            if !out.contains(&v) {
                out.push(v);
            }
        }
    }
    out
}

/// Exactly one distinct value, or `None` (absent or ambiguous).
fn one<T: PartialEq>(v: Vec<T>) -> Option<T> {
    if v.len() == 1 {
        v.into_iter().next()
    } else {
        None
    }
}

fn clean(title: &str) -> String {
    title.replace(['™', '®'], "")
}

/// Promote a listing filed under `label` (the import's market label) if its title pins it down.
pub fn promote(label: &str, title: &str) -> Option<Promoted> {
    let t = clean(title);
    if NOT_A_PART.is_match(&t) {
        return None;
    }
    match label {
        "Processor" => cpu(&t),
        "Motherboard" => mobo(&t),
        "Memory" => ram(&t),
        "SSD" => ssd(&t),
        "Graphics Card" => gpu(&t),
        "Power Supply" => psu(&t),
        "Case" => case(&t),
        "Cooler" => cooler(&t),
        _ => None,
    }
}

// ---------- sockets ----------

static SOCKET: LazyLock<Regex> =
    LazyLock::new(|| re(r"(?i)\b(AM4|AM5|sTR5|sWRX8|LGA\s?(?:1851|1700|1200))\b"));

fn norm_socket(s: &str) -> String {
    let s = s.to_ascii_uppercase().replace(' ', "");
    match s.as_str() {
        "STR5" => "sTR5".into(),
        "SWRX8" => "sWRX8".into(),
        _ => s,
    }
}

/// Socket of a desktop CPU model, by AMD / Intel generation naming.
fn cpu_socket(t: &str) -> Option<String> {
    static RYZEN: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)\bRyzen\s+[3579]\s+(\d)\d{3}"));
    static ULTRA: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)\bCore\s+Ultra\s+[3579]\s+2\d\d"));
    static CORE_I: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)\bi[3579]-1[234]\d{3}"));
    if let Some(c) = RYZEN.captures(t) {
        return match &c[1] {
            "7" | "8" | "9" => Some("AM5".into()),
            "3" | "4" | "5" => Some("AM4".into()),
            _ => None,
        };
    }
    if ULTRA.is_match(t) {
        return Some("LGA1851".into());
    }
    CORE_I.is_match(t).then(|| "LGA1700".into())
}

/// Socket of a motherboard chipset.
fn chipset_socket(chipset: &str) -> Option<&'static str> {
    Some(match chipset {
        "A620" | "B650" | "B650E" | "X670" | "X670E" | "B840" | "B850" | "X870" | "X870E" => "AM5",
        "A520" | "B450" | "B550" | "X470" | "X570" => "AM4",
        "H810" | "B860" | "Z890" => "LGA1851",
        "H610" | "B660" | "H670" | "Z690" | "B760" | "H770" | "Z790" => "LGA1700",
        _ => return None,
    })
}

// ---------- categories ----------

fn cpu(t: &str) -> Option<Promoted> {
    static MODEL: LazyLock<Regex> = LazyLock::new(|| {
        re(
            r"(?i)\b(?:Ryzen\s+(?:Threadripper\s+(?:PRO\s+)?)?[3579]?\s*(\d{4}[A-Z0-9]*)|Core\s+Ultra\s+[3579]\s+(\d{3}[A-Z]*)|Core\s+(i[3579]-\d{4,5}[A-Z]*))",
        )
    });
    static CORES: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)\b(\d{1,2})[\s-]*Cores?\b"));
    static THREADS: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)\b(\d{1,3})[\s-]*Threads?\b"));
    let model = one(distinct(&MODEL, t, |c| {
        c.get(1)
            .or(c.get(2))
            .or(c.get(3))
            .map(|m| m.as_str().to_ascii_uppercase())
    }))?;
    // Any other model-shaped token ("… 9800X3D / 9850X3D") means the listing sells more than one CPU.
    static BARE: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)\b(\d{3,4}[A-Z][A-Z0-9]*)\b"));
    let units = ["W", "MHZ", "GHZ", "GB", "MB", "TB"];
    if distinct(&BARE, t, |c| {
        let m = c[1].to_ascii_uppercase();
        (!units
            .iter()
            .any(|u| m.ends_with(u) && m[..m.len() - u.len()].chars().all(|d| d.is_ascii_digit())))
        .then_some(m)
    })
    .iter()
    .any(|m| *m != model)
    {
        return None;
    }
    let socket =
        one(distinct(&SOCKET, t, |c| Some(norm_socket(&c[1])))).or_else(|| cpu_socket(t))?;
    let mut specs = Map::new();
    let cores = one(distinct(&CORES, t, |c| c[1].parse::<u32>().ok()));
    let threads = one(distinct(&THREADS, t, |c| c[1].parse::<u32>().ok()));
    if let Some(v) = cores {
        specs.insert("cores".into(), json!(v));
    }
    if let Some(v) = threads {
        specs.insert("threads".into(), json!(v));
    }
    specs.insert("socket".into(), json!(socket));
    Some(Promoted {
        cat: Some(CatId::Cpu),
        glyph: model,
        facet: socket.clone(),
        specs,
        socket: Some(socket),
        ..Default::default()
    })
}

static MEMTYPE: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)\b(DDR[45])\b"));

fn mobo(t: &str) -> Option<Promoted> {
    static CHIPSET: LazyLock<Regex> =
        LazyLock::new(|| re(r"(?i)\b([ABHXZ]\d{3}E?)(?:M|I)?(?:-[A-Z0-9]+)?\b"));
    static FF: LazyLock<Regex> =
        LazyLock::new(|| re(r"(?i)\b(E-?ATX|m-?ATX|Micro[\s-]?ATX|m?-?ITX|Mini[\s-]?ITX|ATX)\b"));
    let chipset = one(distinct(&CHIPSET, t, |c| {
        let cs = c[1].to_ascii_uppercase();
        chipset_socket(&cs).map(|_| cs)
    }))?;
    let socket = one(distinct(&SOCKET, t, |c| Some(norm_socket(&c[1]))))
        .unwrap_or_else(|| chipset_socket(&chipset).unwrap_or_default().to_string());
    if chipset_socket(&chipset) != Some(socket.as_str()) {
        return None; // title contradicts itself
    }
    let ff = one(distinct(&FF, t, |c| {
        let f = c[1].to_ascii_lowercase().replace(['-', ' '], "");
        Some(match f.as_str() {
            "eatx" => "E-ATX",
            "matx" | "microatx" => "mATX",
            "itx" | "mitx" | "miniitx" => "Mini-ITX",
            _ => "ATX",
        })
    }))
    .map(str::to_string);
    let mem =
        one(distinct(&MEMTYPE, t, |c| Some(c[1].to_ascii_uppercase()))).or(match socket.as_str() {
            "AM5" | "LGA1851" => Some("DDR5".into()),
            "AM4" => Some("DDR4".into()),
            _ => None,
        });
    let mut specs = Map::new();
    specs.insert("socket".into(), json!(socket));
    specs.insert("chipset".into(), json!(chipset));
    if let Some(f) = &ff {
        specs.insert("ff".into(), json!(f));
    }
    if let Some(m) = &mem {
        specs.insert("mem".into(), json!(m));
    }
    if Regex::new(r"(?i)\bwi-?fi")
        .map(|r| r.is_match(t))
        .unwrap_or(false)
    {
        specs.insert("wifi".into(), json!("Yes"));
    }
    Some(Promoted {
        cat: Some(CatId::Mobo),
        glyph: chipset,
        facet: socket.clone(),
        specs,
        socket: Some(socket),
        ff,
        mem,
        ..Default::default()
    })
}

fn ram(t: &str) -> Option<Promoted> {
    static KIT: LazyLock<Regex> = LazyLock::new(|| {
        re(
            r"(?i)\b(\d{1,3})\s?GB\s?[\(\s]*(?:(\d)\s?[x×]\s?(\d{1,3})\s?GB|(\d{1,3})\s?GB\s?[x×]\s?(\d))",
        )
    });
    static CAP: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)\b(\d{1,3})\s?GB\b"));
    static SPEED: LazyLock<Regex> =
        LazyLock::new(|| re(r"(?i)(?:\b(\d{4})\s?(?:MHz|MT/s)|DDR[45]-(\d{4}))"));
    static CL: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)\bCL(\d{2})\b"));
    // Laptop memory is not a desktop build part.
    if Regex::new(r"(?i)\bSO-?DIMM\b")
        .map(|r| r.is_match(t))
        .unwrap_or(false)
    {
        return None;
    }
    let mem = one(distinct(&MEMTYPE, t, |c| Some(c[1].to_ascii_uppercase())))?;
    // Total capacity and stick layout: "32GB (2x16GB)", "32GB 16GBx2"; else a single capacity.
    let kit = one(distinct(&KIT, t, |c| {
        let total: u32 = c[1].parse().ok()?;
        let (n, each): (u32, u32) = match (c.get(2), c.get(3), c.get(4), c.get(5)) {
            (Some(n), Some(e), _, _) => (n.as_str().parse().ok()?, e.as_str().parse().ok()?),
            (_, _, Some(e), Some(n)) => (n.as_str().parse().ok()?, e.as_str().parse().ok()?),
            _ => return None,
        };
        (n * each == total).then_some((total, n, each))
    }));
    let cap = match kit {
        Some((total, _, _)) => total,
        None => one(distinct(&CAP, t, |c| c[1].parse::<u32>().ok()))?,
    };
    let speeds = distinct(&SPEED, t, |c| {
        c.get(1)
            .or(c.get(2))
            .and_then(|m| m.as_str().parse::<u32>().ok())
    });
    let cls = distinct(&CL, t, |c| c[1].parse::<u32>().ok());
    // Several speeds or timings: the listing price belongs to just one of the kits.
    if speeds.len() > 1 || cls.len() > 1 {
        return None;
    }
    let (speed, cl) = (one(speeds), one(cls));
    let mut specs = Map::new();
    specs.insert("cap".into(), json!(cap));
    if let Some((_, n, each)) = kit {
        specs.insert("kit".into(), json!(format!("{n} × {each} GB")));
    }
    if let Some(v) = speed {
        specs.insert("speed".into(), json!(v));
    }
    if let Some(v) = cl {
        specs.insert("cl".into(), json!(v));
    }
    specs.insert("type".into(), json!(mem));
    Some(Promoted {
        cat: Some(CatId::Ram),
        glyph: format!("{cap}GB"),
        facet: format!("{cap} GB"),
        specs,
        mem: Some(mem),
        ..Default::default()
    })
}

fn ssd(t: &str) -> Option<Promoted> {
    static CAP: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)\b(\d{1,4})\s?(GB|TB)\b"));
    static GEN: LazyLock<Regex> =
        LazyLock::new(|| re(r"(?i)\b(?:Gen\s?([345])|PCIe\s?([345])\.0)\b"));
    let cap = one(distinct(&CAP, t, |c| {
        let n: u32 = c[1].parse().ok()?;
        Some(if c[2].eq_ignore_ascii_case("TB") {
            format!("{n} TB")
        } else {
            format!("{n} GB")
        })
    }))?;
    let nvme = t.to_ascii_lowercase().contains("nvme");
    let sata = t.to_ascii_lowercase().contains("sata");
    let iface = match (nvme, sata) {
        (true, false) => match one(distinct(&GEN, t, |c| {
            c.get(1).or(c.get(2)).map(|m| m.as_str().to_string())
        })) {
            Some(g) => format!("PCIe {g}.0 ×4"),
            None => "NVMe".to_string(),
        },
        (false, true) => "SATA III".to_string(),
        _ => return None,
    };
    let facet = iface.trim_end_matches(" ×4").to_string();
    let mut specs = Map::new();
    specs.insert("cap".into(), json!(cap));
    specs.insert("iface".into(), json!(iface));
    Some(Promoted {
        cat: Some(CatId::Ssd),
        glyph: cap.replace(' ', ""),
        facet,
        specs,
        ..Default::default()
    })
}

/// Reference total board power (W) of a GPU chip, from NVIDIA / AMD specifications. Partner
/// cards can draw more; the spec is labelled as the reference figure.
fn reference_power(chip: &str, vram: u32) -> Option<f64> {
    Some(match chip {
        "RTX 3050" if vram == 6 => 70.0,
        "RTX 3050" => 130.0,
        "RTX 3060" => 170.0,
        "RTX 3060 TI" => 200.0,
        "RTX 3070" => 220.0,
        "RTX 3080" => 320.0,
        "RTX 5090" => 575.0,
        "RTX 5080" => 360.0,
        "RTX 5070 TI" => 300.0,
        "RTX 5070" => 250.0,
        "RTX 5060 TI" => 180.0,
        "RTX 5060" => 145.0,
        "RTX 5050" => 130.0,
        "RTX 4090" => 450.0,
        "RTX 4080 SUPER" | "RTX 4080" => 320.0,
        "RTX 4070 TI SUPER" | "RTX 4070 TI" => 285.0,
        "RTX 4070 SUPER" => 220.0,
        "RTX 4070" => 200.0,
        "RTX 4060 TI" => 165.0,
        "RTX 4060" => 115.0,
        "RX 9070 XT" => 304.0,
        "RX 9070" | "RX 9070 GRE" => 220.0,
        "RX 9060 XT" => 160.0,
        "RX 7900 XTX" => 355.0,
        "RX 7900 XT" => 315.0,
        "RX 7900 GRE" => 260.0,
        "RX 7800 XT" => 263.0,
        "RX 7700 XT" => 245.0,
        "RX 7600 XT" => 190.0,
        "RX 7600" => 165.0,
        _ => return None,
    })
}

fn gpu(t: &str) -> Option<Promoted> {
    static CHIP: LazyLock<Regex> =
        LazyLock::new(|| re(r"(?i)\b(RTX|RX)\s?(\d{4})\s?(Ti\s+Super|Ti|Super|XTX|XT|GRE)?\b"));
    static VRAM: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)\b(\d{1,2})\s?GB\b"));
    static GDDR: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)\b(GDDR[67]X?)\b"));
    let chip = one(distinct(&CHIP, t, |c| {
        let suffix = c
            .get(3)
            .map(|m| {
                format!(
                    " {}",
                    m.as_str()
                        .to_ascii_uppercase()
                        .split_whitespace()
                        .collect::<Vec<_>>()
                        .join(" ")
                )
            })
            .unwrap_or_default();
        Some(format!("{} {}{suffix}", c[1].to_ascii_uppercase(), &c[2]))
    }))?;
    let vram = one(distinct(&VRAM, t, |c| c[1].parse::<u32>().ok()))?;
    let tgp = reference_power(&chip, vram);
    let short = chip.replace(" TI", " Ti").replace(" SUPER", " Super");
    let mut specs = Map::new();
    specs.insert("vram".into(), json!(vram));
    if let Some(m) = one(distinct(&GDDR, t, |c| Some(c[1].to_ascii_uppercase()))) {
        specs.insert("mem".into(), json!(m));
    }
    if let Some(w) = tgp {
        specs.insert("tgp".into(), json!(w));
        specs.insert("tgpNote".into(), json!("reference board power"));
    }
    Some(Promoted {
        cat: Some(CatId::Gpu),
        glyph: short
            .split_whitespace()
            .skip(1)
            .collect::<Vec<_>>()
            .join(" "),
        facet: format!("{vram} GB"),
        specs,
        tgp,
        ..Default::default()
    })
}

fn psu(t: &str) -> Option<Promoted> {
    static WATT: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)\b(\d{3,4})\s?W\b"));
    static EFF: LazyLock<Regex> = LazyLock::new(|| {
        re(
            r"(?i)\b80\s?(?:\+|PLUS)\s*(?:CYBERNETICS\s+)?(Bronze|Silver|Gold|Platinum|Platinium|Titanium)\b",
        )
    });
    static STD: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)\bATX\s?(3\.[01])\b"));
    let watt = one(distinct(&WATT, t, |c| c[1].parse::<u32>().ok()))
        .filter(|w| (300..=3000).contains(w))?;
    let mut specs = Map::new();
    specs.insert("watt".into(), json!(watt));
    if let Some(e) = one(distinct(&EFF, t, |c| {
        let e = c[1].to_ascii_lowercase().replace("platinium", "platinum");
        Some(format!("80+ {}{}", e[..1].to_ascii_uppercase(), &e[1..]))
    })) {
        specs.insert("eff".into(), json!(e));
    }
    if let Some(v) = one(distinct(&STD, t, |c| Some(c[1].to_string()))) {
        specs.insert("std".into(), json!(format!("ATX {v}")));
    }
    let lt = t.to_ascii_lowercase();
    let modular = if lt.contains("non modular") || lt.contains("non-modular") {
        Some("Non-modular")
    } else if lt.contains("semi modular") || lt.contains("semi-modular") {
        Some("Semi-modular")
    } else if lt.contains("full modular") || lt.contains("fully modular") {
        Some("Fully modular")
    } else {
        None
    };
    if let Some(m) = modular {
        specs.insert("mod".into(), json!(m));
    }
    Some(Promoted {
        cat: Some(CatId::Psu),
        glyph: format!("{watt}W"),
        facet: format!("{watt} W"),
        specs,
        watt: Some(watt as f64),
        ..Default::default()
    })
}

fn case(t: &str) -> Option<Promoted> {
    static IS_CASE: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)\b(case|casing|chassis|tower)\b"));
    static SIZE: LazyLock<Regex> =
        LazyLock::new(|| re(r"(?i)\b(E-?ATX|m-?ATX|Micro[\s-]?ATX|Mini[\s-]?ITX|m?ITX|ATX)\b"));
    static TYPE: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)\b(Full|Mid|Mini)[\s-]?Tower\b"));
    if !IS_CASE.is_match(t) {
        return None;
    }
    // The largest board size the title names; a case takes that size and every smaller one.
    let sizes = distinct(&SIZE, t, |c| {
        let f = c[1].to_ascii_lowercase().replace(['-', ' '], "");
        Some(match f.as_str() {
            "eatx" => 3,
            "atx" => 2,
            "matx" | "microatx" => 1,
            _ => 0,
        })
    });
    let ttype = one(distinct(&TYPE, t, |c| {
        let w = c[1].to_ascii_lowercase();
        Some(format!("{}{} tower", w[..1].to_ascii_uppercase(), &w[1..]))
    }));
    let top = match sizes.iter().max() {
        Some(m) => *m,
        None if ttype.as_deref().is_some_and(|x| x != "Mini tower") => 2,
        None => return None,
    };
    let ffs: Vec<String> = ["Mini-ITX", "mATX", "ATX", "E-ATX"][..=top]
        .iter()
        .rev()
        .map(|s| s.to_string())
        .collect();
    let label = ttype.clone().unwrap_or_else(|| match top {
        3 => "Full tower".into(),
        2 => "Mid tower".into(),
        1 => "Micro tower".into(),
        _ => "Mini-ITX".into(),
    });
    let mut specs = Map::new();
    specs.insert("type".into(), json!(label));
    specs.insert("ffs".into(), json!(ffs.join(", ")));
    Some(Promoted {
        cat: Some(CatId::Case),
        glyph: label.clone(),
        facet: label,
        specs,
        ffs: Some(ffs),
        ..Default::default()
    })
}

fn cooler(t: &str) -> Option<Promoted> {
    static AIO: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)\b(AIO|liquid|water)\b"));
    static AIR: LazyLock<Regex> = LazyLock::new(|| {
        re(
            r"(?i)\b(air cooler|tower|heatsink|AK\d{3}|Peerless|Phantom Spirit|Assassin|Hyper\s?\d{3})\b",
        )
    });
    static RAD: LazyLock<Regex> = LazyLock::new(|| re(r"\b(120|140|240|280|360|420)\b"));
    let mut specs = Map::new();
    if AIO.is_match(t) {
        let rad = one(distinct(&RAD, t, |c| c[1].parse::<u32>().ok()))?;
        specs.insert("type".into(), json!(format!("{rad} AIO")));
        specs.insert("rad".into(), json!(rad));
        return Some(Promoted {
            cat: Some(CatId::Cooler),
            glyph: format!("{rad} AIO"),
            facet: format!("{rad} AIO"),
            specs,
            ctype: Some("aio".into()),
            rad: Some(rad as f64),
            ..Default::default()
        });
    }
    if AIR.is_match(t) || t.to_ascii_lowercase().contains("cpu cooler") {
        specs.insert("type".into(), json!("Air tower"));
        return Some(Promoted {
            cat: Some(CatId::Cooler),
            glyph: "AIR".into(),
            facet: "Air".into(),
            specs,
            ctype: Some("air".into()),
            ..Default::default()
        });
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(label: &str, t: &str) -> Option<Promoted> {
        promote(label, t)
    }

    #[test]
    fn cpus_from_listing_titles() {
        let c = p(
            "Processor",
            "AMD Ryzen 9 9900X with Radeon Graphics / 12 Cores & 24 Threads / Socket AM5",
        )
        .unwrap();
        assert_eq!(
            (c.glyph.as_str(), c.socket.as_deref()),
            ("9900X", Some("AM5"))
        );
        assert_eq!(c.specs["cores"], json!(12));
        assert_eq!(c.specs["threads"], json!(24));
        let i = p("Processor", "Intel® Core™ Ultra 5 225F LGA1851 Processor").unwrap();
        assert_eq!(
            (i.glyph.as_str(), i.socket.as_deref()),
            ("225F", Some("LGA1851"))
        );
        // Socket from the model when the title has none.
        assert_eq!(
            p("Processor", "AMD Ryzen 5 5600X Desktop Processor")
                .unwrap()
                .socket
                .as_deref(),
            Some("AM4")
        );
        // Two models in one listing: no single price, stays a market listing.
        assert!(p(
            "Processor",
            "AMD Ryzen 7 9800X3D / 9850X3D AM5 Gaming Processor"
        )
        .is_none());
        // Power draw is never guessed.
        assert!(c.tdp.is_none());
    }

    #[test]
    fn motherboards_from_listing_titles() {
        let m = p(
            "Motherboard",
            "ASUS PRIME B850M-F WIFI-CSM mATX AMD Motherboard / AMD AM5",
        )
        .unwrap();
        assert_eq!(m.glyph, "B850");
        assert_eq!(
            (m.socket.as_deref(), m.ff.as_deref(), m.mem.as_deref()),
            (Some("AM5"), Some("mATX"), Some("DDR5"))
        );
        let e = p(
            "Motherboard",
            "MSI MEG X870E GODLIKE MAX AMD AM5 EATX Motherboard / Socket AM5 & DDR5",
        )
        .unwrap();
        assert_eq!(e.ff.as_deref(), Some("E-ATX"));
        let i = p(
            "Motherboard",
            "ASUS ROG STRIX B850-I GAMING WIFI mITX AMD Motherboard AM5 DDR5 PCIe 5.0",
        )
        .unwrap();
        assert_eq!(i.ff.as_deref(), Some("Mini-ITX"));
        let a = p(
            "Motherboard",
            "ASROCK B450 Pro4 R2.0 ATX Motherboard / Socket AM4",
        )
        .unwrap();
        assert_eq!(
            (a.socket.as_deref(), a.mem.as_deref()),
            (Some("AM4"), Some("DDR4"))
        );
    }

    #[test]
    fn memory_from_listing_titles() {
        let r = p(
            "Memory",
            "KLEVV URBANE V RGB 32GB 16GBx2 6000MHz CL28 DDR5 Gaming Dual Memory Kit",
        )
        .unwrap();
        assert_eq!(r.specs["cap"], json!(32));
        assert_eq!(r.specs["kit"], json!("2 × 16 GB"));
        assert_eq!(
            (r.specs["speed"].clone(), r.specs["cl"].clone()),
            (json!(6000), json!(28))
        );
        assert_eq!(r.mem.as_deref(), Some("DDR5"));
        // Several capacities / timings for one listing price: not promoted.
        assert!(p(
            "Memory",
            "Acer Predator Hermes RGB 32GB 2x16GB 6400MHz 6800Mhz 7200MHz DDR5 Memory Kit"
        )
        .is_none());
        assert!(p(
            "Memory",
            "G.SKILL Ripjaws DDR5 SO-DIMM 16GB 1x16GB 5600MHz DDR5 CL46 Single Memory"
        )
        .is_none());
        assert!(p(
            "Memory",
            "G.SKILL Ripjaws M5 RGB 32GB 2x16GB 64GB 2x32GB 5200MHz 6000MHz DDR5 Dual Memory Kit"
        )
        .is_none());
    }

    #[test]
    fn ssds_gpus_psus_cases_coolers() {
        let s = p("SSD", "Lexar NM790 2TB M.2 2280 PCIe Gen4 x4 NVMe SSD").unwrap();
        assert_eq!(
            (s.specs["cap"].clone(), s.facet.as_str()),
            (json!("2 TB"), "PCIe 4.0")
        );
        assert!(p(
            "SSD",
            "CORSAIR MP600 PRO XT 1TB / 2TB / 4TB / 8TB PCIe Gen4 x4 NVMe M.2 SSD"
        )
        .is_none());
        assert!(p(
            "SSD",
            "DOTATECH FRIEREN RTX5070Ti PC GAMING PACKAGE / 16GB DDR5 / 1TB SSD"
        )
        .is_none());

        let g = p(
            "Graphics Card",
            "GIGABYTE GeForce RTX 5070 EAGLE ICE OC 12GB GDDR7 White Graphics Card",
        )
        .unwrap();
        assert_eq!(
            (g.glyph.as_str(), g.facet.as_str(), g.tgp),
            ("5070", "12 GB", Some(250.0))
        );
        assert_eq!(
            p(
                "Graphics Card",
                "Colorful GeForce RTX 3050 NB DUO 6G-V 6GB GDDR6"
            )
            .unwrap()
            .tgp,
            Some(70.0)
        );
        let x = p(
            "Graphics Card",
            "SAPPHIRE PULSE AMD Radeon RX 9070 XT Gaming 16GB GDDR6 256bit",
        )
        .unwrap();
        assert_eq!((x.glyph.as_str(), x.tgp), ("9070 XT", Some(304.0)));
        assert!(p("Graphics Card", "Colorful GeForce RTX 5070 Ti Battle AX 16GB-V Colorful GeForce RTX 5070 Ti NB EX 16GB-V").is_some());

        let w = p(
            "Power Supply",
            "SEASONIC Core BC 650W 80+ Bronze ATX 3.1 Non Modular ATX PSU",
        )
        .unwrap();
        assert_eq!(w.watt, Some(650.0));
        assert_eq!(w.specs["eff"], json!("80+ Bronze"));
        assert_eq!(w.specs["mod"], json!("Non-modular"));
        assert!(p(
            "Power Supply",
            "ASUS Pro WS 1600W / 2200W 80 PLUS PLATINUM ATX 3.1 PCIe 5.1 FULL MODULAR"
        )
        .is_none());
        assert!(p(
            "Power Supply",
            "ASUS ROG LOKI 750W / 850W / 1000W / 1200W SFX-L 80PLUS Platinum"
        )
        .is_none());

        let c = p(
            "Case",
            "Thermaltake Commander G31 TG ARGB Mid-Tower ATX PC Case",
        )
        .unwrap();
        assert_eq!(
            c.ffs.as_deref().map(|v| v.join(",")),
            Some("ATX,mATX,Mini-ITX".into())
        );
        assert_eq!(
            p(
                "Case",
                "PHANTEKS Evolv X2 Matrix Mid-Tower Tempered Glass ATX PC Case"
            )
            .unwrap()
            .facet,
            "Mid tower"
        );
        assert!(p("Case", "Nintendo Switch 2 Accessories - EDC Carrying Case").is_none());

        let a = p("Cooler", "DEEPCOOL AK500 G2 PERFORMANCE CPU COOLER").unwrap();
        assert_eq!(a.ctype.as_deref(), Some("air"));
        let l = p("Cooler", "NZXT Kraken Elite 360 RGB AIO Liquid Cooler").unwrap();
        assert_eq!((l.ctype.as_deref(), l.rad), (Some("aio"), Some(360.0)));
        assert!(p(
            "Cooler",
            "THERMALRIGHT Peerless Vision / 240 / 360 ARGB AIO Liquid CPU Cooler"
        )
        .is_none());
    }
}
