use std::{env, net::SocketAddr, path::PathBuf};

#[derive(Clone, Debug)]
pub struct Config {
    pub bind_addr: SocketAddr,
    pub database_url: String,
    pub jwt_secret: String,
    pub allowed_email_domain: String,
    pub google_client_id: Option<String>,
    pub dev_auth: bool,
    pub cors_origins: Vec<String>,
    pub storage_dir: PathBuf,
    pub environment: String,
    pub supertone_api_key: Option<String>,
    pub supertone_base_url: String,
    pub supertone_local_tts_url: Option<String>,
    pub supertone_local_voice_url: Option<String>,
    pub pronunciation_provider_url: Option<String>,
    pub arxiv_real_enabled: bool,
    pub diagnostics_enabled: bool,
    pub llm_api_url: Option<String>,
    pub llm_api_key: Option<String>,
    pub llm_model: String,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        dotenvy::dotenv().ok();
        let bind_addr = env::var("BIND_ADDR")
            .unwrap_or_else(|_| "127.0.0.1:8080".to_string())
            .parse()?;
        let database_url = env::var("DATABASE_URL").unwrap_or_else(|_| {
            "postgres://postgres:postgres@localhost:5432/lingovector".to_string()
        });
        let jwt_secret =
            env::var("JWT_SECRET").unwrap_or_else(|_| "dev-only-change-me".to_string());
        let environment = env::var("ENVIRONMENT").unwrap_or_else(|_| "development".to_string());
        if !matches!(environment.as_str(), "development" | "test")
            && jwt_secret == "dev-only-change-me"
        {
            anyhow::bail!("JWT_SECRET must be set to a non-default value outside development");
        }
        let allowed_email_domain =
            env::var("ALLOWED_EMAIL_DOMAIN").unwrap_or_else(|_| "dimigo.hs.kr".to_string());
        let google_client_id = env::var("GOOGLE_CLIENT_ID").ok().filter(|v| !v.is_empty());
        let dev_auth = env_bool("DEV_AUTH", false);
        let cors_origins = env::var("CORS_ORIGINS")
            .unwrap_or_else(|_| "http://localhost:3000".to_string())
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(ToOwned::to_owned)
            .collect();
        let storage_dir = env::var("STORAGE_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("./storage"));
        Ok(Self {
            bind_addr,
            database_url,
            jwt_secret,
            allowed_email_domain,
            google_client_id,
            dev_auth,
            cors_origins,
            storage_dir,
            environment,
            supertone_api_key: env::var("SUPERTONE_API_KEY").ok().filter(|v| !v.is_empty()),
            supertone_base_url: env::var("SUPERTONE_BASE_URL")
                .unwrap_or_else(|_| "https://api.supertone.ai".to_string()),
            supertone_local_tts_url: env::var("SUPERTONE_LOCAL_TTS_URL")
                .ok()
                .filter(|v| !v.is_empty()),
            supertone_local_voice_url: env::var("SUPERTONE_LOCAL_VOICE_URL")
                .ok()
                .filter(|v| !v.is_empty()),
            pronunciation_provider_url: env::var("PRONUNCIATION_PROVIDER_URL")
                .ok()
                .filter(|v| !v.is_empty()),
            arxiv_real_enabled: env_bool("ARXIV_REAL_ENABLED", false),
            diagnostics_enabled: env_bool("DIAGNOSTICS_ENABLED", false),
            llm_api_url: env::var("LLM_API_URL").ok().filter(|v| !v.is_empty()),
            llm_api_key: env::var("LLM_API_KEY").ok().filter(|v| !v.is_empty()),
            llm_model: env::var("LLM_MODEL").unwrap_or_else(|_| "gpt-4.1-mini".to_string()),
        })
    }

    pub fn is_development(&self) -> bool {
        self.environment == "development" || self.environment == "test"
    }

    pub fn diagnostics_allowed(&self) -> bool {
        self.is_development() || self.diagnostics_enabled
    }
}

fn env_bool(key: &str, default: bool) -> bool {
    env::var(key)
        .ok()
        .map(|value| matches!(value.to_lowercase().as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(default)
}
