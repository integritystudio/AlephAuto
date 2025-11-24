"""
ScanReport Model - Complete duplicate detection scan results

Top-level model representing the complete results of a duplicate detection
scan across one or more repositories, including all code blocks, duplicate
groups, consolidation suggestions, and summary metrics.
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, computed_field

# Import our other models
# Note: In actual implementation, these would be proper imports
# from .code_block import CodeBlock
# from .duplicate_group import DuplicateGroup
# from .consolidation_suggestion import ConsolidationSuggestion


class RepositoryInfo(BaseModel):
    """Information about a scanned repository"""
    repository_path: str = Field(..., description="Absolute path to repository")
    repository_name: str = Field(..., description="Repository name/identifier")
    git_remote: Optional[str] = Field(None, description="Git remote URL")
    git_branch: Optional[str] = Field(None, description="Current branch")
    git_commit: Optional[str] = Field(None, description="Current commit hash")
    total_files: int = Field(..., ge=0, description="Total files scanned")
    total_lines: int = Field(..., ge=0, description="Total lines of code scanned")
    languages: List[str] = Field(default_factory=list, description="Languages detected")


class ScanConfiguration(BaseModel):
    """Configuration used for the scan"""
    rules_used: List[str] = Field(default_factory=list, description="ast-grep rules applied")
    excluded_paths: List[str] = Field(default_factory=list, description="Paths excluded from scan")
    min_similarity_threshold: float = Field(0.8, ge=0.0, le=1.0, description="Minimum similarity for grouping")
    min_duplicate_size: int = Field(3, ge=1, description="Minimum lines for duplicate detection")


class ScanMetrics(BaseModel):
    """Statistical metrics from the scan"""

    # Code blocks
    total_code_blocks: int = Field(..., ge=0, description="Total code blocks detected")
    code_blocks_by_category: Dict[str, int] = Field(
        default_factory=dict,
        description="Count of blocks by semantic category"
    )
    code_blocks_by_language: Dict[str, int] = Field(
        default_factory=dict,
        description="Count of blocks by programming language"
    )

    # Duplicate groups
    total_duplicate_groups: int = Field(..., ge=0, description="Total duplicate groups found")
    exact_duplicates: int = Field(..., ge=0, description="Groups with 100% similarity")
    structural_duplicates: int = Field(..., ge=0, description="Groups with structural similarity")
    semantic_duplicates: int = Field(..., ge=0, description="Groups with semantic similarity")

    # Impact metrics
    total_duplicated_lines: int = Field(..., ge=0, description="Total lines in duplicate groups")
    potential_loc_reduction: int = Field(..., ge=0, description="Potential lines that could be removed")
    duplication_percentage: float = Field(..., ge=0.0, le=100.0, description="Percentage of code that's duplicated")

    # Consolidation suggestions
    total_suggestions: int = Field(..., ge=0, description="Total consolidation suggestions")
    quick_wins: int = Field(..., ge=0, description="Number of quick win suggestions")
    high_priority_suggestions: int = Field(..., ge=0, description="High priority suggestions")

    # Cross-repository analysis (if multiple repos scanned)
    cross_repository_duplicates: int = Field(0, ge=0, description="Duplicates spanning multiple repos")


class ScanReport(BaseModel):
    """
    Complete duplicate detection scan report

    This is the top-level model that contains all results from a
    duplicate detection scan, including code blocks, duplicate groups,
    consolidation suggestions, and summary metrics.
    """

    # Core identification
    report_id: str = Field(..., description="Unique identifier for this report")
    scan_name: Optional[str] = Field(None, description="Descriptive name for this scan")

    # Scan metadata
    scanned_at: datetime = Field(default_factory=datetime.utcnow, description="Scan timestamp")
    scan_duration_seconds: Optional[float] = Field(None, ge=0, description="How long the scan took")
    scanner_version: str = Field("1.0.0", description="Version of duplicate detection pipeline")

    # Configuration
    configuration: ScanConfiguration = Field(..., description="Scan configuration")

    # Repository information
    repositories: List[RepositoryInfo] = Field(..., description="Repositories scanned")

    # Results (IDs only for performance, actual objects stored separately)
    code_block_ids: List[str] = Field(default_factory=list, description="IDs of detected code blocks")
    duplicate_group_ids: List[str] = Field(default_factory=list, description="IDs of duplicate groups")
    suggestion_ids: List[str] = Field(default_factory=list, description="IDs of consolidation suggestions")

    # Summary metrics
    metrics: ScanMetrics = Field(..., description="Statistical metrics")

    # Analysis summary
    executive_summary: Optional[str] = Field(None, description="High-level summary of findings")
    recommendations: List[str] = Field(default_factory=list, description="Top-level recommendations")
    warnings: List[str] = Field(default_factory=list, description="Warnings or issues encountered")

    # Output paths
    output_directory: str = Field(..., description="Directory where detailed results are saved")
    report_files: Dict[str, str] = Field(
        default_factory=dict,
        description="Paths to generated report files (HTML, JSON, etc.)"
    )

    # Additional metadata
    tags: List[str] = Field(default_factory=list, description="Tags for categorization")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")

    model_config = {
        'json_schema_extra': {
            'example': {
                'report_id': 'scan_20250111_001',
                'scan_name': 'Sidequest Repository Scan',
                'repositories': [{
                    'repository_name': 'sidequest',
                    'repository_path': '/Users/user/code/jobs/sidequest',
                    'total_files': 15,
                    'total_lines': 2500,
                    'languages': ['javascript', 'typescript']
                }],
                'metrics': {
                    'total_code_blocks': 150,
                    'total_duplicate_groups': 12,
                    'total_duplicated_lines': 300,
                    'potential_loc_reduction': 250,
                    'duplication_percentage': 12.0,
                    'total_suggestions': 12,
                    'quick_wins': 5
                }
            }
        }
    }

    @computed_field
    @property
    def is_multi_repository(self) -> bool:
        """Check if this scan covers multiple repositories"""
        return len(self.repositories) > 1

    @computed_field
    @property
    def total_scanned_files(self) -> int:
        """Total files across all repositories"""
        return sum(repo.total_files for repo in self.repositories)

    @computed_field
    @property
    def total_scanned_lines(self) -> int:
        """Total lines of code across all repositories"""
        return sum(repo.total_lines for repo in self.repositories)

    @computed_field
    @property
    def duplication_severity(self) -> str:
        """
        Assess overall duplication severity

        Returns: 'minimal', 'low', 'moderate', 'high', 'critical'
        """
        dup_pct = self.metrics.duplication_percentage

        if dup_pct < 5:
            return 'minimal'
        elif dup_pct < 10:
            return 'low'
        elif dup_pct < 20:
            return 'moderate'
        elif dup_pct < 40:
            return 'high'
        else:
            return 'critical'

    @computed_field
    @property
    def consolidation_opportunity_score(self) -> float:
        """
        Calculate overall consolidation opportunity (0-100)

        Higher score = more benefit from consolidation
        """
        # Factors: duplication %, number of quick wins, potential LOC reduction
        dup_factor = min(self.metrics.duplication_percentage / 40 * 100, 100)  # Cap at 40%

        quick_win_factor = min(self.metrics.quick_wins / 10 * 100, 100)  # Cap at 10 quick wins

        if self.total_scanned_lines > 0:
            loc_reduction_factor = (
                self.metrics.potential_loc_reduction / self.total_scanned_lines * 100
            )
        else:
            loc_reduction_factor = 0

        # Weighted average
        score = (
            dup_factor * 0.35 +
            quick_win_factor * 0.40 +
            loc_reduction_factor * 0.25
        )

        return round(min(score, 100), 2)

    def add_repository(self, repo_info: RepositoryInfo) -> None:
        """Add a repository to this scan"""
        self.repositories.append(repo_info)

    def add_code_block_id(self, block_id: str) -> None:
        """Register a code block in this scan"""
        if block_id not in self.code_block_ids:
            self.code_block_ids.append(block_id)

    def add_duplicate_group_id(self, group_id: str) -> None:
        """Register a duplicate group in this scan"""
        if group_id not in self.duplicate_group_ids:
            self.duplicate_group_ids.append(group_id)

    def add_suggestion_id(self, suggestion_id: str) -> None:
        """Register a consolidation suggestion in this scan"""
        if suggestion_id not in self.suggestion_ids:
            self.suggestion_ids.append(suggestion_id)

    def generate_executive_summary(self) -> str:
        """
        Auto-generate executive summary based on metrics

        Returns a human-readable summary of the scan results
        """
        repos_text = f"{len(self.repositories)} repository" if len(self.repositories) == 1 else f"{len(self.repositories)} repositories"

        summary = f"""
# Duplicate Detection Scan Report

Scanned {repos_text} containing {self.total_scanned_files:,} files and {self.total_scanned_lines:,} lines of code.

## Key Findings

- **Duplicate Groups Found:** {self.metrics.total_duplicate_groups}
- **Duplicated Code:** {self.metrics.total_duplicated_lines:,} lines ({self.metrics.duplication_percentage:.1f}% of total)
- **Duplication Severity:** {self.duplication_severity.upper()}
- **Potential Reduction:** {self.metrics.potential_loc_reduction:,} lines could be eliminated

## Consolidation Opportunities

- **Total Suggestions:** {self.metrics.total_suggestions}
- **Quick Wins:** {self.metrics.quick_wins} high-impact, low-effort consolidations
- **High Priority:** {self.metrics.high_priority_suggestions} high-priority suggestions
- **Opportunity Score:** {self.consolidation_opportunity_score}/100

## Recommendation

{'🚀 Immediate action recommended - many quick wins available!' if self.metrics.quick_wins >= 5 else
 '⚠️ Moderate duplication detected - consider prioritizing high-impact consolidations' if self.metrics.duplication_percentage >= 10 else
 '✅ Low duplication - focus on preventing new duplicates'}
"""
        return summary.strip()

    def to_summary_dict(self) -> Dict[str, Any]:
        """Export summary data for dashboards/APIs"""
        return {
            'report_id': self.report_id,
            'scanned_at': self.scanned_at.isoformat(),
            'repositories_count': len(self.repositories),
            'total_files': self.total_scanned_files,
            'total_lines': self.total_scanned_lines,
            'duplication_percentage': self.metrics.duplication_percentage,
            'duplication_severity': self.duplication_severity,
            'duplicate_groups': self.metrics.total_duplicate_groups,
            'potential_loc_reduction': self.metrics.potential_loc_reduction,
            'suggestions_total': self.metrics.total_suggestions,
            'quick_wins': self.metrics.quick_wins,
            'opportunity_score': self.consolidation_opportunity_score,
        }

    def __hash__(self) -> int:
        """Enable use in sets and as dict keys"""
        return hash(self.report_id)

    def __eq__(self, other: object) -> bool:
        """Compare reports by ID"""
        if not isinstance(other, ScanReport):
            return NotImplemented
        return self.report_id == other.report_id
