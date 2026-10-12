//! Pure parsers turning a fetched retailer response into a price + stock observation.
//! Network access lives in `ingest.rs`; everything here is unit-tested against fixtures.

use rigmy_core::StockState;
use serde_json::Value;
use url::Url;

#[derive(Debug, Clone, PartialEq)]
pub struct Parsed {
    pub price: f64,
    pub stock: StockState,
}

#[derive(Debug, Clone, PartialEq)]
pub enum AdapterError {
    /// Page parsed but holds no usable product/price.
    NotFound(String),
    /// Price is not in Malaysian ringgit; skipped on purpose.
    Currency(String),
    /// Malformed payload.
    Invalid(String),
}

impl std::fmt::Display for AdapterError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AdapterError::NotFound(m) => write!(f, "not found: {m}"),
            AdapterError::Currency(c) => write!(f, "currency is {c}, not MYR; skipped"),
            AdapterError::Invalid(m) => write!(f, "invalid response: {m}"),
        }
    }
}

impl std::error::Error for AdapterError {}

type R<T> = Result<T, AdapterError>;

/// Prices at or above this (RM) are treated as parse errors (e.g. a SKU or a sen value read as
/// ringgit); no PC part sells for RM 1 million.
pub const MAX_SANE_PRICE_RM: f64 = 1_000_000.0;

fn sane(price: f64) -> bool {
    price.is_finite() && price > 0.0 && price < MAX_SANE_PRICE_RM
}

/// "RM 2,249.00" / "2249" / 2249.5 -> 2249.0 / 2249.5. Handles "2.249,00"-style only when the
/// comma is clearly decimal (two trailing digits and dots as thousands separators).
pub fn parse_price(v: &Value) -> Option<f64> {
    let p = match v {
        Value::Number(n) => n.as_f64()?,
        Value::String(s) => {
            let cleaned: String = s
                .chars()
                .filter(|c| c.is_ascii_digit() || *c == '.' || *c == ',')
                .collect();
            let norm = match (cleaned.rfind('.'), cleaned.rfind(',')) {
                (Some(d), Some(c)) if c > d => cleaned.replace('.', "").replace(',', "."),
                (None, Some(c))
                    if cleaned.len() - c == 3 && cleaned.matches(',').count() == 1 && c > 3 =>
                {
                    cleaned.replace(',', ".")
                }
                _ => cleaned.replace(',', ""),
            };
            norm.parse().ok()?
        }
        _ => return None,
    };
    sane(p).then_some(p)
}

/// schema.org availability (URL or bare token) -> stock state.
pub fn map_availability(v: Option<&Value>) -> StockState {
    let Some(s) = v.and_then(Value::as_str) else {
        return StockState::Unknown;
    };
    let token = s
        .trim()
        .rsplit('/')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    match token.as_str() {
        "instock" | "onlineonly" | "instoreonly" => StockState::InStock,
        "limitedavailability" => StockState::LowStock,
        "preorder" | "presale" | "backorder" => StockState::PreOrder,
        "outofstock" | "soldout" | "discontinued" => StockState::OutOfStock,
        _ => StockState::Unknown,
    }
}

fn type_is(v: &Value, t: &str) -> bool {
    match v.get("@type") {
        Some(Value::String(s)) => s == t || s.ends_with(&format!("/{t}")),
        Some(Value::Array(a)) => a.iter().any(|x| x.as_str() == Some(t)),
        _ => false,
    }
}

fn collect_products<'a>(v: &'a Value, out: &mut Vec<&'a Value>) {
    match v {
        Value::Array(a) => a.iter().for_each(|x| collect_products(x, out)),
        Value::Object(o) => {
            if type_is(v, "Product") {
                out.push(v);
            }
            for (k, child) in o {
                if k != "offers" {
                    collect_products(child, out);
                }
            }
        }
        _ => {}
    }
}

fn as_list(v: Option<&Value>) -> Vec<&Value> {
    match v {
        Some(Value::Array(a)) => a.iter().collect(),
        Some(v @ Value::Object(_)) => vec![v],
        _ => vec![],
    }
}

fn product_matches_sku(p: &Value, sku: &str) -> bool {
    [
        "sku",
        "mpn",
        "gtin",
        "gtin8",
        "gtin12",
        "gtin13",
        "gtin14",
        "productID",
    ]
    .iter()
    .any(|k| match p.get(*k) {
        Some(Value::String(s)) => s.trim().eq_ignore_ascii_case(sku.trim()),
        Some(Value::Number(n)) => n.to_string() == sku.trim(),
        _ => false,
    })
}

/// Price candidates from one Product node's `offers`: (price, stock, currency).
fn offer_candidates(p: &Value) -> Vec<(Option<f64>, StockState, Option<String>)> {
    let mut out = vec![];
    for o in as_list(p.get("offers")) {
        let specs = as_list(o.get("priceSpecification"));
        let price = o
            .get("price")
            .and_then(parse_price)
            .or_else(|| o.get("lowPrice").and_then(parse_price))
            .or_else(|| {
                specs
                    .iter()
                    .find_map(|s| s.get("price").and_then(parse_price))
            });
        let currency = o
            .get("priceCurrency")
            .or_else(|| specs.iter().find_map(|s| s.get("priceCurrency")))
            .and_then(Value::as_str)
            .map(|s| s.trim().to_ascii_uppercase());
        let stock = map_availability(o.get("availability").or_else(|| p.get("availability")));
        out.push((price, stock, currency));
        // AggregateOffer may nest the individual offers too.
        if o.get("offers").is_some() {
            out.extend(offer_candidates(o));
        }
    }
    out
}

/// Choose the cheapest buyable candidate, else the cheapest overall.
fn choose(cands: Vec<(f64, StockState)>) -> Option<Parsed> {
    let best = |avail: bool| {
        cands
            .iter()
            .filter(|(_, s)| !avail || s.available())
            .min_by(|a, b| a.0.total_cmp(&b.0))
            .map(|&(price, stock)| Parsed { price, stock })
    };
    best(true).or_else(|| best(false))
}

/// `jsonld` adapter: schema.org Product in `<script type="application/ld+json">` blocks
/// (top level, inside `@graph`, or in arrays). Prices must be in MYR.
pub fn parse_jsonld(html: &str, sku: Option<&str>) -> R<Parsed> {
    let doc = scraper::Html::parse_document(html);
    let sel =
        scraper::Selector::parse(r#"script[type="application/ld+json"]"#).expect("static selector");
    let mut blocks = vec![];
    for el in doc.select(&sel) {
        let text: String = el.text().collect();
        let cleaned: String = text
            .chars()
            .map(|c| {
                if c.is_control() && c != '\n' && c != '\t' {
                    ' '
                } else {
                    c
                }
            })
            .collect();
        if let Ok(v) = serde_json::from_str::<Value>(cleaned.trim()) {
            blocks.push(v);
        }
    }
    let mut products = vec![];
    for b in &blocks {
        collect_products(b, &mut products);
    }
    if products.is_empty() {
        return Err(AdapterError::NotFound(
            "no schema.org Product in JSON-LD".into(),
        ));
    }
    let chosen: Vec<&Value> = match sku {
        Some(s) => products
            .iter()
            .copied()
            .filter(|p| product_matches_sku(p, s))
            .collect(),
        None => products
            .iter()
            .copied()
            .filter(|p| p.get("offers").is_some())
            .collect(),
    };
    let mut cands = vec![];
    let mut wrong_currency = None;
    for p in chosen {
        for (price, stock, cur) in offer_candidates(p) {
            let Some(price) = price else { continue };
            match cur.as_deref() {
                Some("MYR") => cands.push((price, stock)),
                Some(other) => wrong_currency = Some(other.to_string()),
                None => wrong_currency = wrong_currency.or(Some("unspecified".to_string())),
            }
        }
    }
    match choose(cands) {
        Some(p) => Ok(p),
        None => match wrong_currency {
            Some(c) => Err(AdapterError::Currency(c)),
            None => Err(AdapterError::NotFound(match sku {
                Some(s) => format!("no priced offer for sku '{s}'"),
                None => "no priced offer".into(),
            })),
        },
    }
}

/// Base product URL with query/fragment and trailing slash removed.
fn clean_product_url(url: &str) -> R<Url> {
    let mut u = Url::parse(url).map_err(|e| AdapterError::Invalid(format!("bad url: {e}")))?;
    u.set_query(None);
    u.set_fragment(None);
    let path = u
        .path()
        .trim_end_matches('/')
        .trim_end_matches(".js")
        .trim_end_matches(".json")
        .to_string();
    u.set_path(&path);
    Ok(u)
}

/// Shopify AJAX endpoint: `<product-url>.js` (prices in cents, has `available`).
pub fn shopify_js_url(url: &str) -> R<String> {
    let u = clean_product_url(url)?;
    Ok(format!("{}.js", u.as_str()))
}

/// Shopify JSON endpoint: `<product-url>.json` (prices as decimal strings, no availability).
pub fn shopify_json_url(url: &str) -> R<String> {
    let u = clean_product_url(url)?;
    Ok(format!("{}.json", u.as_str()))
}

fn pick_variant(variants: &[Value], variant: Option<u64>) -> R<Vec<&Value>> {
    match variant {
        Some(id) => {
            let v: Vec<&Value> = variants
                .iter()
                .filter(|v| v.get("id").and_then(Value::as_u64) == Some(id))
                .collect();
            if v.is_empty() {
                return Err(AdapterError::NotFound(format!("variant {id} not present")));
            }
            Ok(v)
        }
        None => Ok(variants.iter().collect()),
    }
}

/// Shopify `.js` payload: integer prices in cents (e.g. 224900 = RM 2,249.00).
pub fn parse_shopify_js(body: &str, variant: Option<u64>) -> R<Parsed> {
    let v: Value = serde_json::from_str(body).map_err(|e| AdapterError::Invalid(e.to_string()))?;
    let variants = v
        .get("variants")
        .and_then(Value::as_array)
        .ok_or_else(|| AdapterError::Invalid("no variants".into()))?;
    let mut cands = vec![];
    for var in pick_variant(variants, variant)? {
        // The .js endpoint always uses integer cents; tolerate strings ("224900") too.
        let cents = match var.get("price") {
            Some(Value::Number(n)) => n.as_f64(),
            Some(Value::String(s)) => s.trim().parse::<f64>().ok(),
            _ => None,
        };
        let Some(price) = cents.map(|c| c / 100.0).filter(|p| sane(*p)) else {
            continue;
        };
        let stock = match var.get("available").and_then(Value::as_bool) {
            Some(true) => StockState::InStock,
            Some(false) => StockState::OutOfStock,
            None => StockState::Unknown,
        };
        cands.push((price, stock));
    }
    choose(cands).ok_or_else(|| AdapterError::NotFound("no priced variant".into()))
}

/// Shopify `.json` payload: `{"product":{"variants":[{"price":"2249.00"}]}}` — decimal ringgit.
pub fn parse_shopify_json(body: &str, variant: Option<u64>) -> R<Parsed> {
    let v: Value = serde_json::from_str(body).map_err(|e| AdapterError::Invalid(e.to_string()))?;
    let variants = v
        .pointer("/product/variants")
        .and_then(Value::as_array)
        .ok_or_else(|| AdapterError::Invalid("no product.variants".into()))?;
    let mut cands = vec![];
    for var in pick_variant(variants, variant)? {
        let Some(price) = var.get("price").and_then(parse_price) else {
            continue;
        };
        let stock = match (
            var.get("available").and_then(Value::as_bool),
            var.get("inventory_quantity").and_then(Value::as_i64),
        ) {
            (Some(true), _) => StockState::InStock,
            (Some(false), _) => StockState::OutOfStock,
            (None, Some(q)) if q > 0 => StockState::InStock,
            _ => StockState::Unknown,
        };
        cands.push((price, stock));
    }
    choose(cands).ok_or_else(|| AdapterError::NotFound("no priced variant".into()))
}

/// WooCommerce Store API URL for a product page: by explicit id, else by the URL's last path
/// segment as slug.
pub fn woocommerce_api_url(product_url: &str, product_id: Option<u64>) -> R<String> {
    let u = Url::parse(product_url).map_err(|e| AdapterError::Invalid(format!("bad url: {e}")))?;
    let origin = u.origin().ascii_serialization();
    if let Some(id) = product_id {
        return Ok(format!("{origin}/wp-json/wc/store/v1/products/{id}"));
    }
    let slug = u
        .path_segments()
        .and_then(|mut s| s.rfind(|x| !x.is_empty()).map(str::to_string))
        .ok_or_else(|| AdapterError::Invalid("cannot derive product slug from url".into()))?;
    let mut api = Url::parse(&format!("{origin}/wp-json/wc/store/v1/products")).expect("valid");
    api.query_pairs_mut().append_pair("slug", &slug);
    Ok(api.to_string())
}

/// WooCommerce Store API payload (object, or array from `?slug=`). `prices.price` is a string in
/// minor units with `currency_minor_unit` decimals.
pub fn parse_woocommerce(body: &str) -> R<Parsed> {
    let v: Value = serde_json::from_str(body).map_err(|e| AdapterError::Invalid(e.to_string()))?;
    let p = match &v {
        Value::Array(a) => a
            .first()
            .ok_or_else(|| AdapterError::NotFound("no product with that slug".into()))?,
        Value::Object(_) => &v,
        _ => return Err(AdapterError::Invalid("unexpected payload".into())),
    };
    let prices = p
        .get("prices")
        .ok_or_else(|| AdapterError::Invalid("no prices".into()))?;
    let currency = prices
        .get("currency_code")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_ascii_uppercase();
    if currency != "MYR" {
        return Err(AdapterError::Currency(if currency.is_empty() {
            "unspecified".into()
        } else {
            currency
        }));
    }
    let minor = prices
        .get("currency_minor_unit")
        .and_then(Value::as_u64)
        .unwrap_or(2)
        .min(6) as i32;
    let raw = match prices.get("price") {
        Some(Value::String(s)) => s.trim().parse::<f64>().ok(),
        Some(Value::Number(n)) => n.as_f64(),
        _ => None,
    }
    .ok_or_else(|| AdapterError::NotFound("empty price".into()))?;
    let price = raw / 10f64.powi(minor);
    if !sane(price) {
        return Err(AdapterError::NotFound(format!("implausible price {price}")));
    }
    let class = p
        .pointer("/stock_availability/class")
        .and_then(Value::as_str)
        .unwrap_or("");
    let stock = if class.contains("backorder") {
        StockState::PreOrder
    } else {
        match p.get("is_in_stock").and_then(Value::as_bool) {
            Some(false) => StockState::OutOfStock,
            Some(true) if p.get("low_stock_remaining").is_some_and(|x| !x.is_null()) => {
                StockState::LowStock
            }
            Some(true) => StockState::InStock,
            None => StockState::Unknown,
        }
    };
    Ok(Parsed { price, stock })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn price_strings() {
        assert_eq!(parse_price(&json!("RM 2,249.00")), Some(2249.0));
        assert_eq!(parse_price(&json!("2249")), Some(2249.0));
        assert_eq!(parse_price(&json!(899.9)), Some(899.9));
        assert_eq!(parse_price(&json!("1.299,50")), Some(1299.5));
        assert_eq!(parse_price(&json!("12,999")), Some(12999.0));
        assert_eq!(parse_price(&json!("0.00")), None);
        assert_eq!(parse_price(&json!(null)), None);
    }

    #[test]
    fn availability() {
        assert_eq!(
            map_availability(Some(&json!("https://schema.org/InStock"))),
            StockState::InStock
        );
        assert_eq!(
            map_availability(Some(&json!("http://schema.org/LimitedAvailability"))),
            StockState::LowStock
        );
        assert_eq!(
            map_availability(Some(&json!("PreOrder"))),
            StockState::PreOrder
        );
        assert_eq!(
            map_availability(Some(&json!("https://schema.org/BackOrder"))),
            StockState::PreOrder
        );
        assert_eq!(
            map_availability(Some(&json!("https://schema.org/OutOfStock"))),
            StockState::OutOfStock
        );
        assert_eq!(map_availability(None), StockState::Unknown);
    }

    #[test]
    fn urls() {
        assert_eq!(
            shopify_js_url("https://shop.example/products/ryzen-7-9800x3d/?variant=1#x").unwrap(),
            "https://shop.example/products/ryzen-7-9800x3d.js"
        );
        assert_eq!(
            shopify_json_url("https://shop.example/products/a.js").unwrap(),
            "https://shop.example/products/a.json"
        );
        assert_eq!(
            woocommerce_api_url("https://pc.example/product/amd-ryzen-7-9800x3d/", None).unwrap(),
            "https://pc.example/wp-json/wc/store/v1/products?slug=amd-ryzen-7-9800x3d"
        );
        assert_eq!(
            woocommerce_api_url("https://pc.example/product/x/", Some(42)).unwrap(),
            "https://pc.example/wp-json/wc/store/v1/products/42"
        );
    }
}
