# RigMY API image: the rigmy-api binary (serve / seed / ingest / import).
# rusqlite is compiled bundled and reqwest uses rustls, so the runtime needs no
# system libraries beyond ca-certificates.
FROM rust:1-slim-bookworm AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
RUN cargo build --release --locked -p rigmy-api

FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/target/release/rigmy-api /usr/local/bin/rigmy-api
COPY config /app/config
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
WORKDIR /app
# The database lives on a volume so restarts and upgrades keep price history.
ENV RIGMY_CONFIG=/app/config \
    RIGMY_DB=/data/rigmy.db
VOLUME /data
EXPOSE 8787
ENTRYPOINT ["/entrypoint.sh"]
CMD ["serve", "--host", "0.0.0.0"]
