FROM rust:1.92-slim-bookworm AS builder

WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends pkg-config libssl-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock ./
COPY apps/api/Cargo.toml apps/api/Cargo.toml
COPY apps/api/migrations apps/api/migrations
COPY apps/api/src apps/api/src

RUN cargo build --release -p lingovector-api

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home --home-dir /app --shell /usr/sbin/nologin lingovector

WORKDIR /app
COPY --from=builder /app/target/release/lingovector-api /usr/local/bin/lingovector-api
RUN mkdir -p /app/storage && chown -R lingovector:lingovector /app

ENV BIND_ADDR=0.0.0.0:8080
ENV STORAGE_DIR=/app/storage
EXPOSE 8080

USER lingovector
CMD ["lingovector-api"]
