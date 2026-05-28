import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const SECRET_KEYS = new Set([
  "JWT_SECRET",
  "DATABASE_URL",
  "GOOGLE_CLIENT_ID",
  "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
  "LLM_API_KEY",
  "SUPERTONE_API_KEY",
  "POSTGRES_PASSWORD",
]);

function parseEnvFile(path) {
  if (!path || !existsSync(path)) return {};
  const result = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[match[1]] = value;
  }
  return result;
}

const explicitEnvFile = process.env.PREFLIGHT_ENV_FILE;
const defaultEnvFile = [".env.staging", ".env.production", ".env"].find((path) => existsSync(resolve(path)));
const envFile = explicitEnvFile ? resolve(explicitEnvFile) : defaultEnvFile ? resolve(defaultEnvFile) : null;
const fileEnv = parseEnvFile(envFile);
const env = { ...fileEnv, ...process.env };

function configured(key) {
  return typeof env[key] === "string" && env[key].trim().length > 0;
}

function modeFrom(realCondition) {
  return realCondition ? "real-intended" : "mock";
}

function boolValue(key) {
  return ["1", "true", "yes", "on"].includes((env[key] ?? "").toLowerCase());
}

function provider(name, mode, requiredKeys, notes, safeToTest) {
  return {
    name,
    intended_mode: mode,
    safe_to_test_without_paid_or_side_effecting_calls: safeToTest,
    required_env: requiredKeys.map((key) => ({
      key,
      configured: configured(key),
      value: SECRET_KEYS.has(key) ? undefined : env[key] || undefined,
    })),
    notes,
  };
}

const environment = env.ENVIRONMENT || env.APP_ENV || "development";
const diagnosticsEnabled = boolValue("DIAGNOSTICS_ENABLED");
const report = {
  env_file: envFile ?? "none",
  environment,
  diagnostics: {
    configured: configured("DIAGNOSTICS_ENABLED"),
    enabled: diagnosticsEnabled,
    note: diagnosticsEnabled ? "Disable after operator diagnostics check." : "Default safe state.",
  },
  auth: {
    mode: configured("GOOGLE_CLIENT_ID") ? "google-oauth" : "incomplete",
    allowed_email_domain: env.ALLOWED_EMAIL_DOMAIN || "dimigo.hs.kr",
    dev_auth_enabled: boolValue("DEV_AUTH"),
    required_env: ["GOOGLE_CLIENT_ID", "ALLOWED_EMAIL_DOMAIN", "JWT_SECRET", "CORS_ORIGINS"].map((key) => ({
      key,
      configured: configured(key),
      value: SECRET_KEYS.has(key) ? undefined : env[key] || undefined,
    })),
  },
  providers: [
    provider(
      "llm",
      modeFrom(configured("LLM_API_URL")),
      ["LLM_API_URL", "LLM_API_KEY", "LLM_MODEL"],
      configured("LLM_API_URL") ? "Real LLM path is intended. Confirm cost and privacy before smoke testing." : "Mock LLM path will be used.",
      !configured("LLM_API_URL"),
    ),
    provider(
      "browser_tts",
      env.NEXT_PUBLIC_TTS_MODE === "browser_onnx"
        ? "browser-onnx-intended"
        : env.NEXT_PUBLIC_TTS_MODE === "mock"
          ? "mock"
          : "server-fallback",
      ["NEXT_PUBLIC_TTS_MODE", "NEXT_PUBLIC_SUPERTONIC_ONNX_MODEL_URL", "NEXT_PUBLIC_SUPERTONIC_ONNX_CONFIG_URL"],
      env.NEXT_PUBLIC_TTS_MODE === "browser_onnx"
        ? "Browser ONNX TTS is intended. Confirm model/schema assets are deployed outside git."
        : env.NEXT_PUBLIC_TTS_MODE === "mock"
          ? "Frontend mock TTS is intended for isolated UI verification."
          : "Frontend will use backend /tts server fallback.",
      true,
    ),
    provider(
      "server_tts_fallback",
      modeFrom(configured("SUPERTONE_API_KEY") || configured("SUPERTONE_LOCAL_TTS_URL")),
      ["SUPERTONE_API_KEY", "SUPERTONE_LOCAL_TTS_URL", "SUPERTONE_BASE_URL"],
      configured("SUPERTONE_LOCAL_TTS_URL")
        ? "Local server-side TTS fallback is intended; check local server contract."
          : configured("SUPERTONE_API_KEY")
            ? "Server-side Supertone API fallback is intended; endpoint/body may need account-specific adjustment."
            : "Backend mock TTS fallback will be used.",
      !configured("SUPERTONE_API_KEY"),
    ),
    provider(
      "voice_cloning",
      modeFrom(configured("SUPERTONE_API_KEY") || configured("SUPERTONE_LOCAL_VOICE_URL")),
      ["SUPERTONE_API_KEY", "SUPERTONE_LOCAL_VOICE_URL", "SUPERTONE_BASE_URL"],
      configured("SUPERTONE_LOCAL_VOICE_URL")
        ? "Local voice cloning path is intended; use consented test voice only."
          : configured("SUPERTONE_API_KEY")
            ? "Supertone API voice path is intended; do not test with real student voice until approved."
            : "Mock voice cloning path will be used.",
      !configured("SUPERTONE_API_KEY") && !configured("SUPERTONE_LOCAL_VOICE_URL"),
    ),
    provider(
      "pronunciation",
      modeFrom(configured("PRONUNCIATION_PROVIDER_URL")),
      ["PRONUNCIATION_PROVIDER_URL"],
      configured("PRONUNCIATION_PROVIDER_URL") ? "HTTP pronunciation provider is intended; verify no raw audio is logged." : "Mock pronunciation scorer will be used.",
      !configured("PRONUNCIATION_PROVIDER_URL"),
    ),
    provider(
      "arxiv",
      boolValue("ARXIV_REAL_ENABLED") ? "real-intended" : "mock",
      ["ARXIV_REAL_ENABLED"],
      boolValue("ARXIV_REAL_ENABLED") ? "Real arXiv fetch is intended; title/abstract only." : "Mock arXiv recommendations will be used.",
      true,
    ),
  ],
};

if (report.auth.dev_auth_enabled && !["development", "test"].includes(environment)) {
  report.auth.warning = "DEV_AUTH is enabled outside development/test; staging/production startup should reject this.";
}

console.log(JSON.stringify(report, null, 2));
