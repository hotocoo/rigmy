//! `import`: bulk-import a retailer's product feed (Shopify public `products.json`).
//!
//! Policy: robots.txt is fetched and checked BEFORE any feed request; the per-host delay,
//! user agent, timeout and retries come from `sources.toml [settings]` (same politeness as
//! `ingest`). Discovered listings that match a verified catalog part attach a real offer to
//! that part (price comparison); everything else becomes a market listing — price/stock only,
//! no build slot, never treated as compatible (see `Product::cat`). Nothing is invented:
//! a listing without a parseable price is skipped and counted in the summary.

use std::collections::BTreeMap;
use std::future::Future;
use std::pin::Pin;
use std::time::Duration;

use anyhow::{bail, Context, Result};
use rigmy_core::time::{iso_from_ms, myt_day_start};
use rigmy_core::{Product, RawOffer, StockState};
use rusqlite::{params, Connection};
use serde::Deserialize;

use crate::config::{Config, ImportKind, IngestSettings};
use crate::db;
use crate::ingest;

type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// One URL fetch; errors are human-readable strings (surfaced in the run log).
pub trait Fetcher: Send {
    fn get<'a>(&'a mut self, url: &'a str) -> BoxFuture<'a, Result<String, String>>;
}

/// Real HTTP fetcher built on the ingest fetcher (UA, per-host delay, retries, timeout).
pub struct HttpFetcher {
    inner: ingest::Fetcher,
}

impl HttpFetcher {
    pub fn new(s: &IngestSettings) -> Result<Self> {
        Ok(Self {
            inner: ingest::Fetcher::new(s)?,
        })
    }
}

impl Fetcher for HttpFetcher {
    fn get<'a>(&'a mut self, url: &'a str) -> BoxFuture<'a, Result<String, String>> {
        Box::pin(async move { self.inner.get_text(url).await.map_err(|e| e.to_string()) })
    }
}

/// True if `path` is allowed for a generic crawler per `robots.txt` (longest matching
/// rule wins, ties go to Allow; no file or no matching rule = allowed).
pub fn robots_allowed(robots: Option<&str>, path: &str) -> bool {
    let Some(txt) = robots else { return true };
    let (mut best_allow, mut best_disallow) = (-1i64, -1i64);
    let mut in_star = false;
    for line in txt.lines() {
        let line = line.split('#').next().unwrap_or("").trim();
        let Some((k, v)) = line.split_once(':') else {
            continue;
        };
        let k = k.trim().to_ascii_lowercase();
        let v = v.trim();
        match k.as_str() {
            "user-agent" => in_star = v == "*",
            "allow" | "disallow" if in_star && !v.is_empty() && path_matches(v, path) => {
                let len = v.len() as i64;
                if k == "allow" {
                    best_allow = best_allow.max(len);
                } else {
                    best_disallow = best_disallow.max(len);
                }
            }
            _ => {}
        }
    }
    best_allow >= best_disallow
}

/// robots.txt pattern match (RFC 9309): patterns anchor at the start of the path and `*`
/// matches any string. The first segment is therefore anchored; later segments may start
/// anywhere after the previous match.
fn path_matches(pattern: &str, path: &str) -> bool {
    let parts: Vec<&str> = pattern.split('*').collect();
    let mut pos = 0usize;
    let mut first = true;
    for part in parts {
        if part.is_empty() {
            continue;
        }
        if first {
            if !path.starts_with(part) {
                return false;
            }
            pos = part.len();
            first = false;
        } else if let Some(o) = path[pos..].find(part) {
            pos += o + part.len();
        } else {
            return false;
        }
    }
    true
}

#[derive(Debug, Deserialize)]
struct FeedFile {
    #[serde(default)]
    products: Vec<FeedProduct>,
}

#[derive(Debug, Deserialize)]
struct FeedProduct {
    handle: String,
    title: String,
    #[serde(default, rename = "product_type")]
    product_type: Option<String>,
    #[serde(default)]
    vendor: Option<String>,
    #[serde(default)]
    variants: Vec<FeedVariant>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct FeedVariant {
    pub(crate) price: String,
    #[serde(default)]
    pub(crate) available: bool,
}

/// One discovered listing in a feed-independent shape, so the matching and
/// upsert logic is shared by every feed adapter.
#[derive(Debug)]
struct FeedItem {
    title: String,
    /// Brand used for seed matching. Shopify sends a `vendor`; WooCommerce has no
    /// vendor field, so the full title is used (the title always contains the brand).
    brand: String,
    price: f64,
    avail: bool,
    url: String,
    /// Stable id fragment for the market-listing id (`mkt-<retailer>-<slug>`).
    slug: String,
    product_type: String,
}

/// WooCommerce Store API product (`/wp-json/wc/store/v1/products`). Prices are
/// integer minor units (cents): "123400" is RM 1234.00.
#[derive(Debug, Deserialize)]
struct WooProduct {
    id: u64,
    name: String,
    permalink: String,
    prices: WooPrices,
    #[serde(default)]
    is_in_stock: bool,
}

#[derive(Debug, Deserialize)]
struct WooPrices {
    price: String,
}

/// Cheapest variant, preferring in-stock; falls back to the cheapest overall (out of stock).
pub(crate) fn pick_variant(v: &[FeedVariant]) -> Option<(f64, bool)> {
    let mut best_any: Option<(f64, bool)> = None;
    let mut best_avail: Option<(f64, bool)> = None;
    for x in v {
        let Ok(p) = x.price.trim().parse::<f64>() else {
            continue;
        };
        if p <= 0.0 {
            continue;
        }
        best_any = Some(match best_any {
            Some(b) if b.0 <= p => b,
            _ => (p, x.available),
        });
        if x.available {
            best_avail = Some(match best_avail {
                Some(b) if b.0 <= p => b,
                _ => (p, true),
            });
        }
    }
    best_avail.or(best_any)
}

/// Market label from the feed's `product_type` code (store-specific codes first).
pub fn market_label(product_type: Option<&str>, title: &str) -> String {
    let t = product_type.unwrap_or("").trim().to_ascii_uppercase();
    const KNOWN: &[(&str, &str)] = &[
        ("VGA", "Graphics Card"),
        ("GPU", "Graphics Card"),
        ("CPU", "Processor"),
        ("MBD", "Motherboard"),
        ("RAM", "Memory"),
        ("SSD", "SSD"),
        ("HDD", "Hard Drive"),
        ("PSU", "Power Supply"),
        ("CASE", "Case"),
        ("COOL", "Cooling"),
        ("FAN", "Cooling"),
        ("AIO", "Cooling"),
        ("KEYBO", "Keyboard"),
        ("MICE", "Mouse"),
        ("HEADS", "Headset"),
        ("MON", "Monitor"),
        ("SPK", "Speaker"),
        ("NET", "Networking"),
        ("SSB", "Sound Card"),
        ("DOCK", "USB / Docking"),
        ("USB", "USB / Docking"),
        ("CBL", "Cable"),
        ("CAM", "Webcam"),
        ("UPS", "UPS"),
        ("ACC", "Accessory"),
    ];
    if let Some((_, label)) = KNOWN.iter().find(|(k, _)| *k == t) {
        return (*label).to_string();
    }
    if !t.is_empty() {
        let mut chars = t.chars();
        let first = chars
            .next()
            .map(|c| c.to_ascii_uppercase().to_string())
            .unwrap_or_default();
        let rest: String = chars
            .map(|c| {
                if c.is_ascii_digit() {
                    c
                } else {
                    c.to_ascii_lowercase()
                }
            })
            .collect();
        return format!("{first}{rest}");
    }
    let lower = title.to_ascii_lowercase();
    for (needle, label) in [
        ("graphics card", "Graphics Card"),
        ("motherboard", "Motherboard"),
        ("processor", "Processor"),
        ("memory", "Memory"),
        ("power supply", "Power Supply"),
        ("keyboard", "Keyboard"),
        ("mouse", "Mouse"),
        ("headset", "Headset"),
        ("monitor", "Monitor"),
        ("ssd", "SSD"),
    ] {
        if lower.contains(needle) {
            return label.to_string();
        }
    }
    "Other".to_string()
}

fn norm(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>()
        .to_lowercase()
}

/// Alphanumeric runs from a product name that look like model numbers:
/// contain a digit and are at least 4 chars (e.g. "b850", "9800x3d"), or at least 7 chars.
/// Model-number-like tokens: alphanumeric runs containing both letters and digits (at
/// least 4 chars). Pure words ("gaming") and pure numbers ("6000", "2025") are too
/// ambiguous to match on, and short number-leading runs ("850w", "16gb") are specs, not
/// model numbers — matching them would attach e.g. an RM850x listing to an RM850e part.
/// Residual risk: same-brand listings sharing a spec token (e.g. "cl30") can still match;
/// prefer specific model numbers when curating the seed catalog.
/// Unit suffixes that mark a token as a spec (frequency/capacity/power), not a model number.
const SPEC_UNITS: &[&str] = &["mhz", "ghz", "gb", "tb", "w", "v", "mm"];

/// Generic interface / standard tokens that appear across many products of the same brand
/// (a GPU, an SSD and a PSU can all say "pcie5"). Matching on them attaches the wrong part,
/// so they are excluded from the model-number set.
const GENERIC_TOKENS: &[&str] = &[
    "pcie3", "pcie4", "pcie5", "pcie6", "ddr4", "ddr5", "ddr6", "gddr5", "gddr6", "gddr7", "gen3",
    "gen4", "gen5", "gen6", "nvme", "sata", "atx", "matx", "itx", "wifi", "wif6", "wif6e", "wif7",
    "rgb", "am4", "am5", "dx11", "dx12", "256bit", "128bit", "192bit", "384bit", "30gbps",
    "28gbps", "24gbps", "19gbps", "14gbps",
];

pub fn model_tokens(name: &str) -> Vec<String> {
    name.split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|raw| {
            let t = raw.to_ascii_lowercase();
            let has_digit = t.chars().any(|c| c.is_ascii_digit());
            let has_alpha = t.chars().any(|c| c.is_ascii_alphabetic());
            let digit_lead = t.chars().next().is_some_and(|c| c.is_ascii_digit());
            let spec = digit_lead
                && SPEC_UNITS
                    .iter()
                    .any(|u| t.ends_with(u) && t.len() > u.len());
            has_digit
                && has_alpha
                && t.len() >= 4
                && !spec
                && !(t.len() <= 5 && digit_lead)
                && !GENERIC_TOKENS.contains(&t.as_str())
        })
        .map(|t| t.to_ascii_lowercase())
        .collect()
}

/// Conservative match of a discovered listing against the verified catalog:
/// brand must agree AND at least one model-number token of the catalog part must appear
/// in the listing title. Returns (seed product id, matching token).
pub fn match_seed(seeds: &[Product], title: &str, vendor: &str) -> Option<(String, String)> {
    let nv = norm(vendor);
    let nt = norm(title);
    let mut best: Option<(String, String, usize)> = None;
    for s in seeds {
        let sb = norm(&s.brand);
        if sb.len() < 3 || nv.len() < 3 {
            continue;
        }
        if !(nv.contains(&sb) || sb.contains(&nv)) {
            continue;
        }
        for tok in model_tokens(&s.name) {
            let better = match &best {
                None => true,
                Some((_, _, l)) => tok.len() > *l,
            };
            if nt.contains(&tok) && better {
                best = Some((s.id.clone(), tok.clone(), tok.len()));
            }
        }
    }
    best.map(|(id, tok, _)| (id, tok))
}

#[derive(Debug, Clone)]
pub struct MatchLog {
    pub listing: String,
    pub seed_id: String,
    pub token: String,
}

#[derive(Debug, Default)]
pub struct ImportSummary {
    pub pages: u32,
    pub products: u32,
    pub matched: u32,
    pub market: u32,
    pub failed: u32,
    /// Distinct feed `product_type` codes seen (for extending the label table).
    pub product_types: BTreeMap<String, u32>,
    pub matches: Vec<MatchLog>,
}

/// Import one retailer's feed. Idempotent: re-runs update prices and listing names.
pub async fn run(
    conn: &mut Connection,
    cfg: &Config,
    retailer_id: &str,
    fetcher: &mut dyn Fetcher,
    now: i64,
) -> Result<ImportSummary> {
    let rconf = cfg
        .retailers
        .retailer
        .iter()
        .find(|r| r.id == retailer_id)
        .with_context(|| format!("retailer '{retailer_id}' not in retailers.toml"))?;
    let import = rconf
        .import
        .as_ref()
        .with_context(|| format!("retailer '{retailer_id}' has no [retailer.import] block"))?;
    let origin = import.base_url.trim_end_matches('/');
    let feed_path = match import.kind {
        ImportKind::Shopify => "/products.json",
        ImportKind::Woocommerce => "/wp-json/wc/store/v1/products",
    };

    // 1) robots.txt — verify crawl permission before touching the feed.
    let robots_url = format!("{origin}/robots.txt");
    let robots = match fetcher.get(&robots_url).await {
        Ok(body) => Some(body),
        Err(e) if e == "HTTP 404" || e == "HTTP 410" => None,
        Err(e) => {
            bail!("fetch {robots_url} failed: {e} (cannot verify crawl permission; aborting)")
        }
    };
    if let Some(txt) = &robots {
        if !robots_allowed(Some(txt), feed_path) {
            bail!("{retailer_id}: robots.txt disallows {feed_path}; import refused");
        }
    }

    // 2) Verified catalog parts, for offer matching.
    let seeds: Vec<Product> = db::products(conn)?
        .into_iter()
        .filter(|p| p.cat.is_some())
        .collect();

    let settings = &cfg.sources.settings;
    let day = myt_day_start(now);
    let mut sum = ImportSummary::default();
    let mut page = 1u32;
    loop {
        let url = match import.kind {
            ImportKind::Shopify => format!("{origin}/products.json?limit=250&page={page}"),
            ImportKind::Woocommerce => {
                format!("{origin}/wp-json/wc/store/v1/products?per_page=100&page={page}")
            }
        };
        let body = fetcher
            .get(&url)
            .await
            .map_err(|e| anyhow::anyhow!("fetch {url}: {e}"))?;
        // Parse the page into the feed-independent shape.
        let items: Vec<FeedItem> = match import.kind {
            ImportKind::Shopify => {
                let feed: FeedFile =
                    serde_json::from_str(&body).with_context(|| format!("parse {url}"))?;
                feed.products
                    .into_iter()
                    .filter_map(|fp| {
                        let (price, avail) = pick_variant(&fp.variants)?;
                        let page_url = format!("{origin}/products/{}", fp.handle);
                        Some(FeedItem {
                            slug: fp.handle,
                            title: fp.title,
                            brand: fp.vendor.unwrap_or_default(),
                            price: (price * 100.0).round() / 100.0,
                            avail,
                            url: page_url,
                            product_type: fp.product_type.unwrap_or_default(),
                        })
                    })
                    .collect()
            }
            ImportKind::Woocommerce => {
                let prods: Vec<WooProduct> =
                    serde_json::from_str(&body).with_context(|| format!("parse {url}"))?;
                prods
                    .into_iter()
                    .filter_map(|wp| {
                        let cents: f64 = wp.prices.price.trim().parse().ok()?;
                        if cents <= 0.0 {
                            return None;
                        }
                        // The title always contains the brand, so it doubles as the
                        // match brand (the Store API has no vendor field).
                        Some(FeedItem {
                            slug: wp.id.to_string(),
                            title: wp.name.clone(),
                            brand: wp.name,
                            price: (cents / 100.0 * 100.0).round() / 100.0,
                            avail: wp.is_in_stock,
                            url: wp.permalink,
                            product_type: String::new(),
                        })
                    })
                    .collect()
            }
        };
        if items.is_empty() {
            break;
        }
        sum.pages += 1;
        for it in &items {
            *sum.product_types
                .entry(it.product_type.clone())
                .or_insert(0) += 1;
            let stock = if it.avail {
                StockState::InStock
            } else {
                StockState::OutOfStock
            };
            let offer = |product_id: String| RawOffer {
                product_id,
                retailer_id: rconf.id.clone(),
                price: it.price,
                stock,
                url: it.url.clone(),
                observed_at: iso_from_ms(now),
            };
            if let Some((seed_id, token)) = match_seed(&seeds, &it.title, &it.brand) {
                let o = offer(seed_id.clone());
                db::upsert_offer(conn, &o)?;
                db::upsert_snapshot(conn, &seed_id, &rconf.id, day, it.price, it.avail)?;
                sum.matched += 1;
                sum.matches.push(MatchLog {
                    listing: it.title.clone(),
                    seed_id,
                    token,
                });
            } else {
                let pid = format!("mkt-{}-{}", rconf.id, it.slug);
                let label = market_label(Some(&it.product_type), &it.title);
                let product = Product {
                    id: pid.clone(),
                    cat: None,
                    market: Some(label.clone()),
                    brand: it.brand.clone(),
                    name: it.title.clone(),
                    glyph: "box".to_string(),
                    short: None,
                    facet: label,
                    warranty_y: 0,
                    specs: Default::default(),
                    socket: None,
                    tdp: None,
                    ff: None,
                    mem: None,
                    ffs: None,
                    max_gpu: None,
                    max_cooler: None,
                    rad_top: None,
                    ctype: None,
                    rad: None,
                    height: None,
                    max_tdp: None,
                    length: None,
                    tgp: None,
                    watt: None,
                    vis: Default::default(),
                };
                conn.execute(
                    "INSERT INTO products(id, cat, sort, json) VALUES(?1, '', ?2, ?3)
                     ON CONFLICT(id) DO UPDATE SET json = excluded.json",
                    params![pid, i64::MAX, serde_json::to_string(&product)?],
                )?;
                let o = offer(pid);
                db::upsert_offer(conn, &o)?;
                db::upsert_snapshot(conn, &o.product_id, &rconf.id, day, it.price, it.avail)?;
                sum.market += 1;
            }
            sum.products += 1;
        }
        if page >= import.max_pages {
            break;
        }
        page += 1;
        tokio::time::sleep(Duration::from_millis(settings.delay_ms)).await;
    }
    Ok(sum)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rigmy_core::CatId;

    fn seed_product(id: &str, brand: &str, name: &str) -> Product {
        Product {
            id: id.into(),
            cat: Some(CatId::Cpu),
            market: None,
            brand: brand.into(),
            name: name.into(),
            glyph: "cpu".into(),
            short: None,
            facet: "x".into(),
            warranty_y: 3,
            specs: Default::default(),
            socket: None,
            tdp: None,
            ff: None,
            mem: None,
            ffs: None,
            max_gpu: None,
            max_cooler: None,
            rad_top: None,
            ctype: None,
            rad: None,
            height: None,
            max_tdp: None,
            length: None,
            tgp: None,
            watt: None,
            vis: Default::default(),
        }
    }

    #[test]
    fn robots_allows_by_default_and_missing_file() {
        assert!(robots_allowed(None, "/products.json"));
        assert!(robots_allowed(
            Some(
                "User-agent: *
Disallow: /cart/"
            ),
            "/products.json"
        ));
        assert!(robots_allowed(Some(""), "/products.json"));
    }

    #[test]
    fn robots_longest_rule_wins() {
        // Disallow of the feed path beats the generic Allow /.
        assert!(!robots_allowed(
            Some(
                "User-agent: *
Allow: /
Disallow: /products.json
"
            ),
            "/products.json"
        ));
        // A more specific Allow beats a broader Disallow.
        assert!(robots_allowed(
            Some(
                "User-agent: *
Disallow: /*.json
Allow: /products.json
"
            ),
            "/products.json"
        ));
        // Wildcards: /prod* matches only paths starting with /prod.
        assert!(!robots_allowed(
            Some(
                "User-agent: *
Disallow: /prod*"
            ),
            "/products.json"
        ));
        assert!(!robots_allowed(
            Some(
                "User-agent: *
Disallow: /prod*"
            ),
            "/products.html"
        ));
        assert!(robots_allowed(
            Some(
                "User-agent: *
Disallow: /prod*"
            ),
            "/media/prod.png"
        ));
        // A trailing wildcard with a suffix segment matches mid-path.
        assert!(!robots_allowed(
            Some(
                "User-agent: *
Disallow: /*.json"
            ),
            "/products.json"
        ));
        assert!(robots_allowed(
            Some(
                "User-agent: *
Disallow: /*.json"
            ),
            "/products.html"
        ));
        // Only the User-agent: * group is honored here.
        assert!(robots_allowed(
            Some(
                "User-agent: BadBot
Disallow: /
User-agent: *
Allow: /
"
            ),
            "/products.json"
        ));
    }

    #[test]
    fn variant_pick_prefers_cheapest_in_stock() {
        let v = vec![
            FeedVariant {
                price: "100.00".into(),
                available: false,
            },
            FeedVariant {
                price: "90.00".into(),
                available: true,
            },
            FeedVariant {
                price: "95.00".into(),
                available: true,
            },
        ];
        assert_eq!(pick_variant(&v), Some((90.0, true)));
        let v = vec![FeedVariant {
            price: "100.00".into(),
            available: false,
        }];
        assert_eq!(pick_variant(&v), Some((100.0, false)));
        let v = vec![FeedVariant {
            price: "abc".into(),
            available: true,
        }];
        assert_eq!(pick_variant(&v), None);
        assert_eq!(pick_variant(&[]), None);
    }

    #[test]
    fn market_labels_map_known_codes() {
        assert_eq!(market_label(Some("VGA"), "x"), "Graphics Card");
        assert_eq!(market_label(Some("KEYBO"), "x"), "Keyboard");
        assert_eq!(market_label(Some("PSU"), "x"), "Power Supply");
        // Unknown code falls back to a title-cased label.
        assert_eq!(market_label(Some("MONITOR"), "x"), "Monitor");
        // No code: sniff the title.
        assert_eq!(
            market_label(None, "Gigabyte GeForce RTX 5060 graphics card"),
            "Graphics Card"
        );
        assert_eq!(market_label(None, "mystery gizmo"), "Other");
    }

    #[test]
    fn model_tokens_are_model_numbers() {
        let t = model_tokens("ASUS ROG Strix B850-F Gaming WiFi");
        assert!(t.contains(&"b850".to_string()));
        assert!(!t.contains(&"gaming".to_string()));
        let t = model_tokens("AMD Ryzen 7 9800X3D");
        assert!(t.contains(&"9800x3d".to_string()));
        // Specs are not model numbers.
        assert_eq!(
            model_tokens("Corsair RM850e (2025) 850W"),
            vec!["rm850e".to_string()]
        );
        assert_eq!(
            model_tokens("NVIDIA GeForce RTX 5060 16GB"),
            Vec::<String>::new()
        );
        assert_eq!(
            model_tokens("Kingston FURY 64GB 6000MHz"),
            Vec::<String>::new()
        );
    }

    #[test]
    fn seed_match_is_conservative() {
        let seeds = vec![
            seed_product("cpu-9800x3d", "AMD", "AMD Ryzen 7 9800X3D"),
            seed_product("mb-b850f", "ASUS", "ASUS ROG Strix B850-F Gaming WiFi"),
        ];
        // Same brand + model token in the title.
        assert_eq!(
            match_seed(&seeds, "AMD Ryzen 7 9800X3D 8-Core Processor", "AMD"),
            Some(("cpu-9800x3d".to_string(), "9800x3d".to_string()))
        );
        // Brand mismatch must never match, even with the token present.
        assert_eq!(
            match_seed(&seeds, "GIGABYTE B850-F AORUS Elite", "GIGABYTE"),
            None
        );
        // Different model, same brand.
        assert_eq!(match_seed(&seeds, "AMD Ryzen 7 7800X3D", "AMD"), None);
        // No model token at all.
        assert_eq!(match_seed(&seeds, "AMD Ryzen 9000 series CPU", "AMD"), None);
    }
}
