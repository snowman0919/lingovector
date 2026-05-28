mod auth;
mod config;
mod dto;
mod error;
mod providers;
mod routes;
mod storage;

use std::sync::Arc;

use axum::http::{HeaderValue, Method};
use config::Config;
use providers::{
    ArxivProvider, LlmProvider, MockArxivProvider, MockLlmProvider, MockPronunciationProvider,
    MockTtsProvider, MockVoiceProvider, PronunciationProvider, SupertoneTtsProvider, TtsProvider,
    VoiceProvider,
};
use sqlx::postgres::PgPoolOptions;
use storage::LocalStorage;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub pool: sqlx::PgPool,
    pub storage: LocalStorage,
    pub llm: Arc<dyn LlmProvider>,
    pub tts: Arc<dyn TtsProvider>,
    pub voice: Arc<dyn VoiceProvider>,
    pub pronunciation: Arc<dyn PronunciationProvider>,
    pub arxiv: Arc<dyn ArxivProvider>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::from_env()?;
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&config.database_url)
        .await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    tokio::fs::create_dir_all(&config.storage_dir).await?;

    let storage = LocalStorage::new(config.storage_dir.clone());
    let tts: Arc<dyn TtsProvider> =
        if config.supertone_api_key.is_some() || config.supertone_local_tts_url.is_some() {
            Arc::new(SupertoneTtsProvider {
                local_url: config.supertone_local_tts_url.clone(),
            })
        } else {
            Arc::new(MockTtsProvider)
        };
    let state = AppState {
        config: config.clone(),
        pool,
        storage,
        llm: Arc::new(MockLlmProvider),
        tts,
        voice: Arc::new(MockVoiceProvider),
        pronunciation: Arc::new(MockPronunciationProvider),
        arxiv: Arc::new(MockArxivProvider),
    };

    let origins = config
        .cors_origins
        .iter()
        .map(|origin| origin.parse::<HeaderValue>())
        .collect::<Result<Vec<_>, _>>()?;
    let cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(tower_http::cors::Any)
        .allow_origin(origins);

    let app = routes::router(state)
        .layer(cors)
        .layer(TraceLayer::new_for_http());
    let listener = tokio::net::TcpListener::bind(config.bind_addr).await?;
    tracing::info!("Lingovector API listening on {}", config.bind_addr);
    axum::serve(listener, app).await?;
    Ok(())
}
