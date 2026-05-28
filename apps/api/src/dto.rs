use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct UserDto {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub picture: Option<String>,
    pub email_verified: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub id_token: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub access_token: String,
    pub user: UserDto,
}

#[derive(Debug, Deserialize)]
pub struct AnalyzeRequest {
    pub title: Option<String>,
    pub text: String,
    #[serde(default = "default_source")]
    pub source: String,
}

fn default_source() -> String {
    "paste".to_string()
}

#[derive(Debug, Serialize, Clone, sqlx::FromRow)]
pub struct SentenceDto {
    pub id: Uuid,
    pub sentence_index: i32,
    pub text: String,
    pub simple_english: String,
    pub korean_detail: String,
    pub grammar: Value,
    pub chunks: Value,
    pub pos: Value,
    pub structure: Value,
    pub logic_relation: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PassageRow {
    pub id: Uuid,
    pub title: String,
    pub source: String,
    pub text: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct PassageDto {
    pub id: Uuid,
    pub title: String,
    pub source: String,
    pub text: String,
    pub created_at: DateTime<Utc>,
    pub sentences: Vec<SentenceDto>,
}

#[derive(Debug, Serialize)]
pub struct PassageListItem {
    pub id: Uuid,
    pub title: String,
    pub source: String,
    pub created_at: DateTime<Utc>,
    pub sentence_count: i64,
}

#[derive(Debug, Deserialize)]
pub struct WordInspectRequest {
    pub word: String,
    #[serde(default)]
    pub context: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct WordInspectResponse {
    pub word: String,
    pub english_definition: String,
    pub core_meaning: String,
    pub contextual_meaning: String,
    pub korean_support: String,
    pub morphology: Value,
    pub familiarity: i32,
}

#[derive(Debug, Deserialize)]
pub struct TtsRequest {
    pub text: String,
    pub voice_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TtsResponse {
    pub provider: String,
    pub audio_url: String,
    pub spoken_words: Vec<SpokenWord>,
}

#[derive(Debug, Serialize, Clone)]
pub struct SpokenWord {
    pub word: String,
    pub start_ms: u32,
    pub end_ms: u32,
}

#[derive(Debug, Serialize)]
pub struct VoiceProfileResponse {
    pub id: Uuid,
    pub provider: String,
    pub provider_voice_id: String,
    pub consent_text: String,
}

#[derive(Debug, Serialize)]
pub struct PronunciationResponse {
    pub id: Uuid,
    pub score: Value,
}

#[derive(Debug, Deserialize)]
pub struct WritingPromptRequest {
    pub passage_id: Uuid,
}

#[derive(Debug, Serialize)]
pub struct WritingPromptResponse {
    pub prompt: String,
}

#[derive(Debug, Deserialize)]
pub struct WritingSubmitRequest {
    pub passage_id: Option<Uuid>,
    pub prompt: String,
    pub response: String,
}

#[derive(Debug, Serialize)]
pub struct WritingResponse {
    pub id: Uuid,
    pub scores: Value,
    pub korean_like_translation: Value,
    pub revised: String,
    pub explanation: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ArxivRecommendation {
    pub id: String,
    pub category: String,
    pub title: String,
    pub abstract_text: String,
    pub difficulty: String,
    pub reason: String,
    pub key_vocabulary: Vec<String>,
    pub writing_prompt: String,
}

#[derive(Debug, Deserialize)]
pub struct OpenArxivRequest {
    pub id: String,
}
