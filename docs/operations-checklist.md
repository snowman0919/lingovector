# Lingovector Beta Operations Checklist

Use this for staging rehearsal and every beta deploy window. Do not deploy from memory.

## Pre-Deploy Checks

- [ ] Confirm the target commit SHA.
- [ ] Confirm no uncommitted changes on the server.
- [ ] Review [docs/deployment.md](deployment.md).
- [ ] Review [docs/privacy-consent-draft.md](privacy-consent-draft.md) and confirm final school/operator/legal approval before real student data or voice uploads.
- [ ] Confirm no secrets are committed.
- [ ] Confirm provider usage and expected cost/risk for this deploy.
- [ ] Confirm Korean UI policy is preserved: UI copy is Korean, but English passages, examples, definitions, and student writing remain English.
- [ ] Confirm a rollback owner and communication channel.

## Environment Validation

- [ ] `ENVIRONMENT=production`
- [ ] `DEV_AUTH=false`
- [ ] `DATABASE_URL` points to the intended database
- [ ] `JWT_SECRET` is non-default and at least 32 characters
- [ ] `GOOGLE_CLIENT_ID` is set
- [ ] `ALLOWED_EMAIL_DOMAIN=dimigo.hs.kr`
- [ ] `CORS_ORIGINS=https://lingovector.kotori9.run`
- [ ] `NEXT_PUBLIC_API_BASE_URL=/api`
- [ ] `API_PORT=8080`, `WEB_PORT=3000`, `POSTGRES_PORT=5432` or documented alternatives
- [ ] `API_HOST_PORT=18080`, `WEB_HOST_PORT=13000`, `POSTGRES_HOST_PORT=15432` or documented alternatives for this shared server
- [ ] `NEXT_PUBLIC_GOOGLE_CLIENT_ID` matches the web OAuth client
- [ ] `DIAGNOSTICS_ENABLED=false` unless a short admin check is scheduled
- [ ] `NEXT_PUBLIC_DIAGNOSTICS_ENABLED=false` for normal student builds
- [ ] `NEXT_PUBLIC_TTS_MODE` matches the approved beta TTS path (`browser_onnx`, `server`, or `mock`)
- [ ] Browser ONNX model/config files are deployed outside git if `NEXT_PUBLIC_TTS_MODE=browser_onnx`

## OAuth Check

- [ ] Google Cloud OAuth client has Authorized JavaScript origin `https://lingovector.kotori9.run`
- [ ] Local test origin remains available for staging if needed
- [ ] Verified `@dimigo.hs.kr` login succeeds
- [ ] Non-school account is rejected
- [ ] Unverified email is rejected
- [ ] Student-facing error text is understandable

## Database Backup

- [ ] Confirm database host and database name
- [ ] Run `pg_dump`
- [ ] Store backup outside the container
- [ ] Record backup filename and timestamp
- [ ] Confirm backup file size is plausible
- [ ] Confirm restore command is known before migration/startup

## Migration Check

- [ ] Install `sqlx` CLI if checking from the host
- [ ] Run `DATABASE_URL=... npm run migrate:check`
- [ ] Review pending migrations
- [ ] Confirm no destructive migration is included
- [ ] Start API only after backup is complete

## Healthcheck

- [ ] Start API
- [ ] `curl -fsS https://lingovector.kotori9.run/api/health`
- [ ] Confirm response includes `"ok": true`
- [ ] Start frontend
- [ ] Open `https://lingovector.kotori9.run`
- [ ] Confirm Cloudflare Tunnel routes `lingovector.kotori9.run /api/*` to `http://api:${API_PORT}` before the web fallback route to `http://web:${WEB_PORT}`
- [ ] Confirm Postgres is not publicly reachable

## Smoke Tests

- [ ] Staging smoke without token: `STAGING_API_BASE_URL=https://lingovector.kotori9.run/api npm run test:staging-smoke`
- [ ] Staging smoke with short-lived operator token when available: `STAGING_API_BASE_URL=https://lingovector.kotori9.run/api STAGING_AUTH_TOKEN=... npm run test:staging-smoke`
- [ ] Full authenticated smoke with operator token: `LINGOVECTOR_API_BASE_URL=https://lingovector.kotori9.run/api LINGOVECTOR_AUTH_TOKEN=... npm run test:authenticated-smoke`
- [ ] Provider preflight without network calls: `PREFLIGHT_ENV_FILE=.env.staging npm run test:provider-preflight`
- [ ] Local development dev-token smoke only when running a separate dev API with `DEV_AUTH=true`: `npm run test:api-smoke`
- [ ] TTS smoke: `npm run test:tts-smoke`
- [ ] Learning-quality fixtures: `npm run test:learning-quality`
- [ ] arXiv smoke: `npm run test:arxiv-smoke`
- [ ] Manual production smoke with Google OAuth when `DEV_AUTH=false`

## Provider Diagnostics

- [ ] Keep diagnostics disabled for normal production
- [ ] If needed, temporarily set `DIAGNOSTICS_ENABLED=true`
- [ ] Sign in with an authorized test account
- [ ] Check `/diagnostics/providers`
- [ ] Confirm no secrets or raw request bodies appear
- [ ] Set `DIAGNOSTICS_ENABLED=false` again and restart API

## Beta User Test

- [ ] Student signs in with `@dimigo.hs.kr`
- [ ] First-use Korean consent gate appears for a new test account
- [ ] Required consent acceptance activates the dashboard
- [ ] Main student UI labels and instructions are Korean
- [ ] Student pastes a short passage
- [ ] Sentence analysis appears
- [ ] Simple English explanation appears before detailed Korean support
- [ ] Student clicks a word and sees word details
- [ ] TTS plays through browser ONNX, server fallback, or mock mode as intentionally configured
- [ ] Voice consent copy is visible
- [ ] Voice upload/delete succeeds in the selected provider mode
- [ ] Pronunciation score appears
- [ ] Writing Tutor returns 7 scores and before/after revision
- [ ] arXiv recommendations load and an abstract opens in the study flow

## Storage and Privacy

- [ ] Confirm `STORAGE_DIR` path or mounted volume
- [ ] Run `STORAGE_DIR=/path/to/storage npm run ops:storage`
- [ ] Confirm voice/audio files are not world-readable on the host
- [ ] Confirm backup policy does not unintentionally expose voice samples
- [ ] Confirm `개인정보 및 계정` can delete voice data for a test account
- [ ] Confirm account deletion/consent withdrawal removes the test account and blocks the old token
- [ ] Do not upload real student voice until consent/deletion behavior has passed this checklist
- [ ] Review `local-output/learning-quality` and clean old local outputs if needed

## Rollback Plan

- [ ] Previous image tag or commit is available
- [ ] Previous `.env.production` is available
- [ ] Database backup exists
- [ ] Stop current frontend/API
- [ ] Start previous frontend/API
- [ ] Check `/health`
- [ ] Run one Google OAuth login
- [ ] Notify beta users if service was interrupted

## Incident Response Basics

- [ ] Capture timeline: start time, detection source, user impact
- [ ] Preserve logs without exposing secrets
- [ ] Disable real provider env vars if provider failures create user impact or cost risk
- [ ] Disable diagnostics after investigation
- [ ] If privacy-related, stop affected feature first and preserve evidence
- [ ] Record root cause and follow-up action before next beta window
