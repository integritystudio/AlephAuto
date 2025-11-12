"""
Similarity calculation modules for duplicate detection
"""

from .structural import calculate_structural_similarity, normalize_code
from .grouping import group_by_similarity

__all__ = [
    'calculate_structural_similarity',
    'normalize_code',
    'group_by_similarity',
]
