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

## Docker Compose (single host)

```bash
docker compose up --build
data/          # SQLite database (persists across restarts and image upgrades)
:3000          # web
:8787          # API
```

To use your own `config/` without rebuilding the image, uncomment the config volume mount
in `docker-compose.yml`. The entrypoint seeds on every start, so config changes take effect
on the next `docker compose up`.

## Release images (GHCR)

Tagged releases (`git tag v1.2.3 && git push origin v1.2.3`) build and push:

- `ghcr.io/hotocoo/rigmy-api:<tag>` (also `:latest` and `:sha-<short>`)
- `ghcr.io/hotocoo/rigmy-web:<tag>`

and a GitHub Release with the source archive + `SHA256SUMS` (verify with `sha256sum -c
SHA256SUMS`).

Pulling a release:

```bash
docker login ghcr.io
docker pull ghcr.io/hotocoo/rigmy-api:v1.2.3
docker pull ghcr.io/hotocoo/rigmy-web:v1.2.3
```

The web image is built with `RIGMY_API_URL=http://api:8787` — the compose service name.
If your API is reachable under another name, rebuild with
`docker build --build-arg RIGMY_API_URL=http://<api-host>:8787 web/`.

## Keeping prices fresh

The app has no built-in scheduler on purpose (the host owns time). On a VPS, a crontab entry
like this refreshes prices daily at 06:30 MYT:

```cron
30 6 * * * cd /opt/rigmy && docker compose exec -T api rigmy-api import >> /var/log/rigmy-import.log 2>&1
```

`import` is idempotent and robots-checked; it re-seeds nothing destructive. `ingest` works the
same way for per-page sources. Backups are a single file: `docker compose cp api:/data/rigmy.db
./rigmy-$(date +%F).db` (WAL mode — stop the container or `sqlite3 /data/rigmy.db "PRAGMA
wal_checkpoint(TRUNCATE)"` first for a consistent copy).

## Reverse proxy

Put a TLS terminator (Caddy, nginx, Traefik) in front of the web container on port 3000. No
extra headers are required; the API is same-origin via the web rewrite, so CORS only matters
when you serve the two on different hostnames (then set `RIGMY_CORS_ORIGINS` on the API).
