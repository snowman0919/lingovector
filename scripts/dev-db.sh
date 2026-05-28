#!/usr/bin/env bash
set -euo pipefail

if ! docker info >/dev/null 2>&1; then
  cat >&2 <<'MSG'
Docker daemon is not running.

On macOS:
  1. Open Docker Desktop.
  2. Wait until the whale icon says Docker is running.
  3. Re-run: npm run dev:db
MSG
  exit 1
fi

docker compose config >/dev/null
docker compose up -d postgres

for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U postgres -d lingovector >/dev/null 2>&1; then
    docker compose ps postgres
    echo "PostgreSQL is ready on localhost:5432."
    exit 0
  fi
  sleep 1
done

docker compose logs postgres
echo "PostgreSQL did not become ready within 30 seconds." >&2
exit 1
