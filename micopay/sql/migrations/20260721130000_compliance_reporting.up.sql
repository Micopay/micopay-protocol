-- Up migration for Compliance Reporting Engine (SAT/UIF)

-- 1. Create compliance_alerts table
CREATE TABLE IF NOT EXISTS compliance_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason          TEXT NOT NULL,
  severity        VARCHAR(16) NOT NULL DEFAULT 'medium',
  details         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sla_deadline    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_compliance_alerts_user ON compliance_alerts (user_id);
CREATE INDEX IF NOT EXISTS idx_compliance_alerts_created ON compliance_alerts (created_at DESC);

-- 2. Create compliance_filings table
CREATE TABLE IF NOT EXISTS compliance_filings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start    TIMESTAMPTZ NOT NULL,
  period_end      TIMESTAMPTZ NOT NULL,
  filing_type     VARCHAR(32) NOT NULL DEFAULT 'monthly_sat',
  report_data     JSONB NOT NULL,
  is_zero_report  BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_filings_period ON compliance_filings (period_start DESC, period_end DESC);

-- 3. Append-only triggers to prevent UPDATE and DELETE on audit log, alerts, and filings
CREATE OR REPLACE FUNCTION prevent_update_or_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Updates and deletions are not allowed on this table (append-only compliance data).';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_append_only_risk_events ON platform_risk_events;
CREATE TRIGGER enforce_append_only_risk_events
  BEFORE UPDATE OR DELETE ON platform_risk_events
  FOR EACH ROW EXECUTE FUNCTION prevent_update_or_delete();

DROP TRIGGER IF EXISTS enforce_append_only_compliance_alerts ON compliance_alerts;
CREATE TRIGGER enforce_append_only_compliance_alerts
  BEFORE UPDATE OR DELETE ON compliance_alerts
  FOR EACH ROW EXECUTE FUNCTION prevent_update_or_delete();

DROP TRIGGER IF EXISTS enforce_append_only_compliance_filings ON compliance_filings;
CREATE TRIGGER enforce_append_only_compliance_filings
  BEFORE UPDATE OR DELETE ON compliance_filings
  FOR EACH ROW EXECUTE FUNCTION prevent_update_or_delete();
