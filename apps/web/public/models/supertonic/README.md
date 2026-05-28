# Supertonic ONNX model files

Place browser-testable Supertonic TTS ONNX assets here for local or staging verification.

Expected default paths:

- `/models/supertonic/model.onnx`
- optional schema/config JSON pointed to by `NEXT_PUBLIC_SUPERTONIC_ONNX_CONFIG_URL`

Large model files must not be committed to git. Keep them in the deployment artifact, server volume, or object storage/CDN path approved by the operator.

The current frontend contains a clean adapter boundary, but the exact Supertonic ONNX input/output schema must be configured before real browser audio generation is enabled. Without that schema, `browser_onnx` mode falls back to server/mock TTS and shows a Korean fallback message.
