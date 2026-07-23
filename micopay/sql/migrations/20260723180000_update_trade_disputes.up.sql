-- Migration: Add evidence_urls, resolution, resolution_note, resolved_by, resolved_at to trade_disputes
ALTER TABLE trade_disputes
  ADD COLUMN IF NOT EXISTS evidence_urls JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS resolution VARCHAR(32),
  ADD COLUMN IF NOT EXISTS resolution_note TEXT,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
