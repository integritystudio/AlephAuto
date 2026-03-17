#!/usr/bin/env bash
# Load Doppler secrets into environment variables for dev use.
# Mirrors the .env pattern: single doppler download, read from cache, unload.
#
# Source before running Node scripts:
#   source scripts/setup/load-doppler-env.sh && node scripts/setup/setup-sentry.js
#
# Or run a command directly:
#   scripts/setup/load-doppler-env.sh node scripts/setup/setup-sentry.js

set -euo pipefail

DOPPLER_PROJECT="${DOPPLER_PROJECT_NAME:-bottleneck}"
DOPPLER_CONFIG="${NODE_ENV:-dev}"

# Single Doppler API call — download all secrets as JSON
_doppler_json="$(doppler secrets download \
  --no-file --format json \
  --project "$DOPPLER_PROJECT" \
  --config "$DOPPLER_CONFIG")"

_doppler_get() {
  local val
  val="$(printf '%s' "$_doppler_json" | jq -r --arg k "$1" '.[$k] // empty')"
  printf '%s' "$val"
}

# Sentry
export SENTRY_DSN="$(_doppler_get SENTRY_DSN)"
export SENTRY_ENVIRONMENT="$(_doppler_get SENTRY_ENVIRONMENT)"
export SENTRY_OTLP="$(_doppler_get SENTRY_OTLP)"
export SENTRY_PROJECT="$(_doppler_get SENTRY_PROJECT)"
export SENTRY_API_TOKEN="$(_doppler_get SENTRY_API_TOKEN)"

# Dashboard Populate Pipeline
export KV_NAMESPACE_ID="$(_doppler_get KV_NAMESPACE_ID)"

# Discord config
export DISCORD_CHANNEL_WEBHOOK="$(_doppler_get DISCORD_CHANNEL_WEBHOOK)"

# Render Config
export RENDER_API_KEY="$(_doppler_get RENDER_API_KEY)"
export RENDER_DB="$(_doppler_get RENDER_DB)"
export RENDER_DB_USER="$(_doppler_get RENDER_DB_USER)"
export RENDER_DB_PASSWORD="$(_doppler_get RENDER_DB_PASSWORD)"
export RENDER_PSQL_COMMAND="$(_doppler_get RENDER_PSQL_COMMAND)"
export DATABASE_URL="$(_doppler_get DATABASE_URL)"
export BOTTLENECK_TOKEN="$(_doppler_get BOTTLENECK_TOKEN)"

# Project configs
export WATCH="$(_doppler_get WATCH)"
export GIT_REPO_SSH="$(_doppler_get GIT_REPO_SSH)"

# Unload cache
unset _doppler_json
unset -f _doppler_get

# If arguments provided, exec them with the loaded env
if [[ $# -gt 0 ]]; then
  exec "$@"
fi
