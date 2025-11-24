"""
CodeBlock Model - Represents a detected code pattern or block

This model captures all metadata about a code block found by ast-grep,
including its location, AST structure, semantic categorization, and hash
for similarity comparison.
"""

from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field, computed_field, field_validator
import hashlib
import json


class LanguageType(str, Enum):
    """Supported programming languages"""
    JAVASCRIPT = "javascript"
    TYPESCRIPT = "typescript"
    PYTHON = "python"
    JAVA = "java"
    GO = "go"
    RUST = "rust"
    C = "c"
    CPP = "cpp"
    CSHARP = "csharp"
    PHP = "php"
    RUBY = "ruby"
    # Add more as needed


class SemanticCategory(str, Enum):
    """Semantic categorization of code blocks"""
    UTILITY = "utility"
    HELPER = "helper"
    VALIDATOR = "validator"
    API_HANDLER = "api_handler"
    AUTH_CHECK = "auth_check"
    DATABASE_OPERATION = "database_operation"
    ERROR_HANDLER = "error_handler"
    LOGGER = "logger"
    CONFIG_ACCESS = "config_access"
    FILE_OPERATION = "file_operation"
    ASYNC_PATTERN = "async_pattern"
    UNKNOWN = "unknown"


class SourceLocation(BaseModel):
    """Precise location of code in source file"""
    file_path: str = Field(..., description="Absolute path to source file")
    line_start: int = Field(..., ge=1, description="Starting line number (1-indexed)")
    line_end: int = Field(..., ge=1, description="Ending line number (1-indexed)")
    column_start: Optional[int] = Field(None, ge=0, description="Starting column (0-indexed)")
    column_end: Optional[int] = Field(None, ge=0, description="Ending column (0-indexed)")

    @field_validator('line_end')
    @classmethod
    def validate_line_range(cls, v, info):
        """Ensure line_end >= line_start"""
        if 'line_start' in info.data and v < info.data['line_start']:
            raise ValueError('line_end must be >= line_start')
        return v

    def __str__(self) -> str:
        return f"{self.file_path}:{self.line_start}"


class ASTNode(BaseModel):
    """Representation of AST node structure"""
    node_type: str = Field(..., description="Type of AST node (e.g., 'CallExpression')")
    children: List['ASTNode'] = Field(default_factory=list, description="Child nodes")
    properties: Dict[str, Any] = Field(default_factory=dict, description="Node properties")

    model_config = {
        'frozen': False,  # Allow mutation for building AST
    }


# Enable self-referencing for AST tree structure
ASTNode.model_rebuild()


class CodeBlock(BaseModel):
    """
    Represents a code block detected by ast-grep

    This is the primary data structure for code pattern matching.
    Each CodeBlock contains:
    - Location information (file, lines)
    - AST structure representation
    - Semantic categorization
    - Hash for similarity comparison
    - Pattern metadata from ast-grep
    """

    # Core identification
    block_id: str = Field(..., description="Unique identifier for this code block")
    pattern_id: str = Field(..., description="ast-grep rule ID that matched this block")

    # Location
    location: SourceLocation = Field(..., description="Source code location")
    relative_path: str = Field(..., description="Repository-relative path")

    # Code content
    source_code: str = Field(..., description="Raw source code of the block")
    normalized_code: Optional[str] = Field(None, description="Normalized/formatted code")

    # AST representation
    ast_structure: Optional[ASTNode] = Field(None, description="AST node tree")
    ast_hash: Optional[str] = Field(None, description="Hash of AST structure")

    # Semantic information
    language: LanguageType = Field(..., description="Programming language")
    category: SemanticCategory = Field(..., description="Semantic category")
    tags: List[str] = Field(default_factory=list, description="Additional semantic tags")

    # Metadata from ast-grep
    match_context: Dict[str, Any] = Field(
        default_factory=dict,
        description="Context from ast-grep match (meta-variables, etc.)"
    )

    # Repository context
    repository_path: str = Field(..., description="Absolute path to repository root")
    repository_name: Optional[str] = Field(None, description="Repository name/identifier")
    git_commit: Optional[str] = Field(None, description="Git commit hash when scanned")

    # Timestamps
    detected_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="When this block was detected"
    )

    # Complexity metrics
    line_count: int = Field(..., ge=1, description="Number of lines in block")
    complexity_score: Optional[float] = Field(
        None,
        ge=0,
        description="Cyclomatic complexity or similar metric"
    )

    model_config = {
        'json_schema_extra': {
            'example': {
                'block_id': 'cb_12345',
                'pattern_id': 'object-manipulation',
                'location': {
                    'file_path': '/path/to/repo/src/utils.js',
                    'line_start': 42,
                    'line_end': 44,
                },
                'relative_path': 'src/utils.js',
                'source_code': 'JSON.stringify(data, null, 2)',
                'language': 'javascript',
                'category': 'utility',
                'repository_path': '/path/to/repo',
                'line_count': 3,
            }
        }
    }

    @computed_field
    @property
    def content_hash(self) -> str:
        """
        Generate hash of source code for exact duplicate detection

        Uses SHA-256 hash of normalized source code
        """
        # Normalize: remove extra whitespace, consistent formatting
        normalized = ' '.join(self.source_code.split())
        return hashlib.sha256(normalized.encode()).hexdigest()[:16]

    @computed_field
    @property
    def structural_hash(self) -> str:
        """
        Generate hash of AST structure for structural similarity

        Uses AST hash if available, otherwise falls back to content hash
        """
        if self.ast_hash:
            return self.ast_hash
        return self.content_hash

    def to_dict_for_comparison(self) -> Dict[str, Any]:
        """
        Export minimal data for similarity comparison

        Returns dict suitable for clustering/grouping algorithms
        """
        return {
            'block_id': self.block_id,
            'pattern_id': self.pattern_id,
            'category': self.category.value,
            'language': self.language.value,
            'content_hash': self.content_hash,
            'structural_hash': self.structural_hash,
            'line_count': self.line_count,
            'tags': self.tags,
        }

    def __hash__(self) -> int:
        """Enable use in sets and as dict keys"""
        return hash(self.block_id)

    def __eq__(self, other: object) -> bool:
        """Compare blocks by ID"""
        if not isinstance(other, CodeBlock):
            return NotImplemented
        return self.block_id == other.block_id
