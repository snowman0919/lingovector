ALTER TABLE voice_profiles
    ADD COLUMN IF NOT EXISTS consent_version TEXT NOT NULL DEFAULT 'voice-consent-v1',
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS arxiv_cache (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    abstract_text TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    reason TEXT NOT NULL,
    key_vocabulary JSONB NOT NULL,
    writing_prompt TEXT NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_arxiv_cache_category ON arxiv_cache(category, fetched_at DESC);
