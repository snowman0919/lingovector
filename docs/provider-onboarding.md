# Provider Onboarding

Use this guide to enable one real provider at a time. Keep mock mode until OAuth, staging smoke, privacy review, and cost review are complete. Do not commit provider keys or paste them into logs.

Run the non-network preflight first:

```bash
PREFLIGHT_ENV_FILE=.env.staging npm run test:provider-preflight
```

The report prints only configured/missing status and intended mode. It does not call paid or side-effecting endpoints.

## LLM Provider

Env vars:

```text
LLM_API_URL=
LLM_API_KEY=
LLM_MODEL=gpt-4.1-mini
```

Mock behavior: deterministic local analysis, word inspection, writing prompts, and writing feedback.

Real behavior: API attempts an OpenAI-compatible chat/completion endpoint and falls back to mock if parsing or provider calls fail.

Smoke command:

```bash
LINGOVECTOR_API_BASE_URL=https://YOUR_STAGING_API_HOST \
LINGOVECTOR_AUTH_TOKEN=PASTE_TOKEN_IN_SHELL_ONLY \
npm run test:authenticated-smoke
```

Expected success: passage analysis returns sentences with Simple English first and Korean support second; writing tutor returns seven 0-100 scores plus before/after revision.

Common failures:

- Provider returns non-JSON output.
- Model name unsupported.
- API URL is not OpenAI-compatible.
- Rate limit or quota failure.

Privacy/cost cautions: passages and student writing may be sent to the provider. Enable only after operator approval and cost limits are clear.

## Supertone/Supertonic TTS

Env vars:

```text
SUPERTONE_API_KEY=
SUPERTONE_BASE_URL=https://api.supertone.ai
SUPERTONE_LOCAL_TTS_URL=
```

Mock behavior: generated WAV metadata and deterministic word timings.

Real behavior: if `SUPERTONE_LOCAL_TTS_URL` or `SUPERTONE_API_KEY` is present, the API attempts the Supertone/Supertonic path and falls back to mock on failure.

Smoke command:

```bash
npm run test:tts-smoke
```

For staging with OAuth:

```bash
LINGOVECTOR_API_BASE_URL=https://YOUR_STAGING_API_HOST \
LINGOVECTOR_AUTH_TOKEN=PASTE_TOKEN_IN_SHELL_ONLY \
npm run test:authenticated-smoke
```

Expected success: response includes `provider`, `audio_url`, and `spoken_words` timing metadata.

Common failures:

- Local TTS server unreachable.
- Account-specific API endpoint differs from the default.
- Request body required by the account differs from Lingovector's abstraction.
- Provider returns audio without timing metadata, requiring fallback timings.

Supertone/Supertonic endpoint and request body may need account-specific adjustment. Verify with a short non-sensitive sentence before student testing.

Privacy/cost cautions: TTS may incur provider cost. Do not send sensitive text until provider handling is approved.

## Voice Cloning

Env vars:

```text
SUPERTONE_API_KEY=
SUPERTONE_BASE_URL=https://api.supertone.ai
SUPERTONE_LOCAL_VOICE_URL=
```

Mock behavior: stores consent/version/metadata and returns a mock voice profile.

Real behavior: if `SUPERTONE_LOCAL_VOICE_URL` or `SUPERTONE_API_KEY` is present, the API attempts the voice provider path and falls back to mock on failure.

Smoke command: use the staging UI with a consented operator voice sample, then delete the profile. Verify storage with:

```bash
STORAGE_DIR=/path/to/staging/storage npm run ops:storage
```

Expected success: voice profile has consent metadata, upload succeeds, delete removes the DB record and attempts stored-file deletion.

Common failures:

- Consent text missing agreement language.
- Local voice server contract differs.
- API endpoint/body requires account-specific fields.
- Storage directory is not writable.

Privacy/cost cautions: never upload another person's voice without explicit permission. Do not use cloned voices to impersonate anyone. Treat voice samples as sensitive data.

## Pronunciation Scoring

Env vars:

```text
PRONUNCIATION_PROVIDER_URL=
```

Mock behavior: returns deterministic pronunciation, stress, intonation, speed, and rhythm scores.

Real behavior: sends the uploaded audio and target text to the configured HTTP provider and falls back to mock if it fails.

Smoke command:

```bash
LINGOVECTOR_API_BASE_URL=https://YOUR_STAGING_API_HOST \
LINGOVECTOR_AUTH_TOKEN=PASTE_TOKEN_IN_SHELL_ONLY \
npm run test:authenticated-smoke
```

Expected success: response includes provider name and score JSON with overall scoring.

Common failures:

- Provider URL unreachable.
- Provider expects a different multipart field shape.
- Provider logs raw audio.

Privacy/cost cautions: pronunciation audio is sensitive. Confirm retention, deletion, and logging behavior before real student use.

## arXiv Real Fetch

Env vars:

```text
ARXIV_REAL_ENABLED=true
```

Mock behavior: returns deterministic recommendations across Security, AI, Robotics, Physics, Chemistry, Biology.

Real behavior: fetches title and abstract metadata only, with memory cache status shown in diagnostics.

Smoke command:

```bash
ARXIV_REAL_ENABLED=true npm run test:arxiv-smoke
```

Expected success: output lists recommendation count, categories, and arXiv diagnostic cache status. Responses must remain title/abstract only.

Common failures:

- Network blocked.
- arXiv response shape changes.
- Cache cold start causes slower first response.

Privacy/cost cautions: arXiv fetch is not paid, but do not expand to full-text ingestion for v0.3.
