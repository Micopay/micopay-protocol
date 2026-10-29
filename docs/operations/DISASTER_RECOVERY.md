# Disaster Recovery Runbook

## Overview

This document describes the disaster recovery procedures for the Micopay database.

## Objectives

| Metric | Target |
|--------|--------|
| RPO (Recovery Point Objective) | < 5 minutes |
| RTO (Recovery Time Objective) | < 30 minutes |
| Backup Retention | 30 days |
| WAL Retention | 30 days |

## Backup Strategy

### Full Backup
- **Schedule**: Daily at 02:00 UTC
- **Type**: Full base backup
- **Retention**: 30 days

### Incremental Backup
- **Schedule**: Every 6 hours
- **Type**: Differential backup
- **Retention**: 7 days

### WAL Archiving
- **Schedule**: Continuous
- **Type**: Transaction logs
- **Retention**: 30 days

## Restore Procedures

### 1. Latest Backup Restore

```bash
# Restore the latest backup
./deploy/backup/scripts/restore.sh latest
# Restore to a specific time
./deploy/backup/scripts/restore.sh time "2024-01-15 10:30:00"
# Refresh staging from latest backup
./deploy/backup/scripts/staging-refresh.sh
-- Check table counts
SELECT schemaname, tablename, n_live_tup 
FROM pg_stat_user_tables 
ORDER BY n_live_tup DESC;

-- Check constraints
SELECT * FROM pg_constraint WHERE convalidated = false;

-- Run custom validation queries
-- (Add specific queries for your application)
pgbackrest --stanza=micopay info
# Check PostgreSQL logs
docker-compose logs postgres | grep archive
pgbackrest restore --process-max=8 --db-timeout=1800
# Check backup status
pgbackrest --stanza=micopay info

# Perform backup
pgbackrest --stanza=micopay backup --type=full

# Restore backup
pgbackrest --stanza=micopay restore --delta

# Check WAL archive
pgbackrest --stanza=micopay archive-push --check
# Check WAL status
psql -c "SELECT pg_current_wal_lsn(), pg_walfile_name(pg_current_wal_lsn());"

# Check archive status
psql -c "SELECT archived_count, failed_count, last_archived_wal, last_failed_wal FROM pg_stat_archiver;"
