"""
Pydantic Models for Code Consolidation System

This package contains the data models for structuring duplicate detection
and consolidation results using Pydantic v2.

Models:
- CodeBlock: Individual code pattern/block detected by ast-grep
- DuplicateGroup: Group of similar code blocks
- ConsolidationSuggestion: Recommendation for consolidating duplicates
- ScanReport: Complete scan results with metrics and recommendations
"""

from .code_block import (
    CodeBlock,
    SourceLocation,
    ASTNode,
    LanguageType,
    SemanticCategory,
)

from .duplicate_group import (
    DuplicateGroup,
    SimilarityMethod,
)

from .consolidation_suggestion import (
    ConsolidationSuggestion,
    ConsolidationStrategy,
    ImplementationComplexity,
    MigrationRisk,
    MigrationStep,
)

from .scan_report import (
    ScanReport,
    RepositoryInfo,
    ScanConfiguration,
    ScanMetrics,
)

__all__ = [
    # code_block
    'CodeBlock',
    'SourceLocation',
    'ASTNode',
    'LanguageType',
    'SemanticCategory',

    # duplicate_group
    'DuplicateGroup',
    'SimilarityMethod',

    # consolidation_suggestion
    'ConsolidationSuggestion',
    'ConsolidationStrategy',
    'ImplementationComplexity',
    'MigrationRisk',
    'MigrationStep',

    # scan_report
    'ScanReport',
    'RepositoryInfo',
    'ScanConfiguration',
    'ScanMetrics',
]

__version__ = '1.0.0'
