"""
Multi-Layer Similarity Grouping

Priority 2: Implement multi-layer grouping algorithm from Phase 1 design.

Combines:
- Layer 1: Exact matching (hash-based)
- Layer 2: Structural similarity (AST-based)
- Layer 3: Semantic equivalence (category + tags) [TODO]
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Dict, Set, Callable, Any
from collections import defaultdict
from pathlib import Path
import sys

# Import centralized config (H1 fix: use config module instead of os.environ)
from .config import SimilarityConfig

# Debug mode from config
DEBUG = SimilarityConfig.DEBUG

# Import models from correct path (relative to pipeline-core)
sys.path.insert(0, str(Path(__file__).parent.parent / 'models'))
sys.path.insert(0, str(Path(__file__).parent.parent))

from code_block import CodeBlock
from duplicate_group import DuplicateGroup

# Import semantic annotator (handle both module and standalone execution)
try:
    from ..annotators.semantic_annotator import SemanticAnnotator, SemanticAnnotation
except ImportError:
    sys.path.insert(0, str(Path(__file__).parent.parent / 'annotators'))
    from semantic_annotator import SemanticAnnotator, SemanticAnnotation

# Import similarity modules (handle both module and standalone execution)
try:
    from .structural import (
        calculate_structural_similarity,
        calculate_ast_hash,
        extract_logical_operators,
        extract_http_status_codes,
        extract_semantic_methods,
        extract_method_chain
    )
    from .semantic import are_semantically_compatible, validate_duplicate_group
except ImportError:
    from structural import (
        calculate_structural_similarity,
        calculate_ast_hash,
        extract_logical_operators,
        extract_http_status_codes,
        extract_semantic_methods,
        extract_method_chain
    )
    from semantic import are_semantically_compatible, validate_duplicate_group

# Minimum complexity threshold for duplicate detection
# IMPORTANT: Keep this low to avoid filtering out genuine duplicates
MIN_COMPLEXITY_THRESHOLD = {
    'min_line_count': 1,  # At least 1 line of code (very permissive)
    'min_unique_tokens': 3,  # At least 3 meaningful tokens (very permissive)
}

# Minimum quality threshold for duplicate groups (from config)
MIN_GROUP_QUALITY = SimilarityConfig.MIN_GROUP_QUALITY

# Opposite logical operator pairs for semantic validation
OPPOSITE_OPERATOR_PAIRS: list[tuple[set[str], set[str]]] = [
    ({'==='}, {'!=='}),
    ({'=='}, {'!='}),
]


# ---------------------------------------------------------------------------
# Semantic Check Infrastructure
# ---------------------------------------------------------------------------

@dataclass
class SemanticCheckResult:
    """Result of a semantic compatibility check."""
    is_valid: bool
    reason: str
    details: tuple[Any, Any] | None = None


def _check_method_chain(code1: str, code2: str) -> SemanticCheckResult:
    """Check for method chain differences."""
    chain1 = extract_method_chain(code1)
    chain2 = extract_method_chain(code2)
    if chain1 != chain2:
        return SemanticCheckResult(False, 'method_chain_mismatch', (chain1, chain2))
    return SemanticCheckResult(True, 'ok')


def _check_http_status_codes(code1: str, code2: str) -> SemanticCheckResult:
    """Check for HTTP status code differences."""
    status1 = extract_http_status_codes(code1)
    status2 = extract_http_status_codes(code2)
    if status1 and status2 and status1 != status2:
        return SemanticCheckResult(False, 'status_code_mismatch', (status1, status2))
    return SemanticCheckResult(True, 'ok')


def _check_logical_operators(code1: str, code2: str) -> SemanticCheckResult:
    """Check for opposite logical operators."""
    ops1 = extract_logical_operators(code1)
    ops2 = extract_logical_operators(code2)
    for pair1, pair2 in OPPOSITE_OPERATOR_PAIRS:
        has_opposite = (
            (pair1.issubset(ops1) and pair2.issubset(ops2)) or
            (pair2.issubset(ops1) and pair1.issubset(ops2))
        )
        if has_opposite:
            return SemanticCheckResult(False, 'opposite_logic', (ops1, ops2))
    return SemanticCheckResult(True, 'ok')


def _check_semantic_methods(code1: str, code2: str) -> SemanticCheckResult:
    """Check for semantic method opposites (e.g., Math.max vs Math.min)."""
    methods1 = extract_semantic_methods(code1)
    methods2 = extract_semantic_methods(code2)
    if methods1 and methods2 and methods1 != methods2:
        return SemanticCheckResult(False, 'semantic_method_mismatch', (methods1, methods2))
    return SemanticCheckResult(True, 'ok')


# Registry of semantic checks to run on code pairs
SEMANTIC_CHECKS: list[Callable[[str, str], SemanticCheckResult]] = [
    _check_method_chain,
    _check_http_status_codes,
    _check_logical_operators,
    _check_semantic_methods,
]


def _extract_function_names(blocks: list) -> list[str]:
    """Extract function names from block tags."""
    func_names = []
    for block in blocks:
        for tag in block.tags:
            if tag.startswith('function:'):
                func_names.append(tag[9:])
                break
    return func_names


def _run_semantic_checks(code1: str, code2: str) -> SemanticCheckResult:
    """Run all semantic checks on a code pair."""
    for check in SEMANTIC_CHECKS:
        result = check(code1, code2)
        if not result.is_valid:
            return result
    return SemanticCheckResult(True, 'semantically_compatible')


def calculate_code_complexity(source_code: str) -> dict:
    """
    Calculate basic complexity metrics for code block.

    Returns:
        {
            'line_count': int,
            'unique_tokens': int,
            'has_control_flow': bool
        }
    """
    import re

    lines = [line.strip() for line in source_code.split('\n') if line.strip()]
    line_count = len(lines)

    # Count unique tokens (simple tokenization)
    tokens = re.findall(r'\b\w+\b', source_code)
    unique_tokens = len(set(tokens))

    # Check for control flow
    control_flow_keywords = ['if', 'else', 'for', 'while', 'switch', 'case', 'try', 'catch']
    has_control_flow = any(keyword in source_code for keyword in control_flow_keywords)

    return {
        'line_count': line_count,
        'unique_tokens': unique_tokens,
        'has_control_flow': has_control_flow
    }


def is_complex_enough(block: 'CodeBlock') -> bool:
    """
    Check if block meets minimum complexity threshold.

    Trivial code (e.g., `return user.name;`) should not be grouped
    unless there are many occurrences.
    """
    complexity = calculate_code_complexity(block.source_code)

    # Must meet minimum thresholds
    if complexity['line_count'] < MIN_COMPLEXITY_THRESHOLD['min_line_count']:
        return False

    if complexity['unique_tokens'] < MIN_COMPLEXITY_THRESHOLD['min_unique_tokens']:
        # Exception: If has control flow, allow lower token count
        if not complexity['has_control_flow']:
            return False

    return True


def calculate_group_quality_score(group_blocks: List['CodeBlock'], similarity_score: float) -> float:
    """
    Calculate quality score for a duplicate group.

    Factors:
    - Average similarity score (40%)
    - Group size (20%)
    - Code complexity (20%)
    - Semantic consistency (20%)

    Returns:
        Quality score 0.0-1.0
    """
    if not group_blocks or len(group_blocks) < 2:
        return 0.0

    # Get weights from config (H6 fix: use constants instead of magic numbers)
    w_sim = SimilarityConfig.QUALITY_WEIGHT_SIMILARITY
    w_size = SimilarityConfig.QUALITY_WEIGHT_SIZE
    w_complexity = SimilarityConfig.QUALITY_WEIGHT_COMPLEXITY
    w_semantic = SimilarityConfig.QUALITY_WEIGHT_SEMANTIC

    # Factor 1: Similarity score
    similarity_factor = similarity_score * w_sim

    # Factor 2: Group size
    # Larger groups more likely to be genuine duplicates
    size_norm = SimilarityConfig.SIZE_NORMALIZATION
    size_factor = min(len(group_blocks) / size_norm, 1.0) * w_size

    # Factor 3: Code complexity
    # More complex code = higher confidence in duplicate
    avg_line_count = sum(b.line_count for b in group_blocks) / len(group_blocks)
    complexity_norm = SimilarityConfig.COMPLEXITY_NORMALIZATION
    complexity_factor = min(avg_line_count / complexity_norm, 1.0) * w_complexity

    # Factor 4: Semantic consistency
    # All blocks same category = 1.0, mixed = lower
    categories = set(b.category for b in group_blocks)
    pattern_ids = set(b.pattern_id for b in group_blocks)

    if len(categories) == 1 and len(pattern_ids) == 1:
        semantic_score = SimilarityConfig.SEMANTIC_PERFECT_CONSISTENCY
    elif len(categories) == 1:
        semantic_score = SimilarityConfig.SEMANTIC_SAME_CATEGORY
    elif len(pattern_ids) == 1:
        semantic_score = SimilarityConfig.SEMANTIC_SAME_PATTERN
    else:
        semantic_score = SimilarityConfig.SEMANTIC_MIXED

    semantic_factor = semantic_score * w_semantic

    total_quality = similarity_factor + size_factor + complexity_factor + semantic_factor

    return total_quality


def validate_exact_group_semantics(group_blocks: List['CodeBlock']) -> tuple:
    """
    Validate that exact hash matches don't have semantic differences.

    This prevents Layer 1 from bypassing semantic validation that exists in Layer 2.
    Checks for:
    - Method chain differences (e.g., .reverse())
    - HTTP status code differences (201 vs 200)
    - Opposite logical operators (!== vs ===)
    - Semantic method opposites (Math.max vs Math.min)

    Returns:
        (is_valid, reason) - False if semantic differences detected
    """
    if len(group_blocks) < 2:
        return True, "single_block"

    func_names = _extract_function_names(group_blocks)

    # Check all pairs for semantic differences
    for i in range(len(group_blocks)):
        for j in range(i + 1, len(group_blocks)):
            result = _run_semantic_checks(
                group_blocks[i].source_code,
                group_blocks[j].source_code
            )
            if not result.is_valid:
                print(f"DEBUG: Layer 1 REJECTED - {result.reason}: {func_names}", file=sys.stderr)
                if result.details:
                    print(f"       {result.details[0]} vs {result.details[1]}", file=sys.stderr)
                return False, f"{result.reason}: {result.details[0]} vs {result.details[1]}"

    return True, "semantically_compatible"


def _try_accept_group(
    group_blocks: List['CodeBlock'],
    similarity_score: float,
    similarity_method: str,
    groups: list,
    grouped_block_ids: set,
    layer_name: str,
    validate_semantics: bool = False
) -> bool:
    """Try to accept a candidate group through validation pipeline.

    Args:
        group_blocks: Candidate blocks for the group
        similarity_score: Similarity score for the group
        similarity_method: Method used ('exact_match' or 'structural')
        groups: List to append accepted groups to
        grouped_block_ids: Set to mark grouped block IDs
        layer_name: Name for debug logging ('Layer 1', 'Layer 2')
        validate_semantics: Whether to run semantic validation (Layer 1 only)

    Returns:
        True if group was accepted, False otherwise
    """
    if len(group_blocks) < 2:
        return False

    func_names = _extract_function_names(group_blocks)

    # Optional semantic validation (Layer 1 exact matches only)
    if validate_semantics:
        is_valid, reason = validate_exact_group_semantics(group_blocks)
        if not is_valid:
            print(f"DEBUG: {layer_name} group REJECTED (semantic): {func_names} - {reason}", file=sys.stderr)
            return False

    # Check group quality
    quality_score = calculate_group_quality_score(group_blocks, similarity_score)

    if quality_score < MIN_GROUP_QUALITY:
        print(f"DEBUG: {layer_name} group REJECTED (quality): {func_names} (quality={quality_score:.2f})", file=sys.stderr)
        return False

    # Accept group
    group = _create_duplicate_group(group_blocks, similarity_score, similarity_method)
    groups.append(group)

    # Mark blocks as grouped
    for block in group_blocks:
        grouped_block_ids.add(block.block_id)

    print(f"DEBUG: {layer_name} group ACCEPTED: {func_names} (quality={quality_score:.2f})", file=sys.stderr)
    return True


def group_by_similarity(
    blocks: List['CodeBlock'],
    similarity_threshold: float = 0.90
) -> List['DuplicateGroup']:
    """
    Group code blocks using multi-layer similarity algorithm with complexity filtering.

    Implements Layer 0 (complexity), Layer 1 (exact), Layer 2 (structural), and Layer 3 (semantic).

    Algorithm:
    0. Layer 0: Filter trivial blocks (below complexity threshold)
    1. Layer 1: Group by exact content hash (O(n))
    2. Layer 2: Group remaining by structural similarity (O(n*k))
    3. Layer 3: Semantic validation (pattern, category, tags)

    Returns:
        List of DuplicateGroup objects with similarity scores
    """
    # Layer 0: Filter out trivial blocks before grouping
    complex_blocks = [b for b in blocks if is_complex_enough(b)]
    trivial_count = len(blocks) - len(complex_blocks)

    if trivial_count > 0:
        print(f"Layer 0: Filtered {trivial_count} trivial blocks (below complexity threshold)", file=sys.stderr)

    groups = []
    grouped_block_ids = set()

    # Layer 1: Exact matching (hash-based)
    print(f"Layer 1: Grouping by exact content hash...", file=sys.stderr)
    exact_groups = _group_by_exact_hash(complex_blocks)

    for hash_val, group_blocks in exact_groups.items():
        print(f"DEBUG: Layer 1 exact group candidate: {_extract_function_names(group_blocks)} (hash={hash_val[:8]})", file=sys.stderr)
        _try_accept_group(
            group_blocks, 1.0, 'exact_match',
            groups, grouped_block_ids, 'Layer 1',
            validate_semantics=True
        )

    print(f"Layer 1: Found {len(groups)} exact duplicate groups", file=sys.stderr)

    # Layer 2: Structural similarity (for ungrouped blocks)
    ungrouped_blocks = [b for b in complex_blocks if b.block_id not in grouped_block_ids]
    print(f"Layer 2: Checking {len(ungrouped_blocks)} remaining blocks for structural similarity...", file=sys.stderr)

    structural_groups = _group_by_structural_similarity(ungrouped_blocks, similarity_threshold)
    layer1_count = len(groups)

    for group_blocks, similarity_score in structural_groups:
        _try_accept_group(
            group_blocks, similarity_score, 'structural',
            groups, grouped_block_ids, 'Layer 2'
        )

    print(f"Layer 2: Found {len(groups) - layer1_count} structural duplicate groups", file=sys.stderr)

    # Layer 3: Semantic similarity (for remaining ungrouped blocks)
    ungrouped_blocks = [b for b in complex_blocks if b.block_id not in grouped_block_ids]
    print(f"Layer 3: Checking {len(ungrouped_blocks)} remaining blocks for semantic similarity...", file=sys.stderr)

    if ungrouped_blocks:
        # Annotate all ungrouped blocks
        annotator = SemanticAnnotator()
        annotations = {
            block.block_id: annotator.annotate(block)
            for block in ungrouped_blocks
        }

        layer2_count = len(groups)
        semantic_groups = _group_by_semantic_similarity(
            ungrouped_blocks,
            annotations,
            SEMANTIC_SIMILARITY_THRESHOLD
        )

        for group_blocks, similarity_score in semantic_groups:
            _try_accept_group(
                group_blocks, similarity_score, 'semantic',
                groups, grouped_block_ids, 'Layer 3'
            )

        print(f"Layer 3: Found {len(groups) - layer2_count} semantic duplicate groups", file=sys.stderr)
    else:
        print(f"Layer 3: No ungrouped blocks remaining", file=sys.stderr)

    print(f"Total: {len(groups)} duplicate groups found", file=sys.stderr)
    return groups


def _group_by_exact_hash(blocks: List['CodeBlock']) -> Dict[str, List['CodeBlock']]:
    """Group blocks by exact content hash."""
    hash_groups = defaultdict(list)

    for i, block in enumerate(blocks):
        hash_val = block.content_hash
        hash_groups[hash_val].append(block)

        # Debug: Show first 20 blocks and their hashes
        if i < 20:
            func_names = _extract_function_names([block])
            func_name = func_names[0] if func_names else 'unknown'
            print(f"Warning: DEBUG hash block {i}: {func_name} at {block.location.file_path}:{block.location.line_start}, hash={hash_val[:8]}, code_len={len(block.source_code)}", file=sys.stderr)

    return hash_groups


def _group_by_structural_similarity(
    blocks: List['CodeBlock'],
    threshold: float
) -> List[tuple[List['CodeBlock'], float]]:
    """
    Group blocks by structural similarity using clustering.

    Returns:
        List of (group_blocks, similarity_score) tuples
    """
    if not blocks:
        return []

    # Build similarity matrix
    n = len(blocks)
    groups = []
    used = set()

    # For each block, find all structurally similar blocks
    for i, block1 in enumerate(blocks):
        if i in used:
            continue

        # Start a new group with this block
        group = [block1]
        similarities = []

        # Compare with remaining blocks
        for j in range(i + 1, n):
            if j in used:
                continue

            block2 = blocks[j]

            # Pre-check semantic compatibility
            if not are_semantically_compatible(block1, block2):
                continue  # Skip incompatible blocks

            # Calculate structural similarity
            similarity, method = calculate_structural_similarity(
                block1.source_code,
                block2.source_code,
                threshold
            )

            if similarity >= threshold:
                group.append(block2)
                similarities.append(similarity)
                used.add(j)

        # If we found similar blocks, validate and create a group
        if len(group) >= 2:
            # Validate complete group
            if validate_duplicate_group(group):
                used.add(i)
                # Average similarity score for the group
                avg_similarity = sum(similarities) / len(similarities) if similarities else 1.0
                groups.append((group, avg_similarity))
            else:
                # Group failed semantic validation
                print(f"Warning: Group rejected by semantic validation: {[b.block_id for b in group]}", file=sys.stderr)

    return groups


# ---------------------------------------------------------------------------
# Layer 3: Semantic Similarity
# ---------------------------------------------------------------------------

# Weights for semantic similarity calculation
SEMANTIC_WEIGHTS = {
    'operations': 0.40,  # What the code does
    'domains': 0.25,     # What domain it operates on
    'patterns': 0.20,    # What patterns it uses
    'data_types': 0.15,  # What data types it processes
}

# Threshold for semantic similarity matching (from config)
SEMANTIC_SIMILARITY_THRESHOLD = SimilarityConfig.SEMANTIC_SIMILARITY_THRESHOLD


def _calculate_jaccard_similarity(set1: set[str], set2: set[str]) -> float:
    """Calculate Jaccard similarity between two sets.

    Args:
        set1: First set of strings
        set2: Second set of strings

    Returns:
        Jaccard similarity coefficient (0.0 - 1.0)
    """
    if not set1 and not set2:
        return 1.0  # Both empty = compatible
    if not set1 or not set2:
        return 0.5  # One empty = partial match
    intersection = len(set1 & set2)
    union = len(set1 | set2)
    return intersection / union if union > 0 else 0.0


def _calculate_semantic_similarity(
    ann1: SemanticAnnotation,
    ann2: SemanticAnnotation
) -> float:
    """Calculate weighted semantic similarity between two annotations.

    Uses Jaccard similarity on each tag category with predefined weights:
    - Operations: 40%
    - Domains: 25%
    - Patterns: 20%
    - Data types: 15%

    Args:
        ann1: First semantic annotation
        ann2: Second semantic annotation

    Returns:
        Weighted similarity score (0.0 - 1.0)
    """
    op_sim = _calculate_jaccard_similarity(ann1.operations, ann2.operations)
    domain_sim = _calculate_jaccard_similarity(ann1.domains, ann2.domains)
    pattern_sim = _calculate_jaccard_similarity(ann1.patterns, ann2.patterns)
    type_sim = _calculate_jaccard_similarity(ann1.data_types, ann2.data_types)

    return (
        op_sim * SEMANTIC_WEIGHTS['operations'] +
        domain_sim * SEMANTIC_WEIGHTS['domains'] +
        pattern_sim * SEMANTIC_WEIGHTS['patterns'] +
        type_sim * SEMANTIC_WEIGHTS['data_types']
    )


def _intents_compatible(intent1: str, intent2: str) -> bool:
    """Check if two intents describe compatible operations.

    Two intents are compatible if they share at least one operation.

    Args:
        intent1: First intent string (e.g., "filter+map|on:user")
        intent2: Second intent string

    Returns:
        True if intents are compatible
    """
    # Unknown intents are never compatible (even with each other)
    if intent1 == 'unknown' or intent2 == 'unknown':
        return False

    # Extract operation components (first part before |)
    op_str1 = intent1.split('|')[0] if intent1 else ''
    op_str2 = intent2.split('|')[0] if intent2 else ''

    # Filter out empty strings when splitting
    ops1 = set(op for op in op_str1.split('+') if op)
    ops2 = set(op for op in op_str2.split('+') if op)

    # Empty operation sets are not compatible
    if not ops1 or not ops2:
        return False

    # At least one common operation required
    return bool(ops1 & ops2)


def _group_by_semantic_similarity(
    blocks: List['CodeBlock'],
    annotations: Dict[str, SemanticAnnotation],
    threshold: float = SEMANTIC_SIMILARITY_THRESHOLD
) -> List[tuple[List['CodeBlock'], float]]:
    """Layer 3: Group blocks by semantic equivalence.

    Matches blocks with:
    - Same category
    - Similar semantic tags (>= threshold)
    - Compatible operation intent

    Args:
        blocks: List of code blocks to group
        annotations: Dict mapping block_id to SemanticAnnotation
        threshold: Minimum similarity threshold (default 0.70)

    Returns:
        List of (group_blocks, similarity_score) tuples
    """
    if not blocks:
        return []

    groups = []
    used = set()

    for i, block1 in enumerate(blocks):
        if i in used:
            continue

        ann1 = annotations.get(block1.block_id)
        if not ann1:
            continue

        group = [block1]
        similarities = []

        for j in range(i + 1, len(blocks)):
            if j in used:
                continue

            block2 = blocks[j]
            ann2 = annotations.get(block2.block_id)
            if not ann2:
                continue

            # Must have same category
            if ann1.category != ann2.category:
                continue

            # Calculate semantic similarity
            similarity = _calculate_semantic_similarity(ann1, ann2)

            if similarity >= threshold:
                # Validate intent compatibility
                if _intents_compatible(ann1.intent, ann2.intent):
                    group.append(block2)
                    similarities.append(similarity)
                    used.add(j)

        if len(group) >= 2:
            used.add(i)
            avg_similarity = sum(similarities) / len(similarities) if similarities else 1.0
            groups.append((group, avg_similarity))

    return groups


def _create_duplicate_group(
    blocks: List['CodeBlock'],
    similarity_score: float,
    similarity_method: str
) -> 'DuplicateGroup':
    """Create a DuplicateGroup from a list of similar blocks."""

    return DuplicateGroup(
        group_id=f"dg_{blocks[0].content_hash[:12]}",
        pattern_id=blocks[0].pattern_id,
        member_block_ids=[b.block_id for b in blocks],
        similarity_score=similarity_score,
        similarity_method=similarity_method,
        category=blocks[0].category,
        language=blocks[0].language,
        occurrence_count=len(blocks),
        total_lines=sum(b.line_count for b in blocks),
        affected_files=list(set(b.location.file_path for b in blocks)),
        affected_repositories=list(set(b.repository_path for b in blocks))
    )
