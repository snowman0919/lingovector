# Lingovector v0.3 MVP

Lingovector is an AI English tutor for Korean high school students. The v0.3 MVP focuses on English as a tool for thinking and expression: sentence logic, vocabulary nuance, pronunciation, and writing feedback.

## Stack

- Frontend: Next.js + TypeScript
- Backend: Rust + Axum
- Database: PostgreSQL via SQLx migrations
- Auth: Google ID token verification on the backend, restricted to verified `@dimigo.hs.kr` accounts
- Providers: trait-based LLM, TTS, voice cloning, pronunciation, and arXiv providers
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

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection string.
- `JWT_SECRET`: server-side session token signing secret. Use a long random value outside local development.
- `DEV_AUTH`: allows `dev:*@dimigo.hs.kr` tokens only when explicitly `true`.
- `GOOGLE_CLIENT_ID`: OAuth client ID used to verify Google ID token audience.
- `ALLOWED_EMAIL_DOMAIN`: defaults to `dimigo.hs.kr`.
- `CORS_ORIGINS`: comma-separated frontend origins.
- `STORAGE_DIR`: local audio and voice sample storage directory.
- `SUPERTONE_API_KEY`: enables Supertone/Supertonic-3 API-mode TTS and voice paths. Empty uses mocks unless a local URL is set.
- `SUPERTONE_BASE_URL`: Supertone API base URL.
- `SUPERTONE_LOCAL_TTS_URL`: optional local TTS server endpoint returning audio bytes.
- `SUPERTONE_LOCAL_VOICE_URL`: optional local voice-cloning endpoint returning `voice_id` or `id`.
- `LLM_API_URL`: OpenAI-compatible chat completions endpoint for real analysis and writing feedback.
- `LLM_API_KEY`: bearer token for `LLM_API_URL`.
- `LLM_MODEL`: model name sent to the OpenAI-compatible endpoint.
- `PRONUNCIATION_PROVIDER_URL`: optional local pronunciation scoring endpoint returning JSON.
- `ARXIV_REAL_ENABLED`: when `true`, fetches title/abstract recommendations from the arXiv API with in-memory cache.
- `DIAGNOSTICS_ENABLED`: enables `/diagnostics/providers` outside development/test. The endpoint never returns secrets.
- `NEXT_PUBLIC_API_BASE_URL`: frontend API URL.
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`: enables the Google Identity Services button.
- `NEXT_PUBLIC_DIAGNOSTICS_ENABLED`: shows the dev provider status tab in production builds only when explicitly `true`. Development builds show it automatically.

Never commit real secrets.

## Implemented MVP Features

- Login with backend-verified Google token path, `email_verified`, and hosted-domain/domain enforcement for `@dimigo.hs.kr`.
- Explicit `DEV_AUTH=true` development login.
- Protected API routes using signed backend JWTs.
- Health endpoint with database readiness at `/health`.
- Authenticated provider diagnostics at `/diagnostics/providers`, hidden in production unless `DIAGNOSTICS_ENABLED=true`.
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
