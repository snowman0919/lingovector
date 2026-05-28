use axum::{
    body::Body,
    extract::{Multipart, Path, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
    Json, Router,
};
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    auth::{
        create_access_token, require_allowed_email, upsert_user, verify_google_id_token,
        CurrentUser,
    },
    dto::{
        AnalyzeRequest, ArxivRecommendation, DeleteVoiceResponse, LoginRequest, LoginResponse,
        OpenArxivRequest, PassageDto, PassageListItem, PassageRow, PronunciationResponse,
        TtsRequest, TtsResponse, UserDto, VoiceProfileResponse, WordInspectRequest,
        WordInspectResponse, WritingPromptRequest, WritingPromptResponse, WritingResponse,
        WritingSubmitRequest,
    },
    error::{AppError, AppResult},
    AppState,
};

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/auth/google", post(login))
        .route("/me", get(me))
        .route("/passages", get(list_passages))
        .route("/passages/analyze", post(analyze_passage))
        .route("/passages/:id", get(get_passage))
        .route("/words/inspect", post(inspect_word))
        .route("/tts", post(tts))
        .route("/voices/upload", post(upload_voice))
        .route("/voices/:id", delete(delete_voice))
        .route("/pronunciation/score", post(score_pronunciation))
        .route("/writing/prompts", post(writing_prompt))
        .route("/writing/submit", post(submit_writing))
        .route("/arxiv/recommendations", get(arxiv_recommendations))
        .route("/arxiv/open", post(open_arxiv))
        .route("/media/*path", get(media))
        .with_state(state)
}

async fn health(State(state): State<AppState>) -> (StatusCode, Json<Value>) {
    let database_ready = sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&state.pool)
        .await
        .map(|value| value == 1)
        .unwrap_or(false);
    let status = if database_ready {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    (
        status,
        Json(json!({
            "ok": database_ready,
            "service": "lingovector-api",
            "version": "0.3.0",
            "database": {"ready": database_ready}
        })),
    )
}

async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> AppResult<Json<LoginResponse>> {
    let claims = verify_google_id_token(&payload.id_token, &state.config).await?;
    require_allowed_email(&claims, &state.config)?;
    let user = upsert_user(&state.pool, &claims).await?;
    let access_token = create_access_token(&user, &state.config)?;
    Ok(Json(LoginResponse { access_token, user }))
}

async fn me(CurrentUser(user): CurrentUser) -> Json<UserDto> {
    Json(user)
}

async fn analyze_passage(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Json(payload): Json<AnalyzeRequest>,
) -> AppResult<Json<PassageDto>> {
    let text = payload.text.trim();
    if text.is_empty() {
        return Err(AppError::BadRequest("passage text is required".to_string()));
    }
    let title = payload
        .title
        .filter(|title| !title.trim().is_empty())
        .unwrap_or_else(|| text.chars().take(48).collect());
    let passage_id = Uuid::new_v4();
    let passage = sqlx::query_as::<_, PassageRow>(
        r#"
        INSERT INTO passages (id, user_id, title, source, text)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, title, source, text, created_at
        "#,
    )
    .bind(passage_id)
    .bind(user.id)
    .bind(title)
    .bind(payload.source)
    .bind(text)
    .fetch_one(&state.pool)
    .await?;

    let analyzed = state.llm.analyze_passage(text).await?;
    for sentence in analyzed {
        sqlx::query(
            r#"
            INSERT INTO sentence_analyses
            (id, passage_id, sentence_index, text, simple_english, korean_detail, grammar, chunks, pos, structure, logic_relation)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(passage.id)
        .bind(sentence.index)
        .bind(sentence.text)
        .bind(sentence.simple_english)
        .bind(sentence.korean_detail)
        .bind(sentence.grammar)
        .bind(sentence.chunks)
        .bind(sentence.pos)
        .bind(sentence.structure)
        .bind(sentence.logic_relation)
        .execute(&state.pool)
        .await?;
    }
    record_review(
        &state,
        user.id,
        "passage",
        passage.id.to_string(),
        "analyzed",
        json!({}),
    )
    .await?;
    Ok(Json(load_passage(&state, user.id, passage.id).await?))
}

async fn list_passages(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
) -> AppResult<Json<Vec<PassageListItem>>> {
    let rows = sqlx::query(
        r#"
        SELECT p.id, p.title, p.source, p.created_at, COUNT(s.id) AS sentence_count
        FROM passages p
        LEFT JOIN sentence_analyses s ON s.passage_id = p.id
        WHERE p.user_id = $1
        GROUP BY p.id
        ORDER BY p.created_at DESC
        LIMIT 40
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await?;
    let passages = rows
        .into_iter()
        .map(|row| PassageListItem {
            id: row.get("id"),
            title: row.get("title"),
            source: row.get("source"),
            created_at: row.get("created_at"),
            sentence_count: row.get("sentence_count"),
        })
        .collect();
    Ok(Json(passages))
}

async fn get_passage(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<PassageDto>> {
    Ok(Json(load_passage(&state, user.id, id).await?))
}

async fn inspect_word(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Json(payload): Json<WordInspectRequest>,
) -> AppResult<Json<WordInspectResponse>> {
    let word = payload.word.trim().to_lowercase();
    if word.is_empty() {
        return Err(AppError::BadRequest("word is required".to_string()));
    }
    let row = sqlx::query(
        r#"
        INSERT INTO unknown_words (id, user_id, word, familiarity, last_seen_at)
        VALUES ($1, $2, $3, 0, now())
        ON CONFLICT (user_id, word) DO UPDATE SET last_seen_at = now()
        RETURNING familiarity
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(user.id)
    .bind(&word)
    .fetch_one(&state.pool)
    .await?;
    let familiarity: i32 = row.get("familiarity");
    let result = state
        .llm
        .inspect_word(&word, &payload.context, familiarity)
        .await?;
    Ok(Json(result))
}

async fn tts(
    State(state): State<AppState>,
    CurrentUser(_user): CurrentUser,
    Json(payload): Json<TtsRequest>,
) -> AppResult<Json<TtsResponse>> {
    if payload.text.trim().is_empty() {
        return Err(AppError::BadRequest("text is required".to_string()));
    }
    let audio = state
        .tts
        .synthesize(&payload.text, payload.voice_id.as_deref(), &state.storage)
        .await?;
    Ok(Json(TtsResponse {
        provider: audio.provider,
        audio_url: state.storage.public_url(&audio.storage_path),
        spoken_words: audio.spoken_words,
    }))
}

async fn upload_voice(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    mut multipart: Multipart,
) -> AppResult<Json<VoiceProfileResponse>> {
    let mut consent_text = String::new();
    let mut name = "My voice".to_string();
    let mut audio_bytes = Vec::new();
    let mut filename = "voice-sample.webm".to_string();
    let mut content_type = "application/octet-stream".to_string();
    let consent_version = "voice-consent-v1".to_string();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|err| AppError::BadRequest(err.to_string()))?
    {
        let field_name = field.name().unwrap_or_default().to_string();
        if field_name == "consent_text" {
            consent_text = field
                .text()
                .await
                .map_err(|err| AppError::BadRequest(err.to_string()))?;
        } else if field_name == "name" {
            name = field
                .text()
                .await
                .map_err(|err| AppError::BadRequest(err.to_string()))?;
        } else if field_name == "file" {
            if let Some(file_name) = field.file_name() {
                filename = file_name.to_string();
            }
            if let Some(kind) = field.content_type() {
                content_type = kind.to_string();
            }
            audio_bytes = field
                .bytes()
                .await
                .map_err(|err| AppError::BadRequest(err.to_string()))?
                .to_vec();
        }
    }

    if audio_bytes.is_empty() {
        return Err(AppError::BadRequest(
            "voice sample file is required".to_string(),
        ));
    }
    let stored = state
        .storage
        .save_bytes("voices", &filename, &audio_bytes)
        .await?;
    let cloned = state.voice.clone_voice(&audio_bytes, &consent_text).await?;
    let id = Uuid::new_v4();
    let metadata = json!({
        "original_filename": filename,
        "content_type": content_type,
        "byte_size": audio_bytes.len(),
        "warning": "Voice cloning requires explicit user consent and should only use the user's own voice."
    });
    sqlx::query(
        r#"
        INSERT INTO voice_profiles
        (id, user_id, name, provider, provider_voice_id, consent_text, storage_path, consent_version, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        "#,
    )
    .bind(id)
    .bind(user.id)
    .bind(name)
    .bind(&cloned.provider)
    .bind(&cloned.provider_voice_id)
    .bind(&consent_text)
    .bind(&stored)
    .bind(&consent_version)
    .bind(&metadata)
    .execute(&state.pool)
    .await?;
    Ok(Json(VoiceProfileResponse {
        id,
        provider: cloned.provider,
        provider_voice_id: cloned.provider_voice_id,
        consent_text,
        consent_version,
        metadata,
    }))
}

async fn delete_voice(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<DeleteVoiceResponse>> {
    let row = sqlx::query(
        "SELECT storage_path FROM voice_profiles WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
    )
    .bind(id)
    .bind(user.id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;
    let storage_path: String = row.get("storage_path");
    state.storage.delete(&storage_path).await?;
    sqlx::query("UPDATE voice_profiles SET deleted_at = now() WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user.id)
        .execute(&state.pool)
        .await?;
    Ok(Json(DeleteVoiceResponse { id, deleted: true }))
}

async fn score_pronunciation(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    mut multipart: Multipart,
) -> AppResult<Json<PronunciationResponse>> {
    let mut target_text = String::new();
    let mut sentence_id: Option<Uuid> = None;
    let mut audio_bytes = Vec::new();
    let mut filename = "pronunciation.webm".to_string();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|err| AppError::BadRequest(err.to_string()))?
    {
        let field_name = field.name().unwrap_or_default().to_string();
        if field_name == "target_text" {
            target_text = field
                .text()
                .await
                .map_err(|err| AppError::BadRequest(err.to_string()))?;
        } else if field_name == "sentence_id" {
            let value = field
                .text()
                .await
                .map_err(|err| AppError::BadRequest(err.to_string()))?;
            sentence_id = Uuid::parse_str(value.trim()).ok();
        } else if field_name == "file" {
            if let Some(file_name) = field.file_name() {
                filename = file_name.to_string();
            }
            audio_bytes = field
                .bytes()
                .await
                .map_err(|err| AppError::BadRequest(err.to_string()))?
                .to_vec();
        }
    }
    if target_text.trim().is_empty() {
        return Err(AppError::BadRequest("target_text is required".to_string()));
    }
    if audio_bytes.is_empty() {
        audio_bytes = b"mock recording".to_vec();
    }
    let score = state
        .pronunciation
        .score(&target_text, &audio_bytes)
        .await?;
    let stored = state
        .storage
        .save_bytes("audio", &filename, &audio_bytes)
        .await?;
    let id = Uuid::new_v4();
    sqlx::query(
        r#"
        INSERT INTO pronunciation_records (id, user_id, sentence_id, target_text, audio_path, score)
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
    )
    .bind(id)
    .bind(user.id)
    .bind(sentence_id)
    .bind(target_text)
    .bind(stored)
    .bind(&score)
    .execute(&state.pool)
    .await?;
    Ok(Json(PronunciationResponse { id, score }))
}

async fn writing_prompt(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Json(payload): Json<WritingPromptRequest>,
) -> AppResult<Json<WritingPromptResponse>> {
    let passage = load_passage(&state, user.id, payload.passage_id).await?;
    let prompt = state.llm.writing_prompt(&passage.text).await?;
    Ok(Json(WritingPromptResponse { prompt }))
}

async fn submit_writing(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Json(payload): Json<WritingSubmitRequest>,
) -> AppResult<Json<WritingResponse>> {
    if payload.response.trim().is_empty() {
        return Err(AppError::BadRequest(
            "writing response is required".to_string(),
        ));
    }
    let feedback = state
        .llm
        .score_writing(&payload.prompt, &payload.response)
        .await?;
    let id = Uuid::new_v4();
    sqlx::query(
        r#"
        INSERT INTO writing_submissions
        (id, user_id, passage_id, prompt, response, scores, korean_like_translation, revised, explanation)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        "#,
    )
    .bind(id)
    .bind(user.id)
    .bind(payload.passage_id)
    .bind(&payload.prompt)
    .bind(&payload.response)
    .bind(&feedback.scores)
    .bind(&feedback.korean_like_translation)
    .bind(&feedback.revised)
    .bind(&feedback.explanation)
    .execute(&state.pool)
    .await?;
    Ok(Json(WritingResponse {
        id,
        scores: feedback.scores,
        korean_like_translation: feedback.korean_like_translation,
        original: payload.response,
        revised: feedback.revised,
        explanation: feedback.explanation,
    }))
}

async fn arxiv_recommendations(
    State(state): State<AppState>,
    CurrentUser(_user): CurrentUser,
) -> AppResult<Json<Vec<ArxivRecommendation>>> {
    Ok(Json(state.arxiv.recommendations().await?))
}

async fn open_arxiv(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Json(payload): Json<OpenArxivRequest>,
) -> AppResult<Json<PassageDto>> {
    let paper = state
        .arxiv
        .find(&payload.id)
        .await?
        .ok_or(AppError::NotFound)?;
    let request = AnalyzeRequest {
        title: Some(paper.title),
        text: paper.abstract_text,
        source: "arxiv".to_string(),
    };
    analyze_passage(State(state), CurrentUser(user), Json(request)).await
}

async fn media(State(state): State<AppState>, Path(path): Path<String>) -> AppResult<Response> {
    let safe_path = path
        .split('/')
        .filter(|part| !part.is_empty() && *part != "..")
        .collect::<Vec<_>>()
        .join("/");
    let full_path = state.storage.full_path(&safe_path);
    let bytes = tokio::fs::read(full_path).await?;
    let content_type = if safe_path.ends_with(".wav") {
        "audio/wav"
    } else if safe_path.ends_with(".webm") {
        "audio/webm"
    } else {
        "application/octet-stream"
    };
    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
    Ok((StatusCode::OK, headers, Body::from(bytes)).into_response())
}

async fn load_passage(state: &AppState, user_id: Uuid, passage_id: Uuid) -> AppResult<PassageDto> {
    let passage = sqlx::query_as::<_, PassageRow>(
        "SELECT id, title, source, text, created_at FROM passages WHERE id = $1 AND user_id = $2",
    )
    .bind(passage_id)
    .bind(user_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;
    let sentences = sqlx::query_as(
        r#"
        SELECT id, sentence_index, text, simple_english, korean_detail, grammar, chunks, pos, structure, logic_relation
        FROM sentence_analyses
        WHERE passage_id = $1
        ORDER BY sentence_index ASC
        "#,
    )
    .bind(passage.id)
    .fetch_all(&state.pool)
    .await?;
    Ok(PassageDto {
        id: passage.id,
        title: passage.title,
        source: passage.source,
        text: passage.text,
        created_at: passage.created_at,
        sentences,
    })
}

async fn record_review(
    state: &AppState,
    user_id: Uuid,
    item_type: &str,
    item_ref: String,
    result: &str,
    metadata: Value,
) -> AppResult<()> {
    sqlx::query(
        r#"
        INSERT INTO review_history (id, user_id, item_type, item_ref, result, metadata)
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(user_id)
    .bind(item_type)
    .bind(item_ref)
    .bind(result)
    .bind(metadata)
    .execute(&state.pool)
    .await?;
    Ok(())
}
