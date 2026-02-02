"""Type stubs for models package."""

from .code_block import (
    CodeBlock as CodeBlock,
    SourceLocation as SourceLocation,
    ASTNode as ASTNode,
    LanguageType as LanguageType,
    SemanticCategory as SemanticCategory,
)
from .duplicate_group import (
    DuplicateGroup as DuplicateGroup,
    SimilarityMethod as SimilarityMethod,
)
from .consolidation_suggestion import (
    ConsolidationSuggestion as ConsolidationSuggestion,
    ConsolidationStrategy as ConsolidationStrategy,
    ImplementationComplexity as ImplementationComplexity,
    MigrationRisk as MigrationRisk,
    MigrationStep as MigrationStep,
)
from .scan_report import (
    ScanReport as ScanReport,
    RepositoryInfo as RepositoryInfo,
    ScanConfiguration as ScanConfiguration,
    ScanMetrics as ScanMetrics,
)

__all__: list[str]
__version__: str
