ALTER TABLE trade_disputes
  DROP COLUMN IF EXISTS evidence_urls,
  DROP COLUMN IF EXISTS resolution,
  DROP COLUMN IF EXISTS resolution_note,
  DROP COLUMN IF EXISTS resolved_by,
  DROP COLUMN IF EXISTS resolved_at;
