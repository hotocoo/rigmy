use std::path::PathBuf;
use std::sync::Arc;

use anyhow::{bail, Context, Result};
use clap::{Parser, Subcommand};
use rigmy_api::{config::Config, db, import, ingest, seed, server};

#[derive(Parser)]
#[command(
    name = "rigmy-api",
    version,
    about = "RigMY API server, seeder and price ingester"
)]
struct Cli {
    /// SQLite database path.
    #[arg(long, env = "RIGMY_DB", default_value = "rigmy.db", global = true)]
    db: String,
    /// Config directory (catalog.json, content.toml, postcodes.toml, retailers.toml, sources.toml, stores.toml, events.toml).
    #[arg(long, env = "RIGMY_CONFIG", default_value = "config", global = true)]
    config: PathBuf,
    #[command(subcommand)]
    cmd: Option<Cmd>,
}

#[derive(Subcommand)]
enum Cmd {
    /// Serve the HTTP API (default). Re-seeds from config on start unless --no-seed.
    Serve {
        #[arg(long, env = "PORT", default_value_t = 8787)]
        port: u16,
        #[arg(long, env = "HOST", default_value = "127.0.0.1")]
        host: String,
        /// Extra allowed CORS origins (comma separated); localhost:3000 is always allowed.
        #[arg(long, env = "RIGMY_CORS_ORIGINS", value_delimiter = ',')]
        cors: Vec<String>,
        #[arg(long)]
        no_seed: bool,
    },
    /// Load config (catalog, retailers, manual stores, events) into the database. Idempotent.
    Seed,
    /// Fetch prices from every source in sources.toml and record offers + daily snapshots.
    Ingest {
        /// Only this product id.
        #[arg(long)]
        product: Option<String>,
        /// Only this retailer id.
        #[arg(long)]
        retailer: Option<String>,
        /// Also import store branches from OpenStreetMap (Overpass) for retailers with osm_match.
        #[arg(long)]
        stores_osm: bool,
        /// Only import OSM stores; skip prices.
        #[arg(long)]
        stores_only: bool,
    },
    /// Bulk-import a retailer product feed (robots-checked, rate-limited). Matched catalog
    /// parts get offers; the rest become market listings (price/stock only).
    Import {
        /// Retailer id from retailers.toml (default: every retailer with an [import] block).
        #[arg(long)]
        retailer: Option<String>,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,rigmy_api=info".into()),
        )
        .with_writer(std::io::stderr)
        .init();
    let cli = Cli::parse();
    let cfg = Config::load(&cli.config)
        .with_context(|| format!("loading config from {}", cli.config.display()))?;
    let mut conn = db::open(&cli.db).with_context(|| format!("opening database {}", cli.db))?;
    let cmd = cli.cmd.unwrap_or(Cmd::Serve {
        port: 8787,
        host: "127.0.0.1".into(),
        cors: vec![],
        no_seed: false,
    });
    match cmd {
        Cmd::Seed => {
            let s = seed::seed(&mut conn, &cfg, db::now_ms())?;
            println!(
                "seeded {} products, {} enabled retailers ({} disabled), {} configured branches",
                s.products, s.retailers_enabled, s.retailers_disabled, s.branches
            );
        }
        Cmd::Ingest {
            product,
            retailer,
            stores_osm,
            stores_only,
        } => {
            seed::seed(&mut conn, &cfg, db::now_ms())?;
            if !stores_only {
                let opts = ingest::IngestOptions {
                    only_product: product,
                    only_retailer: retailer,
                };
                let s = ingest::run_prices(&conn, &cfg, &opts).await?;
                println!(
                    "prices: {} ok, {} failed, {} skipped",
                    s.ok, s.failed, s.skipped
                );
            }
            if stores_osm || stores_only {
                ingest::run_stores(&mut conn, &cfg).await?;
            }
        }
        Cmd::Import { retailer } => {
            seed::seed(&mut conn, &cfg, db::now_ms())?;
            let ids: Vec<String> = match retailer {
                Some(id) => vec![id],
                None => cfg
                    .retailers
                    .retailer
                    .iter()
                    .filter(|r| r.import.is_some())
                    .map(|r| r.id.clone())
                    .collect(),
            };
            if ids.is_empty() {
                bail!("no retailer with an [import] block in retailers.toml");
            }
            let mut fetcher = import::HttpFetcher::new(&cfg.sources.settings)?;
            for id in &ids {
                let now = db::now_ms();
                let s = import::run(&mut conn, &cfg, id, &mut fetcher, now).await?;
                println!(
                    "{id}: {} pages, {} listings ({} matched to catalog, {} market), {} skipped, {} stale catalog offers removed, {} listings buildable",
                    s.pages, s.products, s.matched, s.market, s.failed, s.dropped, s.promoted
                );
                for m in &s.matches {
                    println!(
                        "  matched: {} -> {} (token: {})",
                        m.listing, m.seed_id, m.token
                    );
                }
                let types: Vec<String> = s
                    .product_types
                    .iter()
                    .map(|(k, n)| {
                        format!(
                            "{}={n}",
                            if k.is_empty() {
                                "(none)".into()
                            } else {
                                k.clone()
                            }
                        )
                    })
                    .collect();
                println!("  product types: {}", types.join(", "));
            }
        }
        Cmd::Serve {
            port,
            host,
            cors,
            no_seed,
        } => {
            if !no_seed {
                seed::seed(&mut conn, &cfg, db::now_ms())?;
            }
            let mut origins: Vec<String> = vec![
                "http://localhost:3000".into(),
                "http://127.0.0.1:3000".into(),
            ];
            origins.extend(
                cors.into_iter()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty()),
            );
            let state = Arc::new(server::AppState::new(
                conn,
                cfg.sources.settings.stale_after_days,
            ));
            let app = server::router(state, &origins)
                .layer(tower_http::trace::TraceLayer::new_for_http());
            let addr = format!("{host}:{port}");
            let listener = tokio::net::TcpListener::bind(&addr)
                .await
                .with_context(|| format!("binding {addr}"))?;
            tracing::info!("rigmy-api listening on http://{addr}");
            axum::serve(listener, app)
                .with_graceful_shutdown(async {
                    let _ = tokio::signal::ctrl_c().await;
                })
                .await?;
        }
    }
    Ok(())
}
