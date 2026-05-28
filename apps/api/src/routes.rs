use axum::{
    body::Body,
    extract::{Multipart, Path, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
    Json, Router,
};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::Row;
use uuid::Uuid;

use crate::config::Config;
use crate::{
    auth::{
        create_access_token, require_allowed_email, upsert_user, verify_google_id_token,
        CurrentUser,
    },
    dto::{
        AnalyzeRequest, ArxivRecommendation, ConsentAcceptRequest, ConsentRecord,
        ConsentRequirement, ConsentStatusResponse, DeleteAccountResponse, DeleteVoiceDataResponse,
        DeleteVoiceResponse, LoginRequest, LoginResponse, OpenArxivRequest, PassageDto,
        PassageListItem, PassageRow, PrivacySummaryResponse, PronunciationResponse,
        ProviderDiagnosticsResponse, ProviderStatus, TtsRequest, TtsResponse, UserDto,
        VoiceProfileResponse, WordInspectRequest, WordInspectResponse, WritingPromptRequest,
        WritingPromptResponse, WritingResponse, WritingSubmitRequest,
    },
    error::{AppError, AppResult},
    AppState,
};

const CURRENT_CONSENT_VERSION: &str = "beta-privacy-2026-05-v1";
const CONSENT_COLLECTION: &str = "privacy_collection_use";
const CONSENT_EXTERNAL: &str = "external_services_notice";
const CONSENT_PROCESSING: &str = "processing_environment_notice";
const CONSENT_VOICE: &str = "voice_data_cloning";
const CONSENT_SENSITIVE: &str = "learning_voice_sensitive_data";

pub fn router(state: AppState) -> Router {
    let api_routes = Router::new()
        .route("/health", get(health))
        .route("/diagnostics/providers", get(provider_diagnostics))
        .route("/auth/google", post(login))
        .route("/me", get(me).delete(delete_me))
        .route("/me/delete", post(delete_me))
        .route("/me/withdraw-consent", post(withdraw_consent))
        .route("/me/consents", get(consent_status))
        .route("/me/consents/accept", post(accept_consents))
        .route("/me/privacy-summary", get(privacy_summary))
        .route("/me/voice-data", delete(delete_all_voice_data))
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
        .route("/media/*path", get(media));

    Router::new()
        .merge(api_routes.clone())
        .nest("/api", api_routes)
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

async fn provider_diagnostics(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
) -> AppResult<Json<ProviderDiagnosticsResponse>> {
    if !state.config.diagnostics_allowed() {
        return Err(AppError::NotFound);
    }
    require_active_consents(&state, user.id).await?;
    let database_ready = sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&state.pool)
        .await
        .map(|value| value == 1)
        .unwrap_or(false);
    let arxiv_cache = state.arxiv.cache_status().await;
    let providers = provider_statuses(&state.config, database_ready, arxiv_cache);
    Ok(Json(ProviderDiagnosticsResponse {
        enabled: true,
        environment: state.config.environment.clone(),
        providers,
    }))
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

async fn consent_status(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
) -> AppResult<Json<ConsentStatusResponse>> {
    Ok(Json(load_consent_status(&state, user.id).await?))
}

async fn accept_consents(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    headers: HeaderMap,
    Json(payload): Json<ConsentAcceptRequest>,
) -> AppResult<Json<ConsentStatusResponse>> {
    let required = required_consent_requirements();
    let missing = required
        .iter()
        .filter(|item| item.required)
        .filter(|item| {
            !payload
                .accepted
                .iter()
                .any(|accepted| accepted == &item.consent_type)
        })
        .map(|item| item.title.clone())
        .collect::<Vec<_>>();
    if !missing.is_empty() {
        return Err(AppError::BadRequest(format!(
            "required consent items were not accepted: {}",
            missing.join(", ")
        )));
    }

    let audit_metadata = consent_audit_metadata(&headers);
    for item in required {
        sqlx::query(
            r#"
            INSERT INTO user_consents (id, user_id, consent_type, consent_version, audit_metadata)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (user_id, consent_type, consent_version) DO NOTHING
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(user.id)
        .bind(&item.consent_type)
        .bind(&item.consent_version)
        .bind(&audit_metadata)
        .execute(&state.pool)
        .await?;
    }

    Ok(Json(load_consent_status(&state, user.id).await?))
}

async fn privacy_summary(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
) -> AppResult<Json<PrivacySummaryResponse>> {
    require_active_consents(&state, user.id).await?;
    Ok(Json(load_privacy_summary(&state, user.id).await?))
}

async fn delete_all_voice_data(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
) -> AppResult<Json<DeleteVoiceDataResponse>> {
    require_active_consents(&state, user.id).await?;
    Ok(Json(delete_voice_data_for_user(&state, user.id).await?))
}

async fn delete_me(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
) -> AppResult<Json<DeleteAccountResponse>> {
    delete_account_for_user(&state, user.id).await?;
    Ok(Json(DeleteAccountResponse { deleted: true }))
}

async fn withdraw_consent(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
) -> AppResult<Json<DeleteAccountResponse>> {
    delete_account_for_user(&state, user.id).await?;
    Ok(Json(DeleteAccountResponse { deleted: true }))
}

async fn analyze_passage(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Json(payload): Json<AnalyzeRequest>,
) -> AppResult<Json<PassageDto>> {
    require_active_consents(&state, user.id).await?;
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
    require_active_consents(&state, user.id).await?;
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
    require_active_consents(&state, user.id).await?;
    Ok(Json(load_passage(&state, user.id, id).await?))
}

async fn inspect_word(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Json(payload): Json<WordInspectRequest>,
) -> AppResult<Json<WordInspectResponse>> {
    require_active_consents(&state, user.id).await?;
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
    CurrentUser(user): CurrentUser,
    Json(payload): Json<TtsRequest>,
) -> AppResult<Json<TtsResponse>> {
    require_active_consents(&state, user.id).await?;
    if payload.text.trim().is_empty() {
        return Err(AppError::BadRequest("text is required".to_string()));
    }
    let audio = state
        .tts
        .synthesize(&payload.text, payload.voice_id.as_deref(), &state.storage)
        .await?;
    tracing::info!(
        provider = %audio.provider,
        word_count = audio.spoken_words.len(),
        "tts synthesis completed"
    );
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
    require_active_consents(&state, user.id).await?;
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
        "consent_version": consent_version.clone(),
        "warning": "Upload only your own voice or a voice you have explicit permission to use. Cloned voices must not be used to impersonate others."
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
    require_active_consents(&state, user.id).await?;
    let row = sqlx::query("SELECT storage_path FROM voice_profiles WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user.id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;
    let storage_path: String = row.get("storage_path");
    if let Err(err) = state.storage.delete(&storage_path).await {
        tracing::warn!(
            storage_namespace = "voices",
            error = %err,
            "voice file delete failed; removing profile record"
        );
    }
    sqlx::query("DELETE FROM voice_profiles WHERE id = $1 AND user_id = $2")
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
    require_active_consents(&state, user.id).await?;
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
    require_active_consents(&state, user.id).await?;
    let passage = load_passage(&state, user.id, payload.passage_id).await?;
    let prompt = state.llm.writing_prompt(&passage.text).await?;
    Ok(Json(WritingPromptResponse { prompt }))
}

async fn submit_writing(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Json(payload): Json<WritingSubmitRequest>,
) -> AppResult<Json<WritingResponse>> {
    require_active_consents(&state, user.id).await?;
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
    CurrentUser(user): CurrentUser,
) -> AppResult<Json<Vec<ArxivRecommendation>>> {
    require_active_consents(&state, user.id).await?;
    Ok(Json(state.arxiv.recommendations().await?))
}

async fn open_arxiv(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Json(payload): Json<OpenArxivRequest>,
) -> AppResult<Json<PassageDto>> {
    require_active_consents(&state, user.id).await?;
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

fn required_consent_requirements() -> Vec<ConsentRequirement> {
    vec![
        consent_requirement(
            CONSENT_COLLECTION,
            "개인정보 수집 및 이용 동의",
            "운영자 검토가 필요한 베타용 동의 초안입니다. Lingovector는 Google 계정 식별자, 이메일, 이름, 프로필 이미지, 로그인 상태, 지문 분석 기록, 모르는 단어, 영작 제출물, 발음 점수, 업로드한 음성 파일과 생성된 오디오 메타데이터를 학습 기능 제공과 베타 운영/보안 확인을 위해 저장할 수 있습니다. 이 정보는 계정 삭제 또는 필수 동의 철회 전까지 보관하는 것을 기본으로 하며, 운영상 필요한 최소 기록은 별도 검토가 필요합니다.",
        ),
        consent_requirement(
            CONSENT_EXTERNAL,
            "개인정보 제3자 제공 또는 외부 서비스 이용 고지/동의",
            "Lingovector는 Google OAuth로 학교 계정을 확인하고, 설정에 따라 선택적 LLM provider, arXiv, pronunciation provider, storage provider 같은 외부 서비스를 사용할 수 있습니다. 학습 내용이 외부 provider로 전송될 수 있는 경우 운영자는 provider 설정과 전송 범위를 학생에게 안내해야 합니다. provider 이름과 API 설정은 운영 문서에서 확인합니다.",
        ),
        consent_requirement(
            CONSENT_PROCESSING,
            "개인정보 처리위탁/처리환경 고지",
            "베타 서비스는 학교 내부 테스트를 위해 Linux server, Docker Compose, Cloudflare Tunnel, PostgreSQL, local storage 또는 운영자가 지정한 storage 환경에서 동작할 수 있습니다. 운영자는 서버 접근 권한, 백업, 로그, storage 보관 위치를 최소 권한으로 관리해야 합니다.",
        ),
        consent_requirement(
            CONSENT_VOICE,
            "음성 데이터 및 voice cloning 관련 별도 동의",
            "발음 연습과 voice cloning 테스트를 위해 사용자가 업로드한 음성 샘플, 동의 문구, 동의 버전, 파일 메타데이터가 저장될 수 있습니다. 반드시 본인 목소리 또는 명시적 허락을 받은 목소리만 업로드해야 하며, 복제 음성을 다른 사람을 사칭하는 데 사용하면 안 됩니다. 실제 학생 음성 업로드는 동의 흐름 검증 후 진행해야 합니다.",
        ),
        consent_requirement(
            CONSENT_SENSITIVE,
            "민감할 수 있는 학습/음성 데이터 저장 및 삭제 안내",
            "영작 답안, 발음 기록, 모르는 단어, 음성 샘플은 개인의 학습 상태를 드러낼 수 있습니다. 사용자는 설정에서 음성 데이터 삭제, 개인정보 제공 동의 철회, 계정 삭제를 요청할 수 있습니다. 필수 동의를 철회하면 베타 서비스 제공이 어려우므로 계정과 연결된 개인 데이터 삭제 흐름으로 처리됩니다.",
        ),
    ]
}

fn consent_requirement(consent_type: &str, title: &str, body: &str) -> ConsentRequirement {
    ConsentRequirement {
        consent_type: consent_type.to_string(),
        consent_version: CURRENT_CONSENT_VERSION.to_string(),
        title: title.to_string(),
        body: body.to_string(),
        required: true,
        operator_review_required: true,
    }
}

async fn load_consent_status(state: &AppState, user_id: Uuid) -> AppResult<ConsentStatusResponse> {
    let accepted = sqlx::query_as::<_, ConsentRecord>(
        r#"
        SELECT consent_type, consent_version, accepted_at
        FROM user_consents
        WHERE user_id = $1
        ORDER BY accepted_at DESC
        "#,
    )
    .bind(user_id)
    .fetch_all(&state.pool)
    .await?;
    let required = required_consent_requirements();
    let has_required_consents = required.iter().filter(|item| item.required).all(|item| {
        accepted.iter().any(|record| {
            record.consent_type == item.consent_type
                && record.consent_version == item.consent_version
        })
    });
    Ok(ConsentStatusResponse {
        has_required_consents,
        required,
        accepted,
    })
}

async fn require_active_consents(state: &AppState, user_id: Uuid) -> AppResult<()> {
    if load_consent_status(state, user_id)
        .await?
        .has_required_consents
    {
        Ok(())
    } else {
        Err(AppError::ConsentRequired)
    }
}

fn consent_audit_metadata(headers: &HeaderMap) -> Value {
    let ip_hash = headers
        .get("x-forwarded-for")
        .or_else(|| headers.get("x-real-ip"))
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(hash_metadata_value);
    let user_agent_hash = headers
        .get(header::USER_AGENT)
        .and_then(|value| value.to_str().ok())
        .filter(|value| !value.is_empty())
        .map(hash_metadata_value);
    json!({
        "ip_hash": ip_hash,
        "user_agent_hash": user_agent_hash,
        "metadata_policy": "hashed-minimal",
    })
}

fn hash_metadata_value(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    format!("{:x}", hasher.finalize())
}

async fn load_privacy_summary(
    state: &AppState,
    user_id: Uuid,
) -> AppResult<PrivacySummaryResponse> {
    let passages_count = count_user_rows(state, "passages", user_id).await?;
    let unknown_words_count = count_user_rows(state, "unknown_words", user_id).await?;
    let pronunciation_records_count =
        count_user_rows(state, "pronunciation_records", user_id).await?;
    let voice_profiles_count = count_user_rows(state, "voice_profiles", user_id).await?;
    let writing_submissions_count = count_user_rows(state, "writing_submissions", user_id).await?;
    let review_history_count = count_user_rows(state, "review_history", user_id).await?;
    Ok(PrivacySummaryResponse {
        passages_count,
        unknown_words_count,
        pronunciation_records_count,
        voice_profiles_count,
        writing_submissions_count,
        review_history_count,
    })
}

async fn count_user_rows(state: &AppState, table: &str, user_id: Uuid) -> AppResult<i64> {
    let sql = format!("SELECT COUNT(*) FROM {table} WHERE user_id = $1");
    Ok(sqlx::query_scalar::<_, i64>(&sql)
        .bind(user_id)
        .fetch_one(&state.pool)
        .await?)
}

async fn delete_voice_data_for_user(
    state: &AppState,
    user_id: Uuid,
) -> AppResult<DeleteVoiceDataResponse> {
    let rows = sqlx::query("SELECT storage_path FROM voice_profiles WHERE user_id = $1")
        .bind(user_id)
        .fetch_all(&state.pool)
        .await?;
    let storage_paths = rows
        .iter()
        .map(|row| row.get::<String, _>("storage_path"))
        .collect::<Vec<_>>();
    for path in &storage_paths {
        if let Err(err) = state.storage.delete(path).await {
            tracing::warn!(storage_namespace = "voices", error = %err, "voice file delete failed");
        }
    }
    let deleted = sqlx::query("DELETE FROM voice_profiles WHERE user_id = $1")
        .bind(user_id)
        .execute(&state.pool)
        .await?
        .rows_affected();
    Ok(DeleteVoiceDataResponse {
        deleted_profiles: deleted,
        attempted_file_deletions: storage_paths.len(),
    })
}

async fn delete_account_for_user(state: &AppState, user_id: Uuid) -> AppResult<()> {
    let voice_rows = sqlx::query("SELECT storage_path FROM voice_profiles WHERE user_id = $1")
        .bind(user_id)
        .fetch_all(&state.pool)
        .await?;
    let pronunciation_rows =
        sqlx::query("SELECT audio_path FROM pronunciation_records WHERE user_id = $1")
            .bind(user_id)
            .fetch_all(&state.pool)
            .await?;
    let storage_paths = voice_rows
        .iter()
        .map(|row| row.get::<String, _>("storage_path"))
        .chain(
            pronunciation_rows
                .iter()
                .map(|row| row.get::<String, _>("audio_path")),
        )
        .collect::<Vec<_>>();
    for path in &storage_paths {
        if let Err(err) = state.storage.delete(path).await {
            tracing::warn!(error = %err, "user-owned file delete failed during account deletion");
        }
    }
    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(user_id)
        .execute(&state.pool)
        .await?;
    Ok(())
}

fn provider_statuses(
    config: &Config,
    database_ready: bool,
    arxiv_cache: Value,
) -> Vec<ProviderStatus> {
    vec![
        provider_status(
            "db",
            if database_ready {
                "reachable"
            } else {
                "failed"
            },
            if database_ready {
                "PostgreSQL responded to SELECT 1"
            } else {
                "PostgreSQL did not respond to SELECT 1"
            },
            json!({ "kind": "postgres" }),
        ),
        provider_status(
            "auth",
            auth_mode(config),
            auth_detail(config),
            json!({
                "allowed_domain": config.allowed_email_domain,
                "dev_auth": config.dev_auth,
                "google_client_id_configured": config.google_client_id.is_some()
            }),
        ),
        provider_status(
            "llm",
            if config.llm_api_url.is_some() {
                "configured"
            } else {
                "mock"
            },
            if config.llm_api_url.is_some() {
                "OpenAI-compatible LLM endpoint is configured"
            } else {
                "Mock LLM provider is active"
            },
            json!({
                "api_url_configured": config.llm_api_url.is_some(),
                "api_key_configured": config.llm_api_key.is_some(),
                "model": config.llm_model
            }),
        ),
        provider_status(
            "tts",
            if config.supertone_local_tts_url.is_some() || config.supertone_api_key.is_some() {
                "configured"
            } else {
                "mock"
            },
            if config.supertone_local_tts_url.is_some() {
                "Supertone local TTS endpoint is configured"
            } else if config.supertone_api_key.is_some() {
                "Supertone API TTS credentials are configured"
            } else {
                "Mock TTS provider is active"
            },
            json!({
                "local_url_configured": config.supertone_local_tts_url.is_some(),
                "api_key_configured": config.supertone_api_key.is_some(),
                "base_url_configured": !config.supertone_base_url.is_empty()
            }),
        ),
        provider_status(
            "voice_cloning",
            if config.supertone_local_voice_url.is_some() || config.supertone_api_key.is_some() {
                "configured"
            } else {
                "mock"
            },
            if config.supertone_local_voice_url.is_some() {
                "Supertone local voice endpoint is configured"
            } else if config.supertone_api_key.is_some() {
                "Supertone API voice credentials are configured"
            } else {
                "Mock voice cloning provider is active"
            },
            json!({
                "local_url_configured": config.supertone_local_voice_url.is_some(),
                "api_key_configured": config.supertone_api_key.is_some()
            }),
        ),
        provider_status(
            "pronunciation",
            if config.pronunciation_provider_url.is_some() {
                "configured"
            } else {
                "mock"
            },
            if config.pronunciation_provider_url.is_some() {
                "HTTP pronunciation scorer is configured"
            } else {
                "Mock pronunciation scorer is active"
            },
            json!({
                "provider_url_configured": config.pronunciation_provider_url.is_some()
            }),
        ),
        provider_status(
            "arxiv",
            arxiv_mode(config, &arxiv_cache),
            arxiv_detail(config, &arxiv_cache),
            json!({
                "real_enabled": config.arxiv_real_enabled,
                "categories": crate::providers::ARXIV_CATEGORY_QUERIES
                    .iter()
                    .map(|(category, query)| json!({ "category": category, "query": query }))
                    .collect::<Vec<_>>(),
                "cache": arxiv_cache
            }),
        ),
    ]
}

fn provider_status(name: &str, mode: &str, detail: &str, metadata: Value) -> ProviderStatus {
    ProviderStatus {
        name: name.to_string(),
        mode: mode.to_string(),
        detail: detail.to_string(),
        metadata,
    }
}

fn auth_mode(config: &Config) -> &'static str {
    if config.dev_auth || config.google_client_id.is_some() {
        "configured"
    } else if config.is_development() {
        "disabled"
    } else {
        "failed"
    }
}

fn auth_detail(config: &Config) -> &'static str {
    if config.dev_auth {
        "DEV_AUTH local login is enabled"
    } else if config.google_client_id.is_some() {
        "Google OAuth ID token verification is configured"
    } else if config.is_development() {
        "Google OAuth is not configured and DEV_AUTH is disabled"
    } else {
        "Google OAuth must be configured outside development"
    }
}

fn arxiv_mode(config: &Config, cache: &Value) -> &'static str {
    if !config.arxiv_real_enabled {
        return "mock";
    }
    match cache.get("source").and_then(Value::as_str) {
        Some("real") => "reachable",
        Some("fallback") => "failed",
        _ => "configured",
    }
}

fn arxiv_detail(config: &Config, cache: &Value) -> &'static str {
    if !config.arxiv_real_enabled {
        return "Mock arXiv recommendations are active";
    }
    match cache.get("source").and_then(Value::as_str) {
        Some("real") => "Real arXiv fetch succeeded and is cached",
        Some("fallback") => "Real arXiv fetch failed; mock fallback is cached",
        _ => "Real arXiv fetch is enabled; cache has not been warmed yet",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{net::SocketAddr, path::PathBuf};

    fn test_config() -> Config {
        Config {
            bind_addr: "127.0.0.1:0".parse::<SocketAddr>().unwrap(),
            database_url: "postgres://example".to_string(),
            jwt_secret: "test-secret".to_string(),
            allowed_email_domain: "dimigo.hs.kr".to_string(),
            google_client_id: None,
            dev_auth: true,
            cors_origins: vec!["http://localhost:3000".to_string()],
            storage_dir: PathBuf::from("./storage-test"),
            environment: "test".to_string(),
            supertone_api_key: None,
            supertone_base_url: "https://api.supertone.ai".to_string(),
            supertone_local_tts_url: None,
            supertone_local_voice_url: None,
            pronunciation_provider_url: None,
            arxiv_real_enabled: false,
            diagnostics_enabled: false,
            llm_api_url: None,
            llm_api_key: None,
            llm_model: "test-model".to_string(),
        }
    }

    #[test]
    fn provider_status_reports_mock_and_reachable_without_secrets() {
        let config = test_config();
        let statuses = provider_statuses(
            &config,
            true,
            json!({"type": "mock", "status": "static", "entries": 6, "source": "mock"}),
        );
        let db = statuses.iter().find(|item| item.name == "db").unwrap();
        assert_eq!(db.mode, "reachable");
        let tts = statuses.iter().find(|item| item.name == "tts").unwrap();
        assert_eq!(tts.mode, "mock");
        assert!(tts.metadata.get("api_key").is_none());
    }

    #[test]
    fn arxiv_real_fallback_is_reported_as_failed_with_cache_metadata() {
        let mut config = test_config();
        config.arxiv_real_enabled = true;
        let statuses = provider_statuses(
            &config,
            true,
            json!({"type": "memory", "status": "warm", "entries": 6, "source": "fallback"}),
        );
        let arxiv = statuses.iter().find(|item| item.name == "arxiv").unwrap();
        assert_eq!(arxiv.mode, "failed");
        assert_eq!(arxiv.metadata["cache"]["source"], "fallback");
        assert_eq!(arxiv.metadata["categories"].as_array().unwrap().len(), 6);
    }

    #[test]
    fn consent_requirements_cover_current_beta_sections() {
        let required = required_consent_requirements();
        assert_eq!(required.len(), 5);
        assert!(required.iter().all(|item| item.required));
        assert!(required
            .iter()
            .all(|item| item.consent_version == CURRENT_CONSENT_VERSION));
        assert!(required
            .iter()
            .any(|item| item.consent_type == CONSENT_VOICE && item.body.contains("사칭")));
    }

    #[test]
    fn consent_audit_metadata_hashes_raw_headers() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", HeaderValue::from_static("203.0.113.10"));
        headers.insert(
            header::USER_AGENT,
            HeaderValue::from_static("LingovectorTest/1.0"),
        );
        let metadata = consent_audit_metadata(&headers);
        let payload = serde_json::to_string(&metadata).unwrap();
        assert!(!payload.contains("203.0.113.10"));
        assert!(!payload.contains("LingovectorTest"));
        assert_eq!(metadata["metadata_policy"].as_str(), Some("hashed-minimal"));
    }
}
