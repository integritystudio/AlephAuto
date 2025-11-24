"""
ConsolidationSuggestion Model - Recommendation for consolidating duplicates

Represents a specific recommendation for how to consolidate a DuplicateGroup,
including the strategy tier, implementation steps, and impact assessment.
"""

from datetime import datetime
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, computed_field, field_validator


class ConsolidationStrategy(str, Enum):
    """Consolidation tier/strategy"""
    LOCAL_UTIL = "local_util"           # Utility within single project
    SHARED_PACKAGE = "shared_package"   # Shared library across 2-3 projects
    MCP_SERVER = "mcp_server"           # MCP server for cross-language/tool
    AUTONOMOUS_AGENT = "autonomous_agent"  # Complex orchestration requiring AI
    NO_ACTION = "no_action"             # Not worth consolidating


class ImplementationComplexity(str, Enum):
    """Estimated implementation effort"""
    TRIVIAL = "trivial"      # < 1 hour
    SIMPLE = "simple"        # 1-4 hours
    MODERATE = "moderate"    # 1-2 days
    COMPLEX = "complex"      # 1+ weeks
    VERY_COMPLEX = "very_complex"  # Multiple weeks


class MigrationRisk(str, Enum):
    """Risk level for migration"""
    MINIMAL = "minimal"      # No breaking changes expected
    LOW = "low"             # Minor breaking changes possible
    MEDIUM = "medium"       # Some breaking changes likely
    HIGH = "high"           # Significant breaking changes
    CRITICAL = "critical"   # High risk of system breakage


class MigrationStep(BaseModel):
    """Single step in migration path"""
    step_number: int = Field(..., ge=1, description="Step order")
    description: str = Field(..., description="What to do in this step")
    code_example: Optional[str] = Field(None, description="Example code")
    automated: bool = Field(False, description="Can this step be automated?")
    estimated_time: Optional[str] = Field(None, description="Estimated time (e.g., '30min', '2h')")


class ConsolidationSuggestion(BaseModel):
    """
    Recommendation for consolidating a duplicate group

    Provides actionable guidance on how to consolidate a DuplicateGroup,
    including the recommended strategy tier, implementation steps,
    impact assessment, and migration guidance.
    """

    # Core identification
    suggestion_id: str = Field(..., description="Unique identifier for this suggestion")
    duplicate_group_id: str = Field(..., description="ID of DuplicateGroup being addressed")

    # Consolidation strategy
    strategy: ConsolidationStrategy = Field(..., description="Recommended consolidation tier")
    strategy_rationale: str = Field(..., description="Why this strategy was chosen")

    # Impact assessment
    impact_score: float = Field(
        ...,
        ge=0,
        le=100,
        description="Overall impact score (0-100, higher is more beneficial)"
    )

    # Implementation details
    complexity: ImplementationComplexity = Field(..., description="Implementation complexity")
    migration_risk: MigrationRisk = Field(..., description="Migration risk level")
    breaking_changes: bool = Field(..., description="Will this introduce breaking changes?")

    # Migration path
    migration_steps: List[MigrationStep] = Field(
        default_factory=list,
        description="Step-by-step migration guide"
    )

    # Target implementation
    target_location: Optional[str] = Field(
        None,
        description="Where to create the consolidated code (path or package name)"
    )
    target_name: Optional[str] = Field(
        None,
        description="Suggested name for consolidated function/class/package"
    )

    # Code examples
    proposed_implementation: Optional[str] = Field(
        None,
        description="Proposed consolidated code"
    )
    usage_example: Optional[str] = Field(
        None,
        description="Example of how to use the consolidated code"
    )

    # Metrics
    estimated_effort_hours: Optional[float] = Field(
        None,
        ge=0,
        description="Estimated implementation effort in hours"
    )
    loc_reduction: Optional[int] = Field(
        None,
        ge=0,
        description="Lines of code that will be eliminated"
    )
    affected_files_count: int = Field(..., ge=1, description="Number of files to modify")
    affected_repositories_count: int = Field(..., ge=1, description="Number of repos affected")

    # Dependencies
    dependencies: List[str] = Field(
        default_factory=list,
        description="Required dependencies for consolidation"
    )
    prerequisite_suggestions: List[str] = Field(
        default_factory=list,
        description="Other suggestions that should be completed first"
    )

    # Testing
    test_strategy: Optional[str] = Field(
        None,
        description="How to test the consolidated code"
    )
    rollback_plan: Optional[str] = Field(
        None,
        description="How to rollback if consolidation fails"
    )

    # Metadata
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Confidence in this suggestion (0.0-1.0)"
    )
    automated_refactor_possible: bool = Field(
        False,
        description="Can this be automated with codemod?"
    )
    requires_human_review: bool = Field(
        True,
        description="Requires human review before implementation"
    )

    # Additional context
    benefits: List[str] = Field(
        default_factory=list,
        description="List of benefits from this consolidation"
    )
    drawbacks: List[str] = Field(
        default_factory=list,
        description="Potential drawbacks or concerns"
    )
    notes: Optional[str] = Field(None, description="Additional notes")

    # Timestamps
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="When this suggestion was created"
    )

    model_config = {
        'json_schema_extra': {
            'example': {
                'suggestion_id': 'cs_001',
                'duplicate_group_id': 'dg_001',
                'strategy': 'local_util',
                'strategy_rationale': 'Used within single project, simple utility function',
                'impact_score': 75.0,
                'complexity': 'trivial',
                'migration_risk': 'low',
                'breaking_changes': False,
                'target_location': 'src/utils/json.js',
                'target_name': 'writeJsonFile',
                'loc_reduction': 15,
                'affected_files_count': 5,
                'affected_repositories_count': 1,
            }
        }
    }

    @field_validator('impact_score')
    @classmethod
    def round_impact_score(cls, v):
        """Round impact score to 2 decimal places"""
        return round(v, 2)

    @computed_field
    @property
    def priority(self) -> str:
        """
        Determine priority level based on impact and complexity

        Returns: 'critical', 'high', 'medium', 'low'
        """
        # High impact, low complexity = highest priority
        # Low impact, high complexity = lowest priority

        if self.impact_score >= 75 and self.complexity in ['trivial', 'simple']:
            return 'critical'
        elif self.impact_score >= 50 and self.complexity in ['trivial', 'simple', 'moderate']:
            return 'high'
        elif self.impact_score >= 25:
            return 'medium'
        else:
            return 'low'

    @computed_field
    @property
    def roi_score(self) -> float:
        """
        Calculate Return on Investment score

        Higher ROI = better impact relative to effort
        """
        # Complexity to hours mapping
        complexity_hours = {
            ImplementationComplexity.TRIVIAL: 0.5,
            ImplementationComplexity.SIMPLE: 2.5,
            ImplementationComplexity.MODERATE: 12,
            ImplementationComplexity.COMPLEX: 40,
            ImplementationComplexity.VERY_COMPLEX: 80,
        }

        effort = self.estimated_effort_hours or complexity_hours.get(self.complexity, 10)

        # ROI = impact / effort (normalized to 0-100)
        if effort == 0:
            return 100.0

        roi = (self.impact_score / effort) * 10
        return min(round(roi, 2), 100.0)

    @computed_field
    @property
    def is_quick_win(self) -> bool:
        """
        Check if this is a 'quick win' consolidation

        Quick win = high impact, low effort, low risk
        """
        return (
            self.impact_score >= 60 and
            self.complexity in [ImplementationComplexity.TRIVIAL, ImplementationComplexity.SIMPLE] and
            self.migration_risk in [MigrationRisk.MINIMAL, MigrationRisk.LOW]
        )

    def add_migration_step(
        self,
        description: str,
        code_example: Optional[str] = None,
        automated: bool = False,
        estimated_time: Optional[str] = None
    ) -> None:
        """Add a step to the migration path"""
        step_number = len(self.migration_steps) + 1
        step = MigrationStep(
            step_number=step_number,
            description=description,
            code_example=code_example,
            automated=automated,
            estimated_time=estimated_time
        )
        self.migration_steps.append(step)

    def add_benefit(self, benefit: str) -> None:
        """Add a benefit to the list"""
        if benefit not in self.benefits:
            self.benefits.append(benefit)

    def add_drawback(self, drawback: str) -> None:
        """Add a drawback to the list"""
        if drawback not in self.drawbacks:
            self.drawbacks.append(drawback)

    def to_markdown_summary(self) -> str:
        """Generate a markdown summary of this suggestion"""
        return f"""## {self.target_name or 'Consolidation Suggestion'}

**Strategy:** {self.strategy.value.replace('_', ' ').title()}
**Priority:** {self.priority.upper()}
**Impact Score:** {self.impact_score}/100
**ROI Score:** {self.roi_score}/100

### Rationale
{self.strategy_rationale}

### Metrics
- **Complexity:** {self.complexity.value}
- **Risk:** {self.migration_risk.value}
- **LOC Reduction:** {self.loc_reduction or 'Unknown'}
- **Files Affected:** {self.affected_files_count}
- **Breaking Changes:** {'Yes' if self.breaking_changes else 'No'}

### Benefits
{chr(10).join(f'- {b}' for b in self.benefits) if self.benefits else 'None specified'}

### Migration Steps
{chr(10).join(f'{i+1}. {step.description}' for i, step in enumerate(self.migration_steps)) if self.migration_steps else 'Not specified'}
"""

    def __hash__(self) -> int:
        """Enable use in sets and as dict keys"""
        return hash(self.suggestion_id)

    def __eq__(self, other: object) -> bool:
        """Compare suggestions by ID"""
        if not isinstance(other, ConsolidationSuggestion):
            return NotImplemented
        return self.suggestion_id == other.suggestion_id
