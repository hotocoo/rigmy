//! HTTP API integration tests: in-memory SQLite + `tower::ServiceExt::oneshot`.
//! Retailers, sources and prices below are synthetic test inputs created inside each test.

use std::path::Path;
use std::sync::Arc;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use rigmy_api::config::{Config, RetailerConf, SourceConf};
use rigmy_api::{db, ingest, seed, server};
use rigmy_core::time::{iso_from_ms, ms_from_iso, DAY_MS};
use rigmy_core::StockState;
use serde_json::{json, Value};
use tower::ServiceExt;

fn now() -> i64 {
    ms_from_iso("2026-10-12T12:00:00+08:00").unwrap()
}

fn config() -> Config {
    Config::load(&Path::new(env!("CARGO_MANIFEST_DIR")).join("../../config")).unwrap()
}

fn test_retailer(id: &str) -> RetailerConf {
    toml::from_str(&format!(
        r#"
        id = "{id}"
        name = "Shop {id}"
        city = "Kuala Lumpur"
        website = "https://{id}.test"
        pay = "FPX"
        pickup = "Online only"
        [delivery.kv]
        fee = 10
        eta = "Next day"
        "#
    ))
    .unwrap()
}

fn source(product: &str, retailer: &str, url: &str, adapter: &str) -> SourceConf {
    toml::from_str(&format!(
        "product = '{product}'\nretailer = '{retailer}'\nurl = '{url}'\nadapter = '{adapter}'"
    ))
    .unwrap()
}

fn app_with(cfg: &Config, prep: impl FnOnce(&rusqlite::Connection)) -> axum::Router {
    let mut conn = db::open(":memory:").unwrap();
    seed::seed(&mut conn, cfg, now()).unwrap();
    prep(&conn);
    let mut st = server::AppState::new(conn, 7);
    st.clock = now;
    server::router(Arc::new(st), &["http://localhost:3000".to_string()])
}

async fn call(
    app: &axum::Router,
    method: &str,
    uri: &str,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let mut req = Request::builder().method(method).uri(uri);
    let body = match body {
        Some(b) => {
            req = req.header("content-type", "application/json");
            Body::from(b.to_string())
        }
        None => Body::empty(),
    };
    let res = app.clone().oneshot(req.body(body).unwrap()).await.unwrap();
    let status = res.status();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let v = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes)
            .unwrap_or(Value::String(String::from_utf8_lossy(&bytes).into()))
    };
    (status, v)
}

#[tokio::test]
async fn empty_install_bootstrap_and_stats() {
    let app = app_with(&config(), |_| {});
    let (s, b) = call(&app, "GET", "/api/bootstrap", None).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(b["products"].as_array().unwrap().len(), 35);
    assert_eq!(b["retailers"], json!([]));
    assert_eq!(b["offers"], json!([]));
    assert_eq!(b["branches"], json!([]));
    assert!(b["lastIngest"].is_null());
    assert_eq!(b["presets"].as_array().unwrap().len(), 3);
    assert_eq!(b["regions"][0]["id"], "kv");
    assert_eq!(
        b["specdef"]["cpu"][0],
        json!(["cores", "Cores", "", "high"])
    );
    assert_eq!(b["facet"]["psu"], "Wattage");
    let events = b["events"].as_array().unwrap();
    assert_eq!(events.len(), 21);
    assert_eq!(events[0]["label"], "6.6");
    assert!(b["products"][0].get("price").is_none());
    assert_eq!(b["products"][0]["warrantyY"], 3);

    let (s, h) = call(&app, "GET", "/api/health", None).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(h["ok"], true);

    let (_, st) = call(&app, "GET", "/api/stats", None).await;
    let x = &st["cpu-9800x3d"];
    assert_eq!(x["verdict"], "No price yet");
    assert_eq!(x["tone"], "pending");
    assert!(x["cur"].is_null() && x["d7"].is_null() && x["avg90"].is_null() && x["lowT"].is_null());
    assert_eq!(x["next"]["label"], "11.11");
    assert_eq!(x["nextIn"], 30);
    assert_eq!(x["spark"], json!([]));

    assert_eq!(
        call(&app, "GET", "/api/index?cat=all", None).await.1,
        json!([])
    );
    assert_eq!(
        call(&app, "GET", "/api/index?cat=gpu", None).await.1,
        json!([])
    );
    let (s, e) = call(&app, "GET", "/api/index?cat=toaster", None).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    assert!(e["error"].is_string());

    assert_eq!(
        call(&app, "GET", "/api/products/cpu-9800x3d/history", None)
            .await
            .1,
        json!([])
    );
    let (s, e) = call(&app, "GET", "/api/products/nope/history", None).await;
    assert_eq!(s, StatusCode::NOT_FOUND);
    assert!(e["error"].as_str().unwrap().contains("nope"));
    assert_eq!(
        call(&app, "GET", "/api/nothing", None).await.0,
        StatusCode::NOT_FOUND
    );
    // Removed: couriers now ship in `bootstrap.content.couriers`.
    assert_eq!(
        call(&app, "GET", "/api/couriers", None).await.0,
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn bootstrap_serves_content_region_centers_and_featured_preset() {
    let app = app_with(&config(), |_| {});
    let (_, b) = call(&app, "GET", "/api/bootstrap", None).await;
    assert_eq!(
        b["regions"][0]["center"],
        json!({"lat": 3.139, "lon": 101.6869, "label": "Kuala Lumpur"})
    );
    let labels: Vec<&str> = b["regions"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| r["center"]["label"].as_str().unwrap())
        .collect();
    assert_eq!(
        labels,
        [
            "Kuala Lumpur",
            "George Town",
            "Johor Bahru",
            "Kota Kinabalu"
        ]
    );
    let featured: Vec<&Value> = b["presets"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|p| p["featured"] == true)
        .collect();
    assert_eq!(featured.len(), 1);
    assert_eq!(featured[0]["id"], "helang");

    let c = &b["content"];
    assert_eq!(c["etas"].as_array().unwrap().len(), 6);
    assert_eq!(
        c["etas"][5],
        json!({"label": "5–7 days", "rank": 5, "days": 7})
    );
    assert_eq!(
        c["deliveryWindows"],
        json!(["9 am – 12 pm", "12 – 3 pm", "3 – 6 pm", "6 – 9 pm"])
    );
    assert_eq!(c["slotDays"], 5);
    assert_eq!(c["deliverySizeMultiplier"], json!({"case": 2.0}));
    let pcs = b["postcodes"].as_array().unwrap();
    assert_eq!(pcs.len(), 67);
    assert_eq!(
        pcs[0],
        json!({"prefix": "01", "town": "Kangar", "lat": 6.44, "lon": 100.2})
    );
    assert_eq!(c["guide"].as_array().unwrap().len(), 10);
    assert_eq!(c["guide"][9]["cat"], Value::Null);
    assert_eq!(c["guide"][0]["minutes"], 5);
    assert_eq!(c["cableRuns"][2]["requires"], "gpu");
    assert_eq!(c["cableRuns"][2]["lengthMm"], 650);
    assert_eq!(c["couriers"].as_array().unwrap().len(), 9);
    assert!(c["couriers"][0].get("trackingUrl").is_none());

    // The browser engine accepts exactly what the API serves.
    let cat = rigmy_core::Catalog::from_json(&b.to_string()).unwrap();
    assert_eq!(cat.etas().slowest(), rigmy_core::Eta::D5to7);
}

#[test]
fn bootstrap_requires_seeded_content() {
    let conn = db::open(":memory:").unwrap();
    let e = db::bootstrap(&conn, now(), 7).unwrap_err().to_string();
    assert!(e.contains("run `rigmy-api seed`"), "{e}");
}

#[tokio::test]
async fn builds_roundtrip_and_validation() {
    let app = app_with(&config(), |_| {});
    let body = json!({"name": "  Harimau  ", "build": {"cpu": "cpu-9800x3d", "gpu": "gpu-9070xt", "case": null}, "region": "pen"});
    let (s, b) = call(&app, "POST", "/api/builds", Some(body)).await;
    assert_eq!(s, StatusCode::CREATED);
    let id = b["id"].as_str().unwrap().to_string();
    assert_eq!(id.len(), 8);
    assert!(id.chars().all(|c| c.is_ascii_alphanumeric()));
    assert_eq!(b["name"], "Harimau");
    assert_eq!(b["region"], "pen");
    assert_eq!(
        b["build"],
        json!({"cpu": "cpu-9800x3d", "gpu": "gpu-9070xt"})
    );
    assert_eq!(b["createdAt"], now());

    let (s, g) = call(&app, "GET", &format!("/api/builds/{id}"), None).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(g, b);
    assert_eq!(
        call(&app, "GET", "/api/builds/zzzzzzzz", None).await.0,
        StatusCode::NOT_FOUND
    );

    let (_, st) = call(&app, "GET", "/api/stats", None).await;
    assert_eq!(st["cpu-9800x3d"]["builds"], 1);
    assert_eq!(st["cpu-9600x"]["builds"], 0);

    for bad in [
        json!({"name": "x", "build": {"cpu": "gpu-5090"}, "region": "kv"}),
        json!({"name": "x", "build": {"cpu": "cpu-nope"}, "region": "kv"}),
        json!({"name": "x", "build": {"toaster": "cpu-9600x"}, "region": "kv"}),
        json!({"name": "", "build": {"cpu": "cpu-9600x"}, "region": "kv"}),
        json!({"name": "x", "build": {}, "region": "kv"}),
        json!({"name": "x".repeat(81), "build": {"cpu": "cpu-9600x"}, "region": "kv"}),
    ] {
        let (s, e) = call(&app, "POST", "/api/builds", Some(bad.clone())).await;
        assert_eq!(s, StatusCode::BAD_REQUEST, "{bad}");
        assert!(e["error"].is_string());
    }
    let (s, e) = call(
        &app,
        "POST",
        "/api/builds",
        Some(json!({"name": "x", "build": {}, "region": "mars"})),
    )
    .await;
    assert!(s.is_client_error());
    assert!(e["error"].is_string());
}

fn new_order() -> Value {
    json!({
        "region": "kv",
        "ship": "delivery",
        "contact": {"name": "Aiman", "phone": "012-345 6789", "email": "aiman@example.com"},
        "addr": {"line": "1 Jalan Contoh", "postcode": "50000", "city": "Kuala Lumpur"},
        "slot": {"day": 3, "window": "9 am – 12 pm"},
        "groups": [
            {"retailerId": "a", "name": "Shop a", "items": [
                {"productId": "cpu-9600x", "name": "AMD Ryzen 5 9600X", "cat": "cpu", "price": 900, "url": "https://a.test/cpu"}
            ], "fee": 10, "eta": "Next day", "status": "to-buy"},
            {"retailerId": "b", "name": "Shop b", "items": [
                {"productId": "gpu-5070", "name": "RTX 5070", "cat": "gpu", "price": 2800, "url": "https://b.test/gpu"}
            ], "fee": null, "eta": null, "branchId": null, "status": "to-buy"}
        ],
        "total": 3710
    })
}

#[tokio::test]
async fn orders_roundtrip_and_patch() {
    let app = app_with(&config(), |_| {});
    let (s, o) = call(&app, "POST", "/api/orders", Some(new_order())).await;
    assert_eq!(s, StatusCode::CREATED, "{o}");
    let no = o["no"].as_str().unwrap().to_string();
    assert!(
        no.starts_with("RIG-") && no.len() == 10 && no[4..].chars().all(|c| c.is_ascii_digit())
    );
    assert_eq!(o["placedAt"], now());
    assert_eq!(o["groups"][1]["fee"], Value::Null);
    assert_eq!(o["slot"]["window"], "9 am – 12 pm");
    let mut bad = new_order();
    bad["slot"]["window"] = json!("9am – 1pm");
    let (s, e) = call(&app, "POST", "/api/orders", Some(bad)).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    assert_eq!(
        e["error"],
        "slot.window must be one of: 9 am – 12 pm, 12 – 3 pm, 3 – 6 pm, 6 – 9 pm"
    );
    assert_eq!(o["total"], 3710.0);

    let (s, g) = call(&app, "GET", &format!("/api/orders/{no}"), None).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(g, o);

    let (s, p) = call(
        &app,
        "PATCH",
        &format!("/api/orders/{no}/groups/a"),
        Some(json!({"status": "shipped", "courier": "Some Courier", "tracking": " TRK123 "})),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "{p}");
    assert_eq!(p["groups"][0]["status"], "shipped");
    assert_eq!(p["groups"][0]["tracking"], "TRK123");
    assert_eq!(p["groups"][1]["status"], "to-buy");
    let (_, p) = call(
        &app,
        "PATCH",
        &format!("/api/orders/{no}/groups/a"),
        Some(json!({"tracking": null})),
    )
    .await;
    assert!(p["groups"][0].get("tracking").is_none());
    assert_eq!(p["groups"][0]["courier"], "Some Courier");
    assert_eq!(
        call(&app, "GET", &format!("/api/orders/{no}"), None)
            .await
            .1,
        p
    );

    assert_eq!(
        call(
            &app,
            "PATCH",
            &format!("/api/orders/{no}/groups/zz"),
            Some(json!({}))
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        call(
            &app,
            "PATCH",
            "/api/orders/RIG-000000/groups/a",
            Some(json!({}))
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    let (s, e) = call(
        &app,
        "PATCH",
        &format!("/api/orders/{no}/groups/a"),
        Some(json!({"status": "lost"})),
    )
    .await;
    assert!(s.is_client_error());
    assert!(e["error"].is_string());

    let mut bad = new_order();
    bad["groups"] = json!([]);
    assert_eq!(
        call(&app, "POST", "/api/orders", Some(bad)).await.0,
        StatusCode::BAD_REQUEST
    );
    let mut bad = new_order();
    bad["addr"] = Value::Null;
    assert_eq!(
        call(&app, "POST", "/api/orders", Some(bad.clone())).await.0,
        StatusCode::BAD_REQUEST
    );
    bad["ship"] = json!("pickup");
    assert_eq!(
        call(&app, "POST", "/api/orders", Some(bad)).await.0,
        StatusCode::CREATED
    );
    let mut bad = new_order();
    bad["contact"]["name"] = json!(" ");
    assert_eq!(
        call(&app, "POST", "/api/orders", Some(bad)).await.0,
        StatusCode::BAD_REQUEST
    );
    let mut bad = new_order();
    bad["addr"]["postcode"] = json!("5000");
    assert_eq!(
        call(&app, "POST", "/api/orders", Some(bad)).await.0,
        StatusCode::BAD_REQUEST
    );
}

#[tokio::test]
async fn recorded_prices_flow_into_bootstrap_history_stats_index() {
    let mut cfg = config();
    cfg.retailers.retailer = vec![test_retailer("a"), test_retailer("b")];
    cfg.sources.source = vec![
        source("cpu-9600x", "a", "https://a.test/cpu", "jsonld"),
        source("cpu-9600x", "b", "https://b.test/cpu", "jsonld"),
    ];
    let t = now();
    let app = app_with(&cfg, |conn| {
        let (sa, sb) = (&cfg.sources.source[0], &cfg.sources.source[1]);
        let obs = |s, price, stock, at| {
            ingest::record(conn, s, &rigmy_api::adapters::Parsed { price, stock }, at).unwrap()
        };
        // 10 days of history for shop a, ending today at 899.
        for d in (1..10).rev() {
            obs(sa, 1000.0, StockState::InStock, t - d * DAY_MS);
        }
        obs(sa, 950.0, StockState::InStock, t - 3_600_000);
        obs(sa, 899.0, StockState::InStock, t); // same day: min kept
        obs(sa, 920.0, StockState::InStock, t + 60_000);
        obs(sb, 850.0, StockState::OutOfStock, t);
        db::finish_run(
            conn,
            db::start_run(conn, "prices", t).unwrap(),
            t,
            2,
            0,
            0,
            "",
        )
        .unwrap();
    });

    let (_, b) = call(&app, "GET", "/api/bootstrap", None).await;
    assert_eq!(b["retailers"].as_array().unwrap().len(), 2);
    assert_eq!(
        b["retailers"][0]["delivery"]["kv"],
        json!({"fee": 10.0, "eta": "Next day"})
    );
    assert!(b["retailers"][0].get("courier").is_none());
    let offers = b["offers"].as_array().unwrap();
    assert_eq!(offers.len(), 2);
    assert_eq!(offers[0]["productId"], "cpu-9600x");
    assert_eq!(offers[0]["price"], 920.0); // latest observation
    assert_eq!(offers[1]["stock"], "Out of stock");
    assert_eq!(b["lastIngest"], iso_from_ms(t));

    let (_, h) = call(&app, "GET", "/api/products/cpu-9600x/history", None).await;
    let h = h.as_array().unwrap();
    assert_eq!(h.len(), 10);
    assert_eq!(h[9]["low"], 899.0); // min of the day's in-stock observations; OOS 850 ignored
    assert_eq!(h[0]["low"], 1000.0);

    let (_, st) = call(&app, "GET", "/api/stats", None).await;
    let s = &st["cpu-9600x"];
    assert_eq!(s["cur"], 920.0);
    assert_eq!(s["days"], 10);
    assert_eq!(s["low"], 899.0);
    assert!(s["d7"].as_f64().unwrap() < 0.0);
    assert!(s["d30"].is_null());
    assert!(s["avg90"].is_null());
    assert_eq!(s["verdict"], "Tracking started 9 days ago");
    assert_eq!(s["spark"].as_array().unwrap().len(), 10);

    let (_, idx) = call(&app, "GET", "/api/index?cat=cpu", None).await;
    let idx = idx.as_array().unwrap();
    assert_eq!(idx.len(), 10);
    assert_eq!(idx[0]["v"], 100.0);
    assert!((idx[9]["v"].as_f64().unwrap() - 89.9).abs() < 1e-9);
    assert_eq!(
        call(&app, "GET", "/api/index?cat=gpu", None).await.1,
        json!([])
    );
}

/// End-to-end `ingest` against a local HTTP server serving the fixtures.
#[tokio::test]
async fn ingest_end_to_end_against_local_fixture_server() {
    use axum::routing::get;
    let fx = |n: &str| {
        std::fs::read_to_string(format!("{}/tests/fixtures/{n}", env!("CARGO_MANIFEST_DIR")))
            .unwrap()
    };
    let (js, html, woo) = (
        fx("shopify_product.js"),
        fx("jsonld_simple.html"),
        fx("woocommerce_slug.json"),
    );
    let site = axum::Router::new()
        .route("/products/psu.js", get(move || async move { js }))
        .route(
            "/p/cpu",
            get(move || async move { axum::response::Html(html) }),
        )
        .route(
            "/wp-json/wc/store/v1/products",
            get(move || async move { woo }),
        );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, site).await.unwrap() });
    let base = format!("http://{addr}");

    let mut cfg = config();
    cfg.retailers.retailer = vec![test_retailer("a")];
    cfg.sources.settings.delay_ms = 10;
    cfg.sources.settings.retries = 0;
    cfg.sources.source = vec![
        source("psu-a750", "a", &format!("{base}/products/psu"), "shopify"),
        source("cpu-9800x3d", "a", &format!("{base}/p/cpu"), "jsonld"),
        source(
            "mb-b650m",
            "a",
            &format!("{base}/product/gigabyte-b650m-aorus-elite-ax/"),
            "woocommerce",
        ),
        source("gpu-5090", "a", &format!("{base}/p/missing"), "jsonld"),
    ];
    // Local requests must not go through any outbound proxy configured in the environment.
    std::env::set_var("NO_PROXY", "127.0.0.1,localhost");
    std::env::set_var("no_proxy", "127.0.0.1,localhost");

    let mut conn = db::open(":memory:").unwrap();
    seed::seed(&mut conn, &cfg, now()).unwrap();
    // A stale offer for a source no longer configured is pruned by a full run.
    db::upsert_offer(
        &conn,
        &rigmy_core::RawOffer {
            product_id: "ssd-990".into(),
            retailer_id: "a".into(),
            price: 1.0,
            stock: StockState::InStock,
            url: "https://gone.test".into(),
            observed_at: iso_from_ms(now()),
        },
    )
    .unwrap();
    let sum = ingest::run_prices(&conn, &cfg, &ingest::IngestOptions::default())
        .await
        .unwrap();
    assert_eq!(
        sum,
        ingest::RunSummary {
            ok: 3,
            failed: 1,
            skipped: 0
        }
    );
    let offers = db::offers(&conn, db::now_ms(), 7).unwrap();
    let price = |p: &str| {
        offers
            .iter()
            .find(|o| o.product_id == p)
            .map(|o| (o.price, o.stock))
    };
    assert_eq!(price("psu-a750"), Some((399.0, StockState::InStock)));
    assert_eq!(price("cpu-9800x3d"), Some((2249.0, StockState::InStock)));
    assert_eq!(price("mb-b650m"), Some((749.0, StockState::LowStock)));
    assert_eq!(price("ssd-990"), None);
    assert_eq!(offers.len(), 3);
    let runs: (i64, i64, String) = conn
        .query_row(
            "SELECT ok, failed, log FROM ingest_runs WHERE kind = 'prices'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap();
    assert_eq!((runs.0, runs.1), (3, 1));
    assert!(runs.2.contains("FAIL gpu-5090 @ a: HTTP 404"), "{}", runs.2);
    assert!(db::last_ingest(&conn).unwrap().is_some());
}

#[test]
fn seed_is_idempotent_and_disables_removed_retailers() {
    let mut cfg = config();
    cfg.retailers.retailer = vec![test_retailer("a"), test_retailer("b")];
    let mut conn = db::open(":memory:").unwrap();
    let s1 = seed::seed(&mut conn, &cfg, now()).unwrap();
    let s2 = seed::seed(&mut conn, &cfg, now()).unwrap();
    assert_eq!(s1, s2);
    assert_eq!(s1.retailers_enabled, 2);
    cfg.retailers.retailer.pop();
    let s3 = seed::seed(&mut conn, &cfg, now()).unwrap();
    assert_eq!((s3.retailers_enabled, s3.retailers_disabled), (1, 1));
    assert_eq!(db::retailers(&conn).unwrap().len(), 1);
    let products: i64 = conn
        .query_row("SELECT COUNT(*) FROM products", [], |r| r.get(0))
        .unwrap();
    assert_eq!(products, 35);
    let offers: i64 = conn
        .query_row("SELECT COUNT(*) FROM offers_latest", [], |r| r.get(0))
        .unwrap();
    assert_eq!(offers, 0);
}

#[test]
fn shipped_config_has_no_retailers_or_sources() {
    let cfg = config();
    assert!(cfg.retailers.retailer.is_empty());
    assert!(cfg.sources.source.is_empty());
    assert!(cfg.stores.branch.is_empty());
    assert!(cfg.events.is_empty());
}

/// Copy the shipped config to a fresh directory, apply `edit` to `file`, and load it.
fn load_edited(file: &str, edit: impl FnOnce(String) -> String) -> anyhow::Result<Config> {
    use std::sync::atomic::{AtomicUsize, Ordering};
    static N: AtomicUsize = AtomicUsize::new(0);
    let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../config");
    let dir = std::env::temp_dir().join(format!(
        "rigmy-config-test-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::SeqCst)
    ));
    std::fs::create_dir_all(&dir).unwrap();
    for e in std::fs::read_dir(&src).unwrap() {
        let e = e.unwrap();
        std::fs::copy(e.path(), dir.join(e.file_name())).unwrap();
    }
    let p = dir.join(file);
    let before = std::fs::read_to_string(&p).unwrap_or_default();
    let after = edit(before.clone());
    assert_ne!(before, after, "edit of {file} changed nothing");
    std::fs::write(&p, after).unwrap();
    let r = Config::load(&dir);
    std::fs::remove_dir_all(&dir).unwrap();
    r
}

fn load_err(file: &str, edit: impl FnOnce(String) -> String) -> String {
    format!("{:#}", load_edited(file, edit).unwrap_err())
}

#[test]
fn config_validation_errors() {
    // ETA table: every Eta label exactly once.
    let e = load_err("content.toml", |s| {
        s.replacen("label = \"2–3 days\"", "label = \"1–2 days\"", 1)
    });
    assert!(
        e.contains("content.toml: eta: '1–2 days' is listed more than once"),
        "{e}"
    );
    let e = load_err("content.toml", |s| s.replacen("rank = 4", "rank = 3", 1));
    assert!(
        e.contains("content.toml: eta: '2–3 days' and '3–5 days' share rank 3"),
        "{e}"
    );

    // Two featured presets.
    let e = load_err("catalog.json", |s| {
        s.replacen(
            "\"id\": \"kancil\",",
            "\"id\": \"kancil\",\n      \"featured\": true,",
            1,
        )
    });
    assert!(
        e.contains("exactly one preset must have \"featured\": true (found 2: [kancil, helang])"),
        "{e}"
    );
    // ... or none.
    let e = load_err("catalog.json", |s| {
        s.replace(",\n      \"featured\": true", "")
    });
    assert!(e.contains("(found 0: [])"), "{e}");

    // A region without a center.
    let e = load_err("catalog.json", |s| {
        let i = s.find("\"center\"").unwrap();
        let j = i + s[i..].find('}').unwrap() + 1;
        format!("{}\"x\": 0{}", &s[..i], &s[j..])
    });
    assert!(e.contains("missing field `center`"), "{e}");
    let e = load_err("catalog.json", |s| {
        s.replacen("\"lat\": 3.139", "\"lat\": 93.139", 1)
    });
    assert!(
        e.contains("region 'kv' center (93.139, 101.6869) is not a valid lat/lon"),
        "{e}"
    );

    // Delivery size multiplier: > 0 and a known category.
    let e = load_err("content.toml", |s| {
        s.replacen("{ case = 2.0 }", "{ case = 0 }", 1)
    });
    assert!(
        e.contains(
            "content.toml: delivery.size_multiplier: 'case' must be a number greater than 0"
        ),
        "{e}"
    );
    let e = load_err("content.toml", |s| {
        s.replacen("{ case = 2.0 }", "{ tower = 2.0 }", 1)
    });
    assert!(e.contains("unknown variant `tower`"), "{e}");

    // Postcodes: 2-digit unique prefixes, strict keys, required file.
    let e = load_err("postcodes.toml", |s| {
        s.replacen("prefix = \"02\"", "prefix = \"01\"", 1)
    });
    assert!(
        e.contains("postcodes.toml: postcodes: prefix '01' is listed twice"),
        "{e}"
    );
    let e = load_err("postcodes.toml", |s| {
        s.replacen("prefix = \"02\"", "prefix = \"2\"", 1)
    });
    assert!(e.contains("prefix '2' must be exactly 2 digits"), "{e}");
    let e = load_err("postcodes.toml", |s| {
        s.replacen("lat = 6.44,", "latitude = 6.44,", 1)
    });
    assert!(e.contains("unknown field `latitude`"), "{e}");

    // Cable run requires an unknown category.
    let e = load_err("content.toml", |s| {
        s.replacen("requires = \"gpu\"", "requires = \"vga\"", 1)
    });
    assert!(
        e.contains("parsing") && e.contains("unknown variant `vga`"),
        "{e}"
    );

    // Guide cat.
    let e = load_err("content.toml", |s| {
        s.replacen("cat = \"cables\"", "cat = \"wiring\"", 1)
    });
    assert!(e.contains("unknown guide cat 'wiring'"), "{e}");

    // Unknown keys are rejected.
    let e = load_err("content.toml", |s| {
        s.replacen("minutes = 5", "minutes = 5\nmins = 5", 1)
    });
    assert!(e.contains("unknown field `mins`"), "{e}");

    // Tracking URLs: https + {tracking} placeholder.
    let with_url = |u: &'static str| {
        move |s: String| {
            s.replacen(
                "name = \"Pos Laju\"",
                &format!("name = \"Pos Laju\"\ntracking_url = \"{u}\""),
                1,
            )
        }
    };
    let e = load_err("content.toml", with_url("http://track.example/{tracking}"));
    assert!(e.contains("courier 'Pos Laju': tracking_url 'http://track.example/{tracking}' must start with https://"), "{e}");
    let e = load_err("content.toml", with_url("https://track.example/q?no=TRK"));
    assert!(e.contains("must contain the {tracking} placeholder"), "{e}");
    let ok = load_edited(
        "content.toml",
        with_url("https://track.example/q?no={tracking}"),
    )
    .unwrap();
    assert_eq!(
        ok.content.couriers[0].tracking_url.as_deref(),
        Some("https://track.example/q?no={tracking}")
    );

    // content.toml is required.
    let p = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../config");
    let dir = std::env::temp_dir().join(format!("rigmy-config-nocontent-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::copy(p.join("catalog.json"), dir.join("catalog.json")).unwrap();
    let e = format!("{:#}", Config::load(&dir).unwrap_err());
    std::fs::remove_dir_all(&dir).unwrap();
    assert!(e.contains("content.toml (this file is required)"), "{e}");

    // A retailer's default courier must be a [[courier]].
    let mut cfg = config();
    let mut r = test_retailer("a");
    r.courier = Some("Pigeon Post".into());
    cfg.retailers.retailer = vec![r];
    let e = cfg.validate().unwrap_err().to_string();
    assert!(
        e.contains("uses courier 'Pigeon Post', which is not a [[courier]]"),
        "{e}"
    );
    cfg.retailers.retailer[0].courier = Some("GDEX".into());
    cfg.validate().unwrap();
}
