-- Create trade_messages table for persistent buyer-merchant chat
-- All messages tied to a specific trade (trade_id).
-- sender_id must be a participant in the trade (enforced at app level).
-- read_at enforces unidirectional read receipts: set when OTHER participant reads.

-- abuse_controls.up.sql already created trade_messages (without read_at).
-- This migration adds the missing column and constraints idempotently.
CREATE TABLE IF NOT EXISTS trade_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id        UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at         TIMESTAMPTZ NULL
);

-- Add read_at if the table was created by abuse_controls (which omits it).
ALTER TABLE trade_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ NULL;

-- Constraint: body must be non-empty and <= 2000 chars (idempotent via exception block)
DO $$
BEGIN
  ALTER TABLE trade_messages
    ADD CONSTRAINT check_trade_messages_body_length
    CHECK (length(body) >= 1 AND length(body) <= 2000);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Index: primary query pattern — fetch messages for a trade in chronological order
CREATE INDEX IF NOT EXISTS idx_trade_messages_trade_created ON trade_messages (trade_id, created_at ASC);

-- Index: count unread messages from a specific sender
CREATE INDEX IF NOT EXISTS idx_trade_messages_trade_sender ON trade_messages (trade_id, sender_id);

-- Index: query unread messages
CREATE INDEX IF NOT EXISTS idx_trade_messages_unread ON trade_messages (trade_id, read_at) WHERE read_at IS NULL;

-- SECURITY NOTE: App must validate sender_id is a participant of the trade.
-- Do not rely on FOREIGN KEY alone — the app must call assertTradeParticipant() 
-- on all endpoints before inserting or querying messages.
