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


def group_by_similarity(
    blocks: List['CodeBlock'],
    similarity_threshold: float = 0.85
) -> List['DuplicateGroup']:
    """
    Group code blocks using multi-layer similarity algorithm.

    Priority 2: Structural Similarity
    Implements Layer 1 (exact) and Layer 2 (structural) from Phase 1 design.

    Algorithm:
    1. Layer 1: Group by exact content hash (O(n))
    2. Layer 2: Group remaining by structural similarity (O(n*k))
    3. Layer 3: TODO - Semantic grouping by category + tags

    Returns:
        List of DuplicateGroup objects with similarity scores
    """
    groups = []
    grouped_block_ids = set()

    # Layer 1: Exact matching (hash-based)
    print(f"Layer 1: Grouping by exact content hash...", file=sys.stderr)
    exact_groups = _group_by_exact_hash(blocks)

    for hash_val, group_blocks in exact_groups.items():
        if len(group_blocks) >= 2:
            group = _create_duplicate_group(
                group_blocks,
                similarity_score=1.0,
                similarity_method='exact_match'  # Must match pydantic enum
            )
            groups.append(group)

            # Mark these blocks as grouped
            for block in group_blocks:
                grouped_block_ids.add(block.block_id)

    print(f"Layer 1: Found {len(groups)} exact duplicate groups", file=sys.stderr)

    # Layer 2: Structural similarity (for ungrouped blocks)
    ungrouped_blocks = [b for b in blocks if b.block_id not in grouped_block_ids]
    print(f"Layer 2: Checking {len(ungrouped_blocks)} remaining blocks for structural similarity...", file=sys.stderr)

    structural_groups = _group_by_structural_similarity(
        ungrouped_blocks,
        similarity_threshold
    )

    for group_blocks, similarity_score in structural_groups:
        if len(group_blocks) >= 2:
            group = _create_duplicate_group(
                group_blocks,
                similarity_score=similarity_score,
                similarity_method='structural'
            )
            groups.append(group)

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

    for block in blocks:
        hash_val = block.content_hash
        hash_groups[hash_val].append(block)

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

        # If we found similar blocks, create a group
        if len(group) >= 2:
            used.add(i)
            # Average similarity score for the group
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
