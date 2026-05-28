CREATE TABLE IF NOT EXISTS user_consents (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  audit_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(user_id, consent_type, consent_version)
);

CREATE INDEX IF NOT EXISTS idx_user_consents_user_id
  ON user_consents(user_id);

CREATE INDEX IF NOT EXISTS idx_user_consents_type_version
  ON user_consents(consent_type, consent_version);
