"""Type stubs for semantic_annotator module."""

from dataclasses import dataclass

from ..models.code_block import CodeBlock
from ..utils.timing import TimingMetrics


@dataclass
class SemanticAnnotation:
    """Rich semantic metadata for a code block."""

    category: str
    operations: set[str]
    domains: set[str]
    patterns: set[str]
    data_types: set[str]
    intent: str

    def all_tags(self) -> set[str]: ...
    def to_dict(self) -> dict: ...


class SemanticAnnotator:
    """Stage 4: Full semantic annotation of code blocks."""

    collect_timing: bool
    timing: dict[str, TimingMetrics]

    def __init__(self, collect_timing: bool = ...) -> None: ...
    def get_timing_report(self) -> dict[str, dict]: ...
    def extract_annotation(self, block: CodeBlock) -> SemanticAnnotation: ...


# Pattern dictionaries (module-level)
ARRAY_OPERATION_PATTERNS: dict[str, str]
CRUD_OPERATION_PATTERNS: dict[str, str]
TRANSFORM_OPERATION_PATTERNS: dict[str, str]
VALIDATION_OPERATION_PATTERNS: dict[str, str]
DOMAIN_PATTERNS: dict[str, str]
CODE_PATTERN_PATTERNS: dict[str, str]
DATA_TYPE_PATTERNS: dict[str, str]
