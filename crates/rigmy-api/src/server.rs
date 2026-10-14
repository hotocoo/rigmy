//! HTTP API (axum). JSON shapes follow `web/src/lib/types.ts`.

use std::collections::{BTreeMap, HashMap};
use std::sync::{Arc, Mutex};

use axum::extract::rejection::JsonRejection;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderValue, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, patch, post};
use axum::{Json, Router};
use rand::Rng;
use rigmy_core::*;
use rusqlite::Connection;
use serde::Deserialize;
use serde_json::json;
use tower_http::cors::{AllowOrigin, CorsLayer};

use crate::db;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub stale_days: u32,
    /// Injectable clock (epoch ms) for tests.
    pub clock: fn() -> i64,
}

impl AppState {
    pub fn new(conn: Connection, stale_days: u32) -> Self {
        AppState {
            db: Mutex::new(conn),
            stale_days,
            clock: db::now_ms,
        }
    }
    fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.db.lock().unwrap_or_else(|e| e.into_inner())
    }
}

#[derive(Debug)]
pub struct ApiError(pub StatusCode, pub String);

impl ApiError {
    fn bad(msg: impl Into<String>) -> Self {
        ApiError(StatusCode::BAD_REQUEST, msg.into())
    }
    fn not_found(msg: impl Into<String>) -> Self {
        ApiError(StatusCode::NOT_FOUND, msg.into())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(e: anyhow::Error) -> Self {
        tracing::error!("internal error: {e:#}");
        ApiError(StatusCode::INTERNAL_SERVER_ERROR, "internal error".into())
    }
}

impl From<JsonRejection> for ApiError {
    fn from(e: JsonRejection) -> Self {
        ApiError(e.status(), e.body_text())
    }
}

type Res<T> = Result<Json<T>, ApiError>;
type S = State<Arc<AppState>>;

pub fn router(state: Arc<AppState>, cors_origins: &[String]) -> Router {
    let origins: Vec<HeaderValue> = cors_origins.iter().filter_map(|o| o.parse().ok()).collect();
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::OPTIONS])
        .allow_headers([axum::http::header::CONTENT_TYPE]);
    Router::new()
        .route("/api/health", get(health))
        .route("/api/bootstrap", get(bootstrap))
        .route("/api/products/{id}/history", get(history))
        .route("/api/stats", get(stats_all))
        .route("/api/index", get(index))
        .route("/api/builds", post(create_build))
        .route("/api/builds/{id}", get(get_build))
        .route("/api/gallery", get(gallery))
        .route("/api/orders", post(create_order))
        .route("/api/orders/{no}", get(get_order))
        .route("/api/orders/{no}/groups/{retailer_id}", patch(patch_group))
        .fallback(|| async { ApiError::not_found("no such endpoint") })
        .layer(cors)
        .with_state(state)
}

async fn health(State(st): S) -> Res<serde_json::Value> {
    let c = st.conn();
    let count = |sql: &str| -> Result<i64, ApiError> {
        Ok(c.query_row(sql, [], |r| r.get(0))
            .map_err(anyhow::Error::from)?)
    };
    Ok(Json(json!({
        "ok": true,
        "version": env!("CARGO_PKG_VERSION"),
        "products": count("SELECT COUNT(*) FROM products")?,
        "retailers": count("SELECT COUNT(*) FROM retailers WHERE enabled = 1")?,
        "offers": count("SELECT COUNT(*) FROM offers_latest")?,
        "lastIngest": db::last_ingest(&c)?,
    })))
}

async fn bootstrap(State(st): S) -> Res<Bootstrap> {
    let now = (st.clock)();
    Ok(Json(db::bootstrap(&st.conn(), now, st.stale_days)?))
}

fn product_exists(c: &Connection, id: &str) -> Result<bool, ApiError> {
    Ok(
        c.query_row("SELECT COUNT(*) FROM products WHERE id = ?", [id], |r| {
            r.get::<_, i64>(0)
        })
        .map_err(anyhow::Error::from)?
            > 0,
    )
}

async fn history(State(st): S, Path(id): Path<String>) -> Res<Vec<HistoryPoint>> {
    let c = st.conn();
    if !product_exists(&c, &id)? {
        return Err(ApiError::not_found(format!("unknown product '{id}'")));
    }
    let events = db::events(&c, (st.clock)())?;
    let snaps = db::snapshots(&c, Some(&id))?;
    Ok(Json(build_history(
        snaps.get(&id).map(Vec::as_slice).unwrap_or(&[]),
        &events,
    )))
}

/// Current lowest in-stock price per product from live offers.
fn current_prices(offers: &[RawOffer]) -> HashMap<&str, f64> {
    let mut cur: HashMap<&str, f64> = HashMap::new();
    for o in offers.iter().filter(|o| o.stock.counts_in_stock()) {
        let e = cur.entry(o.product_id.as_str()).or_insert(o.price);
        *e = e.min(o.price);
    }
    cur
}

async fn stats_all(State(st): S) -> Res<BTreeMap<String, PartStats>> {
    let c = st.conn();
    let now = (st.clock)();
    let events = db::events(&c, now)?;
    let products = db::products(&c)?;
    let offers = db::offers(&c, now, st.stale_days)?;
    let cur = current_prices(&offers);
    let snaps = db::snapshots(&c, None)?;
    let builds = db::build_counts(&c)?;
    let out = products
        .iter()
        .map(|p| {
            let h = build_history(snaps.get(&p.id).map(Vec::as_slice).unwrap_or(&[]), &events);
            let s = stats(
                &h,
                cur.get(p.id.as_str()).copied(),
                &events,
                now,
                builds.get(&p.id).copied().unwrap_or(0),
            );
            (p.id.clone(), s)
        })
        .collect();
    Ok(Json(out))
}

#[derive(Deserialize)]
struct IndexQuery {
    cat: Option<String>,
}

async fn index(State(st): S, Query(q): Query<IndexQuery>) -> Res<Vec<IndexPoint>> {
    let cat = match q.cat.as_deref() {
        None | Some("all") | Some("") => None,
        Some(c) => Some(
            CatId::from_str(c).ok_or_else(|| ApiError::bad(format!("unknown category '{c}'")))?,
        ),
    };
    let c = st.conn();
    let events = db::events(&c, (st.clock)())?;
    let snaps = db::snapshots(&c, None)?;
    let histories: Vec<Vec<HistoryPoint>> = db::products(&c)?
        .iter()
        .filter(|p| cat.is_none_or(|k| p.cat == Some(k)))
        .map(|p| build_history(snaps.get(&p.id).map(Vec::as_slice).unwrap_or(&[]), &events))
        .collect();
    Ok(Json(cat_index(&histories)))
}

// ---------- builds ----------

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NewBuild {
    name: String,
    build: BTreeMap<String, Option<String>>,
    region: RegionId,
    /// Opt in to the public gallery.
    #[serde(default)]
    publish: bool,
    title: Option<String>,
    note: Option<String>,
}

fn short_id() -> String {
    rand::rng()
        .sample_iter(rand::distr::Alphanumeric)
        .take(8)
        .map(char::from)
        .collect()
}

/// Request input limits (characters / counts). They bound storage per request; they are not
/// business rules, so they live here rather than in config.
mod limits {
    pub const BUILD_NAME: usize = 80;
    pub const BUILD_NOTE: usize = 500;
    pub const GALLERY_DEFAULT: usize = 24;
    pub const GALLERY_MAX: usize = 50;
    pub const CONTACT_FIELD: usize = 120;
    pub const ADDR_LINE: usize = 300;
    pub const ADDR_CITY: usize = 120;
    pub const GROUPS: usize = 20;
    pub const ITEMS_PER_GROUP: usize = 50;
    pub const GROUP_NAME: usize = 120;
    pub const ITEM_NAME: usize = 300;
    pub const URL: usize = 2000;
    pub const COURIER: usize = 60;
    pub const TRACKING: usize = 80;
}

fn check_len(field: &str, s: &str, max: usize) -> Result<(), ApiError> {
    if s.chars().count() > max {
        return Err(ApiError::bad(format!(
            "{field} is too long (max {max} characters)"
        )));
    }
    Ok(())
}

/// Trimmed optional text: blank becomes None; control characters and over-long text are rejected.
fn clean_text(field: &str, v: &Option<String>, max: usize) -> Result<Option<String>, ApiError> {
    let t = v.as_deref().map(str::trim).unwrap_or("");
    if t.chars().any(char::is_control) {
        return Err(ApiError::bad(format!(
            "{field} must not contain control characters"
        )));
    }
    check_len(field, t, max)?;
    Ok((!t.is_empty()).then(|| t.to_string()))
}

async fn create_build(
    State(st): S,
    body: Result<Json<NewBuild>, JsonRejection>,
) -> Result<(StatusCode, Json<SavedBuild>), ApiError> {
    let Json(nb) = body?;
    let name = nb.name.trim().to_string();
    if name.is_empty() {
        return Err(ApiError::bad("name is required"));
    }
    check_len("name", &name, limits::BUILD_NAME)?;
    let gm = db::GalleryMeta {
        publish: nb.publish,
        title: clean_text("title", &nb.title, limits::BUILD_NAME)?,
        note: clean_text("note", &nb.note, limits::BUILD_NOTE)?,
    };
    for k in nb.build.keys() {
        if CatId::from_str(k).is_none() {
            return Err(ApiError::bad(format!("unknown category '{k}' in build")));
        }
    }
    let build = build_from_map(&nb.build);
    if build.is_empty() {
        return Err(ApiError::bad("build has no parts"));
    }
    let c = st.conn();
    let products = db::products(&c)?;
    for (cat, id) in &build {
        match products.iter().find(|p| &p.id == id) {
            Some(p) if p.cat == Some(cat.product_cat()) => {}
            Some(_) => return Err(ApiError::bad(format!("product '{id}' is not a {cat}"))),
            None => return Err(ApiError::bad(format!("unknown product '{id}'"))),
        }
    }
    for _ in 0..5 {
        let sb = SavedBuild {
            id: short_id(),
            name: name.clone(),
            build: build.clone(),
            region: nb.region,
            created_at: (st.clock)(),
        };
        if db::insert_build(&c, &sb, &gm)? {
            return Ok((StatusCode::CREATED, Json(sb)));
        }
    }
    Err(anyhow::anyhow!("could not allocate a build id").into())
}

async fn get_build(State(st): S, Path(id): Path<String>) -> Res<SavedBuild> {
    db::get_build(&st.conn(), &id)?
        .map(Json)
        .ok_or_else(|| ApiError::not_found(format!("no build '{id}'")))
}

#[derive(Deserialize)]
struct GalleryQuery {
    cat: Option<String>,
    sort: Option<String>,
    limit: Option<usize>,
    cursor: Option<String>,
}

/// Published builds, newest first. Prices are live engine data, so there is no server-side
/// price order: `sort=price` is refused and the web app orders the loaded builds itself.
async fn gallery(State(st): S, Query(q): Query<GalleryQuery>) -> Res<serde_json::Value> {
    match q.sort.as_deref() {
        None | Some("new") => {}
        Some("price") => {
            return Err(ApiError::bad(
                "sort=price is not available: totals use live prices, so clients sort the builds they load",
            ))
        }
        Some(s) => return Err(ApiError::bad(format!("unknown sort '{s}'"))),
    }
    let cat = match q.cat.as_deref().filter(|c| !c.is_empty()) {
        None => None,
        Some(c) => Some(
            CatId::from_str(c).ok_or_else(|| ApiError::bad(format!("unknown category '{c}'")))?,
        ),
    };
    let limit = match q.limit {
        None => limits::GALLERY_DEFAULT,
        Some(0) => return Err(ApiError::bad("limit must be at least 1")),
        Some(n) => n.min(limits::GALLERY_MAX),
    };
    let cursor = match q.cursor.as_deref().filter(|c| !c.is_empty()) {
        None => None,
        Some(c) => Some(
            c.split_once('.')
                .and_then(|(t, id)| Some((t.parse::<i64>().ok()?, id)))
                .ok_or_else(|| ApiError::bad("bad cursor"))?,
        ),
    };
    let mut builds = db::gallery(&st.conn(), cat, cursor, limit + 1)?;
    let next = if builds.len() > limit {
        builds.truncate(limit);
        builds.last().map(|b| format!("{}.{}", b.created_at, b.id))
    } else {
        None
    };
    Ok(Json(json!({ "builds": builds, "nextCursor": next })))
}

// ---------- orders ----------

/// `content` supplies the delivery windows a slot may use.
fn validate_order(o: &NewOrder, content: &Content) -> Result<(), ApiError> {
    let ct = &o.contact;
    if ct.name.trim().is_empty() {
        return Err(ApiError::bad("contact.name is required"));
    }
    if ct.phone.trim().is_empty() && ct.email.trim().is_empty() {
        return Err(ApiError::bad("contact.phone or contact.email is required"));
    }
    if !ct.email.trim().is_empty() && !ct.email.contains('@') {
        return Err(ApiError::bad("contact.email is not a valid email address"));
    }
    for (f, v) in [
        ("contact.name", &ct.name),
        ("contact.phone", &ct.phone),
        ("contact.email", &ct.email),
    ] {
        check_len(f, v, limits::CONTACT_FIELD)?;
    }
    if o.ship == ShipMode::Delivery {
        let a = o
            .addr
            .as_ref()
            .ok_or_else(|| ApiError::bad("addr is required for delivery"))?;
        if a.line.trim().is_empty() || a.city.trim().is_empty() {
            return Err(ApiError::bad("addr.line and addr.city are required"));
        }
        if a.postcode.len() != 5 || !a.postcode.chars().all(|c| c.is_ascii_digit()) {
            return Err(ApiError::bad("addr.postcode must be 5 digits"));
        }
        check_len("addr.line", &a.line, limits::ADDR_LINE)?;
        check_len("addr.city", &a.city, limits::ADDR_CITY)?;
    }
    if let Some(s) = &o.slot {
        if !content.delivery_windows.contains(&s.window) {
            return Err(ApiError::bad(format!(
                "slot.window must be one of: {}",
                content.delivery_windows.join(", ")
            )));
        }
    }
    if o.groups.is_empty() || o.groups.len() > limits::GROUPS {
        return Err(ApiError::bad(format!(
            "groups must contain 1 to {} retailer groups",
            limits::GROUPS
        )));
    }
    let mut seen = std::collections::HashSet::new();
    for g in &o.groups {
        if g.retailer_id.trim().is_empty() || !seen.insert(&g.retailer_id) {
            return Err(ApiError::bad("each group needs a unique retailerId"));
        }
        if g.items.is_empty() || g.items.len() > limits::ITEMS_PER_GROUP {
            return Err(ApiError::bad(format!(
                "group '{}' must have 1 to {} items",
                g.retailer_id,
                limits::ITEMS_PER_GROUP
            )));
        }
        if g.fee.is_some_and(|f| !f.is_finite() || f < 0.0) {
            return Err(ApiError::bad("group fee must be a non-negative number"));
        }
        check_len("group name", &g.name, limits::GROUP_NAME)?;
        for it in &g.items {
            if !it.price.is_finite() || it.price < 0.0 {
                return Err(ApiError::bad("item price must be a non-negative number"));
            }
            check_len("item name", &it.name, limits::ITEM_NAME)?;
            check_len("item url", &it.url, limits::URL)?;
        }
    }
    if !o.total.is_finite() || o.total < 0.0 {
        return Err(ApiError::bad("total must be a non-negative number"));
    }
    Ok(())
}

async fn create_order(
    State(st): S,
    body: Result<Json<NewOrder>, JsonRejection>,
) -> Result<(StatusCode, Json<Order>), ApiError> {
    let Json(no) = body?;
    let c = st.conn();
    validate_order(&no, &db::content(&c)?)?;
    for _ in 0..10 {
        let order = Order {
            no: format!("RIG-{:06}", rand::rng().random_range(0..1_000_000u32)),
            placed_at: (st.clock)(),
            order: no.clone(),
        };
        if db::insert_order(&c, &order)? {
            return Ok((StatusCode::CREATED, Json(order)));
        }
    }
    Err(anyhow::anyhow!("could not allocate an order number").into())
}

async fn get_order(State(st): S, Path(no): Path<String>) -> Res<Order> {
    db::get_order(&st.conn(), &no)?
        .map(Json)
        .ok_or_else(|| ApiError::not_found(format!("no order '{no}'")))
}

fn present<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<Option<String>>, D::Error> {
    Ok(Some(Option::<String>::deserialize(d)?))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct GroupPatch {
    #[serde(default)]
    status: Option<GroupStatus>,
    /// Absent = unchanged, `null` / "" = cleared.
    #[serde(default, deserialize_with = "present")]
    courier: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    tracking: Option<Option<String>>,
}

async fn patch_group(
    State(st): S,
    Path((no, rid)): Path<(String, String)>,
    body: Result<Json<GroupPatch>, JsonRejection>,
) -> Res<Order> {
    let Json(p) = body?;
    let clean = |v: Option<String>| v.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let c = st.conn();
    let mut order =
        db::get_order(&c, &no)?.ok_or_else(|| ApiError::not_found(format!("no order '{no}'")))?;
    let g = order
        .order
        .groups
        .iter_mut()
        .find(|g| g.retailer_id == rid)
        .ok_or_else(|| {
            ApiError::not_found(format!("order '{no}' has no group for retailer '{rid}'"))
        })?;
    if let Some(s) = p.status {
        g.status = s;
    }
    if let Some(v) = p.courier {
        let v = clean(v);
        check_len("courier", v.as_deref().unwrap_or(""), limits::COURIER)?;
        g.courier = v;
    }
    if let Some(v) = p.tracking {
        let v = clean(v);
        check_len("tracking", v.as_deref().unwrap_or(""), limits::TRACKING)?;
        g.tracking = v;
    }
    db::update_order(&c, &order)?;
    Ok(Json(order))
}
