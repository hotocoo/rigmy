//! SQLite storage: schema migrations and typed queries.

use std::collections::HashMap;

use anyhow::{Context, Result};
use rigmy_core::time::{iso_from_ms, ms_from_iso, DAY_MS};
use rigmy_core::*;
use rusqlite::{params, Connection, OptionalExtension};

const MIGRATIONS: &[&str] = &[
    // v1
    r#"
    CREATE TABLE products (
        id   TEXT PRIMARY KEY,
        cat  TEXT NOT NULL,
        sort INTEGER NOT NULL,
        json TEXT NOT NULL
    );
    CREATE TABLE catalog_meta (
        key  TEXT PRIMARY KEY,
        json TEXT NOT NULL
    );
    CREATE TABLE retailers (
        id      TEXT PRIMARY KEY,
        sort    INTEGER NOT NULL,
        enabled INTEGER NOT NULL,
        json    TEXT NOT NULL
    );
    CREATE TABLE branches (
        id          TEXT PRIMARY KEY,
        retailer_id TEXT NOT NULL,
        source      TEXT NOT NULL CHECK (source IN ('osm', 'config')),
        json        TEXT NOT NULL,
        updated_at  TEXT NOT NULL
    );
    CREATE INDEX branches_retailer ON branches(retailer_id);
    CREATE TABLE offers_latest (
        product_id  TEXT NOT NULL,
        retailer_id TEXT NOT NULL,
        price       REAL NOT NULL,
        stock       TEXT NOT NULL,
        url         TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        PRIMARY KEY (product_id, retailer_id)
    );
    CREATE TABLE snapshots (
        product_id  TEXT NOT NULL,
        retailer_id TEXT NOT NULL,
        day         INTEGER NOT NULL,
        price       REAL NOT NULL,
        in_stock    INTEGER NOT NULL,
        PRIMARY KEY (product_id, retailer_id, day)
    );
    CREATE TABLE saved_builds (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        region     TEXT NOT NULL,
        build      TEXT NOT NULL,
        created_at INTEGER NOT NULL
    );
    CREATE TABLE orders (
        no        TEXT PRIMARY KEY,
        placed_at INTEGER NOT NULL,
        json      TEXT NOT NULL
    );
    CREATE TABLE ingest_runs (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        kind        TEXT NOT NULL,
        started_at  TEXT NOT NULL,
        finished_at TEXT,
        ok          INTEGER NOT NULL DEFAULT 0,
        failed      INTEGER NOT NULL DEFAULT 0,
        skipped     INTEGER NOT NULL DEFAULT 0,
        log         TEXT NOT NULL DEFAULT ''
    );
    "#,
];

/// How long a writer waits for a lock held by another connection (e.g. `serve` during `ingest`).
const BUSY_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);

pub fn open(path: &str) -> Result<Connection> {
    let conn = if path == ":memory:" {
        Connection::open_in_memory()?
    } else {
        Connection::open(path)?
    };
    conn.pragma_update(None, "foreign_keys", "ON")?;
    if path != ":memory:" {
        conn.pragma_update(None, "journal_mode", "WAL")?;
    }
    conn.busy_timeout(BUSY_TIMEOUT)?;
    migrate(&conn)?;
    Ok(conn)
}

pub fn migrate(conn: &Connection) -> Result<()> {
    let v: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(v as usize) {
        conn.execute_batch(&format!(
            "BEGIN; {sql}; PRAGMA user_version = {}; COMMIT;",
            i + 1
        ))
        .with_context(|| format!("migration v{}", i + 1))?;
    }
    Ok(())
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn json<T: serde::de::DeserializeOwned>(s: String) -> rusqlite::Result<T> {
    serde_json::from_str(&s).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
    })
}

fn meta<T: serde::de::DeserializeOwned + Default>(conn: &Connection, key: &str) -> Result<T> {
    let s: Option<String> = conn
        .query_row("SELECT json FROM catalog_meta WHERE key = ?", [key], |r| {
            r.get(0)
        })
        .optional()?;
    Ok(match s {
        Some(s) => serde_json::from_str(&s)?,
        None => T::default(),
    })
}

/// A catalog_meta entry that `seed` always writes. Errors when the database was never seeded
/// with it, instead of serving an empty table.
fn required_meta<T: serde::de::DeserializeOwned>(conn: &Connection, key: &str) -> Result<T> {
    let s: Option<String> = conn
        .query_row("SELECT json FROM catalog_meta WHERE key = ?", [key], |r| {
            r.get(0)
        })
        .optional()?;
    let s = s.with_context(|| format!("no {key} in the database; run `rigmy-api seed`"))?;
    Ok(serde_json::from_str(&s)?)
}

/// `content.toml` as seeded.
pub fn content(conn: &Connection) -> Result<Content> {
    required_meta(conn, "content")
}

pub fn set_meta<T: serde::Serialize>(conn: &Connection, key: &str, v: &T) -> Result<()> {
    conn.execute(
        "INSERT INTO catalog_meta(key, json) VALUES(?1, ?2) ON CONFLICT(key) DO UPDATE SET json = excluded.json",
        params![key, serde_json::to_string(v)?],
    )?;
    Ok(())
}

pub fn products(conn: &Connection) -> Result<Vec<Product>> {
    let mut st = conn.prepare("SELECT json FROM products ORDER BY sort")?;
    let v = st
        .query_map([], |r| json(r.get(0)?))?
        .collect::<rusqlite::Result<Vec<Product>>>()?;
    Ok(v)
}

pub fn retailers(conn: &Connection) -> Result<Vec<Retailer>> {
    let mut st = conn.prepare("SELECT json FROM retailers WHERE enabled = 1 ORDER BY sort")?;
    let v = st
        .query_map([], |r| json(r.get(0)?))?
        .collect::<rusqlite::Result<Vec<Retailer>>>()?;
    Ok(v)
}

pub fn branches(conn: &Connection) -> Result<Vec<Branch>> {
    let mut st = conn.prepare(
        "SELECT b.json FROM branches b JOIN retailers r ON r.id = b.retailer_id AND r.enabled = 1
         ORDER BY r.sort, b.id",
    )?;
    let v = st
        .query_map([], |r| json(r.get(0)?))?
        .collect::<rusqlite::Result<Vec<Branch>>>()?;
    Ok(v)
}

/// Latest offers from enabled retailers, excluding ones not refreshed for `stale_days`.
pub fn offers(conn: &Connection, now: i64, stale_days: u32) -> Result<Vec<RawOffer>> {
    let cutoff = now - stale_days as i64 * DAY_MS;
    let mut st = conn.prepare(
        "SELECT o.product_id, o.retailer_id, o.price, o.stock, o.url, o.observed_at
         FROM offers_latest o
         JOIN retailers r ON r.id = o.retailer_id AND r.enabled = 1
         JOIN products p ON p.id = o.product_id
         ORDER BY p.sort, r.sort",
    )?;
    let rows = st.query_map([], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, f64>(2)?,
            r.get::<_, String>(3)?,
            r.get::<_, String>(4)?,
            r.get::<_, String>(5)?,
        ))
    })?;
    let mut out = vec![];
    for row in rows {
        let (product_id, retailer_id, price, stock, url, observed_at) = row?;
        if ms_from_iso(&observed_at).is_some_and(|t| t < cutoff) {
            continue;
        }
        out.push(RawOffer {
            product_id,
            retailer_id,
            price,
            stock: StockState::from_str(&stock).unwrap_or(StockState::Unknown),
            url,
            observed_at,
        });
    }
    Ok(out)
}

pub fn last_ingest(conn: &Connection) -> Result<Option<String>> {
    Ok(conn.query_row(
        "SELECT MAX(finished_at) FROM ingest_runs WHERE kind = 'prices' AND finished_at IS NOT NULL AND ok > 0",
        [],
        |r| r.get(0),
    )?)
}

pub fn bootstrap(conn: &Connection, now: i64, stale_days: u32) -> Result<Bootstrap> {
    let extra: Vec<SaleEvent> = meta(conn, "events")?;
    Ok(Bootstrap {
        regions: meta(conn, "regions")?,
        categories: meta(conn, "categories")?,
        specdef: meta(conn, "specdef")?,
        facet: meta(conn, "facet")?,
        products: products(conn)?,
        retailers: retailers(conn)?,
        branches: branches(conn)?,
        offers: offers(conn, now, stale_days)?,
        events: sale_events(now, &extra),
        presets: meta(conn, "presets")?,
        content: content(conn)?,
        postcodes: required_meta(conn, "postcodes")?,
        last_ingest: last_ingest(conn)?,
    })
}

pub fn events(conn: &Connection, now: i64) -> Result<Vec<SaleEvent>> {
    let extra: Vec<SaleEvent> = meta(conn, "events")?;
    Ok(sale_events(now, &extra))
}

/// Snapshots from enabled retailers, grouped by product.
pub fn snapshots(
    conn: &Connection,
    product: Option<&str>,
) -> Result<HashMap<String, Vec<Snapshot>>> {
    let mut st = conn.prepare(
        "SELECT s.product_id, s.retailer_id, s.day, s.price, s.in_stock FROM snapshots s
         JOIN retailers r ON r.id = s.retailer_id AND r.enabled = 1
         WHERE ?1 IS NULL OR s.product_id = ?1
         ORDER BY s.day",
    )?;
    let mut out: HashMap<String, Vec<Snapshot>> = HashMap::new();
    let rows = st.query_map(params![product], |r| {
        Ok((
            r.get::<_, String>(0)?,
            Snapshot {
                retailer_id: r.get(1)?,
                day: r.get(2)?,
                price: r.get(3)?,
                in_stock: r.get::<_, i64>(4)? != 0,
            },
        ))
    })?;
    for row in rows {
        let (p, s) = row?;
        out.entry(p).or_default().push(s);
    }
    Ok(out)
}

/// Remove one shop's latest offer for a product (price history is kept). Returns rows removed.
pub fn delete_offer(conn: &Connection, product_id: &str, retailer_id: &str) -> Result<usize> {
    Ok(conn.execute(
        "DELETE FROM offers_latest WHERE product_id = ?1 AND retailer_id = ?2",
        params![product_id, retailer_id],
    )?)
}

pub fn upsert_offer(conn: &Connection, o: &RawOffer) -> Result<()> {
    conn.execute(
        "INSERT INTO offers_latest(product_id, retailer_id, price, stock, url, observed_at)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(product_id, retailer_id) DO UPDATE SET
           price = excluded.price, stock = excluded.stock, url = excluded.url, observed_at = excluded.observed_at",
        params![o.product_id, o.retailer_id, o.price, o.stock.as_str(), o.url, o.observed_at],
    )?;
    Ok(())
}

/// One snapshot per (product, retailer, day). Repeated observations keep the lowest price,
/// preferring in-stock observations over out-of-stock ones.
pub fn upsert_snapshot(
    conn: &Connection,
    product: &str,
    retailer: &str,
    day: i64,
    price: f64,
    in_stock: bool,
) -> Result<()> {
    conn.execute(
        "INSERT INTO snapshots(product_id, retailer_id, day, price, in_stock) VALUES(?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(product_id, retailer_id, day) DO UPDATE SET
           price = CASE
             WHEN excluded.in_stock > snapshots.in_stock THEN excluded.price
             WHEN excluded.in_stock < snapshots.in_stock THEN snapshots.price
             ELSE MIN(snapshots.price, excluded.price) END,
           in_stock = MAX(snapshots.in_stock, excluded.in_stock)",
        params![product, retailer, day, price, in_stock as i64],
    )?;
    Ok(())
}

pub fn start_run(conn: &Connection, kind: &str, now: i64) -> Result<i64> {
    conn.execute(
        "INSERT INTO ingest_runs(kind, started_at) VALUES(?1, ?2)",
        params![kind, iso_from_ms(now)],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn finish_run(
    conn: &Connection,
    id: i64,
    now: i64,
    ok: u32,
    failed: u32,
    skipped: u32,
    log: &str,
) -> Result<()> {
    conn.execute(
        "UPDATE ingest_runs SET finished_at = ?2, ok = ?3, failed = ?4, skipped = ?5, log = ?6 WHERE id = ?1",
        params![id, iso_from_ms(now), ok, failed, skipped, log],
    )?;
    Ok(())
}

// ---------- builds ----------

pub fn insert_build(conn: &Connection, b: &SavedBuild) -> Result<bool> {
    let n = conn.execute(
        "INSERT OR IGNORE INTO saved_builds(id, name, region, build, created_at) VALUES(?1, ?2, ?3, ?4, ?5)",
        params![b.id, b.name, b.region.as_str(), serde_json::to_string(&b.build)?, b.created_at],
    )?;
    Ok(n == 1)
}

pub fn get_build(conn: &Connection, id: &str) -> Result<Option<SavedBuild>> {
    let row = conn
        .query_row(
            "SELECT id, name, region, build, created_at FROM saved_builds WHERE id = ?",
            [id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, i64>(4)?,
                ))
            },
        )
        .optional()?;
    let Some((id, name, region, build, created_at)) = row else {
        return Ok(None);
    };
    Ok(Some(SavedBuild {
        id,
        name,
        region: RegionId::from_str(&region).context("bad region in db")?,
        build: serde_json::from_str(&build)?,
        created_at,
    }))
}

/// product id -> number of saved builds containing it.
pub fn build_counts(conn: &Connection) -> Result<HashMap<String, u32>> {
    let mut st = conn.prepare("SELECT build FROM saved_builds")?;
    let mut out = HashMap::new();
    for b in st.query_map([], |r| r.get::<_, String>(0))? {
        let b: Build = serde_json::from_str(&b?)?;
        let ids: std::collections::HashSet<&String> = b.values().collect();
        for id in ids {
            *out.entry(id.clone()).or_insert(0) += 1;
        }
    }
    Ok(out)
}

// ---------- orders ----------

pub fn insert_order(conn: &Connection, o: &Order) -> Result<bool> {
    let n = conn.execute(
        "INSERT OR IGNORE INTO orders(no, placed_at, json) VALUES(?1, ?2, ?3)",
        params![o.no, o.placed_at, serde_json::to_string(o)?],
    )?;
    Ok(n == 1)
}

pub fn get_order(conn: &Connection, no: &str) -> Result<Option<Order>> {
    let s: Option<String> = conn
        .query_row("SELECT json FROM orders WHERE no = ?", [no], |r| r.get(0))
        .optional()?;
    Ok(match s {
        Some(s) => Some(serde_json::from_str(&s)?),
        None => None,
    })
}

pub fn update_order(conn: &Connection, o: &Order) -> Result<()> {
    conn.execute(
        "UPDATE orders SET json = ?2 WHERE no = ?1",
        params![o.no, serde_json::to_string(o)?],
    )?;
    Ok(())
}
