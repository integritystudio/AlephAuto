"""Type stubs for similarity config module."""


class SimilarityConfig:
    """Configuration for multi-layer similarity algorithm."""

    # Debug mode
    DEBUG: bool

    # Layer 0: Complexity filtering
    MIN_LINE_COUNT: int
    MIN_UNIQUE_TOKENS: int

    # Layer 2: Structural similarity
    STRUCTURAL_THRESHOLD: float

    # Penalties
    OPPOSITE_LOGIC_PENALTY: float
    STATUS_CODE_PENALTY: float
    SEMANTIC_METHOD_PENALTY: float

    # Method chain validation
    CHAIN_WEIGHT_LEVENSHTEIN: float
    CHAIN_WEIGHT_CHAIN: float

    # Layer 3: Semantic validation
    MIN_COMPLEXITY_RATIO: float
    SEMANTIC_SIMILARITY_THRESHOLD: float

    # Layer 4: Quality filtering
    MIN_GROUP_QUALITY: float

    # Quality score weights
    QUALITY_WEIGHT_SIMILARITY: float
    QUALITY_WEIGHT_SIZE: float
    QUALITY_WEIGHT_COMPLEXITY: float
    QUALITY_WEIGHT_SEMANTIC: float

    # Quality normalization factors
    SIZE_NORMALIZATION: float
    COMPLEXITY_NORMALIZATION: float

    # Semantic consistency scores
    SEMANTIC_PERFECT_CONSISTENCY: float
    SEMANTIC_SAME_CATEGORY: float
    SEMANTIC_SAME_PATTERN: float
    SEMANTIC_MIXED: float

    @classmethod
    def to_dict(cls) -> dict: ...
    @classmethod
    def print_config(cls) -> None: ...


config: SimilarityConfig
