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


def calculate_structural_similarity(code1: str, code2: str, threshold: float = 0.90) -> Tuple[float, str]:
    """
    Calculate structural similarity between two code blocks.

    Priority 2: Structural Similarity (Layer 2 of 3-layer algorithm)

    Returns:
        (similarity_score, method)
        - similarity_score: 0.0 to 1.0
        - method: 'exact', 'structural', 'structural_opposite_logic', or 'different'

    Algorithm:
    1. Exact match: Compare hashes → 1.0 similarity
    2. Logical operator check: Detect opposite logic → penalty applied
    3. Structural match: Compare normalized code → 0.0-1.0 similarity
    4. Below threshold: Not similar
    """
    if not code1 or not code2:
        return 0.0, 'different'

    # Layer 1: Exact content match (fastest)
    hash1 = hashlib.sha256(code1.encode()).hexdigest()
    hash2 = hashlib.sha256(code2.encode()).hexdigest()

    if hash1 == hash2:
        return 1.0, 'exact'

    # Layer 1.5: Logical operator check
    # If operators are opposite, reduce similarity
    ops1 = extract_logical_operators(code1)
    ops2 = extract_logical_operators(code2)

    # Check for opposite logic (=== vs !==, or presence of ! in one but not other)
    opposite_pairs = [
        ({'==='}, {'!=='}),
        ({'=='}, {'!='}),
    ]

    has_opposite_logic = False
    for pair1, pair2 in opposite_pairs:
        if (pair1.issubset(ops1) and pair2.issubset(ops2)) or \
           (pair2.issubset(ops1) and pair1.issubset(ops2)):
            has_opposite_logic = True
            print(f"DEBUG: Opposite logic detected: {ops1} vs {ops2}", file=sys.stderr)
            break

    # Layer 1.6: HTTP status code check
    # Different status codes = different semantics (200 OK vs 201 Created)
    status_codes1 = extract_http_status_codes(code1)
    status_codes2 = extract_http_status_codes(code2)
    has_different_status_codes = (status_codes1 and status_codes2 and status_codes1 != status_codes2)
    if has_different_status_codes:
        print(f"DEBUG: Different HTTP status codes: {status_codes1} vs {status_codes2}", file=sys.stderr)

    # Layer 1.7: Semantic method check
    # Different semantic methods = different behavior (Math.max vs Math.min)
    semantic_methods1 = extract_semantic_methods(code1)
    semantic_methods2 = extract_semantic_methods(code2)
    has_opposite_semantic_methods = (semantic_methods1 and semantic_methods2 and semantic_methods1 != semantic_methods2)
    if has_opposite_semantic_methods:
        print(f"DEBUG: Opposite semantic methods: {semantic_methods1} vs {semantic_methods2}", file=sys.stderr)

    # Layer 2: Structural match (normalize and compare)
    normalized1 = normalize_code(code1)
    normalized2 = normalize_code(code2)

    # Check if normalized versions are identical (structural duplicate)
    if normalized1 == normalized2:
        # If opposite logic detected, demote to lower similarity
        if has_opposite_logic:
            return 0.75, 'structural_opposite_logic'  # Below threshold

        # If different HTTP status codes, also demote
        if has_different_status_codes:
            return 0.85, 'structural'  # Below threshold

        # If opposite semantic methods (Math.max vs Math.min), demote
        if has_opposite_semantic_methods:
            return 0.85, 'structural'  # Below threshold

        return 0.95, 'structural'  # Slightly less than exact

    # Calculate similarity ratio using Levenshtein
    similarity = calculate_levenshtein_similarity(normalized1, normalized2)

    # Layer 2.5: Method chain validation
    chain_similarity = compare_method_chains(code1, code2)

    if chain_similarity < 1.0:
        # Different chain structure → penalize similarity
        # Weight: 70% Levenshtein + 30% chain similarity
        similarity = (similarity * 0.7) + (chain_similarity * 0.3)

    # Penalize opposite logic even if structurally similar
    if has_opposite_logic and similarity >= threshold:
        original_similarity = similarity
        similarity *= 0.8  # 20% penalty → likely falls below threshold
        print(f"DEBUG: Opposite logic penalty applied: {original_similarity:.3f} -> {similarity:.3f}", file=sys.stderr)

    # Penalize different HTTP status codes
    if has_different_status_codes and similarity >= threshold:
        original_similarity = similarity
        similarity *= 0.7  # 30% penalty → different semantics
        print(f"DEBUG: Status code penalty applied: {original_similarity:.3f} -> {similarity:.3f}", file=sys.stderr)

    # Penalize opposite semantic methods (Math.max vs Math.min)
    if has_opposite_semantic_methods and similarity >= threshold:
        original_similarity = similarity
        similarity *= 0.85  # 15% penalty → different behavior
        print(f"DEBUG: Semantic method penalty applied: {original_similarity:.3f} -> {similarity:.3f}", file=sys.stderr)

    # Determine method based on similarity score
    if similarity >= threshold:
        return similarity, 'structural'
    else:
        return similarity, 'different'


def are_structurally_similar(code1: str, code2: str, threshold: float = 0.90) -> bool:
    """
    Check if two code blocks are structurally similar.

    Returns True if similarity score >= threshold.
    """
    score, _ = calculate_structural_similarity(code1, code2, threshold)
    return score >= threshold
