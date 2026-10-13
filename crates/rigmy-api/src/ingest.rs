//! `ingest`: fetch every configured source politely and record offers + daily snapshots.

use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use rigmy_core::time::{iso_from_ms, myt_day_start};
use rigmy_core::RawOffer;
use rusqlite::{params, Connection};

use crate::adapters::{self, Parsed};
use crate::config::{AdapterKind, Config, IngestSettings, SourceConf};
use crate::db;
use crate::osm;

#[derive(Debug)]
pub enum FetchError {
    Status(u16),
    Network(String),
}

impl std::fmt::Display for FetchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FetchError::Status(s) => write!(f, "HTTP {s}"),
            FetchError::Network(e) => write!(f, "network error: {e}"),
        }
    }
}

impl std::error::Error for FetchError {}

/// HTTP client with a per-host minimum delay, retries with backoff and a request timeout.
pub struct Fetcher {
    client: reqwest::Client,
    delay: Duration,
    retries: u32,
    last: HashMap<String, Instant>,
}

/// TCP/TLS connect timeout (the overall request timeout is `timeout_s` in sources.toml).
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
/// Redirects followed per request.
const MAX_REDIRECTS: usize = 5;
/// Upper bound on a server's `Retry-After`, so one host cannot stall a run.
const MAX_RETRY_AFTER_S: u64 = 120;

impl Fetcher {
    pub fn new(s: &IngestSettings) -> Result<Self> {
        let client = reqwest::Client::builder()
            .user_agent(s.user_agent.clone())
            .timeout(Duration::from_secs(s.timeout_s.max(1)))
            .connect_timeout(CONNECT_TIMEOUT)
            .redirect(reqwest::redirect::Policy::limited(MAX_REDIRECTS))
            .build()?;
        Ok(Fetcher {
            client,
            delay: Duration::from_millis(s.delay_ms),
            retries: s.retries,
            last: HashMap::new(),
        })
    }

    async fn wait_turn(&mut self, url: &str) {
        let host = url::Url::parse(url)
            .ok()
            .and_then(|u| u.host_str().map(str::to_string))
            .unwrap_or_default();
        if let Some(t) = self.last.get(&host) {
            let since = t.elapsed();
            if since < self.delay {
                tokio::time::sleep(self.delay - since).await;
            }
        }
        self.last.insert(host, Instant::now());
    }

    /// GET `url` and return the body (per-host delay + retries applied).
    pub async fn get_text(&mut self, url: &str) -> Result<String, FetchError> {
        self.send(|c| c.get(url), url).await
    }

    async fn send(
        &mut self,
        build: impl Fn(&reqwest::Client) -> reqwest::RequestBuilder,
        url: &str,
    ) -> Result<String, FetchError> {
        let mut attempt = 0;
        loop {
            self.wait_turn(url).await;
            let res = build(&self.client).send().await;
            let (retryable, err, wait) = match res {
                Ok(r) if r.status().is_success() => {
                    return r
                        .text()
                        .await
                        .map_err(|e| FetchError::Network(e.to_string()));
                }
                Ok(r) => {
                    let st = r.status().as_u16();
                    let retry_after = r
                        .headers()
                        .get(reqwest::header::RETRY_AFTER)
                        .and_then(|v| v.to_str().ok())
                        .and_then(|v| v.trim().parse::<u64>().ok())
                        .map(|s| Duration::from_secs(s.min(MAX_RETRY_AFTER_S)));
                    (st == 429 || st >= 500, FetchError::Status(st), retry_after)
                }
                Err(e) => (
                    e.is_timeout() || e.is_connect() || e.is_request(),
                    FetchError::Network(e.to_string()),
                    None,
                ),
            };
            if !retryable || attempt >= self.retries {
                return Err(err);
            }
            attempt += 1;
            let backoff =
                wait.unwrap_or(self.delay.max(Duration::from_secs(1)) * 2u32.pow(attempt));
            tracing::warn!(
                "{url}: {err}; retry {attempt}/{} in {:?}",
                self.retries,
                backoff
            );
            tokio::time::sleep(backoff).await;
        }
    }

    pub async fn get(&mut self, url: &str) -> Result<String, FetchError> {
        let u = url.to_string();
        self.send(
            move |c| {
                c.get(&u)
                    .header(reqwest::header::ACCEPT_LANGUAGE, "en-MY,en;q=0.8")
            },
            url,
        )
        .await
    }

    pub async fn post_form(
        &mut self,
        url: &str,
        pairs: &[(&str, &str)],
    ) -> Result<String, FetchError> {
        let body: String = url::form_urlencoded::Serializer::new(String::new())
            .extend_pairs(pairs)
            .finish();
        let u = url.to_string();
        self.send(
            move |c| {
                c.post(&u)
                    .header(
                        reqwest::header::CONTENT_TYPE,
                        "application/x-www-form-urlencoded",
                    )
                    .body(body.clone())
            },
            url,
        )
        .await
    }
}

/// Fetch + parse one source with its adapter.
pub async fn fetch_source(f: &mut Fetcher, s: &SourceConf) -> Result<Parsed, String> {
    match s.adapter {
        AdapterKind::Jsonld => {
            let html = f.get(&s.url).await.map_err(|e| e.to_string())?;
            adapters::parse_jsonld(&html, s.sku.as_deref()).map_err(|e| e.to_string())
        }
        AdapterKind::Shopify => {
            let js = adapters::shopify_js_url(&s.url).map_err(|e| e.to_string())?;
            let first = match f.get(&js).await {
                Ok(body) => adapters::parse_shopify_js(&body, s.variant).map_err(|e| e.to_string()),
                Err(e) => Err(e.to_string()),
            };
            match first {
                Ok(p) => Ok(p),
                Err(e1) => {
                    let json = adapters::shopify_json_url(&s.url).map_err(|e| e.to_string())?;
                    let body = f
                        .get(&json)
                        .await
                        .map_err(|e| format!("{e1}; .json fallback: {e}"))?;
                    adapters::parse_shopify_json(&body, s.variant)
                        .map_err(|e| format!("{e1}; .json fallback: {e}"))
                }
            }
        }
        AdapterKind::Woocommerce => {
            let api =
                adapters::woocommerce_api_url(&s.url, s.product_id).map_err(|e| e.to_string())?;
            let body = f.get(&api).await.map_err(|e| e.to_string())?;
            adapters::parse_woocommerce(&body).map_err(|e| e.to_string())
        }
    }
}

/// Persist one observation: latest offer + the day's snapshot.
pub fn record(conn: &Connection, s: &SourceConf, p: &Parsed, now: i64) -> Result<()> {
    db::upsert_offer(
        conn,
        &RawOffer {
            product_id: s.product.clone(),
            retailer_id: s.retailer.clone(),
            price: (p.price * 100.0).round() / 100.0,
            stock: p.stock,
            url: s.url.clone(),
            observed_at: iso_from_ms(now),
        },
    )?;
    db::upsert_snapshot(
        conn,
        &s.product,
        &s.retailer,
        myt_day_start(now),
        p.price,
        p.stock.counts_in_stock(),
    )
}

#[derive(Debug, Default, Clone)]
pub struct IngestOptions {
    pub only_product: Option<String>,
    pub only_retailer: Option<String>,
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct RunSummary {
    pub ok: u32,
    pub failed: u32,
    pub skipped: u32,
}

pub async fn run_prices(
    conn: &Connection,
    cfg: &Config,
    opts: &IngestOptions,
) -> Result<RunSummary> {
    let enabled: HashSet<&str> = cfg
        .retailers
        .retailer
        .iter()
        .filter(|r| r.enabled)
        .map(|r| r.id.as_str())
        .collect();
    let sources: Vec<&SourceConf> = cfg
        .sources
        .source
        .iter()
        .filter(|s| opts.only_product.as_deref().is_none_or(|p| p == s.product))
        .filter(|s| {
            opts.only_retailer
                .as_deref()
                .is_none_or(|r| r == s.retailer)
        })
        .collect();
    let run = db::start_run(conn, "prices", db::now_ms())?;
    let mut log = vec![];
    let mut sum = RunSummary::default();
    if sources.is_empty() {
        log.push("no sources configured (config/sources.toml)".to_string());
    }
    let mut f = Fetcher::new(&cfg.sources.settings)?;
    for s in &sources {
        let tag = format!("{} @ {}", s.product, s.retailer);
        if !enabled.contains(s.retailer.as_str()) {
            sum.skipped += 1;
            log.push(format!("skip {tag}: retailer disabled"));
            continue;
        }
        match fetch_source(&mut f, s).await {
            Ok(p) => {
                record(conn, s, &p, db::now_ms())?;
                sum.ok += 1;
                log.push(format!("ok   {tag}: RM {:.2} {}", p.price, p.stock));
            }
            Err(e) => {
                sum.failed += 1;
                log.push(format!("FAIL {tag}: {e}"));
            }
        }
        tracing::info!("{}", log.last().map(String::as_str).unwrap_or(""));
    }
    // Full runs drop latest offers whose source was removed from config.
    if opts.only_product.is_none() && opts.only_retailer.is_none() {
        let keep: HashSet<(String, String)> = cfg
            .sources
            .source
            .iter()
            .map(|s| (s.product.clone(), s.retailer.clone()))
            .collect();
        let mut st = conn.prepare("SELECT product_id, retailer_id FROM offers_latest")?;
        let existing: Vec<(String, String)> = st
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<rusqlite::Result<_>>()?;
        for (p, r) in existing.into_iter().filter(|k| !keep.contains(k)) {
            conn.execute(
                "DELETE FROM offers_latest WHERE product_id = ?1 AND retailer_id = ?2",
                params![p, r],
            )?;
            log.push(format!(
                "removed stale offer {p} @ {r} (no longer in sources.toml)"
            ));
        }
    }
    db::finish_run(
        conn,
        run,
        db::now_ms(),
        sum.ok,
        sum.failed,
        sum.skipped,
        &log.join("\n"),
    )?;
    for l in &log {
        println!("{l}");
    }
    Ok(sum)
}

/// Replace all OSM-sourced branches with a fresh Overpass import.
pub fn replace_osm_branches(
    conn: &mut Connection,
    branches: &[rigmy_core::Branch],
    now: i64,
) -> Result<()> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM branches WHERE source = 'osm'", [])?;
    for b in branches {
        tx.execute(
            "INSERT INTO branches(id, retailer_id, source, json, updated_at) VALUES(?1, ?2, 'osm', ?3, ?4)
             ON CONFLICT(id) DO NOTHING",
            params![b.id, b.retailer_id, serde_json::to_string(b)?, iso_from_ms(now)],
        )?;
    }
    tx.commit()?;
    Ok(())
}

pub async fn run_stores(conn: &mut Connection, cfg: &Config) -> Result<usize> {
    let with_patterns = cfg
        .retailers
        .retailer
        .iter()
        .filter(|r| r.enabled && !r.osm_match.is_empty())
        .count();
    if with_patterns == 0 {
        println!("stores: no enabled retailer has osm_match patterns; nothing to import");
        return Ok(0);
    }
    let run = db::start_run(conn, "stores", db::now_ms())?;
    let mut f = Fetcher::new(&cfg.sources.settings)?;
    let result = f
        .post_form(
            &cfg.sources.settings.overpass_url,
            &[("data", &osm::overpass_query())],
        )
        .await;
    let body = match result {
        Ok(b) => b,
        Err(e) => {
            db::finish_run(conn, run, db::now_ms(), 0, 1, 0, &format!("overpass: {e}"))?;
            return Err(e).context("Overpass request failed");
        }
    };
    let branches = osm::branches_from_overpass(&body, &cfg.retailers.retailer)?;
    replace_osm_branches(conn, &branches, db::now_ms())?;
    let msg = format!("imported {} OSM branches", branches.len());
    db::finish_run(conn, run, db::now_ms(), branches.len() as u32, 0, 0, &msg)?;
    println!("stores: {msg}");
    Ok(branches.len())
}
