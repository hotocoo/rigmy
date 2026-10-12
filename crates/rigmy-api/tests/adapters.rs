//! Adapter + OSM importer tests against hand-written fixtures in tests/fixtures.
//! The fixtures imitate the *structure* of real responses (schema.org JSON-LD, Shopify `.js` /
//! `.json`, WooCommerce Store API, Overpass JSON); names, URLs and prices in them are invented
//! test inputs and are never loaded as data.

use rigmy_api::adapters::*;
use rigmy_api::config::RetailerConf;
use rigmy_api::osm::branches_from_overpass;
use rigmy_core::{BranchSource, StockState};

fn fx(name: &str) -> String {
    std::fs::read_to_string(format!(
        "{}/tests/fixtures/{name}",
        env!("CARGO_MANIFEST_DIR")
    ))
    .unwrap()
}

fn p(price: f64, stock: StockState) -> Parsed {
    Parsed { price, stock }
}

#[test]
fn jsonld_simple_product() {
    assert_eq!(
        parse_jsonld(&fx("jsonld_simple.html"), None),
        Ok(p(2249.0, StockState::InStock))
    );
}

#[test]
fn jsonld_graph_picks_cheapest_in_stock_offer() {
    // 799 is out of stock; 899 comes from priceSpecification.
    assert_eq!(
        parse_jsonld(&fx("jsonld_graph.html"), None),
        Ok(p(899.0, StockState::InStock))
    );
}

#[test]
fn jsonld_aggregate_offer() {
    assert_eq!(
        parse_jsonld(&fx("jsonld_aggregate.html"), None),
        Ok(p(549.0, StockState::LowStock))
    );
}

#[test]
fn jsonld_rejects_non_myr() {
    assert_eq!(
        parse_jsonld(&fx("jsonld_usd.html"), None),
        Err(AdapterError::Currency("USD".into()))
    );
}

#[test]
fn jsonld_variants_and_sku_selection() {
    let html = fx("jsonld_variants.html");
    // Without sku: cheapest buyable across variants (pre-order counts as buyable).
    assert_eq!(
        parse_jsonld(&html, None),
        Ok(p(899.0, StockState::PreOrder))
    );
    assert_eq!(
        parse_jsonld(&html, Some("F5-6000J3040G32GX2-TZ5NR")),
        Ok(p(1699.0, StockState::InStock))
    );
    assert!(matches!(
        parse_jsonld(&html, Some("nope")),
        Err(AdapterError::NotFound(_))
    ));
}

#[test]
fn jsonld_missing() {
    assert!(matches!(
        parse_jsonld(&fx("jsonld_none.html"), None),
        Err(AdapterError::NotFound(_))
    ));
}

#[test]
fn shopify_js_cents_and_availability() {
    let body = fx("shopify_product.js");
    // White (RM 389) is unavailable -> cheapest available is the bundle at RM 399.
    assert_eq!(
        parse_shopify_js(&body, None),
        Ok(p(399.0, StockState::InStock))
    );
    assert_eq!(
        parse_shopify_js(&body, Some(40111111111112)),
        Ok(p(389.0, StockState::OutOfStock))
    );
    assert!(matches!(
        parse_shopify_js(&body, Some(1)),
        Err(AdapterError::NotFound(_))
    ));
    assert_eq!(
        parse_shopify_js(&fx("shopify_soldout.js"), None),
        Ok(p(529.0, StockState::OutOfStock))
    );
    assert!(matches!(
        parse_shopify_js("<html>", None),
        Err(AdapterError::Invalid(_))
    ));
}

#[test]
fn shopify_json_decimal_prices() {
    let body = fx("shopify_product.json");
    assert_eq!(
        parse_shopify_json(&body, None),
        Ok(p(529.0, StockState::Unknown))
    );
    assert_eq!(
        parse_shopify_json(&body, Some(50000000000002)),
        Ok(p(579.0, StockState::Unknown))
    );
}

#[test]
fn woocommerce_store_api() {
    assert_eq!(
        parse_woocommerce(&fx("woocommerce_slug.json")),
        Ok(p(749.0, StockState::LowStock))
    );
    assert_eq!(
        parse_woocommerce(&fx("woocommerce_oos.json")),
        Ok(p(599.0, StockState::OutOfStock))
    );
    assert_eq!(
        parse_woocommerce(&fx("woocommerce_backorder.json")),
        Ok(p(1399.0, StockState::PreOrder))
    );
    assert_eq!(
        parse_woocommerce(&fx("woocommerce_sgd.json")),
        Err(AdapterError::Currency("SGD".into()))
    );
    assert!(matches!(
        parse_woocommerce(&fx("woocommerce_empty.json")),
        Err(AdapterError::NotFound(_))
    ));
}

fn retailer(id: &str, patterns: &[&str]) -> RetailerConf {
    let toml = format!(
        "id = '{id}'\nname = 'Shop {id}'\ncity = 'KL'\nwebsite = 'https://{id}.test'\nosm_match = [{}]",
        patterns.iter().map(|p| format!("'{p}'")).collect::<Vec<_>>().join(",")
    );
    toml::from_str(&toml).unwrap()
}

#[test]
fn overpass_import() {
    let rs = vec![
        retailer("tc", &["test computer"]),
        retailer("second", &["Second Shop"]),
    ];
    let bs = branches_from_overpass(&fx("overpass.json"), &rs).unwrap();
    assert_eq!(bs.len(), 3, "{bs:#?}");
    let a = &bs[0];
    assert_eq!(
        (a.id.as_str(), a.retailer_id.as_str()),
        ("osm-node-1001", "tc")
    );
    assert_eq!(a.addr, "3-12 Jalan Contoh, 55100 Kuala Lumpur");
    assert_eq!(a.phone.as_deref(), Some("+60 3-0000 0000"));
    assert_eq!(a.hours.as_ref().unwrap().week[0], Some([10.0, 22.0]));
    assert_eq!(a.source, BranchSource::Osm);
    assert!(a.services.is_empty());
    let b = &bs[1];
    assert_eq!(
        (b.id.as_str(), b.lat, b.lon),
        ("osm-way-2002", 5.329, 100.2865)
    );
    assert_eq!(b.hours.as_ref().unwrap().week[6], Some([10.0, 16.0]));
    assert_eq!(b.hours.as_ref().unwrap().week[0], None);
    let c = &bs[2];
    assert_eq!(c.retailer_id, "second");
    assert!(c.hours.is_none());
    assert_eq!(c.hours_raw.as_deref(), Some("by appointment"));

    let json = serde_json::to_value(c).unwrap();
    assert!(json["hours"].is_null());
    assert_eq!(json["hoursRaw"], "by appointment");
    assert!(json.get("phone").is_none());
}
