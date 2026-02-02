"""Type stubs for scan_report module."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class RepositoryInfo(BaseModel):
    repository_path: str
    repository_name: str
    git_remote: Optional[str]
    git_branch: Optional[str]
    git_commit: Optional[str]
    total_files: int
    total_lines: int
    languages: List[str]


class ScanConfiguration(BaseModel):
    rules_used: List[str]
    excluded_paths: List[str]
    min_similarity_threshold: float
    min_duplicate_size: int


class ScanMetrics(BaseModel):
    total_code_blocks: int
    code_blocks_by_category: Dict[str, int]
    code_blocks_by_language: Dict[str, int]
    total_duplicate_groups: int
    exact_duplicates: int
    structural_duplicates: int
    semantic_duplicates: int
    total_duplicated_lines: int
    potential_loc_reduction: int
    duplication_percentage: float
    total_suggestions: int
    quick_wins: int
    high_priority_suggestions: int
    cross_repository_duplicates: int


class ScanReport(BaseModel):
    report_id: str
    scan_name: Optional[str]
    scanned_at: datetime
    scan_duration_seconds: Optional[float]
    scanner_version: str
    configuration: ScanConfiguration
    repositories: List[RepositoryInfo]
    code_block_ids: List[str]
    duplicate_group_ids: List[str]
    suggestion_ids: List[str]
    metrics: ScanMetrics
    executive_summary: Optional[str]
    recommendations: List[str]
    warnings: List[str]
    output_directory: str
    report_files: Dict[str, str]
    tags: List[str]
    metadata: Dict[str, Any]

    @property
    def is_multi_repository(self) -> bool: ...
    @property
    def total_scanned_files(self) -> int: ...
    @property
    def total_scanned_lines(self) -> int: ...
    @property
    def duplication_severity(self) -> str: ...
    @property
    def consolidation_opportunity_score(self) -> float: ...

    def add_repository(self, repo_info: RepositoryInfo) -> None: ...
    def add_code_block_id(self, block_id: str) -> None: ...
    def add_duplicate_group_id(self, group_id: str) -> None: ...
    def add_suggestion_id(self, suggestion_id: str) -> None: ...
    def generate_executive_summary(self) -> str: ...
    def to_summary_dict(self) -> Dict[str, Any]: ...
    def __hash__(self) -> int: ...
    def __eq__(self, other: object) -> bool: ...
