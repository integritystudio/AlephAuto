"""
Similarity Algorithm Configuration

Centralized configuration for all similarity thresholds and parameters.
Allows tuning without modifying code.
"""

import os


class SimilarityConfig:
    """Configuration for multi-layer similarity algorithm."""

    # Layer 0: Complexity filtering
    MIN_LINE_COUNT = int(os.getenv('MIN_LINE_COUNT', '1'))
    MIN_UNIQUE_TOKENS = int(os.getenv('MIN_UNIQUE_TOKENS', '3'))

    # Layer 2: Structural similarity
    STRUCTURAL_THRESHOLD = float(os.getenv('STRUCTURAL_THRESHOLD', '0.90'))

    # Penalties
    OPPOSITE_LOGIC_PENALTY = float(os.getenv('OPPOSITE_LOGIC_PENALTY', '0.8'))
    STATUS_CODE_PENALTY = float(os.getenv('STATUS_CODE_PENALTY', '0.7'))
    SEMANTIC_METHOD_PENALTY = float(os.getenv('SEMANTIC_METHOD_PENALTY', '0.85'))

    # Method chain validation
    CHAIN_WEIGHT_LEVENSHTEIN = float(os.getenv('CHAIN_WEIGHT_LEVENSHTEIN', '0.7'))
    CHAIN_WEIGHT_CHAIN = float(os.getenv('CHAIN_WEIGHT_CHAIN', '0.3'))

    # Layer 3: Semantic validation
    MIN_COMPLEXITY_RATIO = float(os.getenv('MIN_COMPLEXITY_RATIO', '0.5'))

    # Layer 4: Quality filtering
    MIN_GROUP_QUALITY = float(os.getenv('MIN_GROUP_QUALITY', '0.70'))

    # Quality score weights
    QUALITY_WEIGHT_SIMILARITY = float(os.getenv('QUALITY_WEIGHT_SIMILARITY', '0.4'))
    QUALITY_WEIGHT_SIZE = float(os.getenv('QUALITY_WEIGHT_SIZE', '0.2'))
    QUALITY_WEIGHT_COMPLEXITY = float(os.getenv('QUALITY_WEIGHT_COMPLEXITY', '0.2'))
    QUALITY_WEIGHT_SEMANTIC = float(os.getenv('QUALITY_WEIGHT_SEMANTIC', '0.2'))

    @classmethod
    def to_dict(cls) -> dict:
        """Export configuration as dictionary."""
        return {
            'complexity': {
                'min_line_count': cls.MIN_LINE_COUNT,
                'min_unique_tokens': cls.MIN_UNIQUE_TOKENS,
            },
            'structural': {
                'threshold': cls.STRUCTURAL_THRESHOLD,
                'opposite_logic_penalty': cls.OPPOSITE_LOGIC_PENALTY,
                'status_code_penalty': cls.STATUS_CODE_PENALTY,
                'semantic_method_penalty': cls.SEMANTIC_METHOD_PENALTY,
            },
            'chain_validation': {
                'levenshtein_weight': cls.CHAIN_WEIGHT_LEVENSHTEIN,
                'chain_weight': cls.CHAIN_WEIGHT_CHAIN,
            },
            'semantic': {
                'min_complexity_ratio': cls.MIN_COMPLEXITY_RATIO,
            },
            'quality': {
                'min_group_quality': cls.MIN_GROUP_QUALITY,
                'weights': {
                    'similarity': cls.QUALITY_WEIGHT_SIMILARITY,
                    'size': cls.QUALITY_WEIGHT_SIZE,
                    'complexity': cls.QUALITY_WEIGHT_COMPLEXITY,
                    'semantic': cls.QUALITY_WEIGHT_SEMANTIC,
                },
            },
        }

    @classmethod
    def print_config(cls):
        """Print current configuration."""
        import json
        print("=== Similarity Algorithm Configuration ===")
        print(json.dumps(cls.to_dict(), indent=2))
        print("=" * 42)


# Global config instance
config = SimilarityConfig()
