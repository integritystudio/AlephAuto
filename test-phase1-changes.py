#!/usr/bin/env python3
"""Quick test to verify Phase 1 changes are working"""

import sys
sys.path.insert(0, '.')

from lib.similarity.structural import (
    normalize_code,
    extract_logical_operators,
    extract_http_status_codes,
    calculate_structural_similarity
)

print("=" * 70)
print("Testing Phase 1 Changes")
print("=" * 70)

# Test 1: Math.max vs Math.min
print("\nTest 1: Math.max vs Math.min (should be DIFFERENT)")
code1 = "function findMax(arr) { return Math.max(...arr); }"
code2 = "function findMin(arr) { return Math.min(...arr); }"

norm1 = normalize_code(code1)
norm2 = normalize_code(code2)

print(f"Code 1: {code1}")
print(f"Normalized 1: {norm1}")
print(f"Code 2: {code2}")
print(f"Normalized 2: {norm2}")
print(f"Are normalized codes identical? {norm1 == norm2}")

similarity, method = calculate_structural_similarity(code1, code2, threshold=0.90)
print(f"Similarity: {similarity:.4f}, Method: {method}")
print(f"Result: {'✅ PASS (Different)' if similarity < 0.90 else '❌ FAIL (Still considered similar)'}")

# Test 2: === vs !== (opposite logic)
print("\nTest 2: === vs !== (should be DIFFERENT)")
code1 = "function isProductionMode() { return process.env.NODE_ENV === 'production'; }"
code2 = "function isDevelopment() { return process.env.NODE_ENV !== 'production'; }"

ops1 = extract_logical_operators(code1)
ops2 = extract_logical_operators(code2)

print(f"Code 1: {code1}")
print(f"Operators 1: {ops1}")
print(f"Code 2: {code2}")
print(f"Operators 2: {ops2}")

similarity, method = calculate_structural_similarity(code1, code2, threshold=0.90)
print(f"Similarity: {similarity:.4f}, Method: {method}")
print(f"Result: {'✅ PASS (Different)' if similarity < 0.90 else '❌ FAIL (Still considered similar)'}")

# Test 3: HTTP status 200 vs 201
print("\nTest 3: HTTP status 200 vs 201 (should be DIFFERENT)")
code1 = "function sendUserSuccess(res, user) { res.status(200).json({ data: user }); }"
code2 = "function sendCreatedResponse(res, data) { res.status(201).json({ data: data }); }"

status1 = extract_http_status_codes(code1)
status2 = extract_http_status_codes(code2)

print(f"Code 1: {code1}")
print(f"Status codes 1: {status1}")
print(f"Code 2: {code2}")
print(f"Status codes 2: {status2}")

similarity, method = calculate_structural_similarity(code1, code2, threshold=0.90)
print(f"Similarity: {similarity:.4f}, Method: {method}")
print(f"Result: {'✅ PASS (Different)' if similarity < 0.90 else '❌ FAIL (Still considered similar)'}")

print("\n" + "=" * 70)
print("Test Complete")
print("=" * 70)
