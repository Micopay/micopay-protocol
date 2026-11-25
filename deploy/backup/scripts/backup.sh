#!/bin/sh

# Backup script for Micopay database
# =================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

error() {
    echo "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo "${GREEN}[SUCCESS]${NC} $1"
}

warn() {
    echo "${YELLOW}[WARNING]${NC} $1"
}

# Check if pgbackrest is running
if ! pgrep -f "pgbackrest" > /dev/null; then
    error "pgBackRest is not running"
    exit 1
fi

# Determine backup type based on time
HOUR=$(date +%H)
DAY=$(date +%u)

if [ "$HOUR" -eq 2 ]; then
    # Full backup (daily at 02:00)
    BACKUP_TYPE="full"
    log "Starting daily full backup..."
elif [ $((HOUR % 6)) -eq 0 ]; then
    # Incremental backup (every 6 hours)
    BACKUP_TYPE="incr"
    log "Starting incremental backup..."
else
    # WAL archiving (continuous)
    log "WAL archiving is continuous, no backup needed"
    exit 0
fi

# Run the backup
if [ "$BACKUP_TYPE" = "full" ]; then
    if pgbackrest --stanza=micopay backup --type=full; then
        success "Full backup completed successfully"
    else
        error "Full backup failed"
        exit 1
    fi
else
    if pgbackrest --stanza=micopay backup --type=incr; then
        success "Incremental backup completed successfully"
    else
        error "Incremental backup failed"
        exit 1
    fi
fi

# Check backup info
log "Backup info:"
pgbackrest --stanza=micopay info

# Send success notification (if webhook configured)
if [ -n "$BACKUP_WEBHOOK_URL" ]; then
    curl -X POST \
        -H "Content-Type: application/json" \
        -d "{\"status\":\"success\",\"type\":\"$BACKUP_TYPE\",\"timestamp\":\"$(date -Iseconds)\"}" \
        "$BACKUP_WEBHOOK_URL" 2>/dev/null || warn "Failed to send webhook notification"
fi

exit 0
