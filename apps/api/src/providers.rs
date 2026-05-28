use async_trait::async_trait;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    dto::{ArxivRecommendation, SpokenWord, WordInspectResponse},
    error::{AppError, AppResult},
    storage::LocalStorage,
};

#[derive(Clone)]
pub struct AnalyzedSentence {
    pub index: i32,
    pub text: String,
    pub simple_english: String,
    pub korean_detail: String,
    pub grammar: Value,
    pub chunks: Value,
    pub pos: Value,
    pub structure: Value,
    pub logic_relation: String,
}

#[derive(Clone)]
pub struct TtsAudio {
    pub provider: String,
    pub storage_path: String,
    pub spoken_words: Vec<SpokenWord>,
}

#[derive(Clone)]
pub struct VoiceClone {
    pub provider: String,
    pub provider_voice_id: String,
}

#[derive(Clone)]
pub struct WritingFeedback {
    pub scores: Value,
    pub korean_like_translation: Value,
    pub revised: String,
    pub explanation: String,
}

#[async_trait]
pub trait LlmProvider: Send + Sync {
    async fn analyze_passage(&self, text: &str) -> AppResult<Vec<AnalyzedSentence>>;
    async fn inspect_word(
        &self,
        word: &str,
        context: &str,
        familiarity: i32,
    ) -> AppResult<WordInspectResponse>;
    async fn writing_prompt(&self, passage: &str) -> AppResult<String>;
    async fn score_writing(&self, prompt: &str, response: &str) -> AppResult<WritingFeedback>;
}

#[async_trait]
pub trait TtsProvider: Send + Sync {
    async fn synthesize(
        &self,
        text: &str,
        voice_id: Option<&str>,
        storage: &LocalStorage,
    ) -> AppResult<TtsAudio>;
}

#[async_trait]
pub trait VoiceProvider: Send + Sync {
    async fn clone_voice(&self, bytes: &[u8], consent_text: &str) -> AppResult<VoiceClone>;
}

#[async_trait]
pub trait PronunciationProvider: Send + Sync {
    async fn score(&self, target_text: &str, audio_bytes: &[u8]) -> AppResult<Value>;
}

#[async_trait]
pub trait ArxivProvider: Send + Sync {
    async fn recommendations(&self) -> AppResult<Vec<ArxivRecommendation>>;
}

#[derive(Clone, Default)]
pub struct MockLlmProvider;

#[async_trait]
impl LlmProvider for MockLlmProvider {
    async fn analyze_passage(&self, text: &str) -> AppResult<Vec<AnalyzedSentence>> {
        let sentences = split_sentences(text);
        Ok(sentences
            .into_iter()
            .enumerate()
            .map(|(idx, sentence)| {
                let words = tokenize(&sentence);
                let chunks = chunk_words(&words);
                AnalyzedSentence {
                    index: idx as i32,
                    simple_english: format!("This sentence mainly says: {}.", plain_summary(&sentence)),
                    korean_detail: format!(
                        "이 문장은 먼저 핵심 주어를 잡고, 동사 방향을 확인한 뒤, 뒤의 수식어가 생각을 어떻게 좁히는지 따라가면 됩니다. 번역문을 외우기보다 '{}'가 어떤 판단을 세우는지 보세요.",
                        first_content_word(&words)
                    ),
                    grammar: json!({
                        "main_clause": detect_main_clause(&words),
                        "tense_or_modality": detect_tense(&words),
                        "note": "Mock analysis uses heuristics; connect an LLM provider for deeper grammar."
                    }),
                    chunks,
                    pos: json!(words.iter().enumerate().map(|(i, w)| json!({
                        "token": w,
                        "label": guess_pos(w),
                        "start": i,
                        "end": i + 1
                    })).collect::<Vec<_>>()),
                    structure: json!([
                        {"label": "Subject / Topic", "text": subject_slice(&words), "role": "idea anchor"},
                        {"label": "Predicate", "text": predicate_slice(&words), "role": "main movement"},
                        {"label": "Expansion", "text": expansion_slice(&words), "role": "detail, reason, contrast, or condition"}
                    ]),
                    logic_relation: detect_logic(&sentence),
                    text: sentence,
                }
            })
            .collect())
    }

    async fn inspect_word(
        &self,
        word: &str,
        context: &str,
        familiarity: i32,
    ) -> AppResult<WordInspectResponse> {
        let clean = word
            .trim_matches(|c: char| !c.is_alphabetic())
            .to_lowercase();
        let morphology = reliable_morphology(&clean);
        Ok(WordInspectResponse {
            word: clean.clone(),
            english_definition: format!("A context-sensitive meaning for '{clean}' that should be checked against the sentence."),
            core_meaning: core_meaning(&clean),
            contextual_meaning: if context.is_empty() {
                "No sentence context was provided, so this remains a general reading.".to_string()
            } else {
                format!("In this context, '{clean}' helps shape the sentence's exact claim instead of acting as a one-word Korean translation.")
            },
            korean_support: format!("'{clean}'는 문장 속 역할을 먼저 보고 한국어 의미를 보조적으로 붙이는 방식으로 학습하세요."),
            morphology,
            familiarity,
        })
    }

    async fn writing_prompt(&self, passage: &str) -> AppResult<String> {
        Ok(format!(
            "In 120-180 words, explain the central idea of this passage and add one original example. Avoid translating Korean thoughts word-for-word. Passage focus: {}",
            plain_summary(passage)
        ))
    }

    async fn score_writing(&self, _prompt: &str, response: &str) -> AppResult<WritingFeedback> {
        let words = tokenize(response);
        let length_score = ((words.len() as i32).min(160) / 20 + 2).clamp(1, 9);
        let korean_like = detect_korean_like(response);
        let scores = json!({
            "Grammar": length_score,
            "Vocabulary": (length_score + 1).min(9),
            "Nuance": if korean_like.as_array().unwrap().is_empty() { 7 } else { 5 },
            "Logic": if response.contains("because") || response.contains("therefore") { 8 } else { 6 },
            "Structure": if response.len() > 240 { 7 } else { 5 },
            "Clarity": 7,
            "Naturalness": if korean_like.as_array().unwrap().is_empty() { 7 } else { 5 }
        });
        Ok(WritingFeedback {
            scores,
            korean_like_translation: korean_like,
            revised: revise_mock(response),
            explanation: "The revision tightens the claim, uses English-first connectors, and replaces translated phrasing with a clearer idea flow.".to_string(),
        })
    }
}

#[derive(Clone, Default)]
pub struct MockTtsProvider;

#[async_trait]
impl TtsProvider for MockTtsProvider {
    async fn synthesize(
        &self,
        text: &str,
        _voice_id: Option<&str>,
        storage: &LocalStorage,
    ) -> AppResult<TtsAudio> {
        let path = storage.save_mock_wav("audio", "mock-tts").await?;
        Ok(TtsAudio {
            provider: "mock".to_string(),
            storage_path: path,
            spoken_words: timed_words(text),
        })
    }
}

#[derive(Clone)]
pub struct SupertoneTtsProvider {
    pub local_url: Option<String>,
}

#[async_trait]
impl TtsProvider for SupertoneTtsProvider {
    async fn synthesize(
        &self,
        text: &str,
        voice_id: Option<&str>,
        storage: &LocalStorage,
    ) -> AppResult<TtsAudio> {
        if let Some(url) = &self.local_url {
            let body = json!({ "text": text, "voice_id": voice_id });
            let bytes = reqwest::Client::new()
                .post(url)
                .json(&body)
                .send()
                .await
                .map_err(|err| AppError::Provider(err.to_string()))?
                .error_for_status()
                .map_err(|err| AppError::Provider(err.to_string()))?
                .bytes()
                .await
                .map_err(|err| AppError::Provider(err.to_string()))?;
            let path = storage.save_bytes("audio", "supertone.wav", &bytes).await?;
            return Ok(TtsAudio {
                provider: "supertone-local".to_string(),
                storage_path: path,
                spoken_words: timed_words(text),
            });
        }
        MockTtsProvider.synthesize(text, voice_id, storage).await
    }
}

#[derive(Clone, Default)]
pub struct MockVoiceProvider;

#[async_trait]
impl VoiceProvider for MockVoiceProvider {
    async fn clone_voice(&self, bytes: &[u8], consent_text: &str) -> AppResult<VoiceClone> {
        if bytes.len() < 32 {
            return Err(AppError::BadRequest(
                "voice sample is too small".to_string(),
            ));
        }
        if !consent_text.to_lowercase().contains("consent") && !consent_text.contains("동의") {
            return Err(AppError::BadRequest(
                "voice cloning consent text is required".to_string(),
            ));
        }
        Ok(VoiceClone {
            provider: "mock".to_string(),
            provider_voice_id: format!("mock-voice-{}", Uuid::new_v4()),
        })
    }
}

#[derive(Clone, Default)]
pub struct MockPronunciationProvider;

#[async_trait]
impl PronunciationProvider for MockPronunciationProvider {
    async fn score(&self, target_text: &str, audio_bytes: &[u8]) -> AppResult<Value> {
        let size_factor = ((audio_bytes.len() / 1024) as i32).clamp(1, 10);
        Ok(json!({
            "pronunciation": 70 + size_factor,
            "stress": 68 + size_factor,
            "intonation": 66 + size_factor,
            "speed": 72,
            "rhythm": 69 + size_factor,
            "overall": 70 + size_factor,
            "target_text": target_text,
            "feedback": [
                "Keep stressed content words longer.",
                "Do not flatten the final clause; let the pitch fall at the end.",
                "Practice linking function words lightly."
            ],
            "provider": "mock"
        }))
    }
}

#[derive(Clone, Default)]
pub struct MockArxivProvider;

#[async_trait]
impl ArxivProvider for MockArxivProvider {
    async fn recommendations(&self) -> AppResult<Vec<ArxivRecommendation>> {
        Ok(sample_arxiv())
    }
}

pub fn find_arxiv(id: &str) -> Option<ArxivRecommendation> {
    sample_arxiv().into_iter().find(|paper| paper.id == id)
}

fn split_sentences(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    for ch in text.chars() {
        current.push(ch);
        if matches!(ch, '.' | '?' | '!') {
            let trimmed = current.trim();
            if !trimmed.is_empty() {
                out.push(trimmed.to_string());
            }
            current.clear();
        }
    }
    let trimmed = current.trim();
    if !trimmed.is_empty() {
        out.push(trimmed.to_string());
    }
    out
}

fn tokenize(text: &str) -> Vec<String> {
    text.split_whitespace()
        .map(|w| {
            w.trim_matches(|c: char| !c.is_alphanumeric() && c != '-')
                .to_string()
        })
        .filter(|w| !w.is_empty())
        .collect()
}

fn timed_words(text: &str) -> Vec<SpokenWord> {
    tokenize(text)
        .into_iter()
        .enumerate()
        .map(|(i, word)| SpokenWord {
            word,
            start_ms: (i as u32) * 420,
            end_ms: (i as u32) * 420 + 360,
        })
        .collect()
}

fn guess_pos(word: &str) -> &'static str {
    let lower = word.to_lowercase();
    if ["a", "an", "the"].contains(&lower.as_str()) {
        "DET"
    } else if ["and", "but", "or", "because", "although", "while"].contains(&lower.as_str()) {
        "CONJ"
    } else if lower.ends_with("ly") {
        "ADV"
    } else if lower.ends_with("ing") || lower.ends_with("ed") {
        "VERB"
    } else if lower.ends_with("ive") || lower.ends_with("al") || lower.ends_with("ous") {
        "ADJ"
    } else {
        "NOUN"
    }
}

fn chunk_words(words: &[String]) -> Value {
    let chunks = words
        .chunks(4)
        .enumerate()
        .map(|(i, chunk)| {
            json!({
                "label": format!("chunk {}", i + 1),
                "text": chunk.join(" "),
                "function": match i {
                    0 => "sets up the topic",
                    1 => "moves the claim forward",
                    _ => "adds detail or relation"
                }
            })
        })
        .collect::<Vec<_>>();
    json!(chunks)
}

fn detect_logic(sentence: &str) -> String {
    let lower = sentence.to_lowercase();
    if lower.contains("because") || lower.contains("therefore") {
        "cause-effect".to_string()
    } else if lower.contains("although") || lower.contains("but") || lower.contains("however") {
        "contrast".to_string()
    } else if lower.contains("if ") {
        "condition".to_string()
    } else {
        "claim/elaboration".to_string()
    }
}

fn detect_tense(words: &[String]) -> String {
    if words.iter().any(|w| w.eq_ignore_ascii_case("will")) {
        "future or prediction".to_string()
    } else if words.iter().any(|w| w.ends_with("ed")) {
        "past or completed action".to_string()
    } else {
        "present/general statement".to_string()
    }
}

fn detect_main_clause(words: &[String]) -> String {
    words.iter().take(8).cloned().collect::<Vec<_>>().join(" ")
}

fn subject_slice(words: &[String]) -> String {
    words.iter().take(3).cloned().collect::<Vec<_>>().join(" ")
}

fn predicate_slice(words: &[String]) -> String {
    words
        .iter()
        .skip(3)
        .take(5)
        .cloned()
        .collect::<Vec<_>>()
        .join(" ")
}

fn expansion_slice(words: &[String]) -> String {
    words.iter().skip(8).cloned().collect::<Vec<_>>().join(" ")
}

fn first_content_word(words: &[String]) -> String {
    words
        .iter()
        .find(|w| !["the", "a", "an", "of", "to", "in"].contains(&w.to_lowercase().as_str()))
        .cloned()
        .unwrap_or_else(|| "the main idea".to_string())
}

fn plain_summary(text: &str) -> String {
    let words = tokenize(text);
    words.into_iter().take(16).collect::<Vec<_>>().join(" ")
}

fn core_meaning(word: &str) -> String {
    if word.ends_with("tion") {
        "a process, result, or abstract noun built from an action".to_string()
    } else if word.ends_with("ive") {
        "a quality that tends to do or cause something".to_string()
    } else if word.ends_with("ly") {
        "a manner or attitude toward an action".to_string()
    } else {
        "the central idea should be learned from repeated sentence contexts, not a fixed Korean match".to_string()
    }
}

fn reliable_morphology(word: &str) -> Value {
    let mut notes = vec![];
    if let Some(stem) = word.strip_suffix("tion") {
        notes.push(json!({"type": "suffix", "form": "-tion", "meaning": "noun of action/result", "stem": stem}));
    }
    if let Some(stem) = word.strip_suffix("ly") {
        notes.push(json!({"type": "suffix", "form": "-ly", "meaning": "adverb-forming suffix", "stem": stem}));
    }
    if let Some(stem) = word.strip_prefix("un") {
        if stem.len() > 3 {
            notes.push(
                json!({"type": "prefix", "form": "un-", "meaning": "not/reverse", "stem": stem}),
            );
        }
    }
    if notes.is_empty() {
        json!({"confidence": "low", "analysis": [], "note": "No reliable root/stem/affix analysis is forced for this word."})
    } else {
        json!({"confidence": "medium", "analysis": notes, "note": "Heuristic morphology; verify with a dictionary for exam-critical study."})
    }
}

fn detect_korean_like(response: &str) -> Value {
    let mut issues = Vec::new();
    let lower = response.to_lowercase();
    if lower.contains("it is very important thing") {
        issues.push(
            json!({"phrase": "important thing", "suggestion": "important / a crucial issue"}),
        );
    }
    if lower.contains("i think that") {
        issues.push(json!({"phrase": "I think that", "suggestion": "Often omit or replace with a direct claim."}));
    }
    if lower.contains("many informations") {
        issues.push(json!({"phrase": "many informations", "suggestion": "much information / many pieces of information"}));
    }
    json!(issues)
}

fn revise_mock(response: &str) -> String {
    let revised = response
        .replace("many informations", "much information")
        .replace("important thing", "important issue")
        .replace("I think that ", "");
    if revised == response {
        format!("{} {}", response.trim(), "This point becomes stronger when it is connected to a concrete example and a clear consequence.")
    } else {
        revised
    }
}

fn sample_arxiv() -> Vec<ArxivRecommendation> {
    vec![
        ArxivRecommendation {
            id: "security-zero-trust-abstract".to_string(),
            category: "Security".to_string(),
            title: "Measuring Trust Boundaries in School Network Authentication".to_string(),
            abstract_text: "Modern authentication systems must reason about device state, identity assurance, and contextual risk. This paper studies how trust boundaries shift when users move between managed and unmanaged networks, and proposes a lightweight scoring model for policy decisions.".to_string(),
            difficulty: "Medium".to_string(),
            reason: "Good for learning abstract nouns such as assurance, boundary, and policy while practicing cause-effect logic.".to_string(),
            key_vocabulary: vec!["authentication".to_string(), "assurance".to_string(), "boundary".to_string(), "contextual".to_string()],
            writing_prompt: "Explain why authentication is more than checking a password.".to_string(),
        },
        ArxivRecommendation {
            id: "ai-small-language-models".to_string(),
            category: "AI".to_string(),
            title: "Small Language Models as Reflective Writing Tutors".to_string(),
            abstract_text: "Recent progress in compact language models enables private and responsive educational feedback. We evaluate how model-generated revision hints affect student writing quality, focusing on nuance, logic, and transfer beyond direct correction.".to_string(),
            difficulty: "Medium".to_string(),
            reason: "Matches Lingovector's writing tutor goal and contains useful academic verbs.".to_string(),
            key_vocabulary: vec!["compact".to_string(), "revision".to_string(), "nuance".to_string(), "transfer".to_string()],
            writing_prompt: "Argue whether AI feedback should correct errors directly or guide students to revise.".to_string(),
        },
        ArxivRecommendation {
            id: "robotics-sensor-fusion".to_string(),
            category: "Robotics".to_string(),
            title: "Sensor Fusion for Robust Indoor Navigation".to_string(),
            abstract_text: "Indoor robots rely on imperfect observations from cameras, inertial sensors, and depth estimators. We introduce a fusion method that preserves uncertainty and improves navigation decisions in crowded school-like environments.".to_string(),
            difficulty: "Medium-Hard".to_string(),
            reason: "Useful for structure: problem, method, result in three sentences.".to_string(),
            key_vocabulary: vec!["fusion".to_string(), "inertial".to_string(), "uncertainty".to_string(), "robust".to_string()],
            writing_prompt: "Describe how uncertainty can be useful rather than merely problematic.".to_string(),
        },
        ArxivRecommendation {
            id: "physics-energy-transfer".to_string(),
            category: "Physics".to_string(),
            title: "Energy Transfer in Coupled Oscillator Networks".to_string(),
            abstract_text: "Coupled oscillators provide a simple model for studying how local interactions produce global patterns. This work analyzes energy transfer under different coupling strengths and identifies conditions that amplify or dampen collective motion.".to_string(),
            difficulty: "Hard".to_string(),
            reason: "Builds academic vocabulary around systems and conditions.".to_string(),
            key_vocabulary: vec!["coupled".to_string(), "oscillator".to_string(), "amplify".to_string(), "dampen".to_string()],
            writing_prompt: "Explain how small local interactions can create large system-level effects.".to_string(),
        },
        ArxivRecommendation {
            id: "chemistry-catalyst-design".to_string(),
            category: "Chemistry".to_string(),
            title: "Data-Guided Catalyst Design for Selective Reactions".to_string(),
            abstract_text: "Catalyst discovery often requires balancing activity, selectivity, and stability. We present a data-guided workflow that narrows the search space and explains which molecular features contribute to selective reaction pathways.".to_string(),
            difficulty: "Medium-Hard".to_string(),
            reason: "Excellent for learning balancing structures and technical noun phrases.".to_string(),
            key_vocabulary: vec!["catalyst".to_string(), "selectivity".to_string(), "workflow".to_string(), "pathway".to_string()],
            writing_prompt: "Discuss why narrowing a search space can make scientific discovery faster.".to_string(),
        },
        ArxivRecommendation {
            id: "biology-protein-folding".to_string(),
            category: "Biology".to_string(),
            title: "Interpretable Features in Protein Folding Predictions".to_string(),
            abstract_text: "Protein folding models achieve high accuracy, yet their internal representations are difficult to interpret. This study links learned features to biological constraints and examines when explanations help researchers trust predictions.".to_string(),
            difficulty: "Hard".to_string(),
            reason: "Good for contrast between accuracy and interpretability.".to_string(),
            key_vocabulary: vec!["interpretable".to_string(), "representation".to_string(), "constraint".to_string(), "prediction".to_string()],
            writing_prompt: "Should a scientific model be trusted if it is accurate but hard to explain?".to_string(),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_sentences_without_losing_tail() {
        let sentences = split_sentences("One idea. Another idea without final mark");
        assert_eq!(sentences.len(), 2);
        assert_eq!(sentences[1], "Another idea without final mark");
    }

    #[test]
    fn morphology_does_not_force_unknown_roots() {
        let morphology = reliable_morphology("claim");
        assert_eq!(morphology["confidence"], "low");
    }

    #[test]
    fn arxiv_recommendations_cover_required_domains() {
        let categories = sample_arxiv()
            .into_iter()
            .map(|paper| paper.category)
            .collect::<Vec<_>>();
        for required in [
            "Security",
            "AI",
            "Robotics",
            "Physics",
            "Chemistry",
            "Biology",
        ] {
            assert!(categories.iter().any(|category| category == required));
        }
    }
}
