#!/bin/bash

# Restore script for Micopay database
# ===================================

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

# Configuration
RESTORE_TYPE="${1:-latest}"  # latest, time, or specific backup
RESTORE_TIME="${2:-}"  # ISO timestamp for PITR
RESTORE_TARGET="${3:-/tmp/pg_restore}"

# Validate arguments
if [ "$RESTORE_TYPE" = "time" ] && [ -z "$RESTORE_TIME" ]; then
    error "RESTORE_TIME is required for PITR"
    echo "Usage: $0 time '2024-01-15 10:30:00' [/tmp/pg_restore]"
    exit 1
fi

log "Starting restore process..."
log "Restore type: $RESTORE_TYPE"
[ -n "$RESTORE_TIME" ] && log "Restore time: $RESTORE_TIME"
log "Restore target: $RESTORE_TARGET"

# Stop PostgreSQL
log "Stopping PostgreSQL..."
docker-compose stop postgres
docker-compose rm -f postgres

# Remove existing data
log "Removing existing data directory..."
rm -rf $RESTORE_TARGET/postgres_data
mkdir -p $RESTORE_TARGET/postgres_data

# Start empty PostgreSQL
log "Starting empty PostgreSQL container..."
docker-compose up -d postgres
sleep 10

# Run restore based on type
case $RESTORE_TYPE in
    latest)
        log "Restoring latest backup..."
        docker-compose exec -T pgbackrest pgbackrest \
            --stanza=micopay \
            --delta \
            --process-max=4 \
            restore
        ;;
    time)
        log "Performing Point-in-Time Recovery to: $RESTORE_TIME"
        docker-compose exec -T pgbackrest pgbackrest \
            --stanza=micopay \
            --delta \
            --process-max=4 \
            --type=time \
            --target="$RESTORE_TIME" \
            --target-action=promote \
            restore
        ;;
    backup)
        # Restore specific backup (not implemented)
        error "Specific backup restore not implemented yet"
        exit 1
        ;;
    *)
        error "Unknown restore type: $RESTORE_TYPE"
        echo "Valid types: latest, time, backup"
        exit 1
        ;;
esac

# Start PostgreSQL with restored data
log "Starting restored PostgreSQL..."
docker-compose stop postgres
docker-compose rm -f postgres
docker-compose up -d postgres

# Wait for PostgreSQL to be ready
log "Waiting for PostgreSQL to be ready..."
sleep 10

# Run validation queries
log "Running validation checks..."
docker-compose exec -T postgres psql -U micopay -d micopay -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" > /dev/null 2>&1

if [ $? -eq 0 ]; then
    success "Restore completed successfully"
    success "Database is ready"
else
    error "Restore validation failed"
    exit 1
fi

# Print summary
log "Restore Summary:"
log "  Type: $RESTORE_TYPE"
[ -n "$RESTORE_TIME" ] && log "  PITR Target: $RESTORE_TIME"
log "  Target Directory: $RESTORE_TARGET"

# Send success notification
if [ -n "$RESTORE_WEBHOOK_URL" ]; then
    curl -X POST \
        -H "Content-Type: application/json" \
        -d "{\"status\":\"success\",\"type\":\"$RESTORE_TYPE\",\"timestamp\":\"$(date -Iseconds)\"}" \
        "$RESTORE_WEBHOOK_URL" 2>/dev/null || warn "Failed to send webhook notification"
fi

exit 0
