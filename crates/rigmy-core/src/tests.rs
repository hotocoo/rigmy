//! Compatibility and plan tests against the real seed catalog (`config/catalog.json`).
//! Retailers and offers below are synthetic *test inputs*; nothing here ships as data.

use std::collections::{BTreeMap, HashMap};

use crate::*;

const CATALOG: &str = include_str!("../../../config/catalog.json");
const CONTENT: &str = include_str!("../../../config/content.toml");
const POSTCODES: &str = include_str!("../../../config/postcodes.toml");

fn content() -> Content {
    toml::from_str::<ContentFile>(CONTENT)
        .expect("content.toml parses")
        .into_content()
}

fn postcodes() -> Vec<Postcode> {
    toml::from_str::<PostcodesFile>(POSTCODES)
        .expect("postcodes.toml parses")
        .postcode
}

/// `catalog.json` + `content.toml` + `postcodes.toml`, as the API serves them in `/api/bootstrap`.
fn catalog() -> Bootstrap {
    let mut v: serde_json::Value = serde_json::from_str(CATALOG).expect("catalog.json is JSON");
    v["content"] = serde_json::to_value(content()).unwrap();
    v["postcodes"] = serde_json::to_value(postcodes()).unwrap();
    serde_json::from_value(v).expect("catalog.json + content + postcodes parse as Bootstrap")
}

fn build(parts: &[(CatId, &str)]) -> Build {
    parts.iter().map(|(c, id)| (*c, id.to_string())).collect()
}

fn retailer(id: &str, delivery: &[(RegionId, f64, Eta)]) -> Retailer {
    Retailer {
        id: id.into(),
        name: format!("Shop {id}"),
        city: "Test".into(),
        website: "https://shop.test".into(),
        pay: "FPX".into(),
        pickup: "Online only".into(),
        delivery: delivery
            .iter()
            .map(|&(r, fee, eta)| {
                (
                    r,
                    Delivery {
                        fee: Some(fee),
                        eta: Some(eta),
                        free_over: None,
                    },
                )
            })
            .collect(),
        courier: None,
        platform: None,
    }
}

fn offer(p: &str, r: &str, price: f64, stock: StockState) -> RawOffer {
    RawOffer {
        product_id: p.into(),
        retailer_id: r.into(),
        price,
        stock,
        url: format!("https://shop.test/{r}/{p}"),
        observed_at: "2026-10-12T00:00:00.000Z".into(),
    }
}

fn with_offers(retailers: Vec<Retailer>, offers: Vec<RawOffer>) -> Catalog {
    let mut b = catalog();
    b.retailers = retailers;
    b.offers = offers;
    Catalog::new(b).unwrap()
}

fn check(cs: &[Check], id: CheckId) -> &Check {
    cs.iter().find(|c| c.id == id).unwrap()
}

#[test]
fn seed_catalog_has_no_prices() {
    let b = catalog();
    assert_eq!(b.products.len(), 35);
    assert!(b.offers.is_empty() && b.retailers.is_empty() && b.branches.is_empty());
    assert!(!CATALOG.contains("\"price\""));
    assert_eq!(b.presets.len(), 3);
}

#[test]
fn compat_empty_build_is_pending() {
    let c = Catalog::new(catalog()).unwrap();
    let cs = c.compat(&Build::new(), RegionId::Kv);
    let ids: Vec<_> = cs.iter().map(|c| c.id).collect();
    assert_eq!(
        ids,
        vec![
            CheckId::Socket,
            CheckId::Mem,
            CheckId::Ff,
            CheckId::Gpu,
            CheckId::Cool,
            CheckId::Psu
        ]
    );
    assert!(cs
        .iter()
        .all(|c| c.status == Tone::Pending && c.value == "Waiting" && c.fix.is_none()));
    assert_eq!(
        cs[0].detail,
        "Add a CPU and a motherboard to check the socket."
    );
    assert_eq!(cs[5].detail, "Add a power supply.");
}

#[test]
fn compat_helang_all_ok_with_prototype_wording() {
    let c = Catalog::new(catalog()).unwrap();
    let helang = c
        .data
        .presets
        .iter()
        .find(|p| p.id == "helang")
        .unwrap()
        .build
        .clone();
    let cs = c.compat(&helang, RegionId::Kv);
    assert!(cs.iter().all(|c| c.status == Tone::Ok), "{cs:#?}");
    let s = check(&cs, CheckId::Socket);
    assert_eq!(s.value, "AM5 = AM5");
    assert_eq!(
        s.detail,
        "The 9800X3D drops straight into the B850-F socket."
    );
    let m = check(&cs, CheckId::Mem);
    assert_eq!(
        m.detail,
        "DDR5 kit on a DDR5 board. Enable EXPO in BIOS for 6000 MT/s."
    );
    assert_eq!(check(&cs, CheckId::Ff).value, "ATX in Air 903 Max");
    assert_eq!(check(&cs, CheckId::Ff).detail, "Standoffs line up for ATX.");
    let g = check(&cs, CheckId::Gpu);
    assert_eq!(
        (g.value.as_str(), g.detail.as_str()),
        ("348 / 400 mm", "52 mm spare in front of the card.")
    );
    let k = check(&cs, CheckId::Cool);
    assert_eq!(k.value, "360 / 360 mm top");
    assert_eq!(k.detail, "360 mm radiator mounts at the top as exhaust.");
    let p = check(&cs, CheckId::Psu);
    assert_eq!(p.value, "575 W of 850 W");
    assert_eq!(p.detail, "32% headroom at estimated full load.");
    assert_eq!(
        c.power(&helang),
        Power {
            est: 575.0,
            rec: 750.0,
            psu: 850.0
        }
    );
}

#[test]
fn compat_socket_and_gpu_errors_with_fixes() {
    let c = Catalog::new(catalog()).unwrap();
    let b = build(&[
        (CatId::Cpu, "cpu-265k"),
        (CatId::Mobo, "mb-b650m"),
        (CatId::Gpu, "gpu-5090"),
        (CatId::Case, "case-popmini"),
    ]);
    let cs = c.compat(&b, RegionId::Kv);
    let s = check(&cs, CheckId::Socket);
    assert_eq!(s.status, Tone::Error);
    assert_eq!(s.value, "LGA1851 ≠ AM5");
    assert_eq!(
        s.detail,
        "The Intel Core Ultra 7 265K needs an LGA1851 board. The B650M is AM5, so the CPU will not physically fit."
    );
    assert_eq!(s.parts, vec![CatId::Cpu, CatId::Mobo]);
    assert_eq!(
        s.fix,
        Some(Fix {
            cat: CatId::Mobo,
            id: "mb-b860m".into(),
            text: "Use MSI MAG B860M Mortar WiFi".into()
        })
    );
    let g = check(&cs, CheckId::Gpu);
    assert_eq!(g.status, Tone::Error);
    assert_eq!(g.detail, "The RTX 5090 is 358 mm long. The Pop Mini Air has 335 mm, so the card hits the front fans by 23 mm.");
    // Both the O11 Vision Compact (380 mm) and Air 903 (400 mm) qualify; unpriced -> name order.
    assert_eq!(g.fix.as_ref().unwrap().id, "case-o11vc");
}

#[test]
fn compat_ff_error() {
    let c = Catalog::new(catalog()).unwrap();
    let b = build(&[(CatId::Mobo, "mb-b850f"), (CatId::Case, "case-popmini")]);
    let f = check(&c.compat(&b, RegionId::Kv), CheckId::Ff).clone();
    assert_eq!(f.value, "ATX ✕ Pop Mini Air");
    assert_eq!(f.detail, "The Fractal Design Pop Mini Air White only takes mATX / Mini-ITX boards. An ATX board is about 61 mm taller than the tray.");
    assert_eq!(f.fix.unwrap().id, "mb-b650m");
}

#[test]
fn compat_psu_fix_prefers_cheapest_live_price() {
    let b = build(&[
        (CatId::Cpu, "cpu-9950x3d"),
        (CatId::Gpu, "gpu-5080"),
        (CatId::Psu, "psu-a750"),
    ]);
    // No prices at all: fall back to name order.
    let c = Catalog::new(catalog()).unwrap();
    let p = check(&c.compat(&b, RegionId::Kv), CheckId::Psu).clone();
    assert_eq!(p.status, Tone::Warn);
    assert_eq!(p.value, "625 W of 750 W");
    assert_eq!(
        p.detail,
        "Works, but leaves little margin for transient GPU spikes. 850 W recommended."
    );
    assert_eq!(p.fix.unwrap().id, "psu-hx1500");
    // With live prices: cheapest qualifying unit wins; out-of-stock offers do not count.
    let kv = [(RegionId::Kv, 0.0, Eta::NextDay)];
    let c = with_offers(
        vec![retailer("a", &kv)],
        vec![
            offer("psu-rm850e", "a", 529.0, StockState::InStock),
            offer("psu-gx1000", "a", 499.0, StockState::InStock),
            offer("psu-hx1500", "a", 100.0, StockState::OutOfStock),
        ],
    );
    assert_eq!(
        check(&c.compat(&b, RegionId::Kv), CheckId::Psu)
            .fix
            .as_ref()
            .unwrap()
            .id,
        "psu-gx1000"
    );

    let err = build(&[
        (CatId::Cpu, "cpu-9950x3d"),
        (CatId::Gpu, "gpu-5090"),
        (CatId::Psu, "psu-a750"),
    ]);
    let p = check(&c.compat(&err, RegionId::Kv), CheckId::Psu).clone();
    assert_eq!(p.status, Tone::Error);
    assert_eq!(p.detail, "Estimated load is 840 W, above the 750 W rating.");
}

#[test]
fn compat_thermal_fix_picks_fitting_cooler() {
    let b = build(&[
        (CatId::Cpu, "cpu-9950x3d"),
        (CatId::Cooler, "cool-pa120"),
        (CatId::Case, "case-popmini"),
    ]);
    let c = Catalog::new(catalog()).unwrap();
    let cs = c.compat(&b, RegionId::Kv);
    let k = check(&cs, CheckId::Cool);
    assert_eq!(
        (k.value.as_str(), k.detail.as_str()),
        ("155 / 170 mm", "15 mm between tower and glass.")
    );
    let t = check(&cs, CheckId::Therm);
    assert_eq!(t.status, Tone::Warn);
    assert_eq!(t.value, "170 W on 150 W");
    assert_eq!(
        t.detail,
        "The PA120 is rated for about 150 W. Expect clock drops under long all-core loads."
    );
    // 360 mm AIOs do not fit the Pop Mini's 240 mm top; first fitting by name is the Kraken 240.
    assert_eq!(t.fix.as_ref().unwrap().id, "cool-kraken240w");
    let kv = [(RegionId::Kv, 0.0, Eta::NextDay)];
    let c = with_offers(
        vec![retailer("a", &kv)],
        vec![
            offer("cool-kraken240w", "a", 549.0, StockState::InStock),
            offer("cool-nhd15", "a", 499.0, StockState::LowStock),
        ],
    );
    assert_eq!(
        check(&c.compat(&b, RegionId::Kv), CheckId::Therm)
            .fix
            .as_ref()
            .unwrap()
            .id,
        "cool-nhd15"
    );
}

#[test]
fn compat_aio_too_big() {
    let c = Catalog::new(catalog()).unwrap();
    let b = build(&[
        (CatId::Cpu, "cpu-9600x"),
        (CatId::Cooler, "cool-lf3"),
        (CatId::Case, "case-popmini"),
    ]);
    let k = check(&c.compat(&b, RegionId::Kv), CheckId::Cool).clone();
    assert_eq!(k.status, Tone::Error);
    assert_eq!(k.value, "360 / 240 mm top");
    assert_eq!(
        k.detail,
        "A 360 mm radiator will not mount. The Pop Mini Air supports up to 240 mm at the top."
    );
    assert_eq!(k.parts, vec![CatId::Cooler, CatId::Case]);
    assert!(k.fix.is_some());
}

fn plan_fixture() -> Catalog {
    let a = retailer(
        "a",
        &[
            (RegionId::Kv, 10.0, Eta::NextDay),
            (RegionId::Pen, 15.0, Eta::D2to3),
        ],
    );
    let b = retailer("b", &[(RegionId::Kv, 0.0, Eta::D3to5)]);
    with_offers(
        vec![a, b],
        vec![
            offer("cpu-9600x", "a", 900.0, StockState::InStock),
            offer("gpu-5070", "a", 2800.0, StockState::InStock),
            offer("case-popmini", "a", 360.0, StockState::InStock),
            offer("cpu-9600x", "b", 880.0, StockState::InStock),
            offer("gpu-5070", "b", 2900.0, StockState::LowStock),
            offer("case-popmini", "b", 340.0, StockState::OutOfStock),
        ],
    )
}

fn plan_build() -> Build {
    build(&[
        (CatId::Cpu, "cpu-9600x"),
        (CatId::Gpu, "gpu-5070"),
        (CatId::Case, "case-popmini"),
    ])
}

#[test]
fn offers_resolution() {
    let c = plan_fixture();
    let o = c.offers("case-popmini", RegionId::Kv);
    assert_eq!(o.len(), 2);
    assert_eq!(o[0].fee, Some(20.0)); // cases ship at double fee
    assert_eq!(o[0].warranty, "2 yrs");
    assert!(o[0].avail);
    assert!(!o[1].avail);
    assert_eq!(o[1].status, "Out of stock");
    let pen = c.offers("cpu-9600x", RegionId::Pen);
    assert_eq!(pen[1].status, "No delivery");
    assert_eq!((pen[1].avail, pen[1].fee, pen[1].eta), (false, None, None));
    assert_eq!(
        c.lowest("cpu-9600x", RegionId::Kv).unwrap().raw.retailer_id,
        "b"
    );
    assert_eq!(
        c.lowest("cpu-9600x", RegionId::Pen)
            .unwrap()
            .raw
            .retailer_id,
        "a"
    );
    assert!(c.lowest("cpu-9800x3d", RegionId::Kv).is_none());
    assert!(c.offers("nope", RegionId::Kv).is_empty());

    let json = serde_json::to_value(&o[0]).unwrap();
    assert_eq!(json["productId"], "case-popmini");
    assert_eq!(json["eta"], "Next day");
    assert!(json.get("raw").is_none());
}

#[test]
fn preorder_and_unknown_stock() {
    let kv = [(RegionId::Kv, 0.0, Eta::SameDay)];
    let c = with_offers(
        vec![retailer("a", &kv)],
        vec![
            offer("ssd-990", "a", 800.0, StockState::PreOrder),
            offer("ssd-t705", "a", 1300.0, StockState::Unknown),
        ],
    );
    let p = &c.offers("ssd-990", RegionId::Kv)[0];
    assert!(p.avail);
    assert_eq!(p.eta, Some(Eta::D5to7));
    let u = &c.offers("ssd-t705", RegionId::Kv)[0];
    assert!(u.avail);
    assert_eq!(u.status, "Unknown");
    assert_eq!(c.offers("ram-tz5", RegionId::Kv).len(), 0);
}

#[test]
fn plan_strategies() {
    let c = plan_fixture();
    let mut picks = HashMap::new();
    picks.insert("gpu-5070".to_string(), "b".to_string());
    let p = c.plan(&plan_build(), RegionId::Kv, &picks);
    assert_eq!(
        p.rows.iter().map(|r| r.p.id.as_str()).collect::<Vec<_>>(),
        vec!["cpu-9600x", "gpu-5070", "case-popmini"]
    );

    assert_eq!(
        (
            p.best.parts,
            p.best.fee,
            p.best.total,
            p.best.shops,
            p.best.missing
        ),
        // Shop a ships the case (size ×2): 10 × 2; shop b: 0.
        (4040.0, 20.0, 4060.0, 2, 0)
    );
    assert_eq!(
        p.best.choice["cpu-9600x"].as_ref().unwrap().raw.retailer_id,
        "b"
    );

    assert_eq!((p.fast.total, p.fast.shops), (4080.0, 1));
    assert_eq!(
        p.fast.choice["cpu-9600x"].as_ref().unwrap().raw.retailer_id,
        "a"
    );

    assert_eq!(p.shop_totals.len(), 2);
    assert_eq!(
        (p.shop_totals[1].total.missing, p.shop_totals[1].total.total),
        (1, 3780.0)
    );
    assert!(p.shop_totals[1].total.choice["case-popmini"].is_none());
    assert_eq!(p.single.rid.as_deref(), Some("a"));
    assert_eq!(p.single.total.total, 4080.0);

    assert_eq!(
        p.custom.choice["gpu-5070"]
            .as_ref()
            .unwrap()
            .raw
            .retailer_id,
        "b"
    );
    assert_eq!(p.custom.total, 4160.0);
    assert_eq!(p.custom.unknown_fees, 0);

    assert_eq!(
        c.max_eta(p.best.choice.values().map(|o| o.as_ref())),
        Eta::D3to5
    );
    assert_eq!(
        c.max_eta(p.fast.choice.values().map(|o| o.as_ref())),
        Eta::NextDay
    );

    // Penang: shop b does not deliver -> only a.
    let pen = c.plan(&plan_build(), RegionId::Pen, &HashMap::new());
    assert_eq!((pen.best.total, pen.best.shops), (4060.0 + 15.0 * 2.0, 1));
    assert_eq!(pen.single.rid.as_deref(), Some("a"));

    let json = serde_json::to_value(&p).unwrap();
    assert!(json["shopTotals"][0]["rid"].is_string());
    assert!(json["shopTotals"][0]["unknownFees"].is_number());
    assert!(json["single"]["retailer"]["name"].is_string());
}

#[test]
fn plan_without_any_data() {
    let c = Catalog::new(catalog()).unwrap();
    let p = c.plan(&plan_build(), RegionId::Kv, &HashMap::new());
    assert_eq!(p.best.missing, 3);
    assert_eq!(p.best.total, 0.0);
    assert!(p.shop_totals.is_empty());
    assert!(p.single.rid.is_none());
    assert_eq!(p.single.total.missing, 3);
    let json = serde_json::to_value(&p.single).unwrap();
    assert!(json.get("rid").is_none());
    assert!(json["choice"]["cpu-9600x"].is_null());
}

#[test]
fn single_falls_back_to_fewest_missing() {
    let kv = [(RegionId::Kv, 5.0, Eta::NextDay)];
    let c = with_offers(
        vec![retailer("a", &kv), retailer("b", &kv)],
        vec![
            offer("cpu-9600x", "a", 900.0, StockState::InStock),
            offer("cpu-9600x", "b", 950.0, StockState::InStock),
            offer("gpu-5070", "b", 2900.0, StockState::InStock),
        ],
    );
    let p = c.plan(&plan_build(), RegionId::Kv, &HashMap::new());
    assert_eq!(p.single.rid.as_deref(), Some("b"));
    assert_eq!(p.single.total.missing, 1);
}

#[test]
fn build_map_parsing() {
    let mut m = BTreeMap::new();
    m.insert("cpu".to_string(), Some("cpu-9600x".to_string()));
    m.insert("gpu".to_string(), None);
    m.insert("bogus".to_string(), Some("x".to_string()));
    let b = build_from_map(&m);
    assert_eq!(b.len(), 1);
    assert_eq!(b[&CatId::Cpu], "cpu-9600x");
}

#[test]
fn product_json_roundtrip_matches_seed() {
    let raw: serde_json::Value = serde_json::from_str(CATALOG).unwrap();
    let b = catalog();
    let back = serde_json::to_value(&b.products).unwrap();
    assert_eq!(norm(back), norm(raw["products"].clone()));
}

/// Numbers compared as f64 (Rust writes `120.0` where JS wrote `120`; both parse to 120 in JS).
fn norm(v: serde_json::Value) -> serde_json::Value {
    use serde_json::Value;
    match v {
        Value::Number(n) => serde_json::json!(n.as_f64().unwrap()),
        Value::Array(a) => Value::Array(a.into_iter().map(norm).collect()),
        Value::Object(o) => Value::Object(o.into_iter().map(|(k, v)| (k, norm(v))).collect()),
        other => other,
    }
}

// ---------- content (config/content.toml) ----------

fn eta_defs(rows: &[(Eta, u32, u32)]) -> Vec<EtaDef> {
    rows.iter()
        .map(|&(label, rank, days)| EtaDef { label, rank, days })
        .collect()
}

fn err_of(c: &Content) -> String {
    c.validate(&catalog().categories).unwrap_err().0
}

#[test]
fn shipped_content_is_valid_and_complete() {
    let b = catalog();
    let c = &b.content;
    let t = c.validate(&b.categories).unwrap();
    let table: Vec<(&str, u32, u32)> = t
        .defs()
        .iter()
        .map(|d| (d.label.as_str(), d.rank, d.days))
        .collect();
    assert_eq!(
        table,
        [
            ("Same day", 0, 0),
            ("Next day", 1, 1),
            ("1–2 days", 2, 2),
            ("2–3 days", 3, 3),
            ("2–5 days", 4, 5),
            ("3–5 days", 5, 5),
            ("4–7 days", 6, 7),
            ("5–7 days", 7, 7),
        ]
    );
    assert_eq!((t.fastest(), t.slowest()), (Eta::SameDay, Eta::D5to7));
    assert_eq!(c.delivery_windows.len(), 4);
    assert_eq!(c.slot_days, 5);
    assert_eq!(c.guide.len(), 10);
    assert_eq!(c.guide[0].cat, Some(GuideCat::Part(CatId::Case)));
    assert_eq!(c.guide[8].cat, Some(GuideCat::Cables));
    assert_eq!(c.guide[9].cat, None);
    let runs: Vec<(&str, u32, CatId)> = c
        .cable_runs
        .iter()
        .map(|r| (r.id.as_str(), r.length_mm, r.requires))
        .collect();
    assert_eq!(
        runs,
        [
            ("cable_24pin", 610, CatId::Mobo),
            ("cable_eps", 700, CatId::Mobo),
            ("cable_gpu", 650, CatId::Gpu),
            ("cable_fp", 450, CatId::Mobo),
        ]
    );
    assert!(c.courier("Pos Laju").is_some() && c.courier("Lalamove").is_some());
    // No tracking URL ships until its format is confirmed.
    assert!(c.couriers.iter().all(|k| k.tracking_url.is_none()));
}

#[test]
fn content_wire_shape_is_camel_case() {
    let v = serde_json::to_value(content()).unwrap();
    for k in [
        "etas",
        "deliveryWindows",
        "slotDays",
        "guide",
        "cableRuns",
        "couriers",
    ] {
        assert!(v.get(k).is_some(), "missing {k}");
    }
    assert_eq!(v["cableRuns"][0]["lengthMm"], 610);
    assert_eq!(v["guide"][9]["cat"], serde_json::Value::Null);
    assert_eq!(v["guide"][8]["cat"], "cables");
    assert_eq!(
        v["etas"][5],
        serde_json::json!({"label": "3–5 days", "rank": 5, "days": 5})
    );
    assert_eq!(v["couriers"][0], serde_json::json!({"name": "Pos Laju"}));
    // And it reads back (the browser engine parses this JSON).
    let back: Content = serde_json::from_value(v).unwrap();
    assert_eq!(back, content());
}

#[test]
fn regions_have_centers_and_one_preset_is_featured() {
    let b = catalog();
    let kv = Catalog::new(b.clone()).unwrap();
    let c = &kv.region(RegionId::Kv).unwrap().center;
    assert_eq!(
        (c.lat, c.lon, c.label.as_str()),
        (3.139, 101.6869, "Kuala Lumpur")
    );
    assert_eq!(
        kv.region(RegionId::East).unwrap().center.label,
        "Kota Kinabalu"
    );
    let featured: Vec<&str> = b
        .presets
        .iter()
        .filter(|p| p.featured)
        .map(|p| p.id.as_str())
        .collect();
    assert_eq!(featured, ["helang"]);
    let v = serde_json::to_value(&b.presets).unwrap();
    assert_eq!(v[2]["featured"], true);
    assert!(v[0].get("featured").is_none());
}

#[test]
fn eta_table_rejects_bad_tables() {
    let full = content().etas;
    let mut missing = full.clone();
    missing.retain(|d| d.label != Eta::D2to3);
    assert_eq!(
        EtaTable::new(&missing).unwrap_err().0,
        "eta: missing '2–3 days' (every delivery label needs exactly one [[eta]] entry)"
    );
    let mut dup = full.clone();
    dup.push(full[0]);
    assert_eq!(
        EtaTable::new(&dup).unwrap_err().0,
        "eta: 'Same day' is listed more than once"
    );
    let mut same_rank = full.clone();
    same_rank[1].rank = 0;
    assert!(EtaTable::new(&same_rank)
        .unwrap_err()
        .0
        .contains("share rank 0"));
    let mut fewer_days = full.clone();
    fewer_days[5].days = 1;
    assert_eq!(
        EtaTable::new(&fewer_days).unwrap_err().0,
        "eta: '3–5 days' (rank 5) has fewer days (1) than the faster '2–5 days' (5)"
    );
    assert!(EtaTable::new(&[]).is_err());
}

#[test]
fn eta_ranking_comes_from_the_table_not_the_enum() {
    // A table where "Next day" is ranked slower than "1–2 days".
    let t = EtaTable::new(&eta_defs(&[
        (Eta::SameDay, 0, 0),
        (Eta::D1to2, 1, 2),
        (Eta::NextDay, 2, 2),
        (Eta::D2to3, 3, 3),
        (Eta::D2to5, 4, 5),
        (Eta::D3to5, 5, 5),
        (Eta::D4to7, 6, 7),
        (Eta::D5to7, 7, 7),
    ]))
    .unwrap();
    assert_eq!(t.max_of([Eta::NextDay, Eta::D1to2]), Eta::NextDay);
    assert_eq!(t.max_of([]), Eta::SameDay);
    assert_eq!((t.rank(Eta::NextDay), t.days(Eta::NextDay)), (2, 2));

    let mut b = catalog();
    b.content.etas = t.defs().to_vec();
    let kv_next = [(RegionId::Kv, 0.0, Eta::NextDay)];
    let kv_d12 = [(RegionId::Kv, 0.0, Eta::D1to2)];
    b.retailers = vec![retailer("a", &kv_next), retailer("b", &kv_d12)];
    b.offers = vec![
        offer("cpu-9600x", "a", 900.0, StockState::InStock),
        offer("cpu-9600x", "b", 950.0, StockState::InStock),
    ];
    let c = Catalog::new(b).unwrap();
    let p = c.plan(
        &build(&[(CatId::Cpu, "cpu-9600x")]),
        RegionId::Kv,
        &HashMap::new(),
    );
    assert_eq!(
        p.fast.choice["cpu-9600x"].as_ref().unwrap().raw.retailer_id,
        "b"
    );
    assert_eq!(
        c.max_eta(p.best.choice.values().map(|o| o.as_ref())),
        Eta::NextDay
    );
}

#[test]
fn content_rules() {
    let mut c = content();
    c.delivery_windows.push(c.delivery_windows[0].clone());
    assert_eq!(
        err_of(&c),
        "checkout.delivery_windows: '9 am – 12 pm' is listed twice"
    );

    let mut c = content();
    c.slot_days = 0;
    assert_eq!(err_of(&c), "checkout.slot_days: 0 is out of range (1–31)");

    let mut c = content();
    c.guide[2].minutes = 0;
    assert_eq!(
        err_of(&c),
        "guide step 3 ('Seat the CPU'): minutes must be greater than 0"
    );

    let mut c = content();
    c.cable_runs[1].id = "cable_24pin".into();
    assert_eq!(err_of(&c), "cable_run 'cable_24pin': duplicate id");

    // `requires` / guide `cat` must be categories the catalog actually has.
    let mut cats = catalog().categories;
    cats.retain(|k| k.id != CatId::Gpu);
    let e = content().validate(&cats).unwrap_err().0;
    assert_eq!(e, "guide step 8 ('Install the graphics card'): category 'gpu' is not in catalog.json categories");
    let mut c = content();
    c.guide
        .retain(|g| g.cat != Some(GuideCat::Part(CatId::Gpu)));
    assert_eq!(
        c.validate(&cats).unwrap_err().0,
        "cable_run 'cable_gpu': requires 'gpu' is not in catalog.json categories"
    );

    let mut c = content();
    c.couriers.push(Courier {
        name: "pos laju".into(),
        tracking_url: None,
    });
    assert_eq!(err_of(&c), "courier 'pos laju': duplicate name");

    for (url, why) in [
        ("http://t.example/{tracking}", "must start with https://"),
        (
            "https://t.example/track",
            "must contain the {tracking} placeholder",
        ),
        ("https:///{tracking}", "has no valid host"),
        ("https://{tracking}.example/", "has no valid host"),
    ] {
        let mut c = content();
        c.couriers[0].tracking_url = Some(url.into());
        let e = err_of(&c);
        assert!(
            e.starts_with("courier 'Pos Laju': tracking_url") && e.ends_with(why),
            "{e}"
        );
    }
    let mut c = content();
    c.couriers[0].tracking_url = Some("https://t.example/track?no={tracking}".into());
    assert!(c.validate(&catalog().categories).is_ok());
    assert_eq!(
        c.couriers[0].tracking_link("AB 12/3").as_deref(),
        Some("https://t.example/track?no=AB%2012%2F3")
    );
    assert_eq!(c.couriers[1].tracking_link("x"), None);
}

#[test]
fn content_file_is_strict() {
    let bad_key = CONTENT.replacen("slot_days = 5", "slot_days = 5\nslot_dayz = 5", 1);
    let e = toml::from_str::<ContentFile>(&bad_key)
        .unwrap_err()
        .to_string();
    assert!(e.contains("unknown field `slot_dayz`"), "{e}");

    let bad_cat = CONTENT.replacen("cat = \"cables\"", "cat = \"wires\"", 1);
    let e = toml::from_str::<ContentFile>(&bad_cat)
        .unwrap_err()
        .to_string();
    assert!(e.contains("unknown guide cat 'wires'"), "{e}");

    let bad_req = CONTENT.replacen("requires = \"gpu\"", "requires = \"graphics\"", 1);
    let e = toml::from_str::<ContentFile>(&bad_req)
        .unwrap_err()
        .to_string();
    assert!(e.contains("unknown variant `graphics`"), "{e}");

    let bad_eta = CONTENT.replacen("label = \"Next day\"", "label = \"Tomorrow\"", 1);
    let e = toml::from_str::<ContentFile>(&bad_eta)
        .unwrap_err()
        .to_string();
    assert!(e.contains("unknown variant `Tomorrow`"), "{e}");
}

#[test]
fn bootstrap_without_valid_content_is_rejected() {
    let mut v: serde_json::Value = serde_json::from_str(CATALOG).unwrap();
    let e = Catalog::from_json(&v.to_string()).unwrap_err().to_string();
    assert!(e.contains("missing field `content`"), "{e}");
    let mut c = content();
    c.etas.pop();
    v["content"] = serde_json::to_value(c).unwrap();
    v["postcodes"] = serde_json::to_value(postcodes()).unwrap();
    let e = Catalog::from_json(&v.to_string()).unwrap_err().to_string();
    assert!(
        e.starts_with("reference data: eta: missing '5–7 days'"),
        "{e}"
    );
}

#[test]
fn pre_orders_take_the_slowest_eta_in_the_table() {
    let kv = [(RegionId::Kv, 0.0, Eta::SameDay)];
    let mut b = catalog();
    b.retailers = vec![retailer("a", &kv)];
    b.offers = vec![offer("cpu-9600x", "a", 900.0, StockState::PreOrder)];
    // Drop "5–7 days" to the same days as "3–5 days" and swap their ranks: the slowest is now 3–5.
    for d in &mut b.content.etas {
        match d.label {
            Eta::D3to5 => (d.rank, d.days) = (7, 7),
            Eta::D5to7 => (d.rank, d.days) = (5, 5),
            _ => {}
        }
    }
    let c = Catalog::new(b).unwrap();
    assert_eq!(c.offers("cpu-9600x", RegionId::Kv)[0].eta, Some(Eta::D3to5));
}

#[test]
fn delivery_size_multiplier_comes_from_content() {
    let c = content();
    assert_eq!(c.size_multiplier(CatId::Case), 2.0);
    assert_eq!(c.size_multiplier(CatId::Gpu), 1.0);
    let v = serde_json::to_value(&c).unwrap();
    assert_eq!(
        v["deliverySizeMultiplier"],
        serde_json::json!({"case": 2.0})
    );

    let kv = [(RegionId::Kv, 10.0, Eta::NextDay)];
    let mut b = catalog();
    b.retailers = vec![retailer("a", &kv)];
    b.offers = vec![
        offer("gpu-5070", "a", 2800.0, StockState::InStock),
        offer("case-popmini", "a", 400.0, StockState::InStock),
    ];
    let shipped = Catalog::new(b.clone()).unwrap();
    assert_eq!(shipped.offers("gpu-5070", RegionId::Kv)[0].fee, Some(10.0));
    assert_eq!(
        shipped.offers("case-popmini", RegionId::Kv)[0].fee,
        Some(20.0)
    );

    b.content.delivery_size_multiplier = [(CatId::Gpu, 1.5)].into_iter().collect();
    let custom = Catalog::new(b).unwrap();
    assert_eq!(custom.offers("gpu-5070", RegionId::Kv)[0].fee, Some(15.0));
    assert_eq!(
        custom.offers("case-popmini", RegionId::Kv)[0].fee,
        Some(10.0)
    );
}

#[test]
fn delivery_size_multiplier_rules() {
    for bad in [0.0, -1.0, f64::NAN] {
        let mut c = content();
        c.delivery_size_multiplier.insert(CatId::Psu, bad);
        assert!(
            err_of(&c)
                .starts_with("delivery.size_multiplier: 'psu' must be a number greater than 0"),
            "{bad}"
        );
    }
    let mut cats = catalog().categories;
    cats.retain(|k| k.id != CatId::Case);
    let mut c = content();
    c.guide
        .retain(|g| g.cat != Some(GuideCat::Part(CatId::Case)));
    assert_eq!(
        c.validate(&cats).unwrap_err().0,
        "delivery.size_multiplier: category 'case' is not in catalog.json categories"
    );
    let bad = CONTENT.replacen("{ case = 2.0 }", "{ chassis = 2.0 }", 1);
    let e = toml::from_str::<ContentFile>(&bad).unwrap_err().to_string();
    assert!(e.contains("unknown variant `chassis`"), "{e}");
}

#[test]
fn postcode_lookup_uses_the_configured_table() {
    let c = Catalog::new(catalog()).unwrap();
    assert_eq!(c.data.postcodes.len(), 67);
    let l = c.postcode("55100").unwrap();
    assert_eq!(l.label, "Bukit Bintang");
    assert_eq!(l.region, Some(RegionId::Kv));
    assert_eq!(l.source, LocSource::Postcode);
    assert_eq!(l.acc, crate::geo::POSTCODE_ACC_M);
    assert_eq!(c.postcode("88-300").unwrap().region, Some(RegionId::East));
    assert_eq!(c.postcode("10000").unwrap().region, Some(RegionId::Pen));
    assert_eq!(c.postcode("81300").unwrap().region, Some(RegionId::Jhr));
    assert!(c.postcode("1234").is_none());
    assert!(c.postcode("99999").is_none());

    // The table is data: a different table gives different answers.
    let mut b = catalog();
    b.postcodes = vec![Postcode {
        prefix: "99".into(),
        town: "Testville".into(),
        lat: 5.9,
        lon: 116.0,
    }];
    let c = Catalog::new(b).unwrap();
    assert_eq!(c.postcode("99999").unwrap().label, "Testville");
    assert!(c.postcode("55100").is_none());
}

#[test]
fn postcode_table_rules() {
    let bad = |f: &dyn Fn(&mut Vec<Postcode>)| {
        let mut t = postcodes();
        f(&mut t);
        validate_postcodes(&t).unwrap_err().0
    };
    assert_eq!(bad(&|t| t.clear()), "postcodes: the table is empty");
    assert_eq!(
        bad(&|t| t[0].prefix = "1".into()),
        "postcodes: prefix '1' must be exactly 2 digits"
    );
    assert_eq!(
        bad(&|t| t[1].prefix = "01".into()),
        "postcodes: prefix '01' is listed twice"
    );
    assert_eq!(
        bad(&|t| t[0].town = " ".into()),
        "postcodes: prefix '01' needs a town"
    );
    assert_eq!(
        bad(&|t| t[0].lat = 91.0),
        "postcodes: prefix '01' has invalid coordinates (91, 100.2)"
    );
    let e = toml::from_str::<PostcodesFile>(
        "postcode = [{ prefix = \"01\", town = \"X\", lat = 1, lon = 1, zip = 2 }]",
    )
    .unwrap_err()
    .to_string();
    assert!(e.contains("unknown field `zip`"), "{e}");
    let mut v: serde_json::Value = serde_json::to_value(catalog()).unwrap();
    v["postcodes"] = serde_json::json!([]);
    let e = Catalog::from_json(&v.to_string()).unwrap_err().to_string();
    assert_eq!(e, "reference data: postcodes: the table is empty");
}

#[test]
fn plan_fee_uses_the_bulkiest_part_per_shop() {
    // Shop a sells the case (×2) and the CPU: one shipment at 10 × 2. Shop b only the GPU: 10 × 1.
    let kv = [(RegionId::Kv, 10.0, Eta::NextDay)];
    let c = with_offers(
        vec![retailer("a", &kv), retailer("b", &kv)],
        vec![
            offer("cpu-9600x", "a", 900.0, StockState::InStock),
            offer("case-popmini", "a", 400.0, StockState::InStock),
            offer("gpu-5070", "b", 2800.0, StockState::InStock),
        ],
    );
    let b = build(&[
        (CatId::Cpu, "cpu-9600x"),
        (CatId::Case, "case-popmini"),
        (CatId::Gpu, "gpu-5070"),
    ]);
    let p = c.plan(&b, RegionId::Kv, &HashMap::new());
    assert_eq!(
        (p.best.parts, p.best.fee, p.best.total, p.best.shops),
        (4100.0, 30.0, 4130.0, 2)
    );
    // Without the case, shop a ships at the plain fee.
    let p = c.plan(
        &build(&[(CatId::Cpu, "cpu-9600x")]),
        RegionId::Kv,
        &HashMap::new(),
    );
    assert_eq!(p.best.fee, 10.0);
}

#[test]
fn swaps_empty_build_is_empty() {
    let c = Catalog::new(catalog()).unwrap();
    assert!(c.swaps(&Build::new(), RegionId::Kv).is_empty());
}

#[test]
fn swaps_excludes_parts_that_break_compatibility() {
    let c = Catalog::new(catalog()).unwrap();
    let b = build(&[(CatId::Cpu, "cpu-9800x3d"), (CatId::Mobo, "mb-b850f")]);
    let swaps = c.swaps(&b, RegionId::Kv);
    let cpu = swaps
        .iter()
        .find(|s| s.cat == CatId::Cpu)
        .expect("cpu slot has swaps");
    assert_eq!(cpu.current, "cpu-9800x3d");
    let ids: Vec<&str> = cpu.options.iter().map(|o| o.id.as_str()).collect();
    // Same-socket AM5 parts fit; the current part is never listed.
    assert!(ids.contains(&"cpu-9950x3d"), "{ids:?}");
    assert!(ids.contains(&"cpu-9600x"), "{ids:?}");
    assert!(!ids.contains(&"cpu-9800x3d"));
    // LGA1851 parts would fail the socket check and must be excluded.
    assert!(
        !ids.contains(&"cpu-265k") && !ids.contains(&"cpu-245k"),
        "{ids:?}"
    );
    // The board slot is judged against the chosen CPU: LGA1851 boards are excluded.
    let mobo = swaps
        .iter()
        .find(|s| s.cat == CatId::Mobo)
        .expect("mobo slot has swaps");
    let mids: Vec<&str> = mobo.options.iter().map(|o| o.id.as_str()).collect();
    assert!(
        mids.contains(&"mb-x870tom") && mids.contains(&"mb-b650m"),
        "{mids:?}"
    );
    assert!(
        !mids.contains(&"mb-z890") && !mids.contains(&"mb-b860m"),
        "{mids:?}"
    );
    // Every listed option really keeps the build error-free when swapped in.
    for s in swaps.iter() {
        for o in &s.options {
            let mut alt = b.clone();
            alt.insert(s.cat, o.id.clone());
            assert!(
                c.compat(&alt, RegionId::Kv)
                    .iter()
                    .all(|ch| ch.status != Tone::Error),
                "swapping {} into {} must not introduce errors",
                o.id,
                s.cat
            );
        }
    }
}

#[test]
fn swaps_orders_priced_ascending_and_unpriced_last() {
    let c = with_offers(
        vec![retailer("r1", &[(RegionId::Kv, 0.0, Eta::NextDay)])],
        vec![
            offer("cpu-9800x3d", "r1", 2099.0, StockState::InStock),
            offer("cpu-9950x3d", "r1", 3449.0, StockState::InStock),
            // cpu-9600x deliberately unpriced.
        ],
    );
    let b = build(&[(CatId::Cpu, "cpu-9800x3d"), (CatId::Mobo, "mb-b850f")]);
    let cpu = c
        .swaps(&b, RegionId::Kv)
        .into_iter()
        .find(|s| s.cat == CatId::Cpu)
        .unwrap();
    let got: Vec<(&str, Option<f64>)> = cpu
        .options
        .iter()
        .map(|o| (o.id.as_str(), o.price))
        .collect();
    assert_eq!(
        got,
        vec![("cpu-9950x3d", Some(3449.0)), ("cpu-9600x", None)],
        "{got:?}"
    );
}

#[test]
fn swaps_never_lists_market_products() {
    let mut b = catalog();
    let mut mkt = b.products[0].clone();
    mkt.id = "mkt-test".into();
    mkt.cat = None;
    mkt.market = Some("Test".into());
    b.products.push(mkt);
    b.retailers
        .push(retailer("r1", &[(RegionId::Kv, 0.0, Eta::NextDay)]));
    b.offers
        .push(offer("mkt-test", "r1", 10.0, StockState::InStock));
    let c = Catalog::new(b).unwrap();
    let bd = build(&[(CatId::Cpu, "cpu-9800x3d"), (CatId::Mobo, "mb-b850f")]);
    for s in c.swaps(&bd, RegionId::Kv) {
        assert!(!s.options.iter().any(|o| o.id == "mkt-test"));
    }
}

/// A part promoted from a retailer listing, carrying only what its title stated.
fn listed_part(id: &str, cat: CatId, name: &str) -> Product {
    Product {
        id: id.into(),
        cat: Some(cat),
        market: None,
        brand: "Shop".into(),
        name: name.into(),
        glyph: name.into(),
        short: None,
        facet: String::new(),
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
        source: Some("listing".into()),
    }
}

#[test]
fn compat_unlisted_specs_warn_instead_of_false_errors() {
    let mut boot = catalog();
    boot.products
        .push(listed_part("lst-board", CatId::Mobo, "Mystery B850 board"));
    let mut gpu = listed_part("lst-gpu", CatId::Gpu, "Mystery RTX card");
    gpu.length = Some(300.0);
    boot.products.push(gpu);
    let c = Catalog::new(boot).unwrap();
    let b = build(&[
        (CatId::Cpu, "cpu-9800x3d"),
        (CatId::Mobo, "lst-board"),
        (CatId::Gpu, "lst-gpu"),
        (CatId::Case, "case-o11vc"),
        (CatId::Psu, "psu-rm850e"),
    ]);
    let cs = c.compat(&b, RegionId::Kv);
    let s = check(&cs, CheckId::Socket);
    assert_eq!((s.status, s.value.as_str()), (Tone::Warn, "Not listed"));
    assert_eq!(s.parts, vec![CatId::Mobo]);
    assert!(s.detail.contains("does not state its socket"));
    assert_eq!(check(&cs, CheckId::Ff).status, Tone::Warn);
    // Length is listed, so clearance is still checked for real.
    assert_eq!(check(&cs, CheckId::Gpu).status, Tone::Ok);
    // The card's power draw is unknown: the PSU check says so rather than passing silently.
    let p = check(&cs, CheckId::Psu);
    assert_eq!(p.status, Tone::Warn);
    assert_eq!(p.parts, vec![CatId::Gpu]);
}

#[test]
fn published_free_delivery_threshold_waives_the_fee_and_missing_eta_is_honest() {
    let mut b = catalog();
    let mut r = retailer("a", &[(RegionId::Kv, 49.0, Eta::D2to3)]);
    let kv = r.delivery.get_mut(&RegionId::Kv).unwrap();
    kv.free_over = Some(1000.0);
    kv.eta = None;
    b.retailers = vec![r];
    b.offers = vec![offer("cpu-9600x", "a", 999.0, StockState::InStock)];
    let c = with_offers(b.retailers.clone(), b.offers.clone());
    let one = build(&[(CatId::Cpu, "cpu-9600x")]);
    let t = c.plan(&one, RegionId::Kv, &HashMap::new()).best;
    assert_eq!((t.fee, t.total), (49.0, 1048.0));
    // Unknown delivery time: buyable, but no ETA is invented.
    let o = &c.offers("cpu-9600x", RegionId::Kv)[0];
    assert!(o.avail && o.eta.is_none());

    let c = with_offers(b.retailers.clone(), vec![offer("cpu-9600x", "a", 1000.0, StockState::InStock)]);
    assert_eq!(c.plan(&one, RegionId::Kv, &HashMap::new()).best.fee, 0.0);
}
