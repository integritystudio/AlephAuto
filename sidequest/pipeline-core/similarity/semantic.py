"""
Semantic Similarity Validation

Layer 3 of the multi-layer similarity algorithm.
Validates that structurally similar code blocks are also semantically equivalent.
"""

from typing import List, Optional
import sys

# Import models
try:
    sys.path.insert(0, '.')
    from lib.models.code_block import CodeBlock, SemanticCategory
except ImportError:
    pass


def are_semantically_compatible(block1: 'CodeBlock', block2: 'CodeBlock') -> bool:
    """
    Check if two code blocks are semantically compatible for grouping.

    Returns True if blocks can be considered semantic duplicates.

    Validation checks:
    1. Same pattern_id (ast-grep rule)
    2. Same category (semantic categorization)
    3. Compatible tags (if present)
    4. Similar complexity (line count within 50%)
    """

    # Check 1: Must match same ast-grep pattern
    if block1.pattern_id != block2.pattern_id:
        return False

    # Check 2: Must be same semantic category
    if block1.category != block2.category:
        return False

    # Check 3: Tag compatibility
    # If both have function tags, they must be different functions
    # (same function in same file = already deduplicated)
    tags1 = set(block1.tags)
    tags2 = set(block2.tags)

    func1 = _extract_function_tag(tags1)
    func2 = _extract_function_tag(tags2)

    if func1 and func2:
        # Both are named functions
        if func1 == func2 and block1.location.file_path == block2.location.file_path:
            # Same function in same file → already deduplicated, should not group
            return False

    # Check 4: Complexity similarity
    # Blocks should have similar size (within 50% difference)
    line_ratio = min(block1.line_count, block2.line_count) / max(block1.line_count, block2.line_count)
    if line_ratio < 0.5:
        # One block is more than 2x the size of the other
        return False

    return True


def calculate_tag_overlap(block1: 'CodeBlock', block2: 'CodeBlock') -> float:
    """
    Calculate semantic tag overlap between two blocks.

    Returns:
        Overlap ratio 0.0-1.0
    """
    tags1 = set(block1.tags)
    tags2 = set(block2.tags)

    if not tags1 and not tags2:
        return 1.0  # No tags on either

    if not tags1 or not tags2:
        return 0.5  # One has tags, other doesn't

    # Calculate Jaccard similarity
    intersection = tags1 & tags2
    union = tags1 | tags2

    return len(intersection) / len(union) if union else 0.0


def _extract_function_tag(tags: set) -> Optional[str]:
    """Extract function name from tag set."""
    for tag in tags:
        if tag.startswith('function:'):
            return tag[9:]  # Remove 'function:' prefix
    return None


def validate_duplicate_group(blocks: List['CodeBlock']) -> bool:
    """
    Validate that a group of blocks are truly semantic duplicates.

    All blocks must:
    - Match same pattern
    - Have same category
    - Be semantically compatible pairwise
    """
    if len(blocks) < 2:
        return False

    # All blocks must have same pattern_id
    pattern_ids = set(b.pattern_id for b in blocks)
    if len(pattern_ids) > 1:
        return False

    # All blocks must have same category
    categories = set(b.category for b in blocks)
    if len(categories) > 1:
        return False

    # Pairwise semantic compatibility
    for i, block1 in enumerate(blocks):
        for block2 in blocks[i+1:]:
            if not are_semantically_compatible(block1, block2):
                return False

    return True
