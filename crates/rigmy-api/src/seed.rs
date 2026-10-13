//! `seed`: load config (catalog, content, postcodes, retailers, manual stores, extra events) into the database.
//! Idempotent: products/retailers are upserted; retailers missing from config are disabled;
//! config branches missing from stores.toml are deleted. Never touches prices.

use anyhow::Result;
use rigmy_core::time::iso_from_ms;
use rigmy_core::{Branch, BranchSource};
use rusqlite::{params, Connection};

use crate::config::Config;
use crate::db;
use crate::hours::parse_opening_hours;

#[derive(Debug, Default, PartialEq, Eq)]
pub struct SeedSummary {
    pub products: usize,
    pub retailers_enabled: usize,
    pub retailers_disabled: usize,
    pub branches: usize,
}

pub fn seed(conn: &mut Connection, cfg: &Config, now: i64) -> Result<SeedSummary> {
    let tx = conn.transaction()?;
    let c = &cfg.catalog;
    db::set_meta(&tx, "regions", &c.regions)?;
    db::set_meta(&tx, "categories", &c.categories)?;
    db::set_meta(&tx, "specdef", &c.specdef)?;
    db::set_meta(&tx, "facet", &c.facet)?;
    db::set_meta(&tx, "presets", &c.presets)?;
    db::set_meta(&tx, "events", &cfg.events)?;
    db::set_meta(&tx, "content", &cfg.content)?;
    db::set_meta(&tx, "postcodes", &cfg.postcodes)?;

    for (i, p) in c.products.iter().enumerate() {
        tx.execute(
            "INSERT INTO products(id, cat, sort, json) VALUES(?1, ?2, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET cat = excluded.cat, sort = excluded.sort, json = excluded.json",
            params![p.id, p.cat.map(|c| c.as_str()).unwrap_or_default(), i as i64, serde_json::to_string(p)?],
        )?;
    }

    tx.execute("UPDATE retailers SET enabled = 0", [])?;
    let mut enabled = 0;
    for (i, r) in cfg.retailers.retailer.iter().enumerate() {
        tx.execute(
            "INSERT INTO retailers(id, sort, enabled, json) VALUES(?1, ?2, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET sort = excluded.sort, enabled = excluded.enabled, json = excluded.json",
            params![r.id, i as i64, r.enabled as i64, serde_json::to_string(&r.to_retailer())?],
        )?;
        enabled += r.enabled as usize;
    }
    let disabled: i64 = tx.query_row(
        "SELECT COUNT(*) FROM retailers WHERE enabled = 0",
        [],
        |r| r.get(0),
    )?;

    tx.execute("DELETE FROM branches WHERE source = 'config'", [])?;
    let stamp = iso_from_ms(now);
    for b in &cfg.stores.branch {
        let branch = Branch {
            id: b.id.clone(),
            retailer_id: b.retailer.clone(),
            name: b.name.clone(),
            addr: b.addr.clone(),
            lat: b.lat,
            lon: b.lon,
            phone: b.phone.clone(),
            hours: b.hours.as_deref().and_then(parse_opening_hours),
            hours_raw: b.hours.clone(),
            services: b.services.clone(),
            source: BranchSource::Config,
        };
        tx.execute(
            "INSERT INTO branches(id, retailer_id, source, json, updated_at) VALUES(?1, ?2, 'config', ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET retailer_id = excluded.retailer_id, source = 'config',
               json = excluded.json, updated_at = excluded.updated_at",
            params![branch.id, branch.retailer_id, serde_json::to_string(&branch)?, stamp],
        )?;
    }
    tx.commit()?;
    Ok(SeedSummary {
        products: c.products.len(),
        retailers_enabled: enabled,
        retailers_disabled: disabled as usize,
        branches: cfg.stores.branch.len(),
    })
}
