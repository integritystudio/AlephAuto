"""Type stubs for grouping module."""

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Set, Tuple

from ..models.code_block import CodeBlock
from ..models.duplicate_group import DuplicateGroup
from ..annotators.semantic_annotator import SemanticAnnotation


@dataclass
class SemanticCheckResult:
    """Result of a semantic compatibility check."""
    is_valid: bool
    reason: str
    details: Tuple[Any, Any] | None = ...


# Module constants
MIN_COMPLEXITY_THRESHOLD: Dict[str, int]
MIN_GROUP_QUALITY: float
OPPOSITE_OPERATOR_PAIRS: List[Tuple[Set[str], Set[str]]]
SEMANTIC_CHECKS: List[Callable[[str, str], SemanticCheckResult]]
SEMANTIC_WEIGHTS: Dict[str, float]
SEMANTIC_SIMILARITY_THRESHOLD: float
DEBUG: bool


def calculate_code_complexity(source_code: str) -> dict: ...
def is_complex_enough(block: CodeBlock) -> bool: ...
def calculate_group_quality_score(
    group_blocks: List[CodeBlock], similarity_score: float
) -> float: ...
def validate_exact_group_semantics(group_blocks: List[CodeBlock]) -> tuple: ...
def group_by_similarity(
    blocks: List[CodeBlock], similarity_threshold: float = ...
) -> List[DuplicateGroup]: ...
