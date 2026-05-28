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
        Self::from_lookup(|key| env::var(key).ok())
    }

    fn from_lookup(get: impl Fn(&str) -> Option<String>) -> anyhow::Result<Self> {
        let bind_addr = bind_addr_from_env(&get)?;
        let raw_database_url = get("DATABASE_URL").filter(|value| !value.trim().is_empty());
        let database_url = raw_database_url.clone().unwrap_or_else(|| {
            "postgres://postgres:postgres@localhost:5432/lingovector".to_string()
        });
        let raw_jwt_secret = get("JWT_SECRET").filter(|value| !value.trim().is_empty());
        let jwt_secret = raw_jwt_secret
            .clone()
            .unwrap_or_else(|| "dev-only-change-me".to_string());
        let environment = get("ENVIRONMENT")
            .filter(|value| !value.trim().is_empty())
            .or_else(|| get("APP_ENV").filter(|value| !value.trim().is_empty()))
            .unwrap_or_else(|| "development".to_string());
        let raw_allowed_email_domain =
            get("ALLOWED_EMAIL_DOMAIN").filter(|value| !value.trim().is_empty());
        let allowed_email_domain = raw_allowed_email_domain
            .clone()
            .unwrap_or_else(|| "dimigo.hs.kr".to_string());
        let google_client_id = get("GOOGLE_CLIENT_ID").filter(|v| !v.is_empty());
        let dev_auth = lookup_bool(&get, "DEV_AUTH", false);
        let raw_cors_origins = get("CORS_ORIGINS").filter(|value| !value.trim().is_empty());
        let cors_origins: Vec<String> = raw_cors_origins
            .clone()
            .unwrap_or_else(|| "http://localhost:3000".to_string())
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(ToOwned::to_owned)
            .collect();
        validate_production_config(ProductionConfigCheck {
            environment: &environment,
            raw_database_url: raw_database_url.as_deref(),
            raw_jwt_secret: raw_jwt_secret.as_deref(),
            raw_allowed_email_domain: raw_allowed_email_domain.as_deref(),
            allowed_email_domain: &allowed_email_domain,
            google_client_id: google_client_id.as_deref(),
            dev_auth,
            cors_origins: &cors_origins,
            raw_cors_origins: raw_cors_origins.as_deref(),
        })?;
        let storage_dir = get("STORAGE_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("./storage"));
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
            supertone_api_key: get("SUPERTONE_API_KEY").filter(|v| !v.is_empty()),
            supertone_base_url: get("SUPERTONE_BASE_URL")
                .unwrap_or_else(|| "https://api.supertone.ai".to_string()),
            supertone_local_tts_url: get("SUPERTONE_LOCAL_TTS_URL").filter(|v| !v.is_empty()),
            supertone_local_voice_url: get("SUPERTONE_LOCAL_VOICE_URL").filter(|v| !v.is_empty()),
            pronunciation_provider_url: get("PRONUNCIATION_PROVIDER_URL").filter(|v| !v.is_empty()),
            arxiv_real_enabled: lookup_bool(&get, "ARXIV_REAL_ENABLED", false),
            diagnostics_enabled: lookup_bool(&get, "DIAGNOSTICS_ENABLED", false),
            llm_api_url: get("LLM_API_URL").filter(|v| !v.is_empty()),
            llm_api_key: get("LLM_API_KEY").filter(|v| !v.is_empty()),
            llm_model: get("LLM_MODEL").unwrap_or_else(|| "gpt-4.1-mini".to_string()),
        })
    }

    pub fn is_development(&self) -> bool {
        self.environment == "development" || self.environment == "test"
    }

    pub fn diagnostics_allowed(&self) -> bool {
        self.is_development() || self.diagnostics_enabled
    }
}

fn bind_addr_from_env(get: &impl Fn(&str) -> Option<String>) -> anyhow::Result<SocketAddr> {
    if let Some(bind_addr) = get("BIND_ADDR").filter(|value| !value.trim().is_empty()) {
        return Ok(bind_addr.parse()?);
    }
    let api_host = get("API_HOST")
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "0.0.0.0".to_string());
    let api_port = get("API_PORT")
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "8080".to_string());
    Ok(format!("{api_host}:{api_port}").parse()?)
}

fn lookup_bool(get: &impl Fn(&str) -> Option<String>, key: &str, default: bool) -> bool {
    get(key)
        .map(|value| matches!(value.to_lowercase().as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(default)
}

struct ProductionConfigCheck<'a> {
    environment: &'a str,
    raw_database_url: Option<&'a str>,
    raw_jwt_secret: Option<&'a str>,
    raw_allowed_email_domain: Option<&'a str>,
    allowed_email_domain: &'a str,
    google_client_id: Option<&'a str>,
    dev_auth: bool,
    cors_origins: &'a [String],
    raw_cors_origins: Option<&'a str>,
}

fn validate_production_config(check: ProductionConfigCheck<'_>) -> anyhow::Result<()> {
    if matches!(check.environment, "development" | "test") {
        return Ok(());
    }
    if check.dev_auth {
        anyhow::bail!("DEV_AUTH cannot be enabled when ENVIRONMENT or APP_ENV is production-like");
    }
    if check.raw_database_url.is_none() {
        anyhow::bail!("DATABASE_URL is required when ENVIRONMENT or APP_ENV is production-like");
    }
    match check.raw_jwt_secret {
        Some(secret) if secret != "dev-only-change-me" && secret.len() >= 32 => {}
        Some(_) => anyhow::bail!(
            "JWT_SECRET must be a non-default value with at least 32 characters when ENVIRONMENT or APP_ENV is production-like"
        ),
        None => anyhow::bail!("JWT_SECRET is required when ENVIRONMENT or APP_ENV is production-like"),
    }
    if check.google_client_id.is_none() {
        anyhow::bail!(
            "GOOGLE_CLIENT_ID is required when ENVIRONMENT or APP_ENV is production-like"
        );
    }
    if check.raw_allowed_email_domain.is_none() {
        anyhow::bail!(
            "ALLOWED_EMAIL_DOMAIN is required when ENVIRONMENT or APP_ENV is production-like"
        );
    }
    if check.allowed_email_domain != "dimigo.hs.kr" {
        anyhow::bail!("ALLOWED_EMAIL_DOMAIN must be dimigo.hs.kr for the school-internal beta");
    }
    if check.raw_cors_origins.is_none() || check.cors_origins.is_empty() {
        anyhow::bail!("CORS_ORIGINS is required when ENVIRONMENT or APP_ENV is production-like");
    }
    for origin in check.cors_origins {
        if origin == "*"
            || origin.contains("localhost")
            || origin.contains("127.0.0.1")
            || !origin.starts_with("https://")
        {
            anyhow::bail!(
                "CORS_ORIGINS must contain explicit https origins when ENVIRONMENT or APP_ENV is production-like"
            );
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn config_from(values: &[(&str, &str)]) -> anyhow::Result<Config> {
        let map = values
            .iter()
            .map(|(key, value)| ((*key).to_string(), (*value).to_string()))
            .collect::<HashMap<_, _>>();
        Config::from_lookup(|key| map.get(key).cloned())
    }

    fn production_values() -> Vec<(&'static str, &'static str)> {
        vec![
            ("ENVIRONMENT", "production"),
            (
                "DATABASE_URL",
                "postgres://user:pass@db.example/lingovector",
            ),
            ("JWT_SECRET", "0123456789abcdef0123456789abcdef"),
            (
                "GOOGLE_CLIENT_ID",
                "google-client-id.apps.googleusercontent.com",
            ),
            ("ALLOWED_EMAIL_DOMAIN", "dimigo.hs.kr"),
            ("CORS_ORIGINS", "https://lingovector.example.edu"),
        ]
    }

    #[test]
    fn development_config_keeps_local_defaults() {
        let config = config_from(&[]).unwrap();
        assert_eq!(config.environment, "development");
        assert_eq!(config.bind_addr, "0.0.0.0:8080".parse().unwrap());
        assert_eq!(config.allowed_email_domain, "dimigo.hs.kr");
        assert!(!config.dev_auth);
        assert_eq!(config.cors_origins, vec!["http://localhost:3000"]);
    }

    #[test]
    fn api_host_and_port_configure_bind_addr() {
        let config = config_from(&[("API_HOST", "127.0.0.1"), ("API_PORT", "18080")]).unwrap();
        assert_eq!(config.bind_addr, "127.0.0.1:18080".parse().unwrap());
    }

    #[test]
    fn bind_addr_remains_backward_compatible_override() {
        let config = config_from(&[
            ("BIND_ADDR", "127.0.0.1:19090"),
            ("API_HOST", "0.0.0.0"),
            ("API_PORT", "18080"),
        ])
        .unwrap();
        assert_eq!(config.bind_addr, "127.0.0.1:19090".parse().unwrap());
    }

    #[test]
    fn production_config_requires_google_client_id() {
        let mut values = production_values();
        values.retain(|(key, _)| *key != "GOOGLE_CLIENT_ID");
        let err = config_from(&values).unwrap_err().to_string();
        assert!(err.contains("GOOGLE_CLIENT_ID is required"));
    }

    #[test]
    fn production_config_requires_allowed_email_domain() {
        let mut values = production_values();
        values.retain(|(key, _)| *key != "ALLOWED_EMAIL_DOMAIN");
        let err = config_from(&values).unwrap_err().to_string();
        assert!(err.contains("ALLOWED_EMAIL_DOMAIN is required"));
    }

    #[test]
    fn production_config_rejects_dev_auth() {
        let mut values = production_values();
        values.push(("DEV_AUTH", "true"));
        let err = config_from(&values).unwrap_err().to_string();
        assert!(err.contains("DEV_AUTH cannot be enabled"));
    }

    #[test]
    fn production_config_rejects_insecure_jwt_secret() {
        let mut values = production_values();
        for item in &mut values {
            if item.0 == "JWT_SECRET" {
                item.1 = "dev-only-change-me";
            }
        }
        let err = config_from(&values).unwrap_err().to_string();
        assert!(err.contains("JWT_SECRET must be a non-default value"));
    }

    #[test]
    fn production_config_rejects_localhost_cors() {
        let mut values = production_values();
        for item in &mut values {
            if item.0 == "CORS_ORIGINS" {
                item.1 = "http://localhost:3000";
            }
        }
        let err = config_from(&values).unwrap_err().to_string();
        assert!(err.contains("CORS_ORIGINS must contain explicit https origins"));
    }

    #[test]
    fn production_config_accepts_required_safe_values() {
        let config = config_from(&production_values()).unwrap();
        assert_eq!(config.environment, "production");
        assert_eq!(config.allowed_email_domain, "dimigo.hs.kr");
        assert!(!config.dev_auth);
        assert_eq!(config.cors_origins, vec!["https://lingovector.example.edu"]);
        assert!(!config.diagnostics_allowed());
    }

    #[test]
    fn production_diagnostics_require_explicit_enable() {
        let mut values = production_values();
        values.push(("DIAGNOSTICS_ENABLED", "true"));
        let config = config_from(&values).unwrap();
        assert!(config.diagnostics_allowed());
    }

    #[test]
    fn app_env_staging_uses_production_like_validation() {
        let mut values = production_values();
        values.retain(|(key, _)| *key != "ENVIRONMENT");
        values.push(("APP_ENV", "staging"));
        let config = config_from(&values).unwrap();
        assert_eq!(config.environment, "staging");
        assert!(!config.is_development());
        assert!(!config.dev_auth);
        assert!(!config.diagnostics_allowed());
    }

    #[test]
    fn app_env_staging_rejects_dev_auth() {
        let mut values = production_values();
        values.retain(|(key, _)| *key != "ENVIRONMENT");
        values.push(("APP_ENV", "staging"));
        values.push(("DEV_AUTH", "true"));
        let err = config_from(&values).unwrap_err().to_string();
        assert!(err.contains("DEV_AUTH cannot be enabled"));
    }

    #[test]
    fn app_env_staging_requires_database_url() {
        let mut values = production_values();
        values.retain(|(key, _)| *key != "ENVIRONMENT" && *key != "DATABASE_URL");
        values.push(("APP_ENV", "staging"));
        let err = config_from(&values).unwrap_err().to_string();
        assert!(err.contains("DATABASE_URL is required"));
    }
}
