#!/bin/bash

# API Route Testing Script
# Tests all Duplicate Detection API routes

BASE_URL="http://localhost:3000"
API_KEY="test-key-12345"  # Optional in dev mode

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counter
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to print test header
print_test() {
  echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}TEST $1: $2${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Function to test an endpoint
test_endpoint() {
  local test_name="$1"
  local method="$2"
  local endpoint="$3"
  local data="$4"
  local expected_status="$5"
  local use_auth="${6:-true}"

  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  print_test "$TOTAL_TESTS" "$test_name"

  # Build curl command
  local curl_cmd="curl -s -w '\n%{http_code}' -X $method"

  if [ "$use_auth" = "true" ]; then
    curl_cmd="$curl_cmd -H 'X-API-Key: $API_KEY'"
  fi

  curl_cmd="$curl_cmd -H 'Content-Type: application/json'"

  if [ -n "$data" ]; then
    curl_cmd="$curl_cmd -d '$data'"
  fi

  curl_cmd="$curl_cmd $BASE_URL$endpoint"

  echo -e "${YELLOW}Request:${NC} $method $endpoint"
  if [ -n "$data" ]; then
    echo -e "${YELLOW}Payload:${NC} $data"
  fi
  echo -e "${YELLOW}Auth:${NC} $use_auth"
  echo ""

  # Execute request
  response=$(eval $curl_cmd)
  status_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | head -n -1)

  # Check status code
  if [ "$status_code" = "$expected_status" ]; then
    echo -e "${GREEN}✓ Status Code: $status_code (expected $expected_status)${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
  else
    echo -e "${RED}✗ Status Code: $status_code (expected $expected_status)${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi

  # Pretty print JSON response
  echo -e "\n${YELLOW}Response:${NC}"
  echo "$body" | jq '.' 2>/dev/null || echo "$body"

  # Check for timestamp field
  if echo "$body" | jq -e '.timestamp' > /dev/null 2>&1; then
    echo -e "\n${GREEN}✓ Response includes timestamp field${NC}"
  else
    echo -e "\n${YELLOW}⚠ Response missing timestamp field${NC}"
  fi
}

# Start testing
echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║         Duplicate Detection API Route Testing             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo "Base URL: $BASE_URL"
echo "Time: $(date)"
echo ""

# Test 1: Health Check (no auth)
test_endpoint \
  "Health Check (No Auth Required)" \
  "GET" \
  "/health" \
  "" \
  "200" \
  "false"

# Test 2: Health Check (with auth - should still work)
test_endpoint \
  "Health Check (With Auth)" \
  "GET" \
  "/health" \
  "" \
  "200" \
  "true"

# Test 3: Missing API key on protected route
test_endpoint \
  "Protected Route Without Auth" \
  "GET" \
  "/api/repositories" \
  "" \
  "401" \
  "false"

# Test 4: List repositories
test_endpoint \
  "List All Repositories" \
  "GET" \
  "/api/repositories" \
  "" \
  "200" \
  "true"

# Test 5: List enabled repositories
test_endpoint \
  "List Enabled Repositories" \
  "GET" \
  "/api/repositories?enabled=true" \
  "" \
  "200" \
  "true"

# Test 6: Get specific repository
test_endpoint \
  "Get Repository Details (sidequest)" \
  "GET" \
  "/api/repositories/sidequest" \
  "" \
  "200" \
  "true"

# Test 7: Get non-existent repository
test_endpoint \
  "Get Non-Existent Repository" \
  "GET" \
  "/api/repositories/nonexistent" \
  "" \
  "404" \
  "true"

# Test 8: Get scan statistics
test_endpoint \
  "Get Scan Statistics" \
  "GET" \
  "/api/scans/stats" \
  "" \
  "200" \
  "true"

# Test 9: List reports
test_endpoint \
  "List Reports" \
  "GET" \
  "/api/reports" \
  "" \
  "200" \
  "true"

# Test 10: List reports with limit
test_endpoint \
  "List Reports (Limited)" \
  "GET" \
  "/api/reports?limit=5" \
  "" \
  "200" \
  "true"

# Test 11: Start scan with valid payload
test_endpoint \
  "Start Scan (Valid Payload)" \
  "POST" \
  "/api/scans/start" \
  '{"repositoryPath": "/Users/alyshialedlie/code/jobs/sidequest"}' \
  "201" \
  "true"

# Test 12: Start scan with missing payload
test_endpoint \
  "Start Scan (Missing Payload)" \
  "POST" \
  "/api/scans/start" \
  '{}' \
  "400" \
  "true"

# Test 13: Start scan with invalid payload
test_endpoint \
  "Start Scan (Invalid Payload)" \
  "POST" \
  "/api/scans/start" \
  '{"options": {}}' \
  "400" \
  "true"

# Test 14: WebSocket status endpoint
test_endpoint \
  "WebSocket Status" \
  "GET" \
  "/api/ws/status" \
  "" \
  "200" \
  "true"

# Test 15: 404 for non-existent endpoint
test_endpoint \
  "Non-Existent Endpoint" \
  "GET" \
  "/api/nonexistent" \
  "" \
  "404" \
  "true"

# Summary
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}TEST SUMMARY${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "Total Tests:  $TOTAL_TESTS"
echo -e "${GREEN}Passed:       $PASSED_TESTS${NC}"
echo -e "${RED}Failed:       $FAILED_TESTS${NC}"

if [ $FAILED_TESTS -eq 0 ]; then
  echo -e "\n${GREEN}╔════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ALL TESTS PASSED! ✓                   ║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
  exit 0
else
  echo -e "\n${RED}╔════════════════════════════════════════╗${NC}"
  echo -e "${RED}║  SOME TESTS FAILED ✗                   ║${NC}"
  echo -e "${RED}╚════════════════════════════════════════╝${NC}"
  exit 1
fi
