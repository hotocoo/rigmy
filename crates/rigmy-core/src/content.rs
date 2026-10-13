//! Reference and editorial content (`config/content.toml`, served as `Bootstrap.content`) and the
//! delivery-time table derived from it.
//!
//! - [`Content`] is the camelCase wire shape from `web/src/lib/types.ts`.
//! - [`ContentFile`] is the TOML schema of `config/content.toml` (snake_case keys, unknown keys
//!   rejected). It reuses the wire element types; their snake_case spellings are serde aliases.
//! - [`Content::validate`] is the one set of rules. The API runs it when loading config and the
//!   browser engine runs it on every bootstrap, so both sides agree on what is valid.
//! - [`EtaTable`] is the only source of ETA speed ranks and day counts. Nothing derives them from
//!   the order of the [`Eta`] variants.

use std::collections::{BTreeMap, HashSet};
use std::fmt;

use serde::{de, Deserialize, Deserializer, Serialize, Serializer};

use crate::types::{CatId, Category, Eta};

/// Placeholder that courier tracking URL templates must contain.
pub const TRACKING_PLACEHOLDER: &str = "{tracking}";
/// Delivery fee multiplier for categories not listed in `[delivery] size_multiplier`.
pub const DEFAULT_SIZE_MULTIPLIER: f64 = 1.0;
/// Upper bound for `slot_days` (the delivery-day picker shows one chip per day).
pub const MAX_SLOT_DAYS: u32 = 31;

/// A content rule was broken. The message names the section and entry.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContentError(pub String);

impl fmt::Display for ContentError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for ContentError {}

macro_rules! fail {
    ($($t:tt)*) => { return Err(ContentError(format!($($t)*))) };
}

// ---------------------------------------------------------------------------------------------
// wire types

/// One delivery-time bucket: `rank` orders them (0 = fastest), `days` is the worst-case number of
/// working days, used to schedule the earliest delivery slot.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EtaDef {
    pub label: Eta,
    pub rank: u32,
    pub days: u32,
}

/// `CatId | 'cables'`. A guide step with no target (`null`) is `Option::None`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum GuideCat {
    Part(CatId),
    Cables,
}

impl GuideCat {
    pub const CABLES: &'static str = "cables";

    pub fn as_str(self) -> &'static str {
        match self {
            GuideCat::Part(c) => c.as_str(),
            GuideCat::Cables => Self::CABLES,
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        if s == Self::CABLES {
            Some(GuideCat::Cables)
        } else {
            CatId::from_str(s).map(GuideCat::Part)
        }
    }
}

impl Serialize for GuideCat {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(self.as_str())
    }
}

impl<'de> Deserialize<'de> for GuideCat {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let s = String::deserialize(d)?;
        GuideCat::parse(&s).ok_or_else(|| {
            de::Error::custom(format!(
                "unknown guide cat '{s}': expected a category id ({}) or \"{}\"; \
                 leave `cat` out for a step that installs no part",
                cat_list(),
                GuideCat::CABLES
            ))
        })
    }
}

fn cat_list() -> String {
    CatId::ALL
        .iter()
        .map(|c| c.as_str())
        .collect::<Vec<_>>()
        .join(", ")
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GuideStepDef {
    /// Part the step installs, `cables` for cable routing, `null` for the final close-up step.
    #[serde(default)]
    pub cat: Option<GuideCat>,
    pub title: String,
    pub minutes: u32,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CableRunDef {
    /// Matches the studio's cable mesh id.
    pub id: String,
    pub name: String,
    pub conn: String,
    #[serde(alias = "length_mm")]
    pub length_mm: u32,
    /// The run only exists when this part is in the build.
    pub requires: CatId,
    pub tidy: String,
    pub stock: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Courier {
    pub name: String,
    /// Public tracking page containing [`TRACKING_PLACEHOLDER`]; absent when no stable URL is known.
    #[serde(
        default,
        alias = "tracking_url",
        skip_serializing_if = "Option::is_none"
    )]
    pub tracking_url: Option<String>,
}

impl Courier {
    /// Tracking link for `tracking` (URL-component encoded), or `None` without a template.
    pub fn tracking_link(&self, tracking: &str) -> Option<String> {
        let t = self.tracking_url.as_ref()?;
        Some(t.replace(TRACKING_PLACEHOLDER, &encode_component(tracking)))
    }
}

/// `encodeURIComponent` equivalent.
fn encode_component(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Content {
    pub etas: Vec<EtaDef>,
    pub delivery_windows: Vec<String>,
    pub slot_days: u32,
    /// Delivery-fee multiplier per category for bulky parts (e.g. cases ship as oversize
    /// parcels). Unlisted categories use [`DEFAULT_SIZE_MULTIPLIER`].
    pub delivery_size_multiplier: BTreeMap<CatId, f64>,
    pub guide: Vec<GuideStepDef>,
    pub cable_runs: Vec<CableRunDef>,
    pub couriers: Vec<Courier>,
}

// ---------------------------------------------------------------------------------------------
// config/content.toml schema

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CheckoutFile {
    pub delivery_windows: Vec<String>,
    pub slot_days: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DeliveryFile {
    #[serde(default)]
    pub size_multiplier: BTreeMap<CatId, f64>,
}

/// `config/content.toml`. Parse it with any serde format, then call [`ContentFile::into_content`]
/// and [`Content::validate`].
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ContentFile {
    pub checkout: CheckoutFile,
    pub delivery: DeliveryFile,
    pub eta: Vec<EtaDef>,
    #[serde(default)]
    pub guide: Vec<GuideStepDef>,
    #[serde(default)]
    pub cable_run: Vec<CableRunDef>,
    #[serde(default)]
    pub courier: Vec<Courier>,
}

impl ContentFile {
    pub fn into_content(self) -> Content {
        let mut etas = self.eta;
        etas.sort_by_key(|e| e.rank);
        Content {
            etas,
            delivery_windows: self.checkout.delivery_windows,
            slot_days: self.checkout.slot_days,
            delivery_size_multiplier: self.delivery.size_multiplier,
            guide: self.guide,
            cable_runs: self.cable_run,
            couriers: self.courier,
        }
    }
}

// ---------------------------------------------------------------------------------------------
// validation

fn blank(s: &str) -> bool {
    s.trim().is_empty()
}

impl Content {
    /// Check every content rule. `categories` are the catalog categories that guide steps and
    /// cable runs may reference. Returns the validated ETA table.
    pub fn validate(&self, categories: &[Category]) -> Result<EtaTable, ContentError> {
        let etas = EtaTable::new(&self.etas)?;
        let known = |c: CatId| categories.iter().any(|k| k.id == c);

        if self.delivery_windows.is_empty() {
            fail!("checkout.delivery_windows: list at least one delivery window");
        }
        let mut seen = HashSet::new();
        for w in &self.delivery_windows {
            if blank(w) {
                fail!("checkout.delivery_windows: windows must not be blank");
            }
            if !seen.insert(w.as_str()) {
                fail!("checkout.delivery_windows: '{w}' is listed twice");
            }
        }
        if !(1..=MAX_SLOT_DAYS).contains(&self.slot_days) {
            fail!(
                "checkout.slot_days: {} is out of range (1–{MAX_SLOT_DAYS})",
                self.slot_days
            );
        }

        for (c, m) in &self.delivery_size_multiplier {
            if !known(*c) {
                fail!("delivery.size_multiplier: category '{c}' is not in catalog.json categories");
            }
            if !(m.is_finite() && *m > 0.0) {
                fail!("delivery.size_multiplier: '{c}' must be a number greater than 0 (got {m})");
            }
        }

        for (i, g) in self.guide.iter().enumerate() {
            let at = format!("guide step {} ('{}')", i + 1, g.title);
            if blank(&g.title) || blank(&g.text) {
                fail!("{at}: title and text are required");
            }
            if g.minutes == 0 {
                fail!("{at}: minutes must be greater than 0");
            }
            if let Some(GuideCat::Part(c)) = g.cat {
                if !known(c) {
                    fail!("{at}: category '{c}' is not in catalog.json categories");
                }
            }
        }

        let mut ids = HashSet::new();
        for r in &self.cable_runs {
            if blank(&r.id) {
                fail!("cable_run: id is required");
            }
            let at = format!("cable_run '{}'", r.id);
            if !ids.insert(r.id.as_str()) {
                fail!("{at}: duplicate id");
            }
            if [&r.name, &r.conn, &r.tidy, &r.stock]
                .iter()
                .any(|s| blank(s))
            {
                fail!("{at}: name, conn, tidy and stock are required");
            }
            if r.length_mm == 0 {
                fail!("{at}: length_mm must be greater than 0");
            }
            if !known(r.requires) {
                fail!(
                    "{at}: requires '{}' is not in catalog.json categories",
                    r.requires
                );
            }
        }

        let mut names = HashSet::new();
        for c in &self.couriers {
            if blank(&c.name) {
                fail!("courier: name is required");
            }
            if !names.insert(c.name.trim().to_lowercase()) {
                fail!("courier '{}': duplicate name", c.name);
            }
            if let Some(u) = &c.tracking_url {
                check_tracking_url(u)
                    .map_err(|e| ContentError(format!("courier '{}': {e}", c.name)))?;
            }
        }
        Ok(etas)
    }

    /// Delivery-fee multiplier for a part of category `c`.
    pub fn size_multiplier(&self, c: CatId) -> f64 {
        self.delivery_size_multiplier
            .get(&c)
            .copied()
            .unwrap_or(DEFAULT_SIZE_MULTIPLIER)
    }

    /// Multiplier for a product; market listings (no build slot) use the default.
    pub fn size_multiplier_for(&self, c: Option<CatId>) -> f64 {
        c.map(|c| self.size_multiplier(c))
            .unwrap_or(DEFAULT_SIZE_MULTIPLIER)
    }

    pub fn courier(&self, name: &str) -> Option<&Courier> {
        self.couriers.iter().find(|c| c.name == name)
    }
}

/// `https://<host>/…{tracking}…`. The API additionally parses the URL with a full URL parser.
pub fn check_tracking_url(u: &str) -> Result<(), String> {
    let Some(rest) = u.strip_prefix("https://") else {
        return Err(format!("tracking_url '{u}' must start with https://"));
    };
    if !u.contains(TRACKING_PLACEHOLDER) {
        return Err(format!(
            "tracking_url '{u}' must contain the {TRACKING_PLACEHOLDER} placeholder"
        ));
    }
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    if host.is_empty() || host.contains(['{', '}', ' ']) {
        return Err(format!("tracking_url '{u}' has no valid host"));
    }
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// ETA table

/// Validated `[[eta]]` table: exactly one entry per [`Eta`] label, unique ranks, and `days` that
/// never decrease as the rank increases.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EtaTable {
    /// Sorted by rank.
    sorted: Vec<EtaDef>,
    /// Indexed by position in `Eta::ALL`.
    by_eta: Vec<EtaDef>,
}

fn eta_index(e: Eta) -> usize {
    Eta::ALL
        .iter()
        .position(|x| *x == e)
        .expect("Eta::ALL lists every variant")
}

impl EtaTable {
    pub fn new(defs: &[EtaDef]) -> Result<Self, ContentError> {
        let mut slots: Vec<Option<EtaDef>> = vec![None; Eta::ALL.len()];
        for d in defs {
            if slots[eta_index(d.label)].replace(*d).is_some() {
                fail!("eta: '{}' is listed more than once", d.label);
            }
        }
        let missing: Vec<&str> = Eta::ALL
            .iter()
            .zip(&slots)
            .filter(|(_, s)| s.is_none())
            .map(|(e, _)| e.as_str())
            .collect();
        if !missing.is_empty() {
            fail!(
                "eta: missing {} (every delivery label needs exactly one [[eta]] entry)",
                missing
                    .iter()
                    .map(|m| format!("'{m}'"))
                    .collect::<Vec<_>>()
                    .join(", ")
            );
        }
        let by_eta: Vec<EtaDef> = slots.into_iter().flatten().collect();
        let mut sorted = by_eta.clone();
        sorted.sort_by_key(|d| d.rank);
        for w in sorted.windows(2) {
            if w[0].rank == w[1].rank {
                fail!(
                    "eta: '{}' and '{}' share rank {}",
                    w[0].label,
                    w[1].label,
                    w[0].rank
                );
            }
            if w[1].days < w[0].days {
                fail!(
                    "eta: '{}' (rank {}) has fewer days ({}) than the faster '{}' ({})",
                    w[1].label,
                    w[1].rank,
                    w[1].days,
                    w[0].label,
                    w[0].days
                );
            }
        }
        Ok(EtaTable { sorted, by_eta })
    }

    /// All entries, fastest first.
    pub fn defs(&self) -> &[EtaDef] {
        &self.sorted
    }
    pub fn def(&self, e: Eta) -> &EtaDef {
        &self.by_eta[eta_index(e)]
    }
    pub fn rank(&self, e: Eta) -> u32 {
        self.def(e).rank
    }
    pub fn days(&self, e: Eta) -> u32 {
        self.def(e).days
    }
    pub fn fastest(&self) -> Eta {
        self.sorted[0].label
    }
    pub fn slowest(&self) -> Eta {
        self.sorted[self.sorted.len() - 1].label
    }
    /// Slowest of `etas`, or [`EtaTable::fastest`] when there are none.
    pub fn max_of(&self, etas: impl IntoIterator<Item = Eta>) -> Eta {
        etas.into_iter()
            .max_by_key(|e| self.rank(*e))
            .unwrap_or_else(|| self.fastest())
    }
}
