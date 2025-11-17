"""
Structural Similarity Calculation

Priority 2: Implement Structural Similarity
Compares code based on AST structure, ignoring variable names and minor differences.
"""

import re
import sys
import hashlib
from typing import Tuple, Set
from difflib import SequenceMatcher
from dataclasses import dataclass, field


@dataclass
class SemanticFeatures:
    """
    Semantic features extracted from original code before normalization.

    These features preserve semantic information that would be lost during
    normalization (e.g., HTTP status codes, logical operators, method names).
    """
    http_status_codes: Set[int] = field(default_factory=set)
    logical_operators: Set[str] = field(default_factory=set)
    semantic_methods: Set[str] = field(default_factory=set)


def extract_semantic_features(source_code: str) -> SemanticFeatures:
    """
    Extract all semantic features from ORIGINAL code before normalization.

    This function MUST be called before normalize_code() to preserve semantic
    information that would otherwise be stripped away.

    Args:
        source_code: Raw, unnormalized source code

    Returns:
        SemanticFeatures containing all detected semantic markers

    Example:
        code = "res.status(201).json({ data: user });"
        features = extract_semantic_features(code)
        # features.http_status_codes = {201}
    """
    features = SemanticFeatures()

    if not source_code:
        return features

    # Extract HTTP status codes (e.g., .status(200), .status(404))
    status_pattern = r'\.status\((\d{3})\)'
    for match in re.finditer(status_pattern, source_code):
        status_code = int(match.group(1))
        features.http_status_codes.add(status_code)

    # Extract logical operators (===, !==, ==, !=, !, &&, ||)
    # Order matters: match longer operators first to avoid partial matches
    operator_patterns = [
        (r'!==', '!=='),   # Strict inequality
        (r'===', '==='),   # Strict equality
        (r'!=', '!='),     # Loose inequality
        (r'==', '=='),     # Loose equality
        (r'!\s*[^=]', '!'), # Logical NOT (followed by non-=)
        (r'&&', '&&'),     # Logical AND
        (r'\|\|', '||'),   # Logical OR
    ]

    for pattern, operator_name in operator_patterns:
        if re.search(pattern, source_code):
            features.logical_operators.add(operator_name)

    # Extract semantic methods (Math.max, Math.min, console.log, etc.)
    semantic_patterns = {
        'Math.max': r'Math\.max\s*\(',
        'Math.min': r'Math\.min\s*\(',
        'Math.floor': r'Math\.floor\s*\(',
        'Math.ceil': r'Math\.ceil\s*\(',
        'Math.round': r'Math\.round\s*\(',
        'console.log': r'console\.log\s*\(',
        'console.error': r'console\.error\s*\(',
        'console.warn': r'console\.warn\s*\(',
        '.reverse': r'\.reverse\s*\(',
        '.toUpperCase': r'\.toUpperCase\s*\(',
        '.toLowerCase': r'\.toLowerCase\s*\(',
    }

    for method_name, pattern in semantic_patterns.items():
        if re.search(pattern, source_code):
            features.semantic_methods.add(method_name)

    return features


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

    # Semantic operator and method whitelist
    # These methods have semantic meaning and should be preserved during normalization
    SEMANTIC_METHODS = {
        # Array functional methods (already preserved)
        'map', 'filter', 'reduce', 'forEach', 'find', 'some', 'every',
        'slice', 'splice', 'push', 'pop', 'shift', 'unshift',
        'join', 'split', 'includes', 'indexOf',

        # Object methods (already preserved)
        'get', 'set', 'has', 'delete',
        'keys', 'values', 'entries',

        # Async patterns (already preserved)
        'then', 'catch', 'finally', 'async', 'await',

        # Array transformations (already preserved)
        'reverse', 'sort', 'concat',

        # NEW: Math operations (opposite semantics)
        'max', 'min', 'abs', 'floor', 'ceil', 'round',

        # NEW: String operations (semantic meaning)
        'trim', 'toLowerCase', 'toUpperCase', 'replace',

        # NEW: HTTP/API methods (semantic differences)
        'status', 'json', 'send', 'redirect',

        # NEW: Properties with semantic value
        'length', 'name', 'value', 'id', 'type'
    }

    # Preserve important objects
    SEMANTIC_OBJECTS = {
        'Math', 'Object', 'Array', 'String', 'Number', 'Boolean',
        'console', 'process', 'JSON', 'Date', 'Promise'
    }

    # Build a pattern that matches identifiers but NOT important methods/objects
    # First, mark important objects for preservation (Math, Object, etc.)
    for obj in SEMANTIC_OBJECTS:
        normalized = re.sub(rf'\b{obj}\b', f'__PRESERVE_OBJ_{obj.upper()}__', normalized)

    # Second, mark important methods so they're not replaced
    for method in SEMANTIC_METHODS:
        normalized = re.sub(rf'\b{method}\b', f'__PRESERVE_{method.upper()}__', normalized)

    # Now normalize other identifiers
    normalized = re.sub(r'\b[a-z][a-zA-Z0-9_]*\b', 'var', normalized)
    normalized = re.sub(r'\b[A-Z][A-Z0-9_]*\b', 'CONST', normalized)

    # Restore preserved objects
    for obj in SEMANTIC_OBJECTS:
        normalized = normalized.replace(f'__PRESERVE_OBJ_{obj.upper()}__', obj)

    # Restore preserved methods in lowercase
    for method in SEMANTIC_METHODS:
        normalized = normalized.replace(f'__PRESERVE_{method.upper()}__', method)

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


def extract_logical_operators(source_code: str) -> set:
    """
    Extract logical operators from source code for semantic comparison.

    Returns:
        Set of logical operators found (e.g., {'===', '!=='})
    """
    operators = set()

    # Find all logical operators
    # Check compound operators first (order matters)
    if '!==' in source_code:
        operators.add('!==')
    if '===' in source_code:
        operators.add('===')
    if '!=' in source_code and '!==' not in source_code:
        operators.add('!=')
    if '==' in source_code and '===' not in source_code:
        operators.add('==')

    # Match standalone ! (not part of !== or !=)
    if re.search(r'(?<![!=])!(?![=])', source_code):
        operators.add('!')

    return operators


def extract_http_status_codes(source_code: str) -> set:
    """
    Extract HTTP status codes from response patterns.

    Returns:
        Set of status codes (e.g., {200, 201, 404})
    """
    status_codes = set()

    # Pattern: res.status(200), response.status(404), etc.
    pattern = r'(?:res|response)\.status\((\d{3})\)'
    matches = re.finditer(pattern, source_code)

    for match in matches:
        status_codes.add(int(match.group(1)))

    return status_codes


def extract_semantic_methods(source_code: str) -> set:
    """
    Extract critical semantic methods that indicate opposite or different behavior.

    Returns:
        Set of semantic methods found (e.g., {'Math.max', 'Math.min'})
    """
    methods = set()

    # Critical Math methods with opposite semantics
    math_opposites = ['max', 'min', 'floor', 'ceil']
    for method in math_opposites:
        if f'Math.{method}' in source_code:
            methods.add(f'Math.{method}')

    return methods


def extract_method_chain(source_code: str) -> list:
    """
    Extract method chain structure from code.

    Returns:
        List of methods in chain order (e.g., ['filter', 'map', 'reverse'])
    """
    # Pattern: .method1().method2().method3()
    # Handles both arr.filter().map() and arr.filter(fn).map(fn)

    chains = []

    # Find chained method calls
    # Pattern: .method_name( ... ).method_name( ... )
    pattern = r'\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\('
    matches = list(re.finditer(pattern, source_code))

    if not matches:
        return []

    # Build chains by tracking consecutive method calls
    current_chain = []
    last_pos = -1

    for i, match in enumerate(matches):
        method_name = match.group(1)

        # Check if this is part of a chain (close to previous match)
        # Allow up to 100 characters between methods for complex arguments
        if current_chain and match.start() - last_pos > 100:
            # Too far apart, start a new chain
            if len(current_chain) > 1:  # Only save actual chains (2+ methods)
                chains.append(current_chain)
            current_chain = [method_name]
        else:
            current_chain.append(method_name)

        # Find end of this method call (rough approximation)
        # Look for closing paren or next method
        if i < len(matches) - 1:
            last_pos = matches[i + 1].start()
        else:
            last_pos = len(source_code)

    # Add the last chain if it has multiple methods
    if len(current_chain) > 1:
        chains.append(current_chain)

    # Return longest chain (most significant)
    return max(chains, key=len) if chains else []


def compare_method_chains(code1: str, code2: str) -> float:
    """
    Compare method chain structure between two code blocks.

    Returns:
        Similarity score 0.0-1.0 based on chain overlap
    """
    chain1 = extract_method_chain(code1)
    chain2 = extract_method_chain(code2)

    if not chain1 and not chain2:
        return 1.0  # No chains in either

    if not chain1 or not chain2:
        return 0.5  # One has chain, other doesn't

    # Exact match
    if chain1 == chain2:
        return 1.0

    # Check if one is a subset of the other (additional operation)
    if len(chain1) != len(chain2):
        # Different length chains → likely different behavior
        # e.g., [filter, map] vs [filter, map, reverse]

        # Check if shorter is prefix of longer
        shorter = chain1 if len(chain1) < len(chain2) else chain2
        longer = chain1 if len(chain1) > len(chain2) else chain2

        if longer[:len(shorter)] == shorter:
            # One is extension of other → partial match
            # Similarity based on overlap ratio
            return len(shorter) / len(longer)
        else:
            # Different chains entirely
            return 0.0

    # Same length but different methods → check overlap
    overlap = sum(1 for m1, m2 in zip(chain1, chain2) if m1 == m2)
    return overlap / len(chain1)


def calculate_semantic_penalty(features1: SemanticFeatures, features2: SemanticFeatures) -> float:
    """
    Calculate combined semantic penalty based on extracted features.

    Penalties are multiplicative - each mismatch reduces similarity:
    - HTTP status codes: 0.70x (30% penalty)
    - Logical operators: 0.80x (20% penalty)
    - Semantic methods: 0.75x (25% penalty)

    Args:
        features1: Semantic features from first code block
        features2: Semantic features from second code block

    Returns:
        Penalty multiplier (0.0-1.0). Returns 1.0 if no penalties apply.

    Example:
        Different status codes (200 vs 404) + different operators (=== vs !==)
        = 0.70 * 0.80 = 0.56x final similarity
    """
    penalty = 1.0

    # Penalty 1: HTTP Status Code Mismatch (30% penalty)
    if features1.http_status_codes and features2.http_status_codes:
        if features1.http_status_codes != features2.http_status_codes:
            # Different status codes indicate different semantic intent
            # (e.g., 200 OK vs 201 Created vs 404 Not Found)
            penalty *= 0.70
            print(f"Warning: DEBUG: HTTP status code penalty: {features1.http_status_codes} vs {features2.http_status_codes}, penalty={penalty:.2f}", file=sys.stderr)

    # Penalty 2: Logical Operator Mismatch (20% penalty)
    if features1.logical_operators and features2.logical_operators:
        if features1.logical_operators != features2.logical_operators:
            # Different logical operators indicate different boolean logic
            # (e.g., === vs !==, && vs ||)
            penalty *= 0.80
            print(f"Warning: DEBUG: Logical operator penalty: {features1.logical_operators} vs {features2.logical_operators}, penalty={penalty:.2f}", file=sys.stderr)

    # Penalty 3: Semantic Method Mismatch (25% penalty)
    if features1.semantic_methods and features2.semantic_methods:
        if features1.semantic_methods != features2.semantic_methods:
            # Different semantic methods indicate different operations
            # (e.g., Math.max vs Math.min, toUpperCase vs toLowerCase)
            penalty *= 0.75
            print(f"Warning: DEBUG: Semantic method penalty: {features1.semantic_methods} vs {features2.semantic_methods}, penalty={penalty:.2f}", file=sys.stderr)

    return penalty


def calculate_structural_similarity(code1: str, code2: str, threshold: float = 0.90) -> Tuple[float, str]:
    """
    Calculate structural similarity between two code blocks using unified penalty system.

    Priority 2: Structural Similarity (Layer 2 of 3-layer algorithm)

    Returns:
        (similarity_score, method)
        - similarity_score: 0.0 to 1.0
        - method: 'exact', 'structural', or 'different'

    Algorithm (NEW TWO-PHASE FLOW):
    1. Exact match: Compare hashes → 1.0 similarity
    2. PHASE 1: Extract semantic features from ORIGINAL code (BEFORE normalization)
    3. PHASE 2: Normalize code and calculate base structural similarity
    4. PHASE 3: Apply unified semantic penalties using original features
    5. Return final similarity score and method
    """
    if not code1 or not code2:
        return 0.0, 'different'

    # Layer 1: Exact content match (fastest)
    hash1 = hashlib.sha256(code1.encode()).hexdigest()
    hash2 = hashlib.sha256(code2.encode()).hexdigest()

    if hash1 == hash2:
        return 1.0, 'exact'

    # ✅ PHASE 1: Extract semantic features from ORIGINAL code
    # This MUST happen BEFORE normalization to preserve semantic information
    features1 = extract_semantic_features(code1)
    features2 = extract_semantic_features(code2)

    # ✅ PHASE 2: Normalize code for structural comparison
    normalized1 = normalize_code(code1)
    normalized2 = normalize_code(code2)

    # Check if normalized versions are identical (structural duplicate)
    if normalized1 == normalized2:
        base_similarity = 0.95  # Slightly less than exact match
    else:
        # Calculate similarity ratio using Levenshtein
        base_similarity = calculate_levenshtein_similarity(normalized1, normalized2)

        # Layer 2.5: Method chain validation
        chain_similarity = compare_method_chains(code1, code2)

        if chain_similarity < 1.0:
            # Different chain structure → penalize similarity
            # Weight: 70% Levenshtein + 30% chain similarity
            base_similarity = (base_similarity * 0.7) + (chain_similarity * 0.3)

    # ✅ PHASE 3: Apply unified semantic penalties using ORIGINAL features
    penalty = calculate_semantic_penalty(features1, features2)
    final_similarity = base_similarity * penalty

    # Determine method based on final similarity score
    if final_similarity >= threshold:
        return final_similarity, 'structural'
    else:
        return final_similarity, 'different'


def are_structurally_similar(code1: str, code2: str, threshold: float = 0.90) -> bool:
    """
    Check if two code blocks are structurally similar.

    Returns True if similarity score >= threshold.
    """
    score, _ = calculate_structural_similarity(code1, code2, threshold)
    return score >= threshold
