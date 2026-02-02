"""Type stubs for similarity package."""

from typing import List, Tuple

from .structural import (
    calculate_structural_similarity as calculate_structural_similarity,
    normalize_code as normalize_code,
)
from .grouping import group_by_similarity as group_by_similarity

__all__: list[str]
