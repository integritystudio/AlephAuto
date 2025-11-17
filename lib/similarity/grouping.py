"""
Multi-Layer Similarity Grouping

Priority 2: Implement multi-layer grouping algorithm from Phase 1 design.

Combines:
- Layer 1: Exact matching (hash-based)
- Layer 2: Structural similarity (AST-based)
- Layer 3: Semantic equivalence (category + tags) [TODO]
"""

from typing import List, Dict, Set
from collections import defaultdict
import sys

# Type annotations for imported models
try:
    sys.path.insert(0, '.')
    from lib.models.code_block import CodeBlock
    from lib.models.duplicate_group import DuplicateGroup
except ImportError:
    pass  # Will be imported properly when used

from .structural import calculate_structural_similarity, calculate_ast_hash
from .semantic import are_semantically_compatible, validate_duplicate_group

# Minimum complexity threshold for duplicate detection
# IMPORTANT: Keep this low to avoid filtering out genuine duplicates
MIN_COMPLEXITY_THRESHOLD = {
    'min_line_count': 1,  # At least 1 line of code (very permissive)
    'min_unique_tokens': 3,  # At least 3 meaningful tokens (very permissive)
}

# Minimum quality threshold for duplicate groups
MIN_GROUP_QUALITY = 0.70  # Groups must score at least 70% quality


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

    # Factor 1: Similarity score (40% weight)
    similarity_factor = similarity_score * 0.4

    # Factor 2: Group size (20% weight)
    # Larger groups more likely to be genuine duplicates
    # 2 members = 0.5, 3 members = 0.75, 4+ members = 1.0
    size_factor = min(len(group_blocks) / 4.0, 1.0) * 0.2

    # Factor 3: Code complexity (20% weight)
    # More complex code = higher confidence in duplicate
    avg_line_count = sum(b.line_count for b in group_blocks) / len(group_blocks)
    complexity_factor = min(avg_line_count / 10.0, 1.0) * 0.2

    # Factor 4: Semantic consistency (20% weight)
    # All blocks same category = 1.0, mixed = lower
    categories = set(b.category for b in group_blocks)
    pattern_ids = set(b.pattern_id for b in group_blocks)

    semantic_factor = 0.0
    if len(categories) == 1 and len(pattern_ids) == 1:
        semantic_factor = 1.0 * 0.2  # Perfect consistency
    elif len(categories) == 1:
        semantic_factor = 0.7 * 0.2  # Same category, different patterns
    elif len(pattern_ids) == 1:
        semantic_factor = 0.5 * 0.2  # Same pattern, different categories
    else:
        semantic_factor = 0.3 * 0.2  # Mixed

    total_quality = similarity_factor + size_factor + complexity_factor + semantic_factor

    return total_quality


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
        if len(group_blocks) >= 2:
            # Check group quality
            quality_score = calculate_group_quality_score(group_blocks, 1.0)

            if quality_score >= MIN_GROUP_QUALITY:
                group = _create_duplicate_group(
                    group_blocks,
                    similarity_score=1.0,
                    similarity_method='exact_match'  # Must match pydantic enum
                )
                groups.append(group)

                # Mark these blocks as grouped
                for block in group_blocks:
                    grouped_block_ids.add(block.block_id)
            else:
                print(f"Warning: Exact group rejected (quality={quality_score:.2f} < {MIN_GROUP_QUALITY}): {[b.block_id for b in group_blocks]}", file=sys.stderr)

    print(f"Layer 1: Found {len(groups)} exact duplicate groups", file=sys.stderr)

    # Layer 2: Structural similarity (for ungrouped blocks)
    ungrouped_blocks = [b for b in complex_blocks if b.block_id not in grouped_block_ids]
    print(f"Layer 2: Checking {len(ungrouped_blocks)} remaining blocks for structural similarity...", file=sys.stderr)

    structural_groups = _group_by_structural_similarity(
        ungrouped_blocks,
        similarity_threshold
    )

    for group_blocks, similarity_score in structural_groups:
        if len(group_blocks) >= 2:
            # Check group quality
            quality_score = calculate_group_quality_score(group_blocks, similarity_score)

            if quality_score >= MIN_GROUP_QUALITY:
                group = _create_duplicate_group(
                    group_blocks,
                    similarity_score=similarity_score,
                    similarity_method='structural'
                )
                groups.append(group)
            else:
                print(f"Warning: Structural group rejected (quality={quality_score:.2f} < {MIN_GROUP_QUALITY}): {[b.block_id for b in group_blocks]}", file=sys.stderr)

            # Mark these blocks as grouped
            for block in group_blocks:
                grouped_block_ids.add(block.block_id)

    print(f"Layer 2: Found {len(structural_groups)} structural duplicate groups", file=sys.stderr)

    # TODO: Layer 3 - Semantic similarity
    # Group remaining blocks by category + semantic tags

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
            func_name = None
            for tag in block.tags:
                if tag.startswith('function:'):
                    func_name = tag[9:]
                    break
            print(f"Warning: DEBUG hash block {i}: {func_name or 'unknown'} at {block.location.file_path}:{block.location.line_start}, hash={hash_val[:8]}, code_len={len(block.source_code)}", file=sys.stderr)

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
