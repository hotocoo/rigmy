//! `import` integration tests: fixture HTTP (no network), in-memory SQLite.

use std::collections::BTreeMap;
use std::future::Future;
use std::path::Path;
use std::pin::Pin;

use rigmy_api::config::Config;
use rigmy_api::{db, import, seed};
use rigmy_core::time::ms_from_iso;
use rigmy_core::StockState;

type BF<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// Fetcher backed by a URL -> body map; unknown URLs are HTTP 404.
struct FixtureFetcher {
    responses: BTreeMap<String, String>,
    calls: Vec<String>,
}

impl FixtureFetcher {
    fn new(responses: BTreeMap<String, String>) -> Self {
        Self {
            responses,
            calls: vec![],
        }
    }
}

impl import::Fetcher for FixtureFetcher {
    fn get<'a>(&'a mut self, url: &'a str) -> BF<'a, Result<String, String>> {
        self.calls.push(url.to_string());
        let out = match self.responses.get(url) {
            Some(body) => Ok(body.clone()),
            None => Err("HTTP 404".to_string()),
        };
        Box::pin(async move { out })
    }
}

fn now() -> i64 {
    ms_from_iso("2026-10-13T09:00:00+08:00").unwrap()
}

fn config() -> Config {
    let mut cfg =
        Config::load(&Path::new(env!("CARGO_MANIFEST_DIR")).join("../../config")).unwrap();
    cfg.sources.settings.delay_ms = 0;
    cfg
}

const ORIGIN: &str = "https://www.allithypermarket.com.my";

const ROBOTS: &str = "User-agent: *\nAllow: /\nDisallow: /cart/\n";

const PAGE1: &str = r#"{
  "products": [
    {"handle": "ryzen-7-9800x3d", "title": "AMD Ryzen 7 9800X3D 8-Core Desktop Processor", "product_type": "CPU", "vendor": "AMD",
     "variants": [{"price": "1899.00", "available": true}, {"price": "1849.00", "available": false}]},
    {"handle": "colorful-rtx-5060-ti-ultra-duo-oc", "title": "COLORFUL iGame GeForce RTX 5060 Ti Ultra DUO OC 16GB-V Graphics Card", "product_type": "VGA", "vendor": "COLORFUL",
     "variants": [{"price": "3449.00", "available": true}]},
    {"handle": "logitech-g316-x-75", "title": "Logitech Gaming Keyboard G316 X 75", "product_type": "KEYBO", "vendor": "Logitech",
     "variants": [{"price": "389.00", "available": true}, {"price": "379.00", "available": false}]}
  ]
}"#;

const PAGE2: &str = r#"{
  "products": [
    {"handle": "corsair-rm850x", "title": "Corsair RM850x 850W 80+ Gold Fully Modular PSU", "product_type": "PSU", "vendor": "Corsair",
     "variants": [{"price": "699.00", "available": true}]}
  ]
}"#;

fn fetcher() -> FixtureFetcher {
    let mut r = BTreeMap::new();
    r.insert(format!("{ORIGIN}/robots.txt"), ROBOTS.to_string());
    r.insert(
        format!("{ORIGIN}/products.json?limit=250&page=1"),
        PAGE1.to_string(),
    );
    r.insert(
        format!("{ORIGIN}/products.json?limit=250&page=2"),
        PAGE2.to_string(),
    );
    r.insert(
        format!("{ORIGIN}/products.json?limit=250&page=3"),
        r#"{"products": []}"#.to_string(),
    );
    FixtureFetcher::new(r)
}

fn offer_of(conn: &rusqlite::Connection, product: &str) -> Option<(f64, String, String)> {
    conn.query_row(
        "SELECT price, stock, url FROM offers_latest WHERE product_id = ?1 AND retailer_id = 'all-it'",
        [product],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )
    .ok()
}

#[tokio::test]
async fn import_feed_writes_offers_and_market_listings() {
    let cfg = config();
    let mut conn = db::open(":memory:").unwrap();
    seed::seed(&mut conn, &cfg, now()).unwrap();

    let mut f = fetcher();
    let sum = import::run(&mut conn, &cfg, "all-it", &mut f, now())
        .await
        .unwrap();

    assert_eq!(sum.pages, 2);
    assert_eq!(sum.products, 4);
    assert_eq!(sum.matched, 1);
    assert_eq!(sum.market, 3);
    assert_eq!(sum.failed, 0);
    // robots.txt is checked before any feed request.
    assert_eq!(f.calls[0], format!("{ORIGIN}/robots.txt"));
    assert_eq!(f.calls.len(), 4);

    // The listing that matches the verified catalog part attaches an offer to it.
    let (price, stock, url) = offer_of(&conn, "cpu-9800x3d").unwrap();
    assert!(
        (price - 1899.0).abs() < 1e-9,
        "cheapest in-stock variant expected, got {price}"
    );
    assert_eq!(stock, StockState::InStock.as_str());
    assert!(url.ends_with("/products/ryzen-7-9800x3d"));

    // Everything else is a market listing: no build slot, own product row + offer + snapshot.
    for (handle, expected_price, expected_stock) in [
        (
            "colorful-rtx-5060-ti-ultra-duo-oc",
            3449.0,
            StockState::InStock,
        ),
        ("logitech-g316-x-75", 389.0, StockState::InStock),
        ("corsair-rm850x", 699.0, StockState::InStock),
    ] {
        let pid = format!("mkt-all-it-{handle}");
        let p = db::products(&conn)
            .unwrap()
            .into_iter()
            .find(|p| p.id == pid)
            .unwrap_or_else(|| panic!("missing market product {pid}"));
        if handle == "colorful-rtx-5060-ti-ultra-duo-oc" {
            // Its title pins the card down (one chip, one VRAM size): buildable, specs from the listing.
            assert_eq!(p.cat, Some(rigmy_core::CatId::Gpu));
            assert_eq!(p.source.as_deref(), Some("listing"));
            assert_eq!(p.tgp, Some(180.0));
        } else if handle == "corsair-rm850x" {
            assert_eq!(p.cat, Some(rigmy_core::CatId::Psu));
            assert_eq!(p.watt, Some(850.0));
        } else {
            // A keyboard has no build slot.
            assert!(p.cat.is_none(), "market listing must not have a build slot");
        }
        let (price, stock, url) = offer_of(&conn, &pid).unwrap();
        assert!((price - expected_price).abs() < 1e-9);
        assert_eq!(stock, expected_stock.as_str());
        assert!(url.ends_with(&format!("/products/{handle}")));
    }
    // Daily snapshot recorded for price history.
    let snaps: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM snapshots WHERE retailer_id = 'all-it'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(snaps, 4);
}

#[tokio::test]
async fn import_is_idempotent() {
    let cfg = config();
    let mut conn = db::open(":memory:").unwrap();
    seed::seed(&mut conn, &cfg, now()).unwrap();

    let s1 = import::run(&mut conn, &cfg, "all-it", &mut fetcher(), now())
        .await
        .unwrap();
    let s2 = import::run(&mut conn, &cfg, "all-it", &mut fetcher(), now())
        .await
        .unwrap();
    assert_eq!(s1.products, s2.products);

    let products: i64 = conn
        .query_row("SELECT COUNT(*) FROM products", [], |r| r.get(0))
        .unwrap();
    let offers: i64 = conn
        .query_row("SELECT COUNT(*) FROM offers_latest", [], |r| r.get(0))
        .unwrap();
    assert_eq!(
        products,
        35 + 3,
        "35 seed parts + 3 market listings, no duplicates"
    );
    assert_eq!(
        offers, 4,
        "one offer per (product, retailer), no duplicates"
    );
}

#[tokio::test]
async fn import_refuses_when_robots_disallows_feed() {
    let cfg = config();
    let mut conn = db::open(":memory:").unwrap();
    seed::seed(&mut conn, &cfg, now()).unwrap();

    let mut f = fetcher();
    // Baseline run succeeds and records 4 offers.
    let ok = import::run(&mut conn, &cfg, "all-it", &mut f, now()).await;
    assert!(ok.is_ok(), "baseline should pass");
    let before: i64 = conn
        .query_row("SELECT COUNT(*) FROM offers_latest", [], |r| r.get(0))
        .unwrap();
    assert_eq!(before, 4);

    let mut disallowing = fetcher();
    disallowing.responses.insert(
        format!("{ORIGIN}/robots.txt"),
        "User-agent: *\nDisallow: /products\n".to_string(),
    );
    let err = import::run(&mut conn, &cfg, "all-it", &mut disallowing, now())
        .await
        .unwrap_err();
    let msg = format!("{err:#}");
    assert!(msg.contains("robots.txt disallows"), "got: {msg}");
    // No feed request may have been made, and no new offers were recorded.
    assert_eq!(disallowing.calls.len(), 1);
    let offers: i64 = conn
        .query_row("SELECT COUNT(*) FROM offers_latest", [], |r| r.get(0))
        .unwrap();
    assert_eq!(offers, before);
}

#[tokio::test]
async fn import_requires_import_block() {
    let cfg = config();
    let mut conn = db::open(":memory:").unwrap();
    seed::seed(&mut conn, &cfg, now()).unwrap();
    let mut f = fetcher();
    let err = import::run(&mut conn, &cfg, "no-such-retailer", &mut f, now())
        .await
        .unwrap_err();
    assert!(format!("{err:#}").contains("not in retailers.toml"));
}

#[tokio::test]
async fn import_drops_catalog_offers_the_feed_no_longer_backs() {
    let cfg = config();
    let mut conn = db::open(":memory:").unwrap();
    seed::seed(&mut conn, &cfg, now()).unwrap();
    // A wrong offer left behind by an older, looser matcher: a B850M-A page on the B850-F part.
    db::upsert_offer(
        &conn,
        &rigmy_core::RawOffer {
            product_id: "mb-b850f".into(),
            retailer_id: "all-it".into(),
            price: 549.0,
            stock: StockState::InStock,
            url: format!("{ORIGIN}/products/asus-prime-b850m-a-wifi"),
            observed_at: "2026-10-12T09:00:00+08:00".into(),
        },
    )
    .unwrap();

    let sum = import::run(&mut conn, &cfg, "all-it", &mut fetcher(), now())
        .await
        .unwrap();
    assert_eq!(sum.dropped, 1);
    assert!(offer_of(&conn, "mb-b850f").is_none());
    // The part the feed does back keeps its offer.
    assert!(offer_of(&conn, "cpu-9800x3d").is_some());
}

#[tokio::test]
async fn multi_model_listing_prices_the_matching_variant_only() {
    let cfg = config();
    let mut conn = db::open(":memory:").unwrap();
    seed::seed(&mut conn, &cfg, now()).unwrap();
    let page = r#"{"products": [
      {"handle": "corsair-rme-series", "title": "CORSAIR RMe SERIES RM650e / RM750e / RM850e / RM1000e GOLD PSU", "product_type": "PSU", "vendor": "Corsair",
       "variants": [{"title": "RM650e", "price": "389.00", "available": true}, {"title": "RM850e", "price": "639.00", "available": true}]},
      {"handle": "amd-x3d-series", "title": "AMD Ryzen 9800X3D / 9950X3D Processor", "product_type": "CPU", "vendor": "AMD",
       "variants": [{"title": "Default", "price": "1999.00", "available": true}, {"title": "Other", "price": "2999.00", "available": true}]}
    ]}"#;
    let mut r = BTreeMap::new();
    r.insert(format!("{ORIGIN}/robots.txt"), ROBOTS.to_string());
    r.insert(
        format!("{ORIGIN}/products.json?limit=250&page=1"),
        page.to_string(),
    );
    r.insert(
        format!("{ORIGIN}/products.json?limit=250&page=2"),
        r#"{"products": []}"#.to_string(),
    );
    let sum = import::run(
        &mut conn,
        &cfg,
        "all-it",
        &mut FixtureFetcher::new(r),
        now(),
    )
    .await
    .unwrap();
    // The RM850e variant's own price, not the cheaper RM650e.
    let (price, _, _) = offer_of(&conn, "psu-rm850e").unwrap();
    assert!((price - 639.0).abs() < 1e-9, "got {price}");
    // Variants priced differently but none names the part: no honest price, so it stays a market listing.
    assert!(offer_of(&conn, "cpu-9800x3d").is_none());
    assert_eq!((sum.matched, sum.market), (1, 1));
}

#[tokio::test]
async fn capacity_variants_price_the_part_capacity() {
    let cfg = config();
    let mut conn = db::open(":memory:").unwrap();
    seed::seed(&mut conn, &cfg, now()).unwrap();
    let page = r#"{"products": [
      {"handle": "lexar-nm790", "title": "Lexar NM790 M.2 NVMe SSD 512GB / 1TB / 2TB / 4TB", "product_type": "SSD", "vendor": "Lexar",
       "variants": [{"title": "512GB", "price": "229.00", "available": true}, {"title": "2TB", "price": "619.00", "available": true}]}
    ]}"#;
    let mut r = BTreeMap::new();
    r.insert(format!("{ORIGIN}/robots.txt"), ROBOTS.to_string());
    r.insert(
        format!("{ORIGIN}/products.json?limit=250&page=1"),
        page.to_string(),
    );
    r.insert(
        format!("{ORIGIN}/products.json?limit=250&page=2"),
        r#"{"products": []}"#.to_string(),
    );
    import::run(
        &mut conn,
        &cfg,
        "all-it",
        &mut FixtureFetcher::new(r),
        now(),
    )
    .await
    .unwrap();
    let (price, _, _) = offer_of(&conn, "ssd-nm790").unwrap();
    assert!(
        (price - 619.0).abs() < 1e-9,
        "2TB part must get the 2TB price, got {price}"
    );
}
