-- Create trade_messages table for persistent buyer-merchant chat
-- All messages tied to a specific trade (trade_id).
-- sender_id must be a participant in the trade (enforced at app level).
-- read_at enforces unidirectional read receipts: set when OTHER participant reads.

CREATE TABLE trade_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id        UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at         TIMESTAMPTZ NULL
);

-- Constraint: body must be non-empty and <= 2000 chars
ALTER TABLE trade_messages
  ADD CONSTRAINT check_trade_messages_body_length
  CHECK (length(body) >= 1 AND length(body) <= 2000);

-- Index: primary query pattern — fetch messages for a trade in chronological order
CREATE INDEX idx_trade_messages_trade_created ON trade_messages (trade_id, created_at ASC);

-- Index: count unread messages from a specific sender
CREATE INDEX idx_trade_messages_trade_sender ON trade_messages (trade_id, sender_id);

-- Index: query unread messages
CREATE INDEX idx_trade_messages_unread ON trade_messages (trade_id, read_at) WHERE read_at IS NULL;

-- SECURITY NOTE: App must validate sender_id is a participant of the trade.
-- Do not rely on FOREIGN KEY alone — the app must call assertTradeParticipant() 
-- on all endpoints before inserting or querying messages.
