"""
DuplicateGroup Model - Represents a group of similar code blocks

Groups together CodeBlocks that are similar enough to be considered
duplicates or candidates for consolidation.
"""

from datetime import datetime
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, computed_field, field_validator


class SimilarityMethod(str, Enum):
    """Method used to determine similarity"""
    EXACT_MATCH = "exact_match"  # Identical code
    STRUCTURAL = "structural"    # Same AST structure
    SEMANTIC = "semantic"        # Similar logic/behavior
    HYBRID = "hybrid"            # Combination of methods


class DuplicateGroup(BaseModel):
    """
    Group of similar code blocks detected as duplicates

    Represents a cluster of CodeBlocks that share structural or semantic
    similarity and are candidates for consolidation into a single
    abstraction.
    """

    # Core identification
    group_id: str = Field(..., description="Unique identifier for this duplicate group")
    pattern_id: str = Field(..., description="ast-grep pattern that matched these blocks")

    # Member blocks (references to CodeBlock IDs)
    member_block_ids: List[str] = Field(
        ...,
        min_length=2,
        description="IDs of CodeBlocks in this group"
    )

    # Similarity metrics
    similarity_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Similarity score (0.0 = completely different, 1.0 = identical)"
    )
    similarity_method: SimilarityMethod = Field(
        ...,
        description="Method used to calculate similarity"
    )

    # Consolidation target
    canonical_block_id: Optional[str] = Field(
        None,
        description="ID of the 'best' representative block for this group"
    )

    # Analysis metadata
    category: str = Field(..., description="Semantic category of duplicates")
    language: str = Field(..., description="Programming language")

    # Statistics
    occurrence_count: int = Field(..., ge=2, description="Number of occurrences")
    total_lines: int = Field(..., ge=1, description="Total lines of duplicated code")
    affected_files: List[str] = Field(
        default_factory=list,
        description="List of files containing duplicates"
    )
    affected_repositories: List[str] = Field(
        default_factory=list,
        description="List of repositories containing duplicates"
    )

    # Consolidation analysis
    consolidation_complexity: Optional[str] = Field(
        None,
        description="Estimated complexity: 'trivial', 'moderate', 'complex'"
    )
    breaking_changes_risk: Optional[str] = Field(
        None,
        description="Risk level: 'low', 'medium', 'high'"
    )

    # Timestamps
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="When this group was created"
    )
    updated_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Last update timestamp"
    )

    # Additional context
    notes: Optional[str] = Field(None, description="Analysis notes")
    metadata: Dict[str, Any] = Field(
        default_factory=dict,
        description="Additional metadata"
    )

    model_config = {
        'json_schema_extra': {
            'example': {
                'group_id': 'dg_001',
                'pattern_id': 'object-manipulation',
                'member_block_ids': ['cb_12345', 'cb_12346', 'cb_12347'],
                'similarity_score': 0.95,
                'similarity_method': 'structural',
                'category': 'utility',
                'language': 'javascript',
                'occurrence_count': 3,
                'total_lines': 9,
                'affected_files': ['src/utils.js', 'src/helpers.js'],
            }
        }
    }

    @field_validator('member_block_ids')
    @classmethod
    def validate_min_members(cls, v):
        """Ensure at least 2 members (a duplicate must have multiple instances)"""
        if len(v) < 2:
            raise ValueError('A duplicate group must have at least 2 members')
        return v

    @field_validator('canonical_block_id')
    @classmethod
    def validate_canonical_in_members(cls, v, info):
        """Ensure canonical block ID is one of the members"""
        if v is not None and 'member_block_ids' in info.data:
            if v not in info.data['member_block_ids']:
                raise ValueError('canonical_block_id must be one of member_block_ids')
        return v

    @computed_field
    @property
    def deduplication_potential(self) -> int:
        """
        Calculate lines of code that could be removed

        If consolidated, we keep one instance and remove the rest
        """
        if self.occurrence_count <= 1:
            return 0
        avg_lines_per_instance = self.total_lines / self.occurrence_count
        return int((self.occurrence_count - 1) * avg_lines_per_instance)

    @computed_field
    @property
    def impact_score(self) -> float:
        """
        Calculate consolidation impact score (0-100)

        Higher score = higher priority for consolidation
        Factors:
        - Number of occurrences
        - Similarity score
        - Lines of code affected
        """
        # Normalize occurrence count (cap at 20 for scoring)
        occurrence_factor = min(self.occurrence_count / 20.0, 1.0)

        # Similarity weight
        similarity_factor = self.similarity_score

        # Lines of code factor (cap at 100 lines for scoring)
        loc_factor = min(self.total_lines / 100.0, 1.0)

        # Weighted average
        score = (
            occurrence_factor * 40 +  # Frequency is most important
            similarity_factor * 35 +   # Similarity is very important
            loc_factor * 25            # Size is moderately important
        )

        return round(score, 2)

    @computed_field
    @property
    def is_cross_repository(self) -> bool:
        """Check if duplicates span multiple repositories"""
        return len(self.affected_repositories) > 1

    @computed_field
    @property
    def priority_level(self) -> str:
        """
        Determine consolidation priority level

        Returns: 'critical', 'high', 'medium', 'low'
        """
        if self.impact_score >= 75:
            return 'critical'
        elif self.impact_score >= 50:
            return 'high'
        elif self.impact_score >= 25:
            return 'medium'
        else:
            return 'low'

    def add_member(self, block_id: str) -> None:
        """Add a new member to this group"""
        if block_id not in self.member_block_ids:
            self.member_block_ids.append(block_id)
            self.occurrence_count = len(self.member_block_ids)
            self.updated_at = datetime.utcnow()

    def remove_member(self, block_id: str) -> None:
        """Remove a member from this group"""
        if block_id in self.member_block_ids:
            self.member_block_ids.remove(block_id)
            self.occurrence_count = len(self.member_block_ids)
            self.updated_at = datetime.utcnow()

            # Reset canonical if it was the removed block
            if self.canonical_block_id == block_id:
                self.canonical_block_id = None

    def set_canonical(self, block_id: str) -> None:
        """Set the canonical (representative) block for this group"""
        if block_id not in self.member_block_ids:
            raise ValueError(f"Block {block_id} is not a member of this group")
        self.canonical_block_id = block_id
        self.updated_at = datetime.utcnow()

    def __hash__(self) -> int:
        """Enable use in sets and as dict keys"""
        return hash(self.group_id)

    def __eq__(self, other: object) -> bool:
        """Compare groups by ID"""
        if not isinstance(other, DuplicateGroup):
            return NotImplemented
        return self.group_id == other.group_id
