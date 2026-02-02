"""Type stubs for duplicate_group module."""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class SimilarityMethod(str, Enum):
    EXACT_MATCH = ...
    STRUCTURAL = ...
    SEMANTIC = ...
    HYBRID = ...


class DuplicateGroup(BaseModel):
    group_id: str
    pattern_id: str
    member_block_ids: List[str]
    similarity_score: float
    similarity_method: SimilarityMethod
    canonical_block_id: Optional[str]
    category: str
    language: str
    occurrence_count: int
    total_lines: int
    affected_files: List[str]
    affected_repositories: List[str]
    consolidation_complexity: Optional[str]
    breaking_changes_risk: Optional[str]
    created_at: datetime
    updated_at: datetime
    notes: Optional[str]
    metadata: Dict[str, Any]

    @property
    def deduplication_potential(self) -> int: ...
    @property
    def impact_score(self) -> float: ...
    @property
    def is_cross_repository(self) -> bool: ...
    @property
    def priority_level(self) -> str: ...

    def add_member(self, block_id: str) -> None: ...
    def remove_member(self, block_id: str) -> None: ...
    def set_canonical(self, block_id: str) -> None: ...
    def __hash__(self) -> int: ...
    def __eq__(self, other: object) -> bool: ...
