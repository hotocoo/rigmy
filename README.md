# RigMY

A PC part picker and price-comparison site for Malaysia. You build in an interactive 3D studio, compatibility is checked live, and every price, stock state and price history comes from real retailer listings in ringgit.

```
web/          Next.js 16 + React 19 + TypeScript app (UI, 3D studio, maps)
crates/
  rigmy-core  Rust domain logic: compatibility, power, purchase plans, history/stats, geo
  rigmy-wasm  rigmy-core compiled to WebAssembly for the browser  → web/src/wasm/
  rigmy-api   Axum + SQLite API, config seeding, price ingester, OpenStreetMap store import
config/       catalog, reference content, postcodes, retailers, price sources, stores, sale events
docs/         BACKEND.md, FRONTEND.md, DATA-SOURCES.md, DEPLOYMENT.md
project/      original Claude Design prototype + handoff notes (reference only)
```

## What it does

- **Build in 3D**: an interactive studio (explode, x-ray, camera views, cable routing) with
  real-world handedness, plus **AR** "view in your room" (AR Quick Look on iOS, WebXR on
  Android, GLB download elsewhere).
- **Live compatibility**: socket, memory, form factor, GPU clearance, cooler fit and power
  headroom, with one-click fixes. Specs a part doesn't state show as *Not listed* instead of a
  guess.
- **Hundreds of buildable parts**: the verified catalogue plus retailer listings whose titles pin
  down one part (tagged *Specs from retailer listing*). The same model at several shops is one
  part with an offer from each, so prices compare across shops.
- **Browse like a pro**: spec filters generated per category (ranges, chips with counts), price
  range, in-stock / compatible / verified-only toggles, and a sortable table view.
- **Optional slots**: a second drive, monitor and case fans alongside the eight core parts.
- **Gaming estimate**: what resolution the GPU suits, the CPU's gaming tier and a bottleneck note
  (bands from review consensus, never invented frame rates).
- **Price history, alerts, compare, watchlist, nearby stores with Reserve over WhatsApp**,
  shop-side promo codes, orders with tracking, and a public **build gallery**.

## Data

There is no mock data. A fresh install has product specs and reference content only. Prices appear once a retailer feed is imported: `rigmy-api import` fetches the full product listing from each retailer in `config/retailers.toml` (robots-checked, rate-limited), matches feed products to the catalogue, and stores every unmatched one as a market listing with its own price and stock. Run the import on a schedule to build up price history. Until then the app shows empty states. See [docs/BACKEND.md](docs/BACKEND.md) and [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md).

Checkout hands off to the retailers. RigMY saves the order and your delivery or pickup preferences, then links to each shop's product pages to buy. You record courier and tracking numbers on the Orders page.

## Run locally

```bash
# API on :8787 — seeds the database from config/ on start
cargo run -p rigmy-api -- serve --db data/rigmy.db --port 8787

# Import a retailer feed (idempotent), e.g. all of ALL IT Hypermarket
cargo run -p rigmy-api -- import --db data/rigmy.db --config config --retailer all-it

# Web on :3000 (/api is proxied to RIGMY_API_URL, default http://localhost:8787)
cd web && npm install && npm run dev
```

Rebuild the WebAssembly engine after changing `crates/rigmy-core`: `./scripts/build-wasm.sh`.

## Quality gates

```bash
cargo fmt --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace
cd web && npx tsc --noEmit && npm run lint && npm test && npx next build
cd web && npx playwright test   # e2e smoke over the real stack
```

Frontend rules (tokens, UI kit, no hardcoding) are in [docs/FRONTEND.md](docs/FRONTEND.md). Contributing guide: [CONTRIBUTING.md](CONTRIBUTING.md). Deployment: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
