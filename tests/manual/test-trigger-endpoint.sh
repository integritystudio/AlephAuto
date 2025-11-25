#!/bin/bash

# Manual test script for pipeline trigger endpoint
# Tests the POST /api/pipelines/:pipelineId/trigger endpoint

set -e

API_URL="http://localhost:8080"
API_TOKEN="${API_TOKEN:-test-token}"

echo "Testing Pipeline Trigger Endpoint"
echo "=================================="
echo ""

# Test 1: Trigger schema-enhancement pipeline
echo "Test 1: Trigger schema-enhancement pipeline"
curl -X POST \
  "${API_URL}/api/pipelines/schema-enhancement/trigger" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -d '{
    "parameters": {
      "baseDir": "/Users/alyshialedlie/code",
      "dryRun": true
    }
  }' \
  | jq .

echo ""
echo "-----------------------------------"
echo ""

# Test 2: Trigger unknown pipeline (should fail)
echo "Test 2: Trigger unknown pipeline (should return error)"
curl -X POST \
  "${API_URL}/api/pipelines/unknown-pipeline/trigger" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -d '{"parameters": {}}' \
  | jq .

echo ""
echo "-----------------------------------"
echo ""

# Test 3: Check job was created in database
echo "Test 3: Fetch recent schema-enhancement jobs"
curl -X GET \
  "${API_URL}/api/pipelines/schema-enhancement/jobs?limit=5" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  | jq .

echo ""
echo "=================================="
echo "Manual tests complete"
echo ""
echo "Usage:"
echo "  1. Start server: doppler run -- npm run dashboard"
echo "  2. Run this script: ./tests/manual/test-trigger-endpoint.sh"
echo "  3. Check dashboard UI for real-time updates"
