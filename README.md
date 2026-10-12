# RigMY

A PC part picker and price-comparison site for Malaysia. You build in an interactive 3D studio, compatibility is checked live, and every price, stock state and price history comes from real retailer listings in ringgit.

```
web/          Next.js 16 + React 19 + TypeScript app (UI, 3D studio, maps)
crates/
  rigmy-core  Rust domain logic: compatibility, power, purchase plans, history/stats, geo
  rigmy-wasm  rigmy-core compiled to WebAssembly for the browser  → web/src/wasm/
  rigmy-api   Axum + SQLite API, config seeding, price ingester, OpenStreetMap store import
config/       catalog, reference content, postcodes, retailers, price sources, stores, sale events
docs/         BACKEND.md, FRONTEND.md (standards)
project/      original Claude Design prototype + handoff notes (reference only)
```

## Data

There is no mock data. A fresh install has product specs and reference content only. Prices appear once you add retailers to `config/retailers.toml`, list product pages in `config/sources.toml` and run `rigmy-api ingest`. Run the ingest on a schedule to build up price history. Until then the app shows empty states. See [docs/BACKEND.md](docs/BACKEND.md).

Checkout hands off to the retailers. RigMY saves the order and your delivery or pickup preferences, then links to each shop's product pages to buy. You record courier and tracking numbers on the Orders page.

## Run locally

```bash
# API (port 8787)
cargo build --release -p rigmy-api
export RIGMY_DB=$PWD/rigmy.db RIGMY_CONFIG=$PWD/config
./target/release/rigmy-api seed
./target/release/rigmy-api serve

# Web (port 3000; /api is proxied to RIGMY_API_URL, default http://localhost:8787)
cd web && npm install && npm run dev
```

Rebuild the WebAssembly engine after changing `crates/rigmy-core`: `./scripts/build-wasm.sh`.

## Quality gates

```bash
cargo fmt --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace
cd web && npx tsc --noEmit && npm run lint && npx next build
```

Frontend rules (tokens, UI kit, no hardcoding) are in [docs/FRONTEND.md](docs/FRONTEND.md).
