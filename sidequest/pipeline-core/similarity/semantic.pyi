"""Type stubs for semantic similarity module."""

from typing import List, Optional

from ..models.code_block import CodeBlock


def are_semantically_compatible(block1: CodeBlock, block2: CodeBlock) -> bool: ...
def calculate_tag_overlap(block1: CodeBlock, block2: CodeBlock) -> float: ...
def validate_duplicate_group(blocks: List[CodeBlock]) -> bool: ...
