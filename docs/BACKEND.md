# RigMY backend (Rust)

```
crates/
  rigmy-core   pure logic: offers, compatibility, power, plan, history/stats, geo (native + wasm32)
  rigmy-wasm   wasm-bindgen wrapper of rigmy-core for the Next.js client  -> web/src/wasm/
  rigmy-api    SQLite store, config seeding, price ingester, HTTP API (one binary: rigmy-api)
config/        catalog.json, content.toml, postcodes.toml, retailers.toml, sources.toml, stores.toml, events.toml
scripts/build-wasm.sh
```

## Where the data comes from

**Every price, stock state and price-history point comes from `rigmy-api ingest`.** Nothing is
generated, estimated or bundled. A fresh install has:

- 35 products in `config/catalog.json`: manufacturer specs only (socket, TDP, lengths, wattage, …),
  no prices. There are also the regions (each with a `center`), categories, spec labels and the
  three preset part lists (exactly one marked `"featured": true`).
- Reference content in `config/content.toml`: the ETA table, checkout delivery windows, assembly
  guide, cable runs and couriers (names only; no tracking URLs until their format is confirmed).
- `config/postcodes.toml`: 2-digit postcode prefix → town centroid, for locating a user by postcode.
- No retailers, no sources and no store branches. Each of these files ships empty, with a
  commented example that documents every field.

Until you configure retailers and run an ingest, the API returns empty `offers`, `retailers` and
`branches`, history is `[]`, and stats say `"No price yet"`. The web app shows its empty states.

## Quick start

```bash
cargo build --release -p rigmy-api
export RIGMY_DB=$PWD/rigmy.db RIGMY_CONFIG=$PWD/config

./target/release/rigmy-api seed      # load config into SQLite (idempotent)
./target/release/rigmy-api ingest    # fetch prices from config/sources.toml
./target/release/rigmy-api serve     # http://127.0.0.1:8787 (also re-seeds on start)
```

Environment and flags:

| env | flag | default | |
|---|---|---|---|
| `RIGMY_DB` | `--db` | `rigmy.db` | SQLite file (WAL mode). Migrations run automatically. |
| `RIGMY_CONFIG` | `--config` | `config` | config directory |
| `PORT` | `serve --port` | `8787` | |
| `HOST` | `serve --host` | `127.0.0.1` | use `0.0.0.0` in a container |
| `RIGMY_CORS_ORIGINS` | `serve --cors` | | extra origins, comma separated. `http://localhost:3000` and `http://127.0.0.1:3000` are always allowed. |
| `RUST_LOG` | | `info` | |

`serve --no-seed` skips the re-seed that otherwise runs on startup.

## 1. Add retailers (`config/retailers.toml`)

Add one `[[retailer]]` block per shop. Use its real name and website. Add a
`[retailer.delivery.<region>]` table (`kv`, `pen`, `jhr`, `east`) with `fee` (RM) and `eta` for
each region the shop actually delivers to. If a region is missing, its offers show as
`"No delivery"` and are not available in that region. ETAs must be one of `Same day`, `Next day`,
`1–2 days`, `2–3 days`, `3–5 days` or `5–7 days` (the `[[eta]]` labels in `content.toml`), and the
ranges use an en dash. `courier`, if set, must be a `[[courier]]` name from `content.toml`.

To hide a shop without losing its history, set `enabled = false`. When a retailer is removed from
the file, the next seed disables it.

## 2. Map products to pages (`config/sources.toml`)

```toml
[[source]]
product  = "cpu-9800x3d"                 # id from catalog.json
retailer = "my-shop"                     # id from retailers.toml
url      = "https://…/products/…"        # product page; also the "buy" link users see
adapter  = "shopify"                     # jsonld | shopify | woocommerce
```

| adapter | reads | notes |
|---|---|---|
| `jsonld` | the page's `<script type="application/ld+json">` | Finds a schema.org `Product` at the top level, inside `@graph`, in arrays or in `ProductGroup.hasVariant`. Reads the price from `offers.price`, `lowPrice` (AggregateOffer) or `priceSpecification.price`. `priceCurrency` **must be MYR**, otherwise the source is skipped with a warning. Availability maps `InStock`/`OnlineOnly`/`InStoreOnly` to In stock, `LimitedAvailability` to Low stock, `PreOrder`/`PreSale`/`BackOrder` to Pre-order and `OutOfStock`/`SoldOut`/`Discontinued` to Out of stock. Anything else becomes Unknown. Optional `sku = "…"` selects one product on the page. |
| `shopify` | `<url>.js`, falling back to `<url>.json` | `.js` prices are integer cents and include `available`. `.json` prices are decimal strings with no availability, so stock is Unknown. Without `variant = <id>`, the adapter takes the cheapest available variant. Shopify does not report currency, so only add shops that price in MYR. |
| `woocommerce` | `/wp-json/wc/store/v1/products?slug=<last path segment>` | You can set `product_id = <id>` instead of using the slug. Prices come in minor units (`currency_minor_unit`), and `currency_code` must be MYR. Stock comes from `is_in_stock`, `low_stock_remaining` (Low stock) and `stock_availability.class` (backorder becomes Pre-order). |

Stock semantics:
- `Out of stock` is the only state that is not buyable. `Unknown` (a price with no availability
  signal) counts as available, and the UI shows the status.
- `Pre-order` is buyable with the slowest ETA in the `content.toml` table (`5–7 days` as shipped),
  but it is not an "in-stock" price for history.

The `[settings]` block in `sources.toml` controls `user_agent`, `delay_ms` (the per-host gap,
default 5 s), `timeout_s`, `retries` (on timeouts, 429 and 5xx, with backoff that honours
`Retry-After`), `overpass_url` and `stale_after_days`. With the default `stale_after_days`, an
offer that has not refreshed for 7 days drops out of `/api/bootstrap`. Check each site's terms
and `robots.txt` before you add it.

## 3. Run the ingest

```bash
rigmy-api ingest                       # all sources
rigmy-api ingest --product gpu-5070    # one product
rigmy-api ingest --retailer my-shop    # one retailer
```

Each successful source writes two things:
- `offers_latest`: the current price, stock, URL and observation time for the (product, retailer)
  pair. `/api/bootstrap` serves these.
- `snapshots`: one row per (product, retailer, Malaysia-time day). Repeated runs on the same day
  keep the lowest price and prefer in-stock observations.

A failed fetch leaves the previous offer in place, and the run log records it in the `ingest_runs`
table. A full run (no filters) deletes `offers_latest` rows whose source is no longer configured.
History is kept.

### Schedule it to build history

Price history, the 7- and 30-day change, the 90-day average and the category index all come from
the daily snapshots, so they fill in as the ingest keeps running:

- d7 needs 8 days of history.
- avg90 needs 30 days.
- d30 needs 31 days.
- "12-month low" needs 365 days.

Until then the verdict reads `Tracking started N days ago`.

Cron example, every 6 hours:

```cron
15 */6 * * * cd /srv/rigmy && RIGMY_DB=/srv/rigmy/rigmy.db RIGMY_CONFIG=/srv/rigmy/config ./rigmy-api ingest >> /var/log/rigmy-ingest.log 2>&1
```

A systemd timer with `OnCalendar=*-*-* 00/6:15` works the same way. SQLite runs in WAL mode, so
`serve` can keep running during an ingest.

## 4. Store locations

- **Manual:** add `[[branch]]` blocks to `config/stores.toml`. `hours` uses OSM `opening_hours`
  syntax.
- **OpenStreetMap:** give a retailer `osm_match = ["Shop Name", …]`, then run
  `rigmy-api ingest --stores-osm`, or `ingest --stores-only` to skip prices. The command asks the
  Overpass API (`overpass_url`) for `shop=computer|electronics` in Malaysia and keeps elements
  whose `name`, `brand` or `operator` contains one of the patterns (case-insensitive). It then
  replaces all OSM-sourced branches. `opening_hours` is parsed for these forms:
  - `Mo-Su 10:00-22:00`
  - `Mo-Fr 09:00-18:00; Sa 10:00-16:00`
  - `Mo-Sa 10:00-21:00; Su off`
  - `24/7`
  - day lists, wrapping ranges and past-midnight closes

  Other forms, such as split shifts, months or free text, give `hours: null` and keep the raw
  string in `hoursRaw`, so the UI shows "Hours not listed". OSM data is © OpenStreetMap
  contributors (ODbL), so attribute it in the UI.

## Other config

### `catalog.json`

Besides the products: `regions` (every region id exactly once, each with
`center: {lat, lon, label}`, the city centre used as the user's approximate position until they
share a location), `categories`, `specdef`, `facet` and `presets`. Exactly one preset must have
`"featured": true` (it is the home-page starting build). Zero or several featured presets is a
load error rather than a silent fallback, so the featured build is always an explicit choice.
Preset parts must exist in the slot's category.

### `content.toml` (required)

Reference and editorial content, served as `Bootstrap.content` (camelCase on the wire). Every
section and field is documented in the file. Unknown keys are rejected.

| section | wire field | rules |
|---|---|---|
| `[checkout] delivery_windows` | `deliveryWindows` | non-empty, unique. `POST /api/orders` rejects any other `slot.window`. |
| `[checkout] slot_days` | `slotDays` | 1–31 days offered by the delivery-day picker |
| `[delivery] size_multiplier` | `deliverySizeMultiplier` | `{ <category> = factor }` applied to a retailer's region fee on offers of that category (bulky parts ship oversize; `case = 2.0` as shipped). Unlisted categories use 1.0. Categories must be in the catalog and factors > 0. In a plan, each shop is one shipment: its region fee × the largest multiplier among the parts bought from it. |
| `[[eta]] label, rank, days` | `etas` (sorted by rank) | exactly one entry per `Eta` label, unique ranks, `days` never decreasing with rank |
| `[[guide]] cat, title, minutes, text` | `guide` | `cat` is a catalog category, `"cables"`, or left out (`null`, the final step). `minutes > 0`. |
| `[[cable_run]] id, name, conn, length_mm, requires, tidy, stock` | `cableRuns` (`lengthMm`) | unique `id`, `length_mm > 0`, `requires` is a catalog category |
| `[[courier]] name, tracking_url?` | `couriers` (`trackingUrl`) | unique name. `tracking_url` must be `https://`, have a host and contain `{tracking}`. |

The ETA table is the only source of ETA ranks and day counts: the fastest-delivery plan, `maxEta`,
the pre-order ETA and the browser's `etaRank` / `etaDays` all read it. Nothing derives them from the
order of the `Eta` enum. The rules live in `rigmy_core::Content::validate`, which runs both when
the API loads config and when the browser engine receives a bootstrap.

### `postcodes.toml` (required)

`postcode = [ { prefix, town, lat, lon }, … ]`: the approximate centre of the main town for each
2-digit postcode prefix (source: the prototype's table). Prefixes must be exactly 2 digits and
unique, towns non-blank, coordinates valid; unknown keys are rejected. Served as
`Bootstrap.postcodes`; `engine.postcode(pc)` looks the first two digits up here (accuracy
`POSTCODE_ACC_M`, region from `region_of`). Unlisted prefixes return `null`.

### Rules kept in code

Engineering and algorithm thresholds that are not reference data are named, documented constants
in one place each, rather than config:

| where | constants |
|---|---|
| `rigmy_core::catalog` | `BASE_SYSTEM_W` (95 W non-CPU/GPU allowance), `PSU_HEADROOM` (1.3), `PSU_STEP_W` (50), `GPU_CLEARANCE_WARN_MM` (15), `BOARD_HEIGHT_MM` (ATX 305 / mATX 244 / Mini-ITX 170 from the form-factor specs; the "board is N mm taller" text is computed from these and omitted for other form factors) |
| `rigmy_core::history` | verdict thresholds and windows: `YEAR_DAYS`, `AVG_WINDOW_DAYS`, `AVG_MIN_DAYS`, `MIN_VERDICT_DAYS`, `SHORT_CHANGE_DAYS`, `LONG_CHANGE_DAYS`, `SPARK_DAYS`, `AT_LOW_TOLERANCE`, `BELOW_AVG_FACTOR`, `ABOVE_AVG_FACTOR`, `SALE_HINT_DAYS`, `SCORE_DROP_WEIGHT`, `SCORE_BUILDS_PER_POINT`; `FIXED_SALES` (the 6.6–12.12 calendar) |
| `rigmy_core::geo` | `region_of` bands (`EAST_MY_MIN_LON`, `NORTH_MIN_LAT`, `SOUTH_MAX_LAT`), `POSTCODE_ACC_M`, `CLOSING_SOON_H` |
| `rigmy_api` | request limits (`server::limits`), `MAX_SANE_PRICE_RM`, fetch `CONNECT_TIMEOUT` / `MAX_REDIRECTS` / `MAX_RETRY_AFTER_S`, `OVERPASS_TIMEOUT_S`, SQLite `BUSY_TIMEOUT` |

### `events.toml`

Extra sale or festival days (`date = "YYYY-MM-DD"`, `label`). The fixed-date sales 6.6, 7.7, 8.8,
9.9, 10.10, 11.11 and 12.12 are built in for the previous, current and next year. Moving festivals
such as CNY or Raya are not built in; add them per year.

## HTTP API

All responses are JSON in the shapes of `web/src/lib/types.ts`. Errors are `{"error": "…"}` with
a 4xx or 5xx status.

| method | path | returns |
|---|---|---|
| GET | `/api/health` | `{ok, version, products, retailers, offers, lastIngest}` |
| GET | `/api/bootstrap` | `Bootstrap` |
| GET | `/api/products/:id/history` | `HistoryPoint[]` (404 for an unknown product) |
| GET | `/api/stats` | `Record<productId, PartStats>`. `builds` is the number of saved builds that contain the part. |
| GET | `/api/index?cat=all\|cpu\|…` | `IndexPoint[]` (`[]` without history) |
| POST | `/api/builds` | body `{name, build, region}` → `201 SavedBuild` with an 8-character base62 id |
| GET | `/api/builds/:id` | `SavedBuild` |
| POST | `/api/orders` | body `NewOrder` → `201 Order` (`no` = `RIG-` + 6 digits) |
| GET | `/api/orders/:no` | `Order` |
| PATCH | `/api/orders/:no/groups/:retailerId` | body `{status?, courier?, tracking?}` → `Order`. Sending `null` or `""` clears courier or tracking. |

Validation:
- Builds: the name must be 1–80 characters and every part must exist in its category.
- Orders: need a contact name and a phone or email, plus 1–20 groups with 1–50 items each and
  non-negative prices. Delivery orders also need an address with a 5-digit postcode. A `slot`'s
  `window` must be one of `content.deliveryWindows`.

`/api/bootstrap` includes `content` (see `content.toml` above). Couriers are served there as
`content.couriers`; there is no separate couriers endpoint. `postcodes` comes from
`postcodes.toml`. The bootstrap fails with a 500 if the database was never seeded with `content`
or `postcodes` (run `rigmy-api seed`, or `serve` without `--no-seed`).

## WASM engine (browser)

`./scripts/build-wasm.sh` regenerates `web/src/wasm/` (`rigmy_wasm.js`, `rigmy_wasm_bg.wasm`,
`.d.ts`) with `wasm-bindgen --target web`. It needs `wasm-bindgen-cli` at the exact version of
the `wasm-bindgen` crate in `Cargo.lock`, and the script prints the install command if that
version is missing. The script uses `wasm-opt` if it is installed. The build is deterministic.

```ts
// client component / module
import init, { Engine } from '@/wasm/rigmy_wasm';
import type { Bootstrap } from '@/lib/types';

await init({ module_or_path: new URL('../wasm/rigmy_wasm_bg.wasm', import.meta.url) }); // once
const bootstrap: Bootstrap = await fetch(`${API}/api/bootstrap`).then(r => r.json());
const engine = new Engine(JSON.stringify(bootstrap));

engine.offers('gpu-5070', 'kv');                // Offer[]
engine.compat(build);                           // Check[]  (fix prices use 'kv' unless given)
const plan = engine.plan(build, region, picks); // Plan
engine.maxEta(plan.best.choice);                // Eta (ranked by content.etas)
engine.etaDays(engine.maxEta(plan.best.choice)); // number of days, from content.etas
```

The `.d.ts` imports its types from `../lib/types`, so the output must stay in `web/src/wasm/`.
Build a new `Engine` whenever the bootstrap changes, and call `engine.free()` on the old one
(optional, since the GC frees it eventually).

| method | args | returns |
|---|---|---|
| `new Engine` | `bootstrapJson: string` | throws on invalid JSON, invalid `content` (e.g. an incomplete ETA table) or an invalid `postcodes` table |
| `offers` | `productId: string, region: RegionId` | `Offer[]` (retailer order) |
| `lowest` | `productId, region` | `Offer \| null` |
| `compat` | `build: Build, region?: RegionId` | `Check[]` |
| `power` | `build` | `Power` |
| `plan` | `build, region, picks?: Record<productId, retailerId>` | `Plan` |
| `maxEta` | `choice: Choice` | `Eta`: the slowest by `content.etas` rank (the fastest label when empty) |
| `etas` | | `EtaDef[]`, fastest first |
| `etaRank` | `eta: Eta` | `number` (0 = fastest). Throws on an unknown label. |
| `etaDays` | `eta: Eta` | `number`, worst-case days. Throws on an unknown label. |
| `trackingUrl` | `courier: string, tracking: string` | `string \| undefined`: the courier's `trackingUrl` with the URL-encoded number, or `undefined` without a template / unknown courier / blank number |
| `regionOf` | `lat: number, lon: number` | `RegionId` |
| `postcode` | `pc: string` | `UserLoc \| null`, from `bootstrap.postcodes` |
| `dist` | `a: {lat,lon}, b: {lat,lon}` | `number` (km) |
| `fmtKm` | `km: number` | `string` |
| `openState` | `branchId: string, nowMs: number` | `OpenState` (Malaysia time) |
| `nearby` | `loc: {lat,lon}` | `{branchId, km}[]` sorted by distance |

An unknown region string throws an `Error`.

## Development

```bash
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
./scripts/build-wasm.sh
```

The adapter tests use hand-written fixtures in `crates/rigmy-api/tests/fixtures/`. These are test
inputs that copy the structure of real responses. They are never loaded as data.
