import { synthesize } from "./api";
import type { TtsResult } from "./types";

export type BrowserTtsMode = "browser_onnx" | "server" | "mock";

export function configuredTtsMode(): BrowserTtsMode {
  const mode = process.env.NEXT_PUBLIC_TTS_MODE;
  if (mode === "browser_onnx" || mode === "server" || mode === "mock") return mode;
  return "server";
}

export function ttsModeLabel(mode = configuredTtsMode()) {
  if (mode === "browser_onnx") return "브라우저 ONNX";
  if (mode === "mock") return "mock";
  return "서버 TTS";
}

export async function synthesizeForBrowser(text: string, voiceId?: string): Promise<TtsResult> {
  const mode = configuredTtsMode();
  if (mode === "server") return synthesize(text, voiceId);
  if (mode === "mock") return mockBrowserTts(text);

  try {
    return await synthesizeWithSupertonicOnnx();
  } catch (error) {
    const fallback = await synthesize(text, voiceId).catch(() => mockBrowserTts(text));
    return {
      ...fallback,
      fallback_message:
        error instanceof Error
          ? `온디바이스 TTS를 사용할 수 없어 대체 경로를 사용했습니다. ${error.message}`
          : "온디바이스 TTS를 사용할 수 없어 대체 경로를 사용했습니다.",
    };
  }
}

async function synthesizeWithSupertonicOnnx(): Promise<TtsResult> {
  if (typeof window === "undefined") {
    throw new Error("브라우저 환경에서만 ONNX TTS를 실행할 수 있습니다.");
  }
  const modelUrl = process.env.NEXT_PUBLIC_SUPERTONIC_ONNX_MODEL_URL ?? "/models/supertonic/model.onnx";
  const configUrl = process.env.NEXT_PUBLIC_SUPERTONIC_ONNX_CONFIG_URL;
  if (!configUrl) {
    throw new Error("Supertonic ONNX model schema is not configured.");
  }

  const ort = await import("onnxruntime-web");
  const providers = isWebGpuAvailable() ? ["webgpu", "wasm"] : ["wasm"];
  const configResponse = await fetch(configUrl);
  if (!configResponse.ok) {
    throw new Error("Supertonic ONNX model schema is not configured.");
  }
  const config = (await configResponse.json()) as { schema_version?: string; adapter?: string };
  if (config.adapter !== "supertonic-v1-placeholder") {
    throw new Error("Supertonic ONNX model schema is not configured.");
  }

  await ort.InferenceSession.create(modelUrl, { executionProviders: providers });
  throw new Error("Supertonic ONNX model schema is not configured.");
}

function isWebGpuAvailable() {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

function mockBrowserTts(text: string): TtsResult {
  const words = text
    .split(/\s+/)
    .map((word) => word.replace(/[^\w-]/g, ""))
    .filter(Boolean);
  return {
    provider: "browser-mock",
    audio_url: silentWavDataUrl(),
    spoken_words: words.map((word, index) => ({
      word,
      start_ms: index * 280,
      end_ms: index * 280 + 240,
    })),
  };
}

function silentWavDataUrl() {
  const bytes = new Uint8Array([
    82, 73, 70, 70, 40, 0, 0, 0, 87, 65, 86, 69, 102, 109, 116, 32, 16, 0, 0, 0, 1, 0, 1, 0,
    64, 31, 0, 0, 128, 62, 0, 0, 2, 0, 16, 0, 100, 97, 116, 97, 4, 0, 0, 0, 0, 0, 0, 0,
  ]);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}
