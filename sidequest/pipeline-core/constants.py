"""
Centralized constants for the duplicate detection pipeline.

Eliminates magic numbers scattered across extractors, models, similarity,
and visualization modules. Organized by domain into namespace classes.
"""


class ChartDefaults:
    WIDTH = 800
    HEIGHT = 600
    BAR_HEIGHT = 30
    BAR_SPACING = 10
    MARGIN_TOP = 50
    MARGIN_LEFT = 250
    MARGIN_RIGHT = 100
    MARGIN_BOTTOM = 50
    LEGEND_OFFSET_X = 200
    LEGEND_SPACING_Y = 25
    TITLE_FONT_SIZE = 20
    LABEL_FONT_SIZE = 14
    STROKE_WIDTH_PATH = 2
    STROKE_WIDTH_BAR = 1
    RADIUS_DIVISOR = 3
    SVG_ANGLE_OFFSET = 90
    LARGE_ARC_THRESHOLD = 180


class ScoringThresholds:
    CRITICAL = 75
    HIGH = 50
    MEDIUM = 25


class ImpactWeights:
    OCCURRENCE = 40
    SIMILARITY = 35
    SIZE = 25
    OCCURRENCE_CAP = 20.0
    LOC_CAP = 100.0


class DuplicationThresholds:
    MINIMAL_PCT = 5
    LOW_PCT = 10
    MODERATE_PCT = 20
    HIGH_PCT = 40
    QUICK_WIN_CAP = 10


class ExtractionDefaults:
    SEARCH_WINDOW = 10
    MIN_GROUP_SIZE = 2
    QUICK_WIN_MAX_OCCURRENCES = 3
    HIGH_IMPACT_MIN_LINES = 20
    HIGH_IMPACT_MIN_OCCURRENCES = 5
    HIGH_PRIORITY_SCORE = 75
    METHOD_CHAIN_MAX_GAP = 100


class EffortEstimates:
    TRIVIAL = 0.5
    SIMPLE = 2.5
    MODERATE = 12
    COMPLEX = 40
    VERY_COMPLEX = 80


class StructuralDefaults:
    CHAIN_MISSING_SIMILARITY = 0.5
    STATUS_CODE_PENALTY = 0.70
    LOGIC_OPERATOR_PENALTY = 0.80
    SEMANTIC_METHOD_PENALTY = 0.75
    NORMALIZED_IDENTICAL = 0.95


class SemanticWeights:
    OPERATIONS = 0.40
    DOMAINS = 0.25
    PATTERNS = 0.20
    DATA_TYPES = 0.15
    EMPTY_SET_SIMILARITY = 0.5
    BOTH_EMPTY_SIMILARITY = 1.0
