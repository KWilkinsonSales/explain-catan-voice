-- Reference schema for a future D1 migration.
-- The v0.1 Worker currently uses Cloudflare KV for the fastest cross-device proof.

CREATE TABLE invitation_tokens (
  token TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  issuer_id TEXT NOT NULL,
  issuer_display_name TEXT NOT NULL,
  recipient_display_name TEXT,
  role_or_context TEXT,
  topic TEXT NOT NULL,
  approved_personalization_context TEXT NOT NULL DEFAULT '{}',
  transcript_default INTEGER NOT NULL DEFAULT 0,
  receipt_mode TEXT NOT NULL DEFAULT 'minimal',
  state TEXT NOT NULL CHECK (state IN ('waiting','running','closed','expired'))
);

CREATE TABLE mission_receipts (
  mission_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  summary TEXT,
  handoff_type TEXT,
  primary_question TEXT,
  outcome_code TEXT NOT NULL,
  hover_signal INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'closed'
);
