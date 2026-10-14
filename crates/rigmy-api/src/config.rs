//! Config files under `RIGMY_CONFIG` (default `./config`).

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use rigmy_core::content::TRACKING_PLACEHOLDER;
use rigmy_core::{
    CatId, Category, Content, ContentFile, Delivery, Postcode, PostcodesFile, Preset, Product,
    Region, RegionId, Retailer, SaleEvent, SpecDef,
};
use serde::Deserialize;

/// `catalog.json`: seed product specs (no prices) and static UI tables.
#[derive(Debug, Clone, Deserialize)]
pub struct CatalogFile {
    pub regions: Vec<Region>,
    pub categories: Vec<Category>,
    pub specdef: BTreeMap<CatId, Vec<SpecDef>>,
    pub facet: BTreeMap<CatId, String>,
    pub products: Vec<Product>,
    #[serde(default)]
    pub presets: Vec<Preset>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RetailerConf {
    pub id: String,
    pub name: String,
    pub city: String,
    pub website: String,
    #[serde(default)]
    pub pay: String,
    #[serde(default)]
    pub pickup: String,
    #[serde(default)]
    pub courier: Option<String>,
    #[serde(default = "yes")]
    pub enabled: bool,
    #[serde(default)]
    pub delivery: BTreeMap<RegionId, Delivery>,
    /// Case-insensitive substrings matched against OSM `name` / `brand` / `operator` tags.
    #[serde(default)]
    pub osm_match: Vec<String>,
    /// Bulk product-feed import (`rigmy-api import`); absent = no bulk import for this shop.
    #[serde(default)]
    pub import: Option<ImportConf>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImportKind {
    /// Shopify storefront: paginates the public `products.json` feed.
    Shopify,
    /// WooCommerce storefront: paginates the public Store API (`/wp-json/wc/store/v1/products`).
    Woocommerce,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ImportConf {
    pub kind: ImportKind,
    /// Storefront origin, e.g. `https://www.example.my` (no trailing slash).
    pub base_url: String,
    /// Safety cap on feed pages (Shopify pages hold at most 250, WooCommerce at most 100).
    #[serde(default = "default_max_pages")]
    pub max_pages: u32,
}

fn default_max_pages() -> u32 {
    40
}

fn yes() -> bool {
    true
}

impl RetailerConf {
    pub fn to_retailer(&self) -> Retailer {
        Retailer {
            id: self.id.clone(),
            name: self.name.clone(),
            city: self.city.clone(),
            website: self.website.clone(),
            pay: self.pay.clone(),
            pickup: self.pickup.clone(),
            delivery: self.delivery.clone(),
            courier: self.courier.clone(),
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct RetailersFile {
    #[serde(default)]
    pub retailer: Vec<RetailerConf>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AdapterKind {
    Jsonld,
    Shopify,
    Woocommerce,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SourceConf {
    pub product: String,
    pub retailer: String,
    pub url: String,
    pub adapter: AdapterKind,
    /// shopify: pin a specific variant id.
    #[serde(default)]
    pub variant: Option<u64>,
    /// jsonld: pick the Product node whose sku / mpn / gtin* equals this.
    #[serde(default)]
    pub sku: Option<String>,
    /// woocommerce: explicit Store API product id (otherwise looked up by URL slug).
    #[serde(default)]
    pub product_id: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IngestSettings {
    #[serde(default = "default_ua")]
    pub user_agent: String,
    /// Minimum delay between two requests to the same host.
    #[serde(default = "default_delay")]
    pub delay_ms: u64,
    #[serde(default = "default_timeout")]
    pub timeout_s: u64,
    #[serde(default = "default_retries")]
    pub retries: u32,
    #[serde(default = "default_overpass")]
    pub overpass_url: String,
    /// Offers older than this are left out of /api/bootstrap (a source that keeps failing).
    #[serde(default = "default_stale")]
    pub stale_after_days: u32,
}

fn default_ua() -> String {
    format!(
        "RigMYBot/{} (price comparison; respects robots.txt)",
        env!("CARGO_PKG_VERSION")
    )
}
fn default_delay() -> u64 {
    5000
}
fn default_timeout() -> u64 {
    20
}
fn default_retries() -> u32 {
    2
}
fn default_overpass() -> String {
    "https://overpass-api.de/api/interpreter".into()
}
fn default_stale() -> u32 {
    7
}

impl Default for IngestSettings {
    fn default() -> Self {
        toml::from_str("").expect("defaults")
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct SourcesFile {
    #[serde(default)]
    pub settings: IngestSettings,
    #[serde(default)]
    pub source: Vec<SourceConf>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BranchConf {
    pub id: String,
    pub retailer: String,
    pub name: String,
    #[serde(default)]
    pub addr: String,
    pub lat: f64,
    pub lon: f64,
    #[serde(default)]
    pub phone: Option<String>,
    /// OSM `opening_hours` syntax, e.g. "Mo-Sa 10:00-21:00; Su off".
    #[serde(default)]
    pub hours: Option<String>,
    #[serde(default)]
    pub services: Vec<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct StoresFile {
    #[serde(default)]
    pub branch: Vec<BranchConf>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EventConf {
    /// `YYYY-MM-DD` (Malaysia time).
    pub date: String,
    pub label: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct EventsFile {
    #[serde(default)]
    pub event: Vec<EventConf>,
}

impl EventsFile {
    pub fn to_events(&self) -> Result<Vec<SaleEvent>> {
        self.event
            .iter()
            .map(|e| {
                let t = (e.date.len() == 10)
                    .then(|| rigmy_core::time::ms_from_iso(&e.date))
                    .flatten()
                    .with_context(|| {
                        format!("events.toml: bad date '{}' (want YYYY-MM-DD)", e.date)
                    })?;
                Ok(SaleEvent {
                    t,
                    label: e.label.clone(),
                })
            })
            .collect()
    }
}

#[derive(Debug, Clone)]
pub struct Config {
    pub dir: PathBuf,
    pub catalog: CatalogFile,
    pub retailers: RetailersFile,
    pub sources: SourcesFile,
    pub stores: StoresFile,
    /// `content.toml`, validated (see [`Content::validate`]).
    pub content: Content,
    /// `postcodes.toml`, validated (see [`rigmy_core::validate_postcodes`]).
    pub postcodes: Vec<Postcode>,
    pub events: Vec<SaleEvent>,
}

fn read_toml<T: for<'de> Deserialize<'de> + Default>(path: &Path) -> Result<T> {
    if !path.exists() {
        return Ok(T::default());
    }
    let s = std::fs::read_to_string(path).with_context(|| format!("reading {}", path.display()))?;
    toml::from_str(&s).with_context(|| format!("parsing {}", path.display()))
}

/// Like [`read_toml`] for a file that must exist.
fn read_required_toml<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T> {
    let s = std::fs::read_to_string(path)
        .with_context(|| format!("reading {} (this file is required)", path.display()))?;
    toml::from_str(&s).with_context(|| format!("parsing {}", path.display()))
}

impl Config {
    pub fn load(dir: &Path) -> Result<Config> {
        let cat_path = dir.join("catalog.json");
        let catalog: CatalogFile = serde_json::from_str(
            &std::fs::read_to_string(&cat_path)
                .with_context(|| format!("reading {}", cat_path.display()))?,
        )
        .with_context(|| format!("parsing {}", cat_path.display()))?;
        let events_file: EventsFile = read_toml(&dir.join("events.toml"))?;
        let cfg = Config {
            dir: dir.to_path_buf(),
            catalog,
            retailers: read_toml(&dir.join("retailers.toml"))?,
            sources: read_toml(&dir.join("sources.toml"))?,
            stores: read_toml(&dir.join("stores.toml"))?,
            content: read_required_toml::<ContentFile>(&dir.join("content.toml"))?.into_content(),
            postcodes: read_required_toml::<PostcodesFile>(&dir.join("postcodes.toml"))?.postcode,
            events: events_file.to_events()?,
        };
        cfg.validate()?;
        Ok(cfg)
    }

    pub fn validate(&self) -> Result<()> {
        let mut seen = std::collections::HashSet::new();
        for p in &self.catalog.products {
            if !seen.insert(&p.id) {
                bail!("catalog.json: duplicate product id '{}'", p.id);
            }
        }
        self.validate_regions()?;
        self.validate_presets()?;
        self.validate_content()?;
        rigmy_core::validate_postcodes(&self.postcodes)
            .map_err(|e| anyhow::anyhow!("postcodes.toml: {e}"))?;
        let mut rids = std::collections::HashSet::new();
        for r in &self.retailers.retailer {
            if r.id.is_empty()
                || !r
                    .id
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
            {
                bail!("retailers.toml: invalid retailer id '{}'", r.id);
            }
            if !rids.insert(&r.id) {
                bail!("retailers.toml: duplicate retailer id '{}'", r.id);
            }
            if let Some(c) = &r.courier {
                if self.content.courier(c).is_none() {
                    bail!(
                        "retailers.toml: retailer '{}' uses courier '{c}', which is not a [[courier]] in content.toml",
                        r.id
                    );
                }
            }
            if r.delivery
                .values()
                .any(|d| !d.fee.is_finite() || d.fee < 0.0)
            {
                bail!(
                    "retailers.toml: retailer '{}' has a negative or invalid delivery fee",
                    r.id
                );
            }
        }
        for s in &self.sources.source {
            if !seen.contains(&s.product) {
                bail!("sources.toml: unknown product '{}'", s.product);
            }
            if !rids.contains(&s.retailer) {
                bail!(
                    "sources.toml: unknown retailer '{}' (add it to retailers.toml)",
                    s.retailer
                );
            }
            url::Url::parse(&s.url)
                .with_context(|| format!("sources.toml: bad url '{}'", s.url))?;
        }
        for b in &self.stores.branch {
            if !rids.contains(&b.retailer) {
                bail!(
                    "stores.toml: branch '{}' references unknown retailer '{}'",
                    b.id,
                    b.retailer
                );
            }
        }
        Ok(())
    }
}

impl Config {
    /// Every region id exactly once, each with a usable `center`.
    fn validate_regions(&self) -> Result<()> {
        let regions = &self.catalog.regions;
        for id in RegionId::ALL {
            let n = regions.iter().filter(|r| r.id == *id).count();
            if n != 1 {
                bail!(
                    "catalog.json: region '{id}' must appear exactly once in `regions` (found {n})"
                );
            }
        }
        for r in regions {
            let c = &r.center;
            if !(c.lat.is_finite() && (-90.0..=90.0).contains(&c.lat))
                || !(c.lon.is_finite() && (-180.0..=180.0).contains(&c.lon))
            {
                bail!(
                    "catalog.json: region '{}' center ({}, {}) is not a valid lat/lon",
                    r.id,
                    c.lat,
                    c.lon
                );
            }
            if c.label.trim().is_empty() {
                bail!("catalog.json: region '{}' center needs a label", r.id);
            }
        }
        Ok(())
    }

    /// Unique ids, parts that exist in the right category, and exactly one `featured` preset.
    /// A missing or second featured preset is an error, not a silent fallback: the home page
    /// would otherwise show an arbitrary build.
    fn validate_presets(&self) -> Result<()> {
        let presets = &self.catalog.presets;
        let mut ids = std::collections::HashSet::new();
        for p in presets {
            if !ids.insert(&p.id) {
                bail!("catalog.json: duplicate preset id '{}'", p.id);
            }
            for (cat, pid) in &p.build {
                match self.catalog.products.iter().find(|x| &x.id == pid) {
                    Some(x) if x.cat == Some(*cat) => {}
                    Some(x) => bail!(
                        "catalog.json: preset '{}' puts '{pid}' ({}) in the {cat} slot",
                        p.id,
                        x.cat
                            .map(|c| c.to_string())
                            .unwrap_or_else(|| "market listing".into())
                    ),
                    None => bail!(
                        "catalog.json: preset '{}' uses unknown product '{pid}'",
                        p.id
                    ),
                }
            }
        }
        let featured: Vec<&str> = presets
            .iter()
            .filter(|p| p.featured)
            .map(|p| p.id.as_str())
            .collect();
        if !presets.is_empty() && featured.len() != 1 {
            bail!(
                "catalog.json: exactly one preset must have \"featured\": true (found {}: [{}])",
                featured.len(),
                featured.join(", ")
            );
        }
        Ok(())
    }

    /// The shared rules from `rigmy_core` plus a full URL parse of each tracking template.
    fn validate_content(&self) -> Result<()> {
        let c = &self.content;
        c.validate(&self.catalog.categories)
            .map_err(|e| anyhow::anyhow!("content.toml: {e}"))?;
        for k in &c.couriers {
            if let Some(t) = &k.tracking_url {
                let u = url::Url::parse(&t.replace(TRACKING_PLACEHOLDER, "TRACKING"))
                    .with_context(|| {
                        format!(
                            "content.toml: courier '{}' has a malformed tracking_url",
                            k.name
                        )
                    })?;
                if u.scheme() != "https" || u.host_str().is_none_or(str::is_empty) {
                    bail!(
                        "content.toml: courier '{}' tracking_url must be an https URL with a host",
                        k.name
                    );
                }
            }
        }
        Ok(())
    }
}
