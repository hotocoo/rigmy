# RigMY deployment

Two deployables: the **API** (Rust binary, port 8787) and the **web app** (Next.js, port
3000). Everything else — catalogue, retailers, sources, stores — is config in `config/`,
loaded into SQLite on every start (idempotent seed).

## Local development

```bash
# terminal 1 — API on :8787
cargo run -p rigmy-api -- serve

# terminal 2 — web on :3000 (rewrites /api/* to :8787)
cd web && npm install && npm run dev
```

The web app needs no env vars in development. See `docs/BACKEND.md` for the full CLI
(seed / ingest / import / serve) and `docs/DATA-SOURCES.md` for adding retailers.

## Production (single host)

Run the two processes with any supervisor (systemd, pm2, foreman). The API owns the SQLite
database in a persistent file (`RIGMY_DB`); the web app rewrites `/api/*` to the API.

```bash
# API (systemd unit or `pm2 start`)
RIGMY_DB=/opt/rigmy/rigmy.db RIGMY_CONFIG=/opt/rigmy/config rigmy-api serve --host 0.0.0.0

# Web (production build)
cd web && npm ci && npm run build && RIGMY_API_URL=http://127.0.0.1:8787 npm run start
```

The database is a single file; back it up by copying it (WAL mode — stop the API or run
`sqlite3 rigmy.db "PRAGMA wal_checkpoint(TRUNCATE)"` first for a consistent copy).

## Releases

Tagged releases (`git tag v1.2.3 && git push origin v1.2.3`) publish a GitHub Release with
the source archive + `SHA256SUMS` (verify with `sha256sum -c SHA256SUMS`).

## Keeping prices fresh

The app has no built-in scheduler on purpose (the host owns time). On a VPS, a crontab entry
like this refreshes prices daily at 06:30 MYT:

```cron
30 6 * * * cd /opt/rigmy && RIGMY_DB=/opt/rigmy/rigmy.db RIGMY_CONFIG=/opt/rigmy/config rigmy-api import >> /var/log/rigmy-import.log 2>&1
```

`import` is idempotent and robots-checked; it re-seeds nothing destructive. `ingest` works the
same way for per-page sources.

## Reverse proxy

Put a TLS terminator (Caddy, nginx, Traefik) in front of the web app on port 3000. No extra
headers are required; the API is same-origin via the web rewrite, so CORS only matters when
you serve the two on different hostnames (then set `RIGMY_CORS_ORIGINS` on the API).
