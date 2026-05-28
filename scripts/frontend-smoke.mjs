import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const study = readFileSync(resolve(root, "apps/web/src/components/StudyDashboard.tsx"), "utf8");
const api = readFileSync(resolve(root, "apps/web/src/lib/api.ts"), "utf8");
const types = readFileSync(resolve(root, "apps/web/src/lib/types.ts"), "utf8");

const checks = [
  [study.includes("Delete voice"), "voice deletion control is rendered"],
  [study.includes("Before") && study.includes("Revised Version"), "writing before/after display is rendered"],
  [api.includes("DELETE") && api.includes("/voices/"), "voice delete API client exists"],
  [types.includes("consent_version"), "voice consent version type exists"],
  [study.includes("Voice cloning requires your explicit consent"), "voice consent warning exists"],
];

const failed = checks.filter(([ok]) => !ok);
if (failed.length > 0) {
  for (const [, message] of failed) {
    console.error(`frontend smoke failed: ${message}`);
  }
  process.exit(1);
}

console.log("frontend smoke checks passed");
