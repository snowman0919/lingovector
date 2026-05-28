use axum::{
    async_trait,
    extract::FromRequestParts,
    http::{header::AUTHORIZATION, request::Parts},
};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    config::Config,
    dto::UserDto,
    error::{AppError, AppResult},
    AppState,
};

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub email: String,
    pub hd: Option<String>,
    pub exp: usize,
}

#[derive(Debug, Deserialize)]
struct GoogleTokenInfo {
    email: String,
    #[serde(default)]
    email_verified: String,
    #[serde(default)]
    name: String,
    picture: Option<String>,
    aud: Option<String>,
    hd: Option<String>,
}

#[derive(Debug, Clone)]
pub struct GoogleClaims {
    pub email: String,
    pub email_verified: bool,
    pub name: String,
    pub picture: Option<String>,
    pub hosted_domain: Option<String>,
}

pub fn create_access_token(user: &UserDto, config: &Config) -> AppResult<String> {
    let exp = (Utc::now() + Duration::days(7)).timestamp() as usize;
    let claims = Claims {
        sub: user.id.to_string(),
        email: user.email.clone(),
        hd: user.email.split('@').nth(1).map(ToOwned::to_owned),
        exp,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(config.jwt_secret.as_bytes()),
    )
    .map_err(|err| AppError::Internal(err.into()))
}

pub async fn verify_google_id_token(id_token: &str, config: &Config) -> AppResult<GoogleClaims> {
    if let Some(email) = id_token.strip_prefix("dev:") {
        if !config.dev_auth {
            return Err(AppError::Forbidden(
                "development login token is disabled; set DEV_AUTH=true for local dev".to_string(),
            ));
        }
        let email = if email.trim().is_empty() {
            "student@dimigo.hs.kr".to_string()
        } else {
            email.trim().to_string()
        };
        return Ok(GoogleClaims {
            name: email
                .split('@')
                .next()
                .unwrap_or("Student")
                .replace('.', " "),
            email,
            email_verified: true,
            picture: None,
            hosted_domain: Some(config.allowed_email_domain.clone()),
        });
    }

    let client_id = config.google_client_id.as_ref().ok_or_else(|| {
        AppError::BadRequest("GOOGLE_CLIENT_ID is required for Google login".to_string())
    })?;
    let token_info: GoogleTokenInfo = reqwest::Client::new()
        .get("https://oauth2.googleapis.com/tokeninfo")
        .query(&[("id_token", id_token)])
        .send()
        .await
        .map_err(|err| AppError::Provider(err.to_string()))?
        .error_for_status()
        .map_err(|_| AppError::Unauthorized)?
        .json()
        .await
        .map_err(|err| AppError::Provider(err.to_string()))?;

    if token_info.aud.as_deref() != Some(client_id.as_str()) {
        return Err(AppError::Unauthorized);
    }

    Ok(GoogleClaims {
        email: token_info.email,
        email_verified: token_info.email_verified == "true",
        name: token_info.name,
        picture: token_info.picture,
        hosted_domain: token_info.hd,
    })
}

pub fn require_allowed_email(claims: &GoogleClaims, config: &Config) -> AppResult<()> {
    if !claims.email_verified {
        return Err(AppError::Forbidden(
            "Google account email must be verified".to_string(),
        ));
    }
    let allowed_domain = config.allowed_email_domain.to_lowercase();
    let allowed_suffix = format!("@{}", allowed_domain);
    if !claims.email.to_lowercase().ends_with(&allowed_suffix) {
        return Err(AppError::Forbidden(format!(
            "only verified {} accounts are allowed",
            allowed_suffix
        )));
    }
    match claims.hosted_domain.as_deref() {
        Some(hd) if hd.eq_ignore_ascii_case(&allowed_domain) => Ok(()),
        Some(_) => Err(AppError::Forbidden(format!(
            "Google hosted domain must be {}",
            allowed_domain
        ))),
        None => {
            if claims.email.to_lowercase().ends_with(&allowed_suffix) {
                Ok(())
            } else {
                Err(AppError::Forbidden(format!(
                    "Google hosted domain must be {}",
                    allowed_domain
                )))
            }
        }
    }
}

pub async fn upsert_user(pool: &PgPool, claims: &GoogleClaims) -> AppResult<UserDto> {
    let id = Uuid::new_v4();
    let user = sqlx::query_as::<_, UserDto>(
        r#"
        INSERT INTO users (id, email, name, picture, email_verified)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (email) DO UPDATE
        SET name = EXCLUDED.name,
            picture = EXCLUDED.picture,
            email_verified = EXCLUDED.email_verified
        RETURNING id, email, name, picture, email_verified, created_at
        "#,
    )
    .bind(id)
    .bind(&claims.email)
    .bind(&claims.name)
    .bind(&claims.picture)
    .bind(claims.email_verified)
    .fetch_one(pool)
    .await?;
    Ok(user)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config() -> Config {
        Config {
            bind_addr: "127.0.0.1:0".parse().unwrap(),
            database_url: "postgres://example".to_string(),
            jwt_secret: "test-secret".to_string(),
            allowed_email_domain: "dimigo.hs.kr".to_string(),
            google_client_id: Some("client".to_string()),
            dev_auth: false,
            cors_origins: vec!["http://localhost:3000".to_string()],
            storage_dir: "./storage".into(),
            environment: "test".to_string(),
            supertone_api_key: None,
            supertone_base_url: "https://api.supertone.ai".to_string(),
            supertone_local_tts_url: None,
            supertone_local_voice_url: None,
            pronunciation_provider_url: None,
            arxiv_real_enabled: false,
            llm_api_url: None,
            llm_api_key: None,
            llm_model: "test-model".to_string(),
        }
    }

    #[test]
    fn allows_verified_dimigo_hosted_domain() {
        let claims = GoogleClaims {
            email: "student@dimigo.hs.kr".to_string(),
            email_verified: true,
            name: "Student".to_string(),
            picture: None,
            hosted_domain: Some("dimigo.hs.kr".to_string()),
        };
        assert!(require_allowed_email(&claims, &test_config()).is_ok());
    }

    #[test]
    fn rejects_wrong_google_hosted_domain() {
        let claims = GoogleClaims {
            email: "student@dimigo.hs.kr".to_string(),
            email_verified: true,
            name: "Student".to_string(),
            picture: None,
            hosted_domain: Some("gmail.com".to_string()),
        };
        assert!(matches!(
            require_allowed_email(&claims, &test_config()),
            Err(AppError::Forbidden(_))
        ));
    }

    #[test]
    fn rejects_unverified_email() {
        let claims = GoogleClaims {
            email: "student@dimigo.hs.kr".to_string(),
            email_verified: false,
            name: "Student".to_string(),
            picture: None,
            hosted_domain: Some("dimigo.hs.kr".to_string()),
        };
        assert!(matches!(
            require_allowed_email(&claims, &test_config()),
            Err(AppError::Forbidden(_))
        ));
    }
}

#[derive(Debug, Clone)]
pub struct CurrentUser(pub UserDto);

#[async_trait]
impl FromRequestParts<AppState> for CurrentUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let header = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .ok_or(AppError::Unauthorized)?;
        let token = header
            .strip_prefix("Bearer ")
            .ok_or(AppError::Unauthorized)?;
        let data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
            &Validation::default(),
        )
        .map_err(|_| AppError::Unauthorized)?;
        let user_id = Uuid::parse_str(&data.claims.sub).map_err(|_| AppError::Unauthorized)?;
        let user = sqlx::query_as::<_, UserDto>(
            "SELECT id, email, name, picture, email_verified, created_at FROM users WHERE id = $1",
        )
        .bind(user_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::Unauthorized)?;
        Ok(CurrentUser(user))
    }
}
