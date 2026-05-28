# Lingovector v0.3 MVP

Lingovector is an AI English tutor for Korean high school students. The v0.3 MVP focuses on English as a tool for thinking and expression: sentence logic, vocabulary nuance, pronunciation, and writing feedback.

The main student UI is Korean for Dimigo beta users. English passages, examples, definitions, generated Simple English explanations, and student-written English remain in English so the learning flow stays English-first, with Korean used as support rather than translation memorization.

## Stack

- Frontend: Next.js + TypeScript
- Backend: Rust + Axum
- Database: PostgreSQL via SQLx migrations
- Auth: Google ID token verification on the backend, restricted to verified `@dimigo.hs.kr` accounts
- Providers: trait-based LLM, TTS, voice cloning, pronunciation, and arXiv providers
- Preferred beta TTS: browser-side Supertonic ONNX via ONNX Runtime Web when model assets are deployed
- Default mode: mock providers when external API keys or local provider URLs are absent

## Run Locally on macOS

Prerequisites: Docker Desktop running, Rust stable, Node.js 22+ or newer, and npm.

1. Copy env values and keep `DEV_AUTH=true` for local login:

   ```bash
   cp .env.example .env
   ```

2. Start PostgreSQL:

   ```bash
   npm run dev:db
   ```

3. Install frontend dependencies:

   ```bash
   npm install
   ```

4. Start the Rust API:

   ```bash
   npm run dev:api
   ```

5. In another terminal, check API and DB readiness:

   ```bash
   npm run dev:health
   ```

   To exercise the main backend flow through HTTP while the API is running:

   ```bash
   npm run test:api-smoke
   ```

   Optional provider verification scripts while the API is running:

   ```bash
   npm run test:tts-smoke
   npm run test:learning-quality
   ARXIV_REAL_ENABLED=true npm run test:arxiv-smoke
   ```

6. Start the frontend:

   ```bash
   npm run dev:web
   ```

7. Open `http://localhost:3000`.

For local development without Google OAuth, sign in with:

```text
dev:student@dimigo.hs.kr
```

The dev token is accepted only when `DEV_AUTH=true`. Real Google login still requires `GOOGLE_CLIENT_ID` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.

On first login, users must accept the current Korean beta privacy consent sections before normal learning routes are available. If the consent version changes, the app requires re-consent.

## Environment Variables

- `ENVIRONMENT`: use `development`, `test`, or `production`. Production enables fail-fast safety validation.
- `API_HOST`: API bind host. Default `0.0.0.0`; `BIND_ADDR` still works as a legacy override.
- `API_PORT`: API container/internal port. Default `8080`.
- `WEB_PORT`: Next.js production container/internal port. Default `3000`.
- `POSTGRES_PORT`: PostgreSQL container/internal port. Default `5432`.
- `API_HOST_PORT`: localhost host port published by production Compose for operator checks. Recommended `18080`.
- `WEB_HOST_PORT`: localhost host port published by production Compose for operator checks. Recommended `13000`.
- `POSTGRES_HOST_PORT`: localhost-only PostgreSQL host port for operator maintenance. Recommended `15432`; do not bind Postgres publicly.
- `DATABASE_URL`: PostgreSQL connection string. Required in production.
- `JWT_SECRET`: server-side session token signing secret. In production it must be present, non-default, and at least 32 characters.
- `DEV_AUTH`: allows `dev:*@dimigo.hs.kr` tokens only when explicitly `true`. Production rejects `DEV_AUTH=true`.
- `GOOGLE_CLIENT_ID`: OAuth client ID used to verify Google ID token audience. Required in production.
- `ALLOWED_EMAIL_DOMAIN`: must be `dimigo.hs.kr` for the school beta.
- `CORS_ORIGINS`: comma-separated frontend origins. Production requires explicit `https://` origins, not localhost or `*`.
- `STORAGE_DIR`: local audio and voice sample storage directory.
- `NEXT_PUBLIC_TTS_MODE`: `browser_onnx`, `server`, or `mock`. Browser ONNX is preferred for beta once model/schema files are deployed.
- `NEXT_PUBLIC_SUPERTONIC_ONNX_MODEL_URL`: public ONNX model URL, default `/models/supertonic/model.onnx`.
- `NEXT_PUBLIC_SUPERTONIC_ONNX_CONFIG_URL`: public adapter/schema config URL. Required before real browser ONNX audio generation.
- `SUPERTONE_API_KEY`: optional server-side Supertone/Supertonic fallback for TTS and voice paths. Empty uses mocks unless a local URL is set.
- `SUPERTONE_BASE_URL`: Supertone API base URL.
- `SUPERTONE_LOCAL_TTS_URL`: optional local TTS server endpoint returning audio bytes.
- `SUPERTONE_LOCAL_VOICE_URL`: optional local voice-cloning endpoint returning `voice_id` or `id`.
- `LLM_API_URL`: OpenAI-compatible chat completions endpoint for real analysis and writing feedback.
- `LLM_API_KEY`: bearer token for `LLM_API_URL`.
- `LLM_MODEL`: model name sent to the OpenAI-compatible endpoint.
- `PRONUNCIATION_PROVIDER_URL`: optional local pronunciation scoring endpoint returning JSON.
- `ARXIV_REAL_ENABLED`: when `true`, fetches title/abstract recommendations from the arXiv API with in-memory cache.
- `DIAGNOSTICS_ENABLED`: enables `/api/diagnostics/providers` outside development/test. The endpoint never returns secrets.
- `NEXT_PUBLIC_API_BASE_URL`: frontend API base. Use `/api` for the single-domain Cloudflare deployment, or an absolute API origin for split-host/dev deployments.
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`: enables the Google Identity Services button.
- `NEXT_PUBLIC_DIAGNOSTICS_ENABLED`: shows the dev provider status tab in production builds only when explicitly `true`. Development builds show it automatically.

Never commit real secrets.

## Production Safety

Production startup fails fast when required beta settings are missing or unsafe:

- `DEV_AUTH=true` is rejected.
- `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `ALLOWED_EMAIL_DOMAIN`, and `CORS_ORIGINS` are required.
- `JWT_SECRET=dev-only-change-me`, short JWT secrets, wildcard CORS, localhost CORS, and non-HTTPS production CORS origins are rejected.
- `/api/diagnostics/providers` is disabled in production unless `DIAGNOSTICS_ENABLED=true`.
- The frontend diagnostics panel is hidden in production unless `NEXT_PUBLIC_DIAGNOSTICS_ENABLED=true`.
- Required privacy consent is enforced before protected learning routes.
- Users can delete voice data, withdraw required consent, or delete their account from `개인정보 및 계정`.
- The Korean consent copy is a beta draft. Complete final school/operator/legal review before real student data or voice uploads.

Mock providers remain visible in developer diagnostics and smoke scripts. The student dashboard avoids exposing provider jargon during normal production use.

## Google OAuth Beta Setup

1. Create or select a Google Cloud project for the Lingovector beta.
2. Configure the OAuth consent screen for an internal/school beta audience as appropriate for the school account setup.
3. Create an OAuth 2.0 Web application client.
4. Add local authorized JavaScript origin:

   ```text
   http://localhost:3000
   ```

5. Add production authorized JavaScript origin:

   ```text
   https://lingovector.kotori9.run
   ```

6. Authorized redirect URIs can remain empty because the current Google Identity Services flow does not use a redirect/callback route. If a redirect-based OAuth flow is later added, register explicit callback URIs.

7. Set single-domain production routing values:

   ```text
   CORS_ORIGINS=https://lingovector.kotori9.run
   NEXT_PUBLIC_API_BASE_URL=/api
   ```

8. Set `GOOGLE_CLIENT_ID` on the backend and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` on the frontend to the OAuth web client ID.
9. Verify login manually:

- A verified `student@dimigo.hs.kr` account can sign in.
- A non-`@dimigo.hs.kr` account is rejected.
- An unverified email is rejected.
- Production UI does not show the local development token field.
- Student-facing auth errors mention school Google account requirements clearly.

## Real Provider Setup

All provider integrations are env-gated. Leave values empty to use mock providers for local development.

### LLM Provider

- Set `LLM_API_URL` to an OpenAI-compatible chat completions endpoint.
- Set `LLM_API_KEY` only in the runtime environment, never in git.
- Set `LLM_MODEL` to the model name expected by that endpoint.
- Verify with:

  ```bash
  npm run test:api-smoke
  npm run test:learning-quality
  ```

Review JSON outputs under `local-output/learning-quality/` for simple-English-first explanations, detailed Korean support, nuance, meaning flow, and conservative morphology.

### Browser Supertonic ONNX TTS

- Set `NEXT_PUBLIC_TTS_MODE=browser_onnx`.
- Deploy model/config assets outside git. Do not commit ONNX model files.
- See [docs/supertonic-onnx.md](docs/supertonic-onnx.md).
- If the schema/model is absent, the UI shows a Korean fallback message and uses server/mock TTS.

### Server-side Supertone/Supertonic Fallback

- For a local server, set `SUPERTONE_LOCAL_TTS_URL` to the local endpoint that returns audio bytes.
- For API mode, set `SUPERTONE_API_KEY` and optionally `SUPERTONE_BASE_URL`.
- Verify with:

  ```bash
  npm run test:tts-smoke
  ```

The response should include `provider`, `audio_url`, and `spoken_words` timing metadata.

### Voice Cloning

- For a local voice server, set `SUPERTONE_LOCAL_VOICE_URL`.
- For API mode, set `SUPERTONE_API_KEY`.
- Verify upload/delete through `npm run test:api-smoke`.
- Confirm the UI consent text is shown and deletion reports success.

### Pronunciation Provider

- Set `PRONUNCIATION_PROVIDER_URL` to an HTTP endpoint that accepts multipart audio and target text.
- Empty value uses the mock scorer.
- Verify through `npm run test:api-smoke` and the Pronunciation tab.

### arXiv Real Fetch

- Set `ARXIV_REAL_ENABLED=true` to fetch title/abstract recommendations from arXiv.
- Verify with:

  ```bash
  ARXIV_REAL_ENABLED=true npm run test:arxiv-smoke
  ```

Real arXiv results are cached in memory and remain title/abstract-only.

## Beta Checklist

Use [docs/beta-checklist.md](docs/beta-checklist.md) before inviting students.

## Deployment Rehearsal

The preferred public deployment is a single Cloudflare Tunnel hostname:

```text
https://lingovector.kotori9.run/      -> web
https://lingovector.kotori9.run/api/  -> API
```

This avoids a separate predictable API subdomain and keeps OAuth/CORS on one origin. It is not a security boundary; auth, safe CORS, disabled diagnostics, `DEV_AUTH=false`, and secret handling still matter.

On shared Linux servers, keep container ports stable and move only localhost host ports as needed:

```text
API_PORT=8080
WEB_PORT=3000
POSTGRES_PORT=5432
API_HOST_PORT=18080
WEB_HOST_PORT=13000
POSTGRES_HOST_PORT=15432
```

Cloudflare Tunnel should target Docker service names and internal ports, for example `http://api:8080` and `http://web:3000`. Host ports are for local operator checks and systemd `cloudflared`; Postgres must stay localhost-only.

Use [docs/linux-server-runbook.md](docs/linux-server-runbook.md) and [docs/cloudflare-tunnel.md](docs/cloudflare-tunnel.md) for the Linux server plus Cloudflare Tunnel path. Use [docs/staging-runbook.md](docs/staging-runbook.md) for production-like staging rehearsal. Use [docs/oauth-setup.md](docs/oauth-setup.md) and [docs/provider-onboarding.md](docs/provider-onboarding.md) for real OAuth/provider setup. Use [docs/beta-operator-handoff.md](docs/beta-operator-handoff.md) for the human handoff checklist. Use [docs/deployment.md](docs/deployment.md) for the deployment rehearsal runbook. Use [docs/operations-checklist.md](docs/operations-checklist.md) during each beta deploy window.

Review [docs/privacy-consent-draft.md](docs/privacy-consent-draft.md) before beta. It is an operator-review-required draft, not legal advice.

## Implemented MVP Features

- Login with backend-verified Google token path, `email_verified`, and hosted-domain/domain enforcement for `@dimigo.hs.kr`.
- Explicit `DEV_AUTH=true` development login.
- Protected API routes using signed backend JWTs.
- Health endpoint with database readiness at `/health`.
- Public API route aliases under `/api`, including `/api/health`; root routes remain available for local compatibility and container healthchecks.
- Authenticated provider diagnostics at `/api/diagnostics/providers`, hidden in production unless `DIAGNOSTICS_ENABLED=true`.
- Passage input as the authenticated landing workflow.
- Sentence splitting and strict JSON-schema LLM provider path with safe mock fallback.
- Separate POS and sentence-structure visualizations.
- Vocabulary inspection with definition, core concept, contextual reading, Korean support, and conservative morphology.
- TTS endpoint with mock WAV generation, optional local TTS endpoint, or Supertone API path; word timing metadata is returned for highlighting.
- Voice sample upload with explicit consent text, consent version, metadata, saved voice profile, and delete endpoint.
- Browser recording and pronunciation scoring with consistent stored score JSON and optional local scorer.
- Writing prompt generation, 0-100 scoring across seven fixed dimensions, Korean-like translated English detection, before/after revision, and explanation.
- arXiv recommendations across Security, AI, Robotics, Physics, Chemistry, and Biology via real arXiv API when enabled, with mock fallback and title/abstract-only study flow.
- Learning records for passages, sentences, unknown words, voice profiles, pronunciation records, writing submissions, and review history.

## Commands

```bash
npm run format:api
npm run clippy:api
npm run migrate:check
npm run ops:storage
npm run ops:cleanup-local-output
npm run test:api
npm run test:api-smoke
npm run test:tts-smoke
npm run test:learning-quality
npm run test:arxiv-smoke
npm run test:web
npm run lint
npm --workspace apps/web run typecheck
npm run build
```

## Notes

- Mock providers remain available for offline development. Real providers are env-gated and fall back safely if output is invalid or unavailable.
- The Supertone/Supertonic-3 HTTP paths are integration-ready but may need endpoint/body adjustment for the exact deployed Supertone account or local server.
- Uploaded audio is stored on local disk under `STORAGE_DIR`; production should use object storage, retention controls, and a visible deletion/audit policy.
- Voice sample upload stores consent version and metadata. Deleting a voice profile removes the database row and attempts to remove the stored local audio file.
- Learning-quality fixture outputs are written under `local-output/learning-quality/` and are intentionally ignored by git.
- `npm audit --omit=dev` may report advisories inherited through Next.js dependencies until upstream patched releases are available.

## Provider Diagnostics

`GET /diagnostics/providers` requires login. In development and test it is enabled by default; in production set `DIAGNOSTICS_ENABLED=true`. The response uses provider modes `mock`, `configured`, `reachable`, `failed`, or `disabled` and returns sanitized metadata only:

```json
{
  "enabled": true,
  "environment": "development",
  "providers": [
    {
      "name": "tts",
      "mode": "mock",
      "detail": "Mock TTS provider is active",
      "metadata": {
        "local_url_configured": false,
        "api_key_configured": false,
        "base_url_configured": true
      }
    }
  ]
}
```

The dev UI shows this in the Practice diagnostics tab. Production builds hide the tab unless `NEXT_PUBLIC_DIAGNOSTICS_ENABLED=true`.

## TTS Verification

`npm run test:tts-smoke` calls `/tts` with one short sentence. If the running API has `SUPERTONE_LOCAL_TTS_URL` or `SUPERTONE_API_KEY`, the Supertone/Supertonic path is attempted; otherwise the mock WAV path is used. The script prints sanitized metadata only:

```json
{
  "provider": "mock",
  "audio_url": "/media/audio/example.wav",
  "word_count": 8,
  "first_word": { "word": "Lingovector", "start_ms": 0, "end_ms": 360 },
  "last_word": { "word": "English", "start_ms": 2940, "end_ms": 3300 }
}
```

## arXiv Categories

Real arXiv recommendations are title/abstract-only and use this explicit mapping:

- Security: `cat:cs.CR`
- AI: `cat:cs.AI`
- Robotics: `cat:cs.RO`
- Physics: `cat:physics.gen-ph`
- Chemistry: `cat:physics.chem-ph`
- Biology: `cat:q-bio.BM`
