"""Type stubs for consolidation_suggestion module."""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class ConsolidationStrategy(str, Enum):
    LOCAL_UTIL = ...
    SHARED_PACKAGE = ...
    MCP_SERVER = ...
    AUTONOMOUS_AGENT = ...
    NO_ACTION = ...


class ImplementationComplexity(str, Enum):
    TRIVIAL = ...
    SIMPLE = ...
    MODERATE = ...
    COMPLEX = ...
    VERY_COMPLEX = ...


class MigrationRisk(str, Enum):
    MINIMAL = ...
    LOW = ...
    MEDIUM = ...
    HIGH = ...
    CRITICAL = ...


class MigrationStep(BaseModel):
    step_number: int
    description: str
    code_example: Optional[str]
    automated: bool
    estimated_time: Optional[str]


class ConsolidationSuggestion(BaseModel):
    suggestion_id: str
    duplicate_group_id: str
    strategy: ConsolidationStrategy
    strategy_rationale: str
    impact_score: float
    complexity: ImplementationComplexity
    migration_risk: MigrationRisk
    breaking_changes: bool
    migration_steps: List[MigrationStep]
    target_location: Optional[str]
    target_name: Optional[str]
    proposed_implementation: Optional[str]
    usage_example: Optional[str]
    estimated_effort_hours: Optional[float]
    loc_reduction: Optional[int]
    affected_files_count: int
    affected_repositories_count: int
    dependencies: List[str]
    prerequisite_suggestions: List[str]
    test_strategy: Optional[str]
    rollback_plan: Optional[str]
    confidence: float
    automated_refactor_possible: bool
    requires_human_review: bool
    benefits: List[str]
    drawbacks: List[str]
    notes: Optional[str]
    created_at: datetime

    @property
    def priority(self) -> str: ...
    @property
    def roi_score(self) -> float: ...
    @property
    def is_quick_win(self) -> bool: ...

    def add_migration_step(
        self,
        description: str,
        code_example: Optional[str] = ...,
        automated: bool = ...,
        estimated_time: Optional[str] = ...,
    ) -> None: ...
    def add_benefit(self, benefit: str) -> None: ...
    def add_drawback(self, drawback: str) -> None: ...
    def to_markdown_summary(self) -> str: ...
    def __hash__(self) -> int: ...
    def __eq__(self, other: object) -> bool: ...
