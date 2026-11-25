-- Down migration for Compliance Reporting Engine (SAT/UIF)

DROP TRIGGER IF EXISTS enforce_append_only_compliance_filings ON compliance_filings;
DROP TRIGGER IF EXISTS enforce_append_only_compliance_alerts ON compliance_alerts;
DROP TRIGGER IF EXISTS enforce_append_only_risk_events ON platform_risk_events;

DROP FUNCTION IF EXISTS prevent_update_or_delete();

DROP TABLE IF EXISTS compliance_filings;
DROP TABLE IF EXISTS compliance_alerts;
