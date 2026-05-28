# Browser-side Supertonic ONNX TTS

Lingovector beta should prefer browser-side ONNX TTS when Supertonic model assets are available. This reduces server-side audio processing and can keep TTS generation on the student's device.

## Env vars

- `NEXT_PUBLIC_TTS_MODE=browser_onnx|server|mock`
- `NEXT_PUBLIC_SUPERTONIC_ONNX_MODEL_URL=/models/supertonic/model.onnx`
- `NEXT_PUBLIC_SUPERTONIC_ONNX_CONFIG_URL=/models/supertonic/config.json`

`browser_onnx` tries ONNX Runtime Web first. `server` uses the existing backend `/tts` route. `mock` uses frontend-only mock timing/audio for isolated UI checks.

## Model placement

Do not commit large model files. Place model assets in the deployed web public path, a mounted volume, or an approved static/object storage path.

Default local path:

```text
apps/web/public/models/supertonic/model.onnx
```

The repository intentionally includes only `apps/web/public/models/supertonic/README.md`.

## Adapter status

The exact Supertonic ONNX input/output schema is account/model-specific and is not hardcoded. The frontend has an isolated adapter boundary. Until `NEXT_PUBLIC_SUPERTONIC_ONNX_CONFIG_URL` points to a reviewed schema and adapter configuration, browser ONNX mode fails clearly with:

```text
Supertonic ONNX model schema is not configured.
```

The UI then shows a Korean fallback message and uses server/mock TTS.

## WebGPU and WASM

The browser provider requests WebGPU when available and falls back to WASM. Operators should verify both:

1. Chrome/Edge with WebGPU enabled.
2. Safari/Firefox or a browser without WebGPU, confirming WASM fallback or clear fallback to server/mock TTS.

## Verification

1. Set `NEXT_PUBLIC_TTS_MODE=browser_onnx`.
2. Deploy or mount model/config files outside git.
3. Open a studied sentence and click `문장 재생`.
4. Confirm the UI shows `온디바이스 TTS 상태: 브라우저 ONNX`.
5. If the schema is missing, confirm the fallback message appears and learning flow continues.

Server-side Supertone/Supertonic API/local URL remains an optional fallback, not the primary beta direction.
