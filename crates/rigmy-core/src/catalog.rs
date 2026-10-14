//! Offer resolution, power, compatibility and purchase-plan optimisation.

use std::collections::{BTreeMap, HashMap};

use serde_json::Value;

use crate::content::{ContentError, EtaTable};
use crate::types::*;

// ---------- engineering rules (named so they are visible and tested in one place) ----------

/// Allowance in watts for everything except CPU and GPU (board, RAM, SSD, fans, pump) in the
/// full-load estimate.
pub const BASE_SYSTEM_W: f64 = 95.0;
/// Recommended PSU = estimated load × this headroom factor...
pub const PSU_HEADROOM: f64 = 1.3;
/// ...rounded up to this step (PSUs are sold in 50 W steps).
pub const PSU_STEP_W: f64 = 50.0;
/// GPU length clearance below which the GPU check warns (room for power cables and front fans).
pub const GPU_CLEARANCE_WARN_MM: f64 = 15.0;
/// Board height (the edge that runs top to bottom in a tower) per form factor, from the
/// ATX / microATX / Mini-ITX specifications. Used to say how much an unsupported board overhangs.
pub const BOARD_HEIGHT_MM: &[(&str, f64)] = &[("ATX", 305.0), ("mATX", 244.0), ("Mini-ITX", 170.0)];

fn board_height(ff: &str) -> Option<f64> {
    BOARD_HEIGHT_MM
        .iter()
        .find(|(f, _)| *f == ff)
        .map(|(_, h)| *h)
}

/// Why a bootstrap payload could not be turned into a [`Catalog`].
#[derive(Debug)]
pub enum CatalogError {
    Json(serde_json::Error),
    Content(ContentError),
}

impl std::fmt::Display for CatalogError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CatalogError::Json(e) => write!(f, "{e}"),
            CatalogError::Content(e) => write!(f, "reference data: {e}"),
        }
    }
}

impl std::error::Error for CatalogError {}

/// Format a number like JS `String(n)` for whole numbers, trimming float noise otherwise.
pub fn fmt_num(n: f64) -> String {
    if n.fract() == 0.0 && n.abs() < 1e15 {
        format!("{}", n as i64)
    } else {
        let s = format!("{:.3}", n);
        s.trim_end_matches('0').trim_end_matches('.').to_string()
    }
}

fn spec_str(v: Option<&Value>) -> String {
    match v {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.as_f64().map(fmt_num).unwrap_or_default(),
        Some(other) => other.to_string(),
        None => "undefined".to_string(),
    }
}

/// Indexed catalog built from a [`Bootstrap`] payload. All lookups are in-memory; no IO.
#[derive(Debug, Clone)]
pub struct Catalog {
    pub data: Bootstrap,
    /// Validated `data.content.etas`.
    etas: EtaTable,
    product_idx: HashMap<String, usize>,
    retailer_idx: HashMap<String, usize>,
    branch_idx: HashMap<String, usize>,
    /// product id -> indices into `data.offers`
    offer_idx: HashMap<String, Vec<usize>>,
}

impl Catalog {
    /// Index a bootstrap payload. Fails when `data.content` or `data.postcodes` breaks a rule
    /// (e.g. an incomplete ETA table), so lookups never fall back to made-up values.
    pub fn new(data: Bootstrap) -> Result<Self, ContentError> {
        let etas = data.content.validate(&data.categories)?;
        crate::geo::validate_postcodes(&data.postcodes)?;
        let product_idx = data
            .products
            .iter()
            .enumerate()
            .map(|(i, p)| (p.id.clone(), i))
            .collect();
        let retailer_idx = data
            .retailers
            .iter()
            .enumerate()
            .map(|(i, r)| (r.id.clone(), i))
            .collect();
        let branch_idx = data
            .branches
            .iter()
            .enumerate()
            .map(|(i, b)| (b.id.clone(), i))
            .collect();
        let mut offer_idx: HashMap<String, Vec<usize>> = HashMap::new();
        for (i, o) in data.offers.iter().enumerate() {
            offer_idx.entry(o.product_id.clone()).or_default().push(i);
        }
        Ok(Catalog {
            data,
            etas,
            product_idx,
            retailer_idx,
            branch_idx,
            offer_idx,
        })
    }

    pub fn from_json(json: &str) -> Result<Self, CatalogError> {
        let data = serde_json::from_str(json).map_err(CatalogError::Json)?;
        Self::new(data).map_err(CatalogError::Content)
    }

    /// The delivery-time table from `content.etas`.
    pub fn etas(&self) -> &EtaTable {
        &self.etas
    }

    /// 5-digit postcode -> approximate location from the `postcodes` table.
    pub fn postcode(&self, pc: &str) -> Option<UserLoc> {
        crate::geo::postcode(&self.data.postcodes, pc)
    }

    pub fn region(&self, id: RegionId) -> Option<&Region> {
        self.data.regions.iter().find(|r| r.id == id)
    }

    /// Slowest delivery estimate among the chosen offers (the fastest ETA when nothing is chosen).
    pub fn max_eta<'a>(&self, choice: impl IntoIterator<Item = Option<&'a Offer>>) -> Eta {
        self.etas
            .max_of(choice.into_iter().flatten().filter_map(|o| o.eta))
    }

    pub fn product(&self, id: &str) -> Option<&Product> {
        self.product_idx.get(id).map(|&i| &self.data.products[i])
    }
    pub fn retailer(&self, id: &str) -> Option<&Retailer> {
        self.retailer_idx.get(id).map(|&i| &self.data.retailers[i])
    }
    pub fn branch(&self, id: &str) -> Option<&Branch> {
        self.branch_idx.get(id).map(|&i| &self.data.branches[i])
    }

    /// Resolve one raw listing for a delivery region.
    pub fn resolve(&self, p: &Product, raw: &RawOffer, r: &Retailer, region: RegionId) -> Offer {
        let warranty = p.warranty_text();
        match r.delivery.get(&region) {
            None => Offer {
                raw: raw.clone(),
                avail: false,
                fee: None,
                eta: None,
                status: "No delivery".to_string(),
                warranty,
            },
            Some(d) => {
                // Bulky parts ship as oversize parcels: `[delivery] size_multiplier` in content.toml.
                let big = self.data.content.size_multiplier_for(p.cat);
                // Pre-orders ship whenever stock lands: show the slowest bucket in the table.
                let eta = if raw.stock == StockState::PreOrder {
                    Some(self.etas.slowest())
                } else {
                    d.eta
                };
                Offer {
                    raw: raw.clone(),
                    avail: raw.stock.available(),
                    fee: d.fee.map(|f| f * big),
                    eta,
                    status: raw.stock.as_str().to_string(),
                    warranty,
                }
            }
        }
    }

    /// All known listings for a product, resolved for `region`, in retailer (config) order.
    /// Listings from retailers that are not in the catalog (disabled / removed) are ignored.
    pub fn offers(&self, product_id: &str, region: RegionId) -> Vec<Offer> {
        let Some(p) = self.product(product_id) else {
            return vec![];
        };
        let Some(idx) = self.offer_idx.get(product_id) else {
            return vec![];
        };
        let mut out: Vec<(usize, Offer)> = idx
            .iter()
            .filter_map(|&i| {
                let raw = &self.data.offers[i];
                let ri = *self.retailer_idx.get(&raw.retailer_id)?;
                Some((ri, self.resolve(p, raw, &self.data.retailers[ri], region)))
            })
            .collect();
        out.sort_by_key(|(ri, _)| *ri);
        out.into_iter().map(|(_, o)| o).collect()
    }

    /// Cheapest available offer (first one wins ties, like the prototype's reduce).
    pub fn lowest(&self, product_id: &str, region: RegionId) -> Option<Offer> {
        pick_cheapest(
            self.offers(product_id, region)
                .into_iter()
                .filter(|o| o.avail),
        )
    }

    fn part(&self, build: &Build, cat: CatId) -> Option<&Product> {
        build
            .get(&cat)
            .and_then(|id| self.product(id))
            .filter(|p| p.cat == Some(cat.product_cat()))
    }

    pub fn power(&self, build: &Build) -> Power {
        let cpu = self.part(build, CatId::Cpu);
        let gpu = self.part(build, CatId::Gpu);
        let est = cpu.and_then(|p| p.tdp).unwrap_or(0.0)
            + gpu.and_then(|p| p.tgp).unwrap_or(0.0)
            + BASE_SYSTEM_W;
        let rec = (est * PSU_HEADROOM / PSU_STEP_W).ceil() * PSU_STEP_W;
        let psu = self
            .part(build, CatId::Psu)
            .and_then(|p| p.watt)
            .unwrap_or(0.0);
        Power { est, rec, psu }
    }

    /// Cheapest product (by current lowest available price in `region`) matching `filter`.
    /// Unpriced products only win when nothing matching has a price; then the first by name.
    pub fn cheapest<F: Fn(&Product) -> bool>(
        &self,
        region: RegionId,
        filter: F,
    ) -> Option<&Product> {
        let cands: Vec<&Product> = self.data.products.iter().filter(|p| filter(p)).collect();
        let priced = cands
            .iter()
            .filter_map(|p| self.lowest(&p.id, region).map(|o| (o.raw.price, *p)))
            .fold(None::<(f64, &Product)>, |acc, c| match acc {
                Some(a) if a.0 <= c.0 => Some(a),
                _ => Some(c),
            });
        if let Some((_, p)) = priced {
            return Some(p);
        }
        cands.into_iter().min_by(|a, b| a.name.cmp(&b.name))
    }

    /// Compatibility checks with the prototype's exact wording. Fix suggestions are priced
    /// against live offers in `region` (default Klang Valley in the WASM/API wrappers).
    pub fn compat(&self, b: &Build, region: RegionId) -> Vec<Check> {
        let cpu = self.part(b, CatId::Cpu);
        let mobo = self.part(b, CatId::Mobo);
        let ram = self.part(b, CatId::Ram);
        let gpu = self.part(b, CatId::Gpu);
        let cs = self.part(b, CatId::Case);
        let psu = self.part(b, CatId::Psu);
        let cool = self.part(b, CatId::Cooler);
        let mut out = Vec::new();
        let fix = |cat: CatId, p: Option<&Product>| {
            p.map(|p| Fix {
                cat,
                id: p.id.clone(),
                text: format!("Use {}", p.name),
            })
        };
        let pending = |id: CheckId, label: &str, detail: &str| Check {
            id,
            label: label.into(),
            value: "Waiting".into(),
            status: Tone::Pending,
            parts: vec![],
            detail: detail.into(),
            fix: None,
        };
        let s = |o: &Option<String>| o.clone().unwrap_or_default();
        let ffs = |c: &Product| c.ffs.clone().unwrap_or_default();
        let n = |v: Option<f64>| v.unwrap_or(0.0);
        // A part promoted from a retailer listing may not state a spec a check needs: say so
        // instead of comparing against a blank and raising a false error.
        let unlisted = |id: CheckId, label: &str, p: &Product, what: &str, parts: Vec<CatId>| {
            Check {
            id,
            label: label.into(),
            value: "Not listed".into(),
            status: Tone::Warn,
            parts,
            detail: format!(
                "The retailer listing for the {} does not state its {what}. Check it with the shop before you buy.",
                p.short_name()
            ),
            fix: None,
        }
        };

        // socket
        match (cpu, mobo) {
            (Some(cpu), Some(_)) if cpu.socket.is_none() => out.push(unlisted(
                CheckId::Socket,
                "CPU socket",
                cpu,
                "socket",
                vec![CatId::Cpu],
            )),
            (Some(_), Some(mobo)) if mobo.socket.is_none() => out.push(unlisted(
                CheckId::Socket,
                "CPU socket",
                mobo,
                "socket",
                vec![CatId::Mobo],
            )),
            (Some(cpu), Some(mobo)) => {
                let ok = cpu.socket == mobo.socket;
                let fx = if ok {
                    None
                } else {
                    self.cheapest(region, |p| {
                        p.cat == Some(CatId::Mobo)
                            && p.socket == cpu.socket
                            && cs.is_none_or(|c| p.ff.as_ref().is_some_and(|f| ffs(c).contains(f)))
                    })
                };
                let (cs_, ms) = (s(&cpu.socket), s(&mobo.socket));
                out.push(Check {
                    id: CheckId::Socket,
                    label: "CPU socket".into(),
                    value: if ok { format!("{cs_} = {ms}") } else { format!("{cs_} ≠ {ms}") },
                    status: if ok { Tone::Ok } else { Tone::Error },
                    parts: if ok { vec![] } else { vec![CatId::Cpu, CatId::Mobo] },
                    detail: if ok {
                        format!("The {} drops straight into the {} socket.", cpu.glyph, mobo.glyph)
                    } else {
                        format!(
                            "The {} needs an {cs_} board. The {} is {ms}, so the CPU will not physically fit.",
                            cpu.name, mobo.glyph
                        )
                    },
                    fix: fix(CatId::Mobo, fx),
                });
            }
            _ => out.push(pending(
                CheckId::Socket,
                "CPU socket",
                "Add a CPU and a motherboard to check the socket.",
            )),
        }

        // memory
        match (ram, mobo) {
            (Some(ram), Some(_)) if ram.mem.is_none() => out.push(unlisted(
                CheckId::Mem,
                "Memory type",
                ram,
                "memory type",
                vec![CatId::Ram],
            )),
            (Some(_), Some(mobo)) if mobo.mem.is_none() => out.push(unlisted(
                CheckId::Mem,
                "Memory type",
                mobo,
                "memory type",
                vec![CatId::Mobo],
            )),
            (Some(ram), Some(mobo)) => {
                let (rm, mm) = (s(&ram.mem), s(&mobo.mem));
                if rm == mm {
                    out.push(Check {
                        id: CheckId::Mem,
                        label: "Memory type".into(),
                        value: format!("{rm} = {mm}"),
                        status: Tone::Ok,
                        parts: vec![],
                        detail: format!(
                            "{rm} kit on a {mm} board. Enable {} in BIOS for {} MT/s.",
                            spec_str(ram.specs.get("expo")),
                            spec_str(ram.specs.get("speed"))
                        ),
                        fix: None,
                    });
                } else {
                    let fx =
                        self.cheapest(region, |p| p.cat == Some(CatId::Ram) && p.mem == mobo.mem);
                    out.push(Check {
                        id: CheckId::Mem,
                        label: "Memory type".into(),
                        value: format!("{rm} ≠ {mm}"),
                        status: Tone::Error,
                        parts: vec![CatId::Ram, CatId::Mobo],
                        detail: format!(
                            "The {} is {rm} memory. The {} only takes {mm}.",
                            ram.name, mobo.glyph
                        ),
                        fix: fix(CatId::Ram, fx),
                    });
                }
            }
            _ => out.push(pending(
                CheckId::Mem,
                "Memory type",
                "Add memory and a motherboard.",
            )),
        }

        // form factor
        match (mobo, cs) {
            (Some(mobo), Some(_)) if mobo.ff.is_none() => out.push(unlisted(
                CheckId::Ff,
                "Board form factor",
                mobo,
                "form factor",
                vec![CatId::Mobo],
            )),
            (Some(_), Some(cs)) if cs.ffs.as_ref().is_none_or(|v| v.is_empty()) => {
                out.push(unlisted(
                    CheckId::Ff,
                    "Board form factor",
                    cs,
                    "supported board sizes",
                    vec![CatId::Case],
                ))
            }
            (Some(mobo), Some(cs)) => {
                let mff = s(&mobo.ff);
                let ok = ffs(cs).contains(&mff);
                let fx = if ok {
                    None
                } else {
                    self.cheapest(region, |p| {
                        p.cat == Some(CatId::Mobo)
                            && p.socket == mobo.socket
                            && p.ff.as_ref().is_some_and(|f| ffs(cs).contains(f))
                    })
                };
                out.push(Check {
                    id: CheckId::Ff,
                    label: "Board form factor".into(),
                    value: if ok {
                        format!("{mff} in {}", cs.short_name())
                    } else {
                        format!("{mff} ✕ {}", cs.short_name())
                    },
                    status: if ok { Tone::Ok } else { Tone::Error },
                    parts: if ok {
                        vec![]
                    } else {
                        vec![CatId::Mobo, CatId::Case]
                    },
                    detail: if ok {
                        format!("Standoffs line up for {mff}.")
                    } else {
                        // How far the board overhangs the largest board the case takes, when
                        // both heights are known.
                        let over = board_height(&mff).zip(
                            ffs(cs)
                                .iter()
                                .filter_map(|f| board_height(f))
                                .reduce(f64::max),
                        );
                        let tail = match over {
                            Some((b, c)) if b > c => {
                                format!(
                                    " An {mff} board is about {} mm taller than the tray.",
                                    fmt_num(b - c)
                                )
                            }
                            _ => String::new(),
                        };
                        format!(
                            "The {} only takes {} boards.{tail}",
                            cs.name,
                            ffs(cs).join(" / ")
                        )
                    },
                    fix: fix(CatId::Mobo, fx),
                });
            }
            _ => out.push(pending(
                CheckId::Ff,
                "Board form factor",
                "Add a motherboard and a case.",
            )),
        }

        // GPU clearance
        match (gpu, cs) {
            (Some(gpu), Some(_)) if gpu.length.is_none() => out.push(unlisted(
                CheckId::Gpu,
                "GPU clearance",
                gpu,
                "card length",
                vec![CatId::Gpu],
            )),
            (Some(_), Some(cs)) if cs.max_gpu.is_none() => out.push(unlisted(
                CheckId::Gpu,
                "GPU clearance",
                cs,
                "maximum GPU length",
                vec![CatId::Case],
            )),
            (Some(gpu), Some(cs)) => {
                let (len, max) = (n(gpu.length), n(cs.max_gpu));
                let spare = max - len;
                let st = if spare < 0.0 {
                    Tone::Error
                } else if spare < GPU_CLEARANCE_WARN_MM {
                    Tone::Warn
                } else {
                    Tone::Ok
                };
                let fx = if st == Tone::Error {
                    self.cheapest(region, |p| {
                        p.cat == Some(CatId::Case)
                            && n(p.max_gpu) >= len + GPU_CLEARANCE_WARN_MM
                            && mobo
                                .is_none_or(|m| m.ff.as_ref().is_some_and(|f| ffs(p).contains(f)))
                    })
                } else {
                    None
                };
                out.push(Check {
                    id: CheckId::Gpu,
                    label: "GPU clearance".into(),
                    value: format!("{} / {} mm", fmt_num(len), fmt_num(max)),
                    status: st,
                    parts: if st == Tone::Ok { vec![] } else { vec![CatId::Gpu, CatId::Case] },
                    detail: match st {
                        Tone::Error => format!(
                            "The {} is {} mm long. The {} has {} mm, so the card hits the front fans by {} mm.",
                            gpu.short_name(),
                            fmt_num(len),
                            cs.short_name(),
                            fmt_num(max),
                            fmt_num(-spare)
                        ),
                        Tone::Warn => format!("Fits with {} mm spare. Front fans and cables will be tight.", fmt_num(spare)),
                        _ => format!("{} mm spare in front of the card.", fmt_num(spare)),
                    },
                    fix: fix(CatId::Case, fx),
                });
            }
            _ => out.push(pending(
                CheckId::Gpu,
                "GPU clearance",
                "Add a graphics card and a case.",
            )),
        }

        // cooler fit
        let cooler_fits = |p: &Product, cs: &Product| match p.ctype.as_deref() {
            Some("aio") => n(p.rad) <= n(cs.rad_top),
            _ => p.height.is_some() && n(p.height) <= n(cs.max_cooler),
        };
        let cooler_gap = |cool: &Product, cs: &Product| -> Option<(&'static str, bool)> {
            match cool.ctype.as_deref() {
                None => Some(("cooler type", true)),
                Some("aio") if cool.rad.is_none() => Some(("radiator size", true)),
                Some("aio") if cs.rad_top.is_none() => Some(("top radiator support", false)),
                Some("aio") => None,
                _ if cool.height.is_none() => Some(("cooler height", true)),
                _ if cs.max_cooler.is_none() => Some(("maximum cooler height", false)),
                _ => None,
            }
        };
        match (cool, cs) {
            (Some(cool), Some(cs)) if cooler_gap(cool, cs).is_some() => {
                let (what, on_cooler) = cooler_gap(cool, cs).unwrap_or(("size", true));
                let (p, c) = if on_cooler {
                    (cool, CatId::Cooler)
                } else {
                    (cs, CatId::Case)
                };
                out.push(unlisted(CheckId::Cool, "Cooler fit", p, what, vec![c]))
            }
            (Some(cool), Some(cs)) => {
                let mut st = Tone::Ok;
                let (val, det);
                let mut fx = None;
                let alt = || {
                    self.cheapest(region, |p| {
                        p.cat == Some(CatId::Cooler)
                            && cooler_fits(p, cs)
                            && cpu.is_none_or(|c| n(p.max_tdp) >= n(c.tdp))
                    })
                };
                if cool.ctype.as_deref() == Some("aio") {
                    let (rad, top) = (n(cool.rad), n(cs.rad_top));
                    val = format!("{} / {} mm top", fmt_num(rad), fmt_num(top));
                    if rad > top {
                        st = Tone::Error;
                        det = format!(
                            "A {} mm radiator will not mount. The {} supports up to {} mm at the top.",
                            fmt_num(rad),
                            cs.short_name(),
                            fmt_num(top)
                        );
                        fx = alt();
                    } else {
                        det = format!("{} mm radiator mounts at the top as exhaust.", fmt_num(rad));
                    }
                } else {
                    let (h, max) = (n(cool.height), n(cs.max_cooler));
                    val = format!("{} / {} mm", fmt_num(h), fmt_num(max));
                    if h > max {
                        st = Tone::Error;
                        det = format!(
                            "Tower is {} mm too tall for the side panel.",
                            fmt_num(h - max)
                        );
                        fx = alt();
                    } else {
                        det = format!("{} mm between tower and glass.", fmt_num(max - h));
                    }
                }
                out.push(Check {
                    id: CheckId::Cool,
                    label: "Cooler fit".into(),
                    value: val,
                    status: st,
                    parts: if st == Tone::Ok {
                        vec![]
                    } else {
                        vec![CatId::Cooler, CatId::Case]
                    },
                    detail: det,
                    fix: fix(CatId::Cooler, fx),
                });
            }
            _ => out.push(pending(
                CheckId::Cool,
                "Cooler fit",
                "Add a cooler and a case.",
            )),
        }

        // thermal headroom (only reported when it is a problem)
        if let (Some(cool), Some(cpu)) = (cool, cpu) {
            let (mt, tdp) = (n(cool.max_tdp), n(cpu.tdp));
            if cool.max_tdp.is_some() && cpu.tdp.is_some() && mt < tdp {
                let fx = self.cheapest(region, |p| {
                    p.cat == Some(CatId::Cooler)
                        && n(p.max_tdp) >= tdp
                        && cs.is_none_or(|c| cooler_fits(p, c))
                });
                out.push(Check {
                    id: CheckId::Therm,
                    label: "Thermal headroom".into(),
                    value: format!("{} W on {} W", fmt_num(tdp), fmt_num(mt)),
                    status: Tone::Warn,
                    parts: vec![CatId::Cooler],
                    detail: format!(
                        "The {} is rated for about {} W. Expect clock drops under long all-core loads.",
                        cool.glyph,
                        fmt_num(mt)
                    ),
                    fix: fix(CatId::Cooler, fx),
                });
            }
        }

        // power
        let pw = self.power(b);
        let unpowered: Vec<&Product> = [
            (cpu, cpu.and_then(|p| p.tdp)),
            (gpu, gpu.and_then(|p| p.tgp)),
        ]
        .into_iter()
        .filter_map(|(p, w)| p.filter(|_| w.is_none()))
        .collect();
        match psu {
            Some(psu) if psu.watt.is_none() => out.push(unlisted(
                CheckId::Psu,
                "Power headroom",
                psu,
                "wattage",
                vec![CatId::Psu],
            )),
            Some(psu) if !unpowered.is_empty() => {
                let names: Vec<&str> = unpowered.iter().map(|p| p.short_name()).collect();
                out.push(Check {
                    id: CheckId::Psu,
                    label: "Power headroom".into(),
                    value: format!("{} W known of {} W", fmt_num(pw.est), fmt_num(n(psu.watt))),
                    status: Tone::Warn,
                    parts: unpowered.iter().filter_map(|p| p.cat).collect(),
                    detail: format!(
                        "The retailer does not list the power draw of the {}, so the estimate leaves it out. Check it before relying on this PSU.",
                        names.join(" and ")
                    ),
                    fix: None,
                });
            }
            Some(psu) => {
                let w = n(psu.watt);
                let st = if w < pw.est {
                    Tone::Error
                } else if w < pw.rec {
                    Tone::Warn
                } else {
                    Tone::Ok
                };
                let fx = if st == Tone::Ok {
                    None
                } else {
                    self.cheapest(region, |p| p.cat == Some(CatId::Psu) && n(p.watt) >= pw.rec)
                };
                out.push(Check {
                    id: CheckId::Psu,
                    label: "Power headroom".into(),
                    value: format!("{} W of {} W", fmt_num(pw.est), fmt_num(w)),
                    status: st,
                    parts: if st == Tone::Ok { vec![] } else { vec![CatId::Psu] },
                    detail: match st {
                        Tone::Error => format!("Estimated load is {} W, above the {} W rating.", fmt_num(pw.est), fmt_num(w)),
                        Tone::Warn => format!(
                            "Works, but leaves little margin for transient GPU spikes. {} W recommended.",
                            fmt_num(pw.rec)
                        ),
                        _ => format!("{}% headroom at estimated full load.", ((1.0 - pw.est / w) * 100.0).round()),
                    },
                    fix: fix(CatId::Psu, fx),
                });
            }
            None => out.push(pending(
                CheckId::Psu,
                "Power headroom",
                "Add a power supply.",
            )),
        }
        out
    }

    /// Purchase plan: per-part offers plus best / fastest / single-shop / custom strategies.
    /// `picks` maps product id -> preferred retailer id (custom mode).
    pub fn plan(&self, b: &Build, region: RegionId, picks: &HashMap<String, String>) -> Plan {
        let rows: Vec<PlanRow> = CatId::ALL
            .iter()
            .filter_map(|c| self.part(b, *c))
            .map(|p| PlanRow {
                p: p.clone(),
                offers: self.offers(&p.id, region),
            })
            .collect();

        let sum_plan = |choice: Choice| -> PlanTotal {
            let mut parts = 0.0;
            let mut missing = 0;
            // (retailer id, largest size multiplier among the parts bought there), in first-seen order.
            let mut shops: Vec<(&str, f64, f64)> = vec![];
            for r in &rows {
                match choice.get(&r.p.id).and_then(|o| o.as_ref()) {
                    None => missing += 1,
                    Some(o) => {
                        parts += o.raw.price;
                        let m = self.data.content.size_multiplier_for(r.p.cat);
                        match shops.iter_mut().find(|(id, _, _)| *id == o.raw.retailer_id) {
                            Some(s) => {
                                s.1 = s.1.max(m);
                                s.2 += o.raw.price;
                            }
                            None => shops.push((&o.raw.retailer_id, m, o.raw.price)),
                        }
                    }
                }
            }
            // One shipment per shop: the shop's region fee × the bulkiest part's size multiplier,
            // consistent with the per-offer `fee`.
            let mut fee = 0.0;
            let mut unknown_fees = 0;
            for (rid, m, sub) in &shops {
                match self.retailer(rid).and_then(|r| r.delivery.get(&region)) {
                    // A published free-delivery threshold waives the fee for that shop's order.
                    Some(Delivery {
                        free_over: Some(t), ..
                    }) if sub >= t => {}
                    Some(Delivery { fee: Some(f), .. }) => fee += f * m,
                    Some(_) => unknown_fees += 1,
                    None => unknown_fees += 1,
                }
            }
            PlanTotal {
                parts,
                fee,
                total: parts + fee,
                shops: shops.len() as u32,
                missing,
                unknown_fees,
                choice,
            }
        };
        let choice_from = |f: &dyn Fn(&PlanRow) -> Option<Offer>| -> Choice {
            rows.iter().map(|r| (r.p.id.clone(), f(r))).collect()
        };

        let best_of = |r: &PlanRow| pick_cheapest(r.offers.iter().filter(|o| o.avail).cloned());
        let best = choice_from(&best_of);
        let fast = choice_from(&|r: &PlanRow| {
            let mut av: Vec<&Offer> = r.offers.iter().filter(|o| o.avail).collect();
            av.sort_by(|a, c| {
                let ra = a.eta.map_or(u32::MAX, |e| self.etas.rank(e));
                let rc = c.eta.map_or(u32::MAX, |e| self.etas.rank(e));
                ra.cmp(&rc).then(a.raw.price.total_cmp(&c.raw.price))
            });
            av.first().map(|o| (*o).clone())
        });
        let shop_totals: Vec<ShopTotal> = self
            .data
            .retailers
            .iter()
            .map(|rt| {
                let ch = choice_from(&|r: &PlanRow| {
                    r.offers
                        .iter()
                        .find(|o| o.raw.retailer_id == rt.id && o.avail)
                        .cloned()
                });
                ShopTotal {
                    total: sum_plan(ch),
                    rid: rt.id.clone(),
                    retailer: rt.clone(),
                }
            })
            .collect();
        let mut full: Vec<&ShopTotal> = shop_totals
            .iter()
            .filter(|s| s.total.missing == 0)
            .collect();
        full.sort_by(|a, c| a.total.total.total_cmp(&c.total.total));
        let single_pick = full.first().copied().or_else(|| {
            let mut all: Vec<&ShopTotal> = shop_totals.iter().collect();
            all.sort_by(|a, c| {
                a.total
                    .missing
                    .cmp(&c.total.missing)
                    .then(a.total.total.total_cmp(&c.total.total))
            });
            all.first().copied()
        });
        let single = match single_pick {
            Some(s) => SinglePlan {
                total: s.total.clone(),
                rid: Some(s.rid.clone()),
                retailer: Some(s.retailer.clone()),
            },
            None => SinglePlan {
                total: sum_plan(choice_from(&|_| None)),
                rid: None,
                retailer: None,
            },
        };
        let custom = choice_from(&|r: &PlanRow| {
            picks
                .get(&r.p.id)
                .and_then(|pk| {
                    r.offers
                        .iter()
                        .find(|o| &o.raw.retailer_id == pk && o.avail)
                        .cloned()
                })
                .or_else(|| best_of(r))
        });
        Plan {
            best: sum_plan(best),
            fast: sum_plan(fast),
            single,
            custom: sum_plan(custom),
            shop_totals,
            rows,
        }
    }

    /// Swap/upgrade suggestions for a build. For every filled slot, lists the other catalogue
    /// parts in the same category that keep the build free of compatibility *errors* (warnings
    /// are allowed — they are caveats, not failures), each with its lowest regional price.
    ///
    /// Deliberately not a quality ranking: the catalogue has no manufacturer tier data, so the
    /// UI shows "other parts that fit" with real prices and lets the user judge the trade.
    pub fn swaps(&self, b: &Build, region: RegionId) -> Vec<SlotSwaps> {
        let mut out = Vec::new();
        for (cat, cur_id) in b {
            let Some(cur) = self.product(cur_id) else {
                continue;
            };
            if cur.cat != Some(*cat) {
                continue; // a build slot only ever holds a catalogue part in its own category
            }
            let mut options: Vec<SwapOption> = Vec::new();
            for p in &self.data.products {
                if p.cat != Some(*cat) || p.id == *cur_id {
                    continue;
                }
                let mut alt = b.clone();
                alt.insert(*cat, p.id.clone());
                if self
                    .compat(&alt, region)
                    .iter()
                    .any(|c| c.status == Tone::Error)
                {
                    continue;
                }
                let price = self.lowest(&p.id, region).map(|o| o.raw.price);
                options.push(SwapOption {
                    id: p.id.clone(),
                    price,
                });
            }
            if options.is_empty() {
                continue;
            }
            options.sort_by(|a, b2| match (a.price, b2.price) {
                (Some(x), Some(y)) => x.partial_cmp(&y).unwrap_or(std::cmp::Ordering::Equal),
                (Some(_), None) => std::cmp::Ordering::Less,
                (None, Some(_)) => std::cmp::Ordering::Greater,
                (None, None) => a.id.cmp(&b2.id),
            });
            out.push(SlotSwaps {
                cat: *cat,
                current: cur_id.clone(),
                options,
            });
        }
        out
    }
}

fn pick_cheapest(it: impl Iterator<Item = Offer>) -> Option<Offer> {
    it.fold(None, |acc: Option<Offer>, o| match acc {
        Some(a) if o.raw.price >= a.raw.price => Some(a),
        _ => Some(o),
    })
}

/// Parse a loosely-typed build object (`Partial<Record<CatId, string>>`, unknown keys ignored).
pub fn build_from_map(m: &BTreeMap<String, Option<String>>) -> Build {
    m.iter()
        .filter_map(|(k, v)| Some((CatId::from_str(k)?, v.clone().filter(|s| !s.is_empty())?)))
        .collect()
}
