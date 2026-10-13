# Contributing

RigMY is a Rust + TypeScript monorepo. The compatibility engine lives in pure Rust
(`rigmy-core`), is exposed to the browser through WASM (`rigmy-wasm`), and serves the
REST API (`rigmy-api`). The Next.js app (`web/`) contains no business logic of its own —
every check, plan, and swap suggestion comes from the engine.

## Prerequisites

- Rust (stable) — `rustup target add wasm32-unknown-unknown` for the WASM build
- `wasm-bindgen-cli` at the exact version pinned in `Cargo.lock`
  (`scripts/build-wasm.sh` prints the install command if it is missing or mismatched)
- Node 22 + npm

## Layout

```
crates/rigmy-core   pure engine: types, catalogue, compatibility checks, plans, swaps
crates/rigmy-wasm   wasm-bindgen bindings of the engine (built into web/src/wasm/)
crates/rigmy-api    Axum REST API, SQLite storage, seed + retailer feed import
web/                Next.js app (all UI state in zustand, all logic in the WASM engine)
config/             catalog.json, retailers.toml, content, postcodes, stores, events
data/               rigmy.db (gitignored) — the live database
docs/               BACKEND.md, DATA-SOURCES.md, DEPLOYMENT.md
scripts/            build-wasm.sh
docker/, .github/   Dockerfiles, compose file, CI/CD workflows
```

## Run it locally

```sh
# API on :8787 (seeds the database from config/ on start)
cargo run -p rigmy-api -- serve --db data/rigmy.db --port 8787

# bulk-import a retailer feed (idempotent; robots-checked, rate-limited)
cargo run -p rigmy-api -- import --db data/rigmy.db --config config --retailer all-it

# web on :3000
cd web && npm ci && npm run dev
```

## Rebuild the WASM engine

After changing anything in `rigmy-core` or `rigmy-wasm`:

```sh
scripts/build-wasm.sh
```

The artifacts in `web/src/wasm/` are committed — commit the rebuilt files together with
the Rust change, and rebuild the web app (`npm run build`) before testing in the browser.

## Tests

```sh
cargo test --workspace                 # engine, API, adapters, wasm bindings
cd web && npm test                     # vitest: format, shared, csv, store
cd web && npx playwright test          # e2e smoke over the real stack
```

The e2e suite starts a freshly seeded API and the built web app itself (or reuses your
running dev servers). It asserts on the seed catalogue and engine behaviour — never on
live feed prices, because CI's database has no offers.

## Lint and format

```sh
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cd web && npm run lint && npx tsc --noEmit
```

## Docker

```sh
docker compose up --build    # api :8787, web :3000, shared ./data volume
```

## The honesty contract

The whole product is built on one rule: **never invent data**.

- Catalogue parts (with specs) are the only buildable parts. Discovered feed products are
  *market listings* — price, stock, and history, but never a slot in a build.
- A part with no offer in the chosen region says "No price yet"; it is never given a
  guessed price, and totals are never shown when nothing is priced.
- Compatibility checks that cannot be verified from the catalogue report "pending",
  never a false OK.
- Swap/upgrade suggestions list only parts the engine verified fit, and deliberately do
  not rank quality — the catalogue carries no tier data.

Keep new features inside that contract: if a value is not in the catalogue or a feed,
it does not get rendered.

## Commit style

Conventional Commits: `feat`, `fix`, `test`, `docs`, `chore` — one logical change per
commit, e.g. `fix(core): exclude market listings from swap suggestions`.
