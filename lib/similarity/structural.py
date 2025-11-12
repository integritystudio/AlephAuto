"""
Structural Similarity Calculation

Priority 2: Implement Structural Similarity
Compares code based on AST structure, ignoring variable names and minor differences.
"""

import re
import hashlib
from typing import Tuple
from difflib import SequenceMatcher


def normalize_code(source_code: str) -> str:
    """
    Normalize code by removing variable-specific information.

    This allows structural comparison by focusing on code structure
    rather than specific names or values.
    """
    if not source_code:
        return ""

    # Remove comments
    normalized = re.sub(r'//.*?$', '', source_code, flags=re.MULTILINE)  # Single-line comments
    normalized = re.sub(r'/\*.*?\*/', '', normalized, flags=re.DOTALL)   # Multi-line comments

    # Normalize whitespace (collapse to single spaces)
    normalized = re.sub(r'\s+', ' ', normalized)

    # Normalize string literals (replace with placeholder)
    normalized = re.sub(r"'[^']*'", "'STR'", normalized)
    normalized = re.sub(r'"[^"]*"', '"STR"', normalized)
    normalized = re.sub(r'`[^`]*`', '`STR`', normalized)

    # Normalize numbers (replace with placeholder)
    normalized = re.sub(r'\b\d+\b', 'NUM', normalized)

    # Normalize variable names to generic form
    # Replace identifiers with placeholders while preserving structure
    # This is a simplified version - full AST comparison would be better
    normalized = re.sub(r'\b[a-z][a-zA-Z0-9_]*\b', 'var', normalized)
    normalized = re.sub(r'\b[A-Z][A-Z0-9_]*\b', 'CONST', normalized)

    # Remove extra spaces around operators and punctuation
    normalized = re.sub(r'\s*([(){}[\];,.])\s*', r'\1', normalized)
    normalized = re.sub(r'\s*(=>|===?|!==?|[+\-*/%<>=&|])\s*', r' \1 ', normalized)

    # Collapse multiple spaces
    normalized = re.sub(r'\s+', ' ', normalized)

    # Trim
    normalized = normalized.strip()

    return normalized


def calculate_ast_hash(source_code: str) -> str:
    """
    Calculate a hash based on normalized code structure.

    This creates a structural fingerprint that's the same for
    code with the same structure but different variable names.
    """
    normalized = normalize_code(source_code)
    return hashlib.sha256(normalized.encode()).hexdigest()


def calculate_levenshtein_similarity(str1: str, str2: str) -> float:
    """
    Calculate similarity using Levenshtein distance via SequenceMatcher.

    Returns a similarity ratio between 0.0 and 1.0.
    """
    if not str1 or not str2:
        return 0.0

    return SequenceMatcher(None, str1, str2).ratio()


def calculate_structural_similarity(code1: str, code2: str, threshold: float = 0.85) -> Tuple[float, str]:
    """
    Calculate structural similarity between two code blocks.

    Priority 2: Structural Similarity (Layer 2 of 3-layer algorithm)

    Returns:
        (similarity_score, method)
        - similarity_score: 0.0 to 1.0
        - method: 'exact', 'structural', or 'different'

    Algorithm:
    1. Exact match: Compare hashes → 1.0 similarity
    2. Structural match: Compare normalized code → 0.0-1.0 similarity
    3. Below threshold: Not similar
    """
    if not code1 or not code2:
        return 0.0, 'different'

    # Layer 1: Exact content match (fastest)
    hash1 = hashlib.sha256(code1.encode()).hexdigest()
    hash2 = hashlib.sha256(code2.encode()).hexdigest()

    if hash1 == hash2:
        return 1.0, 'exact'

    # Layer 2: Structural match (normalize and compare)
    normalized1 = normalize_code(code1)
    normalized2 = normalize_code(code2)

    # Check if normalized versions are identical (structural duplicate)
    if normalized1 == normalized2:
        return 0.95, 'structural'  # Slightly less than exact

    # Calculate similarity ratio using Levenshtein
    similarity = calculate_levenshtein_similarity(normalized1, normalized2)

    # Determine method based on similarity score
    if similarity >= threshold:
        return similarity, 'structural'
    else:
        return similarity, 'different'


def are_structurally_similar(code1: str, code2: str, threshold: float = 0.85) -> bool:
    """
    Check if two code blocks are structurally similar.

    Returns True if similarity score >= threshold.
    """
    score, _ = calculate_structural_similarity(code1, code2, threshold)
    return score >= threshold
