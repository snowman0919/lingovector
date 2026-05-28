# Beta Operator Handoff

Use this checklist when handing Lingovector to the staging/beta operator.

## Prepare

- [ ] Confirm target commit.
- [ ] Confirm no secrets are committed.
- [ ] Copy `.env.staging.example` to `.env.staging`.
- [ ] Fill staging-only values. Do not reuse production secrets casually.
- [ ] Confirm Korean UI policy: UI is Korean; English passages, examples, definitions, and student writing remain English.
- [ ] Confirm no real student data will be used in staging unless explicitly approved.

## Start Staging

- [ ] `export COMPOSE_PROJECT_NAME=lingovector-staging`
- [ ] Confirm port env values for this shared server, for example `API_PORT=8080`, `WEB_PORT=3000`, `API_HOST_PORT=18080`, `WEB_HOST_PORT=13000`
- [ ] Configure Cloudflare Tunnel single hostname rules: `lingovector.kotori9.run /api/*` -> `http://api:${API_PORT}`, then default path -> `http://web:${WEB_PORT}`
- [ ] Set `CLOUDFLARE_TUNNEL_TOKEN` outside git
- [ ] Build: `docker compose --env-file .env.staging -f docker-compose.production.example.yml build`
- [ ] Start: `LINGOVECTOR_ENV_FILE=.env.staging docker compose --env-file .env.staging -f docker-compose.production.example.yml -f docker-compose.cloudflare.example.yml up -d`
- [ ] Health: `curl -fsS https://lingovector.kotori9.run/api/health`
- [ ] Logs: inspect API/web logs for errors and confirm no secrets are printed.

## OAuth

- [ ] Configure Google OAuth Authorized JavaScript origin: `https://lingovector.kotori9.run`.
- [ ] Set backend `GOOGLE_CLIENT_ID`.
- [ ] Set frontend `NEXT_PUBLIC_GOOGLE_CLIENT_ID` and rebuild web image.
- [ ] Sign in with a verified `@dimigo.hs.kr` account.
- [ ] Complete the Korean first-login privacy consent gate.
- [ ] Confirm non-Dimigo account is rejected.

## Smoke

- [ ] Unauthenticated smoke:

  ```bash
  STAGING_API_BASE_URL=https://lingovector.kotori9.run/api npm run test:staging-smoke
  ```

- [ ] Capture a short-lived token from the signed-in browser session.
- [ ] Do not paste the token into commits, screenshots, logs, or shared chats.
- [ ] Authenticated smoke:

  ```bash
  LINGOVECTOR_API_BASE_URL=https://lingovector.kotori9.run/api \
  LINGOVECTOR_AUTH_TOKEN=PASTE_TOKEN_IN_SHELL_ONLY \
  npm run test:authenticated-smoke
  ```

- [ ] `unset LINGOVECTOR_AUTH_TOKEN`

## Providers

- [ ] Run preflight:

  ```bash
  PREFLIGHT_ENV_FILE=.env.staging npm run test:provider-preflight
  ```

- [ ] Enable only one real provider at a time.
- [ ] Prefer browser Supertonic ONNX TTS when model/schema assets are ready; otherwise document `server` or `mock` fallback.
- [ ] Run the relevant provider smoke command.
- [ ] Review logs for sanitized metadata only.
- [ ] Disable or roll back provider env vars if output quality, cost, or privacy behavior is unclear.

## Learning Quality

- [ ] Run `npm run test:learning-quality` against the intended API mode.
- [ ] Review `local-output/learning-quality`.
- [ ] Confirm Simple English explanation appears before Korean support.
- [ ] Confirm morphology avoids forced etymology.
- [ ] Confirm writing scores stay 0-100 across seven dimensions.

## Decision

- [ ] Verify `개인정보 및 계정`: consent history, voice data delete, consent withdrawal/account deletion with a test account.
- [ ] Do not upload real student voice until consent/deletion flow has been verified.
- [ ] Approve beta start only if OAuth, smoke checks, provider mode, consent gate, privacy copy, voice delete, account deletion, and rollback are verified.
- [ ] Reject beta start if real provider behavior, auth, storage, or privacy handling is uncertain.
- [ ] Record known limitations and selected provider modes before inviting students.
