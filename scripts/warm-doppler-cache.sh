#!/bin/bash
#
# Doppler Cache Warming Script
#
# Ensures Doppler fallback cache is fresh by proactively fetching secrets.
# This provides resilience during Doppler API outages.
#
# Usage:
#   ./scripts/warm-doppler-cache.sh
#
# Add to cron for periodic updates:
#   0 */6 * * * cd /Users/alyshialedlie/code/jobs && ./scripts/warm-doppler-cache.sh
#

set -e  # Exit on error

CACHE_DIR="$HOME/.doppler"
CACHE_FILE="$CACHE_DIR/.fallback.json"
LOG_FILE="$(dirname "$0")/../logs/doppler-cache-warming.log"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "🔄 Doppler cache warming started"

# Check if doppler CLI is available
if ! command -v doppler &> /dev/null; then
    log "❌ ERROR: doppler CLI not found in PATH"
    exit 1
fi

# Check if cache directory exists
if [ ! -d "$CACHE_DIR" ]; then
    log "ℹ️  Creating Doppler cache directory: $CACHE_DIR"
    mkdir -p "$CACHE_DIR"
fi

# Warm the cache by running a simple doppler command
# This will fetch secrets and update the fallback cache
log "📥 Fetching secrets from Doppler API..."

if doppler secrets get NODE_ENV --plain > /dev/null 2>&1; then
    log "✅ Successfully fetched secrets from Doppler API"

    # Verify cache file was updated
    if [ -f "$CACHE_FILE" ]; then
        CACHE_AGE=$(($(date +%s) - $(stat -f %m "$CACHE_FILE" 2>/dev/null || stat -c %Y "$CACHE_FILE" 2>/dev/null)))
        log "✅ Cache file updated: $CACHE_FILE (age: ${CACHE_AGE}s)"
    else
        log "⚠️  Warning: Cache file not found after fetch: $CACHE_FILE"
    fi
else
    log "❌ ERROR: Failed to fetch secrets from Doppler API"
    log "ℹ️  Check Doppler configuration: doppler setup"
    exit 1
fi

log "🎉 Doppler cache warming completed successfully"
exit 0
