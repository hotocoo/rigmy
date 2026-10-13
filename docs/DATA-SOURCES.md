# RigMY data sources

Principle: **RigMY never invents data.** Every price, stock state and price-history point is
recorded from a retailer's own page or feed at the moment it was observed. When a value cannot
be verified, the app says so — "No price yet", "Tracking started N days ago", "Unknown" stock —
instead of guessing.

Two pipelines write data (see `docs/BACKEND.md`):

- `rigmy-api ingest` — reads the exact product pages you map in `config/sources.toml`.
- `rigmy-api import` — bulk-imports a retailer's whole product feed. Listings that match a
  verified catalogue part become offers on that part; everything else becomes a **market
  listing** (price, stock and history only — never buildable, never spec-parsed).

## Verified Malaysian retailers

Probed on 2026-10-13 from this machine. "Configured" means present in `config/retailers.toml`.

| Retailer | id | How RigMY can read it | Status |
|---|---|---|---|
| ALL IT Hypermarket | `all-it` | Shopify store; `products.json` feed open, robots.txt allows crawlers. Bulk feed via `import` (shipped with an `[import]` block). Delivery terms not published in the feed, so the retailer ships with no delivery table — its offers show "No delivery" until terms are confirmed. | **Configured + imported** (first live import: 1,562 market listings, 7 catalogue matches) |
| Sen Heng | — | WooCommerce; the Store API (`/wp-json/wc/store/v1/products`) is open, but there is no sitemap, so pages must be mapped per product in `sources.toml` (`adapter = "woocommerce"`) | Probed; not yet configured |
| Courts | — | Magento 2; robots.txt allows AI crawlers; no `/sitemap.xml`, so per-product mapping is required | Probed; not yet configured |
| Aeon | — | robots.txt sets `Crawl-delay: 10`; raise `[settings] delay_ms` to at least 10000 before configuring any source | Probed; not yet configured |
| Harvey Norman | — | Sits behind an Incapsula WAF that blocks non-browser clients | Excluded until a compliant access path exists |
| MST | — | `mst.com.my` no longer resolves | Excluded |

Adding a retailer: create the `[[retailer]]` block (with real delivery terms only when you know
them — an unknown field is left out rather than guessed), then either map its pages in
`sources.toml` or add an `[import]` block for a feed-based shop. Re-run `rigmy-api seed`.

## robots.txt policy

`import` enforces robots.txt automatically. Rules, as implemented in
`rigmy_api::import::robots_allowed`:

- Only the `User-agent: *` group is considered (RigMY does not claim a specific crawler name).
- The longest matching `Allow`/`Disallow` path prefix wins; equal-length ties go to Allow.
- Patterns follow RFC 9309: anchored at the start of the path, `*` matches any string.
- A missing robots.txt (HTTP 404/410) means **allowed**; any other fetch error **aborts the
  import** (permission cannot be verified).
- If the feed path is disallowed, the import refuses to run.

`ingest` fetches pages you configured deliberately and has no automatic check — the
`sources.toml` header asks you to verify each site's terms and robots.txt before adding it.

## Verified vs market

- **Verified catalogue parts** (`config/catalog.json`, 35 parts): manufacturer specifications
  checked by hand. Buildable and compatibility-checked. Their prices come from `sources.toml`
  page mappings and from feed listings the conservative matcher links to them.
- **Market listings** (`mkt-*` ids): products discovered from a feed. RigMY shows their live
  price, stock, history and buy link, but does not parse specifications from titles and never
  lets them enter a build — enforced in the core engine, the API and the UI.
