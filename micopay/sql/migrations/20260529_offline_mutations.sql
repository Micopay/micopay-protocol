-- Migration: Add offline queue tables for merchant mutations
-- 
-- Note: Current implementation uses IndexedDB on the frontend, so these tables
-- are optional for the backend. Add this migration if you want to:
-- 1. Audit all offline mutations that were synced
-- 2. Replay mutations for reconciliation
-- 3. Track sync failures for customer support
--
-- This is NOT required for the offline queue to function.

CREATE TABLE IF NOT EXISTS offline_mutations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Mutation metadata
  mutation_type     VARCHAR(32) NOT NULL,  -- 'availability', 'config'
  payload           JSONB NOT NULL,        -- The actual mutation data
  
  -- Status tracking
  status            VARCHAR(16) NOT NULL DEFAULT 'pending',  -- 'pending', 'synced', 'failed', 'retrying'
  error_message     TEXT,
  sync_attempts     INTEGER DEFAULT 0,
  
  -- Timestamps
  queued_at         TIMESTAMPTZ DEFAULT NOW(),
  synced_at         TIMESTAMPTZ,
  last_error_at     TIMESTAMPTZ,
  
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offline_mutations_user_status 
  ON offline_mutations (user_id, status);
CREATE INDEX IF NOT EXISTS idx_offline_mutations_queued 
  ON offline_mutations (queued_at DESC) 
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_offline_mutations_failed 
  ON offline_mutations (last_error_at DESC) 
  WHERE status = 'failed';

-- Table for auditing which mutations were successfully synced
CREATE TABLE IF NOT EXISTS offline_mutations_audit (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mutation_id       UUID REFERENCES offline_mutations(id) ON DELETE SET NULL,
  
  -- What was synced
  mutation_type     VARCHAR(32) NOT NULL,
  payload_before    JSONB,
  payload_after     JSONB,
  
  -- Conflict detection
  had_conflict      BOOLEAN DEFAULT FALSE,
  conflict_notes    TEXT,
  
  -- Sync result
  result_status     VARCHAR(16) NOT NULL,  -- 'success', 'conflict', 'error'
  result_details    JSONB,
  
  synced_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mutations_audit_user_time 
  ON offline_mutations_audit (user_id, synced_at DESC);
