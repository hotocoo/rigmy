//! Serde mirrors of `web/src/lib/types.ts`. Field names are camelCase on the wire;
//! optional TS fields (`foo?:`) are skipped when `None`, nullable ones (`| null`) serialize as `null`.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

pub use crate::content::{CableRunDef, Content, Courier, EtaDef, GuideCat, GuideStepDef};

macro_rules! str_enum {
    ($(#[$m:meta])* $name:ident { $($var:ident = $s:literal),+ $(,)? }) => {
        $(#[$m])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
        pub enum $name { $(#[serde(rename = $s)] $var),+ }
        impl $name {
            pub const ALL: &'static [$name] = &[$($name::$var),+];
            pub fn as_str(self) -> &'static str { match self { $($name::$var => $s),+ } }
            #[allow(clippy::should_implement_trait)]
            pub fn from_str(s: &str) -> Option<Self> { match s { $($s => Some($name::$var),)+ _ => None } }
        }
        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { f.write_str(self.as_str()) }
        }
    };
}

str_enum!(
    /// Part category, in build order.
    CatId { Cpu = "cpu", Cooler = "cooler", Mobo = "mobo", Ram = "ram", Ssd = "ssd", Gpu = "gpu", Case = "case", Psu = "psu" }
);
str_enum!(RegionId { Kv = "kv", Pen = "pen", Jhr = "jhr", East = "east" });
str_enum!(
    /// Delivery estimate label. Speed rank and day counts are NOT derived from the variant order:
    /// they come from the `[[eta]]` table in `config/content.toml` (see [`crate::content::EtaTable`]).
    Eta { SameDay = "Same day", NextDay = "Next day", D1to2 = "1–2 days", D2to3 = "2–3 days", D3to5 = "3–5 days", D5to7 = "5–7 days" }
);
str_enum!(Tone { Ok = "ok", Warn = "warn", Error = "error", Pending = "pending", Info = "info" });
str_enum!(StockState { InStock = "In stock", LowStock = "Low stock", PreOrder = "Pre-order", OutOfStock = "Out of stock", Unknown = "Unknown" });
str_enum!(CheckId { Socket = "socket", Mem = "mem", Ff = "ff", Gpu = "gpu", Cool = "cool", Therm = "therm", Psu = "psu" });
str_enum!(LocSource { Gps = "gps", Postcode = "postcode", Region = "region" });
str_enum!(BranchSource { Osm = "osm", Config = "config" });
str_enum!(ShipMode { Delivery = "delivery", Pickup = "pickup" });
str_enum!(GroupStatus { ToBuy = "to-buy", Purchased = "purchased", Shipped = "shipped", Ready = "ready", Received = "received" });

impl StockState {
    /// Whether a listing in this state can be bought (and so counts for plans / lowest price).
    /// `Unknown` (retailer page had a price but no availability signal) is treated as buyable:
    /// shops that publish a price almost always sell the item; the UI shows the "Unknown" status.
    pub fn available(self) -> bool {
        !matches!(self, StockState::OutOfStock)
    }
    /// Whether the price counts as an "in-stock" price for history (low/avg) and `cur`.
    /// Pre-orders and out-of-stock listings are excluded.
    pub fn counts_in_stock(self) -> bool {
        matches!(
            self,
            StockState::InStock | StockState::LowStock | StockState::Unknown
        )
    }
}

/// `Build = Partial<Record<CatId, string>>`
pub type Build = BTreeMap<CatId, String>;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Region {
    pub id: RegionId,
    pub name: String,
    pub short: String,
    /// Approximate user position for the region until they share a location.
    pub center: RegionCenter,
}

/// One row of `config/postcodes.toml`: 2-digit postcode prefix -> town centroid.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Postcode {
    pub prefix: String,
    pub town: String,
    pub lat: f64,
    pub lon: f64,
}

/// `LatLon & { label }`
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RegionCenter {
    pub lat: f64,
    pub lon: f64,
    /// Place name shown for the approximate position, e.g. "Kuala Lumpur".
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Category {
    pub id: CatId,
    pub label: String,
    pub long: String,
    pub idx: String,
}

/// `[specKey, label, unit?, better?]` — kept as a raw JSON array to match the TS tuple exactly.
pub type SpecDef = Vec<Value>;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Product {
    pub id: String,
    /// Build slot for spec-verified parts; `None` for market listings (price/stock only).
    /// `Catalog::part` filters on this, so market listings can never satisfy a build slot.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cat: Option<CatId>,
    /// Market category label for listings without a build slot (e.g. "Keyboard").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub market: Option<String>,
    pub brand: String,
    pub name: String,
    pub glyph: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub short: Option<String>,
    pub facet: String,
    pub warranty_y: u32,
    #[serde(default)]
    pub specs: Map<String, Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub socket: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tdp: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ff: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mem: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ffs: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_gpu: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_cooler: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rad_top: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ctype: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rad: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_tdp: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub length: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tgp: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub watt: Option<f64>,
    #[serde(default)]
    pub vis: Map<String, Value>,
}

impl Product {
    /// `short ?? name` (the prototype uses `short` for cases/GPUs).
    pub fn short_name(&self) -> &str {
        self.short.as_deref().unwrap_or(&self.name)
    }
    /// Manufacturer warranty, e.g. "Lifetime", "1 yr", "3 yrs".
    pub fn warranty_text(&self) -> String {
        match self.warranty_y {
            y if y >= 99 => "Lifetime".to_string(),
            1 => "1 yr".to_string(),
            y => format!("{y} yrs"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Delivery {
    pub fee: f64,
    pub eta: Eta,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Retailer {
    pub id: String,
    pub name: String,
    pub city: String,
    pub website: String,
    pub pay: String,
    pub pickup: String,
    #[serde(default)]
    pub delivery: BTreeMap<RegionId, Delivery>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub courier: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawOffer {
    pub product_id: String,
    pub retailer_id: String,
    pub price: f64,
    pub stock: StockState,
    pub url: String,
    pub observed_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Offer {
    #[serde(flatten)]
    pub raw: RawOffer,
    pub avail: bool,
    pub fee: Option<f64>,
    pub eta: Option<Eta>,
    pub status: String,
    pub warranty: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WeekHours {
    /// Index 0 = Sunday. `[open, close]` in local hours; `close` may exceed 24 for past-midnight closing.
    pub week: Vec<Option<[f64; 2]>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub id: String,
    pub retailer_id: String,
    pub name: String,
    pub addr: String,
    pub lat: f64,
    pub lon: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phone: Option<String>,
    pub hours: Option<WeekHours>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hours_raw: Option<String>,
    #[serde(default)]
    pub services: Vec<String>,
    pub source: BranchSource,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SaleEvent {
    pub t: i64,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HistoryPoint {
    pub t: i64,
    pub low: f64,
    pub avg: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ev: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sale: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PartStats {
    pub cur: Option<f64>,
    pub low: Option<f64>,
    pub low_t: Option<i64>,
    pub high: Option<f64>,
    pub avg90: Option<f64>,
    pub d7: Option<f64>,
    pub d30: Option<f64>,
    pub verdict: String,
    pub tone: Tone,
    pub next: Option<SaleEvent>,
    pub next_in: Option<i64>,
    pub builds: u32,
    pub days: u32,
    pub score: f64,
    pub spark: Vec<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct IndexPoint {
    pub t: i64,
    pub v: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ev: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Fix {
    pub cat: CatId,
    pub id: String,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Check {
    pub id: CheckId,
    pub label: String,
    pub value: String,
    pub status: Tone,
    pub parts: Vec<CatId>,
    pub detail: String,
    pub fix: Option<Fix>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Power {
    pub est: f64,
    pub rec: f64,
    pub psu: f64,
}

/// `Record<productId, Offer | null>`
pub type Choice = BTreeMap<String, Option<Offer>>;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanTotal {
    pub parts: f64,
    pub fee: f64,
    pub total: f64,
    pub shops: u32,
    pub missing: u32,
    pub unknown_fees: u32,
    pub choice: Choice,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ShopTotal {
    #[serde(flatten)]
    pub total: PlanTotal,
    pub rid: String,
    pub retailer: Retailer,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SinglePlan {
    #[serde(flatten)]
    pub total: PlanTotal,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rid: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub retailer: Option<Retailer>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlanRow {
    pub p: Product,
    pub offers: Vec<Offer>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub rows: Vec<PlanRow>,
    pub best: PlanTotal,
    pub fast: PlanTotal,
    pub single: SinglePlan,
    pub custom: PlanTotal,
    pub shop_totals: Vec<ShopTotal>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Preset {
    pub id: String,
    pub name: String,
    pub tier: String,
    pub note: String,
    pub build: Build,
    /// The preset shown on the home page / offered as the starting point (exactly one).
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub featured: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UserLoc {
    pub lat: f64,
    pub lon: f64,
    pub label: String,
    pub source: LocSource,
    pub acc: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub postcode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub city: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub road: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub region: Option<RegionId>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OpenState {
    pub open: bool,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub closing: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unknown: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    pub regions: Vec<Region>,
    pub categories: Vec<Category>,
    pub specdef: BTreeMap<CatId, Vec<SpecDef>>,
    pub facet: BTreeMap<CatId, String>,
    pub products: Vec<Product>,
    #[serde(default)]
    pub retailers: Vec<Retailer>,
    #[serde(default)]
    pub branches: Vec<Branch>,
    #[serde(default)]
    pub offers: Vec<RawOffer>,
    #[serde(default)]
    pub events: Vec<SaleEvent>,
    #[serde(default)]
    pub presets: Vec<Preset>,
    /// Reference/editorial content from `config/content.toml`. Required: the ETA table drives
    /// plan ranking, so a bootstrap without it is rejected rather than silently defaulted.
    pub content: Content,
    /// Postcode prefix table from `config/postcodes.toml` (required, used by `postcode()`).
    pub postcodes: Vec<Postcode>,
    #[serde(default)]
    pub last_ingest: Option<String>,
}

// ---------- orders ----------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderItem {
    pub product_id: String,
    pub name: String,
    pub cat: CatId,
    pub price: f64,
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderGroup {
    pub retailer_id: String,
    pub name: String,
    pub items: Vec<OrderItem>,
    pub fee: Option<f64>,
    pub eta: Option<Eta>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub branch_id: Option<String>,
    pub status: GroupStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub courier: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tracking: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Contact {
    pub name: String,
    pub phone: String,
    pub email: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Address {
    pub line: String,
    pub postcode: String,
    pub city: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Slot {
    pub day: i64,
    pub window: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NewOrder {
    pub region: RegionId,
    pub ship: ShipMode,
    pub contact: Contact,
    pub addr: Option<Address>,
    pub slot: Option<Slot>,
    pub groups: Vec<OrderGroup>,
    pub total: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Order {
    pub no: String,
    pub placed_at: i64,
    #[serde(flatten)]
    pub order: NewOrder,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedBuild {
    pub id: String,
    pub name: String,
    pub build: Build,
    pub region: RegionId,
    pub created_at: i64,
}
