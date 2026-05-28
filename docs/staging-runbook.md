# Lingovector Staging Rehearsal Runbook

Use this runbook to start a production-like staging instance without deploying production. Staging is for operator verification, OAuth setup checks, provider readiness, and beta rehearsal only.

Do not use real student data in staging unless a teacher/admin has explicitly approved the test and privacy handling. Prefer short synthetic passages, test voice clips, and a dedicated `@dimigo.hs.kr` staging account.

## Prerequisites

- Docker Desktop or Docker Engine with Compose v2.
- Node.js 22+ and npm for smoke scripts.
- Rust stable only if running local non-Docker checks.
- Access to a staging hostname or tunnel, for example:
  - Frontend: `https://staging.lingovector.example.com`
  - API: `https://api-staging.lingovector.example.com`
- Google OAuth web client configured for the staging frontend origin.
- A staging PostgreSQL database or the compose-provided PostgreSQL service.
- No production secrets copied casually into staging.

## Create `.env.staging`

Copy the template outside git:

```bash
cp .env.staging.example .env.staging
```

Use staging-only values:

```text
APP_ENV=staging
DEV_AUTH=false
DATABASE_URL=postgres://lingovector_staging:STAGING_PASSWORD@postgres:5432/lingovector_staging
JWT_SECRET=STAGING_ONLY_LONG_RANDOM_VALUE_AT_LEAST_32_CHARS
GOOGLE_CLIENT_ID=YOUR_STAGING_GOOGLE_CLIENT_ID
ALLOWED_EMAIL_DOMAIN=dimigo.hs.kr
CORS_ORIGINS=https://YOUR_STAGING_FRONTEND_HOST
STORAGE_DIR=/app/storage
DIAGNOSTICS_ENABLED=false
NEXT_PUBLIC_API_BASE_URL=https://YOUR_STAGING_API_HOST
NEXT_PUBLIC_GOOGLE_CLIENT_ID=YOUR_STAGING_GOOGLE_CLIENT_ID
NEXT_PUBLIC_DIAGNOSTICS_ENABLED=false
POSTGRES_USER=lingovector_staging
POSTGRES_PASSWORD=STAGING_PASSWORD
POSTGRES_DB=lingovector_staging
```

Provider env vars are optional. Leave `LLM_API_URL`, `LLM_API_KEY`, `SUPERTONE_API_KEY`, `SUPERTONE_LOCAL_TTS_URL`, `SUPERTONE_LOCAL_VOICE_URL`, and `PRONUNCIATION_PROVIDER_URL` empty for mock mode. Set `ARXIV_REAL_ENABLED=false` unless intentionally checking the real arXiv path.

`APP_ENV=staging` is production-like in the backend: required env vars are validated, HTTPS CORS is required, diagnostics are off by default, and `DEV_AUTH=true` is rejected.

Use a staging-specific Compose project name so local rehearsal volumes do not collide with other Lingovector compose runs:

```bash
export COMPOSE_PROJECT_NAME=lingovector-staging
```

## OAuth Staging Setup

In Google Cloud Console, configure the staging OAuth web client:

- Authorized JavaScript origin: `https://YOUR_STAGING_FRONTEND_HOST`
- Backend `GOOGLE_CLIENT_ID`: same staging web client ID.
- Frontend `NEXT_PUBLIC_GOOGLE_CLIENT_ID`: same staging web client ID.
- If a redirect-based OAuth flow is later added, use a staging redirect URI such as `https://YOUR_STAGING_FRONTEND_HOST/auth/callback`.

The `@dimigo.hs.kr` restriction must still apply in staging. Verify that a non-school Google account is rejected.

## Cloudflare Tunnel Staging Setup

Cloudflare Tunnel is the expected public entrypoint for staging. Prefer the Compose `cloudflared` overlay:

```bash
export COMPOSE_PROJECT_NAME=lingovector-staging
export LINGOVECTOR_ENV_FILE=.env.staging
export CLOUDFLARE_TUNNEL_TOKEN=PASTE_TOKEN_IN_SHELL_ONLY
```

In Cloudflare Zero Trust, route public hostnames to internal Docker services:

```text
staging.lingovector.example.com      -> http://web:3000
api-staging.lingovector.example.com  -> http://api:8080
```

Then use:

```text
CORS_ORIGINS=https://staging.lingovector.example.com
NEXT_PUBLIC_API_BASE_URL=https://api-staging.lingovector.example.com
```

Do not publish Postgres. Do not commit the tunnel token.

## Build

Build production-like images using the staging env file:

```bash
docker compose --env-file .env.staging \
  -f docker-compose.production.example.yml \
  -f docker-compose.cloudflare.example.yml build
```

To build individual images:

```bash
docker build -f apps/api/Dockerfile -t lingovector-api:staging-rehearsal .
docker build \
  -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://YOUR_STAGING_API_HOST \
  --build-arg NEXT_PUBLIC_GOOGLE_CLIENT_ID=YOUR_STAGING_GOOGLE_CLIENT_ID \
  --build-arg NEXT_PUBLIC_DIAGNOSTICS_ENABLED=false \
  -t lingovector-web:staging-rehearsal .
```

## Start

Start the stack locally, bound to localhost ports:

```bash
LINGOVECTOR_ENV_FILE=.env.staging \
docker compose --env-file .env.staging \
  -f docker-compose.production.example.yml \
  -f docker-compose.cloudflare.example.yml up -d
```

Check container state:

```bash
docker compose --env-file .env.staging \
  -f docker-compose.production.example.yml \
  -f docker-compose.cloudflare.example.yml ps
```

## Healthcheck

From the host:

```bash
curl -fsS http://127.0.0.1:8080/health
```

Through the staging API hostname or tunnel:

```bash
curl -fsS https://api-staging.lingovector.example.com/health
```

Expected response includes `"ok": true` and `"database": {"ready": true}`.

## Logs Check

Inspect recent logs without printing env files or secrets:

```bash
docker compose --env-file .env.staging -f docker-compose.production.example.yml logs --tail=200 api
docker compose --env-file .env.staging -f docker-compose.production.example.yml logs --tail=100 web
docker compose --env-file .env.staging -f docker-compose.production.example.yml -f docker-compose.cloudflare.example.yml logs --tail=100 cloudflared
```

Logs should show request paths and request IDs, not tokens, secrets, raw voice files, or sensitive request bodies.

## Smoke Test Sequence

Production-like staging uses Google OAuth, so dev-token scripts are not expected to pass unless running a separate local dev API.

Unauthenticated staging checks:

```bash
STAGING_API_BASE_URL=https://api-staging.lingovector.example.com npm run test:staging-smoke
```

Authenticated staging checks:

1. Sign in through the staging frontend with a verified `@dimigo.hs.kr` account.
2. Obtain a short-lived bearer token using browser developer tools only for this operator check.
3. Run:

   ```bash
   STAGING_API_BASE_URL=https://YOUR_STAGING_API_HOST \
   STAGING_AUTH_TOKEN=PASTE_TOKEN_IN_SHELL_ONLY \
   npm run test:staging-smoke
   ```

The script does not print the token. It checks `/health`, protected-route rejection, `/me`, diagnostics if enabled, passage analysis, TTS metadata, and arXiv title/abstract behavior.

For a deeper authenticated check that also covers word inspection, pronunciation scoring, writing tutor, and arXiv open:

```bash
LINGOVECTOR_API_BASE_URL=https://YOUR_STAGING_API_HOST \
LINGOVECTOR_AUTH_TOKEN=PASTE_TOKEN_IN_SHELL_ONLY \
npm run test:authenticated-smoke
```

Unset the token after testing:

```bash
unset LINGOVECTOR_AUTH_TOKEN STAGING_AUTH_TOKEN
```

Local dev smoke scripts remain useful for non-staging API verification:

```bash
npm run test:api-smoke
npm run test:tts-smoke
npm run test:learning-quality
npm run test:arxiv-smoke
```

## Provider Diagnostics Verification

Diagnostics are off by default in staging. To verify provider readiness:

1. Temporarily set `DIAGNOSTICS_ENABLED=true`.
2. Set `NEXT_PUBLIC_DIAGNOSTICS_ENABLED=true` only if you need the frontend diagnostics tab.
3. Restart the API/web as needed.
4. Sign in with an authorized staging account.
5. Run authenticated staging smoke or open `/diagnostics/providers`.
6. Confirm provider modes are `mock`, `configured`, `reachable`, `failed`, or `disabled`.
7. Confirm no secrets, API keys, raw tokens, or raw request bodies appear.
8. Set diagnostics back to false and restart.

## Storage Verification

Confirm runtime storage is mounted and writable:

```bash
STORAGE_DIR=/path/to/staging/storage npm run ops:storage
docker compose --env-file .env.staging -f docker-compose.production.example.yml exec api sh -lc 'du -sh /app/storage && find /app/storage -maxdepth 2 -type f | head -n 25'
```

Voice uploads are stored under `STORAGE_DIR/voices`; generated TTS/pronunciation audio is under `STORAGE_DIR/audio`. Do not manually delete staging user data unless the staging owner approves it.

## Rollback

For a staging rehearsal rollback:

1. Preserve logs:

   ```bash
   mkdir -p logs/staging
   docker compose --env-file .env.staging -f docker-compose.production.example.yml logs --no-color > "logs/staging/compose-$(date +%Y%m%d-%H%M%S).log"
   ```

2. Back up the staging DB:

   ```bash
   mkdir -p backups
   docker compose --env-file .env.staging -f docker-compose.production.example.yml exec -T postgres \
     sh -lc 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "backups/staging-$(date +%Y%m%d-%H%M%S).sql"
   ```

3. Stop current containers:

   ```bash
   docker compose --env-file .env.staging -f docker-compose.production.example.yml stop web api
   ```

4. Checkout the previous commit or retag the previous images.
5. Rebuild/restart.
6. Confirm `/health`, OAuth login, passage analysis, TTS, voice upload/delete, and writing tutor.

## Shutdown

Stop containers but keep volumes:

```bash
docker compose --env-file .env.staging -f docker-compose.production.example.yml down
```

This preserves staging PostgreSQL and storage volumes.

## Cleanup

Clean local verification outputs only:

```bash
npm run ops:cleanup-local-output
npm run ops:cleanup-local-output -- --delete
```

Remove staging containers and networks while preserving named volumes:

```bash
docker compose --env-file .env.staging -f docker-compose.production.example.yml down
```

Remove staging volumes only after confirming the data is disposable:

```bash
docker compose --env-file .env.staging -f docker-compose.production.example.yml down --volumes
```

Do not run `down --volumes` against a production compose project or any staging project containing real student data.

## Common Failures

- `DEV_AUTH cannot be enabled`: staging is production-like. Set `DEV_AUTH=false`. For isolated local dev-token tests, use the normal development API instead.
- `DATABASE_URL is required`: fill `.env.staging` with a staging DB URL.
- `CORS_ORIGINS must contain explicit https origins`: use the exact staging frontend HTTPS origin, not localhost or `*`.
- Google login button missing: set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` at web build time and rebuild the web image.
- Google login rejected: confirm `GOOGLE_CLIENT_ID`, authorized JavaScript origin, and verified `@dimigo.hs.kr` account.
- Browser cannot call API: confirm `NEXT_PUBLIC_API_BASE_URL`, reverse proxy/tunnel route, HTTPS certificate, and `CORS_ORIGINS`.
- Diagnostics returns 404: expected when disabled. Temporarily enable `DIAGNOSTICS_ENABLED=true` only for an operator check.
- TTS returns mock provider: expected unless `SUPERTONE_API_KEY` or `SUPERTONE_LOCAL_TTS_URL` is configured.
- Voice upload fails: confirm file type, consent text includes agreement, `STORAGE_DIR` is writable, and storage volume is mounted.
