#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for migration checks." >&2
  exit 1
fi

if ! command -v sqlx >/dev/null 2>&1; then
  cat >&2 <<'MSG'
sqlx CLI is required for migration checks.

Install locally:
  cargo install sqlx-cli --no-default-features --features postgres,rustls
MSG
  exit 1
fi

sqlx migrate info --source apps/api/migrations
