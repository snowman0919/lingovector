import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const study = readFileSync(resolve(root, "apps/web/src/components/StudyDashboard.tsx"), "utf8");
const consent = readFileSync(resolve(root, "apps/web/src/components/ConsentGate.tsx"), "utf8");
const api = readFileSync(resolve(root, "apps/web/src/lib/api.ts"), "utf8");
const tts = readFileSync(resolve(root, "apps/web/src/lib/tts.ts"), "utf8");
const types = readFileSync(resolve(root, "apps/web/src/lib/types.ts"), "utf8");

const checks = [
  [study.includes("음성 삭제"), "voice deletion control is rendered"],
  [study.includes("수정 전") && study.includes("수정 후"), "writing before/after display is rendered"],
  [api.includes("DELETE") && api.includes("/voices/"), "voice delete API client exists"],
  [types.includes("consent_version"), "voice consent version type exists"],
  [study.includes("복제 음성은 다른 사람을 사칭하는 데 사용할 수 없습니다"), "voice consent warning exists"],
  [study.includes("ProviderDiagnosticsPanel") && api.includes("/diagnostics/providers"), "dev provider diagnostics UI exists"],
  [study.includes("LearningQualityReview"), "dev learning-quality review UI exists"],
  [study.includes("개발용 샘플 음성 (mock)"), "mock provider label is limited to developer UI"],
  [study.includes("학습 흐름"), "dashboard study flow guide exists"],
  [study.includes("지문 입력") && study.includes("영작 튜터") && study.includes("논문 추천"), "main UI labels are localized"],
  [consent.includes("개인정보 수집") || consent.includes("베타 이용 전 개인정보 동의"), "Korean consent gate exists"],
  [api.includes("/me/consents") && api.includes("/me/withdraw-consent") && api.includes('"/me"'), "privacy consent and account deletion API clients exist"],
  [api.includes("replace(/\\\\/$/, \"\")") || api.includes("replace(/\\/$/, \"\")"), "API base URL normalizes trailing slash for /api deployments"],
  [study.includes("개인정보 및 계정") && study.includes("개인정보 제공 동의 철회") && study.includes("계정 삭제"), "privacy settings UI exists"],
  [tts.includes("NEXT_PUBLIC_TTS_MODE") && tts.includes("onnxruntime-web") && tts.includes("Supertonic ONNX model schema is not configured"), "browser ONNX TTS adapter and fallback exist"],
];

const failed = checks.filter(([ok]) => !ok);
if (failed.length > 0) {
  for (const [, message] of failed) {
    console.error(`frontend smoke failed: ${message}`);
  }
  process.exit(1);
}

console.log("frontend smoke checks passed");
