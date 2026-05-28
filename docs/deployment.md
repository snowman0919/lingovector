# Lingovector Production Deployment Rehearsal

This document describes a production deployment rehearsal for Lingovector. It is not a production deploy procedure by itself. Do not paste secrets into this file or commit real `.env.production` values.

## Recommended Architecture

- Next.js frontend runs as a production Node server on `127.0.0.1:3000`.
- Rust Axum API runs on `127.0.0.1:8080`.
- PostgreSQL runs as a managed database or a server-local PostgreSQL service/container.
- Runtime storage stores generated TTS audio and uploaded voice samples under `STORAGE_DIR`; local disk is acceptable for a small rehearsal, but object storage should replace local disk before larger use.
- Nginx, Caddy, another reverse proxy, or Cloudflare Tunnel terminates HTTPS and routes traffic to the local frontend and API.

Student-facing UI is Korean for the Dimigo beta. English passages, English examples, definitions, generated Simple English explanations, paper titles/abstracts, and student-written English remain in English so Lingovector teaches English-first thinking with Korean support instead of translation memorization.

Expected public routes:

- `https://YOUR_BETA_FRONTEND_HOST/` -> Next.js frontend
- `https://YOUR_BETA_API_HOST/health` -> Axum API health endpoint
- `https://YOUR_BETA_API_HOST/media/...` -> Axum API media endpoint

Expected internal ports:

- Frontend: `3000`
- API: `8080`
- PostgreSQL: `5432`

## Required Environment

Copy the template and fill it outside git:

```bash
cp .env.production.example .env.production
```

Required backend values:

- `ENVIRONMENT=production`
- `DEV_AUTH=false`
- `DATABASE_URL`
- `JWT_SECRET`
- `GOOGLE_CLIENT_ID`
- `ALLOWED_EMAIL_DOMAIN=dimigo.hs.kr`
- `CORS_ORIGINS`
- `STORAGE_DIR`
- `DIAGNOSTICS_ENABLED=false`

Required frontend build values:

- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- `NEXT_PUBLIC_DIAGNOSTICS_ENABLED=false`

Optional real provider values:

- `LLM_API_URL`, `LLM_API_KEY`, `LLM_MODEL`
- `SUPERTONE_API_KEY`, `SUPERTONE_BASE_URL`
- `SUPERTONE_LOCAL_TTS_URL`
- `SUPERTONE_LOCAL_VOICE_URL`
- `PRONUNCIATION_PROVIDER_URL`
- `ARXIV_REAL_ENABLED`

Production startup fails fast when required env vars are missing or unsafe. `DEV_AUTH=true`, default JWT secrets, short JWT secrets, wildcard CORS, localhost CORS, and non-HTTPS production CORS origins are rejected.

## Local Staging Rehearsal

1. Prepare a local production env file:

   ```bash
   cp .env.production.example .env.production
   ```

2. Fill placeholder values. For local compose rehearsal with the included Postgres service, use a local-only database URL similar to:

   ```text
   DATABASE_URL=postgres://lingovector:YOUR_LOCAL_REHEARSAL_PASSWORD@postgres:5432/lingovector
   POSTGRES_USER=lingovector
   POSTGRES_PASSWORD=YOUR_LOCAL_REHEARSAL_PASSWORD
   POSTGRES_DB=lingovector
   NEXT_PUBLIC_API_BASE_URL=https://YOUR_BETA_API_HOST
   CORS_ORIGINS=https://YOUR_BETA_FRONTEND_HOST
   ```

3. Build production images:

   ```bash
   docker compose --env-file .env.production -f docker-compose.production.example.yml build
   ```

The compose file reads service env from `.env.production` by default. For a dry config check against the committed template, set `LINGOVECTOR_ENV_FILE=.env.production.example` and provide placeholder shell values for required substitutions.

The example compose file includes PostgreSQL for rehearsal. If production uses an external managed database, remove or ignore the `postgres` service, remove `api.depends_on.postgres`, and set `DATABASE_URL` to the external database over TLS if supported by the provider.

4. Start the rehearsal stack:

   ```bash
   docker compose --env-file .env.production -f docker-compose.production.example.yml up -d
   ```

5. Check health:

   ```bash
   curl -fsS http://127.0.0.1:8080/health
   docker compose --env-file .env.production -f docker-compose.production.example.yml ps
   docker compose --env-file .env.production -f docker-compose.production.example.yml logs --tail=100 api
   ```

6. Run production-mode checks:

   ```bash
   curl -fsS http://127.0.0.1:8080/health
   ```

   For a production-mode rehearsal with `ENVIRONMENT=production`, `DEV_AUTH=true` is rejected by design, so the dev-token smoke scripts will not authenticate. Use manual browser testing with Google OAuth for the production-mode compose stack.

   To exercise scripted smoke tests separately, run the normal local dev API with `DEV_AUTH=true`:

   ```bash
   npm run test:api-smoke
   npm run test:tts-smoke
   npm run test:learning-quality
   npm run test:arxiv-smoke
   ```

7. Stop rehearsal:

   ```bash
   docker compose --env-file .env.production -f docker-compose.production.example.yml down
   ```

## Database Migration Safety

The API runs SQLx migrations at startup. Before any staging or production startup that may apply migrations:

1. Back up the database.
2. Check pending migrations.
3. Start the new API only after the backup is confirmed.

Manual migration check:

```bash
DATABASE_URL=postgres://... npm run migrate:check
```

The script uses `sqlx migrate info --source apps/api/migrations` and requires `sqlx` CLI:

```bash
cargo install sqlx-cli --no-default-features --features postgres,rustls
```

PostgreSQL backup examples:

```bash
pg_dump "$DATABASE_URL" > "backups/lingovector-$(date +%Y%m%d-%H%M%S).sql"
docker compose --env-file .env.production -f docker-compose.production.example.yml exec postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "backups/lingovector-$(date +%Y%m%d-%H%M%S).sql"
```

No destructive migrations should be run without a separate review and rollback plan.

## Logging and Observability

The API uses `tracing` and includes request spans with:

- HTTP method
- request path
- `x-request-id`

The API propagates `x-request-id` when a proxy supplies it and creates one when it is missing. Logs must not include secrets, Google ID tokens, JWTs, raw voice files, or sensitive request bodies.

Useful checks:

```bash
curl -fsS https://YOUR_BETA_API_HOST/health
docker compose --env-file .env.production -f docker-compose.production.example.yml logs --tail=200 api
```

Diagnostics are disabled in production unless `DIAGNOSTICS_ENABLED=true`. If enabled for a short admin check, call `/diagnostics/providers` from an authenticated admin test account, then disable it again.

## Storage and Privacy Operations

Runtime storage:

- Voice uploads: `STORAGE_DIR/voices`
- Generated TTS and pronunciation audio: `STORAGE_DIR/audio`
- Local verification fixture output: `local-output/learning-quality`

For a single-server beta, mount `STORAGE_DIR` as a persistent volume owned by the API runtime user. For object storage, keep the same logical separation for voice uploads and generated audio, and document the bucket retention/delete process before enabling it for students.

Inspect local usage:

```bash
STORAGE_DIR=/path/to/storage npm run ops:storage
```

Dry-run local verification cleanup:

```bash
npm run ops:cleanup-local-output
```

Delete ignored local verification output older than 7 days:

```bash
npm run ops:cleanup-local-output -- --delete
```

This cleanup script is intentionally scoped to `local-output`. Do not use it for `STORAGE_DIR` user data. For MVP beta operations, review storage weekly and manually decide whether old generated audio can be removed after confirming product expectations and privacy policy.

## Reverse Proxy Example

Example Nginx split-host configuration:

```nginx
server {
    listen 443 ssl http2;
    server_name YOUR_BETA_FRONTEND_HOST;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Request-Id $request_id;
    }
}

server {
    listen 443 ssl http2;
    server_name YOUR_BETA_API_HOST;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Request-Id $request_id;
    }
}
```

Set:

```text
CORS_ORIGINS=https://YOUR_BETA_FRONTEND_HOST
NEXT_PUBLIC_API_BASE_URL=https://YOUR_BETA_API_HOST
```

HTTPS is required for production Google sign-in and microphone recording. Google OAuth authorized JavaScript origins must include `https://YOUR_BETA_FRONTEND_HOST`. If a redirect-based OAuth flow is later added, register a production redirect URI such as `https://YOUR_BETA_FRONTEND_HOST/auth/callback` and keep the local redirect URI separate.

## Cloudflare Tunnel Notes

For Cloudflare Tunnel, route public hostnames to local services:

```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: /etc/cloudflared/YOUR_TUNNEL_ID.json

ingress:
  - hostname: YOUR_BETA_FRONTEND_HOST
    service: http://localhost:3000
  - hostname: YOUR_BETA_API_HOST
    service: http://localhost:8080
  - service: http_status:404
```

Use the same `CORS_ORIGINS` and `NEXT_PUBLIC_API_BASE_URL` values as the public HTTPS hostnames.

## Production Startup Checklist

- [ ] Code is at the intended commit.
- [ ] `.env.production` exists only on the server.
- [ ] `ENVIRONMENT=production`.
- [ ] `DEV_AUTH=false`.
- [ ] Student UI is Korean and English learning materials remain English-first.
- [ ] Google OAuth client IDs match frontend/backend env.
- [ ] `CORS_ORIGINS` is the exact HTTPS frontend origin.
- [ ] Database backup is complete.
- [ ] Migration check reviewed.
- [ ] Reverse proxy or tunnel routes HTTPS to ports `3000` and `8080`.
- [ ] `/health` returns OK.
- [ ] Manual `@dimigo.hs.kr` login succeeds.
- [ ] Voice upload/delete beta privacy copy is visible.

## Rollback Checklist

- [ ] Keep the previous image tag or commit SHA available.
- [ ] Stop the new `web` and `api` services.
- [ ] Start the previous `web` and `api` services.
- [ ] Confirm `/health`.
- [ ] Confirm Google login.
- [ ] If a migration caused data issues, stop the API before restoring a backup.
- [ ] Restore database only from a verified backup and document the restore time.
- [ ] Disable real providers by removing provider env vars if provider failures are causing the incident.
- [ ] Keep diagnostics disabled unless a short authenticated admin check is needed.
