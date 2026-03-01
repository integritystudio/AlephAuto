"""
Centralized constants for the duplicate detection pipeline.

Eliminates magic numbers scattered across extractors, models, similarity,
and visualization modules. Organized by domain into namespace classes.
"""

from enum import IntEnum


class HTTPCodes(IntEnum):
    """Standard HTTP status codes referenced in structural similarity analysis."""
    OK = 200
    CREATED = 201
    MOVED_PERMANENTLY = 301
    FOUND = 302
    BAD_REQUEST = 400
    UNAUTHORIZED = 401
    FORBIDDEN = 403
    NOT_FOUND = 404
    INTERNAL_SERVER_ERROR = 500
    BAD_GATEWAY = 502
    SERVICE_UNAVAILABLE = 503


class ScanDefaults:
    """Default thresholds for scan configuration and report recommendations."""
    MIN_SIMILARITY_THRESHOLD = 0.8
    MIN_DUPLICATE_SIZE = 3
    CONTENT_HASH_LENGTH = 16
    QUICK_WINS_RECOMMEND_THRESHOLD = 5
    HIGH_DUPLICATION_PCT = 10
    DEBUG_HASH_DISPLAY_LIMIT = 20
    PERCENTAGE_MAX = 100.0


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
    LEGEND_ICON_SIZE = 15
    LEGEND_TEXT_OFFSET_X = 20
    LEGEND_TEXT_OFFSET_Y = 12
    LEGEND_FONT_SIZE = 12
    TITLE_FONT_SIZE = 20
    TITLE_Y = 30
    LABEL_FONT_SIZE = 14
    LABEL_GAP = 10
    VALUE_GAP = 5
    TEXT_VERTICAL_OFFSET = 5
    STROKE_WIDTH_PATH = 2
    STROKE_WIDTH_BAR = 1
    RADIUS_DIVISOR = 3
    SVG_ANGLE_OFFSET = 90
    LARGE_ARC_THRESHOLD = 180
    FULL_CIRCLE_DEGREES = 360


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
    CHAIN_LEVENSHTEIN_WEIGHT = 0.7
    CHAIN_STRUCTURE_WEIGHT = 0.3
    DEFAULT_SIMILARITY_THRESHOLD = 0.90


class SemanticWeights:
    OPERATIONS = 0.40
    DOMAINS = 0.25
    PATTERNS = 0.20
    DATA_TYPES = 0.15
    EMPTY_SET_SIMILARITY = 0.5
    BOTH_EMPTY_SIMILARITY = 1.0
    LINE_RATIO_THRESHOLD = 0.5
    PARTIAL_TAG_OVERLAP = 0.5


class OpportunityWeights:
    DUPLICATION = 0.35
    QUICK_WIN = 0.40
    LOC_REDUCTION = 0.25


class ConfidenceThresholds:
    HIGH_SIMILARITY = 0.95
    HIGH_CONFIDENCE = 0.9
    LOW_CONFIDENCE = 0.7


class ROIMultipliers:
    COMPLEXITY_TRIVIAL = 1.3
    COMPLEXITY_SIMPLE = 1.1
    COMPLEXITY_MODERATE = 0.9
    COMPLEXITY_COMPLEX = 0.7
    RISK_MINIMAL = 1.2
    RISK_LOW = 1.1
    RISK_MEDIUM = 0.9
    RISK_HIGH = 0.7
    MAX_SCORE = 100.0


class EffortHours:
    TRIVIAL = 0.5
    SIMPLE = 1.0
    MODERATE = 3.0
    COMPLEX = 8.0
    DEFAULT = 2.0
    PER_FILE_INCREMENT = 0.25
    TESTING_OVERHEAD = 0.5


class SuggestionDefaults:
    GROUPING_SIMILARITY_THRESHOLD = 0.85
    DEFAULT_EFFORT_FALLBACK = 10
    ROI_NORMALIZER = 10
    QUICK_WIN_MIN_IMPACT = 60


class GitActivityDefaults:
    LEGACY_COMMIT_THRESHOLD = 5
    TOP_N_DISPLAY = 5
    WEEKLY_MAX_DAYS = 7
    MONTHLY_MAX_DAYS = 31
    SEPARATOR_LENGTH = 60


class ValidationLimits:
    FILE_PATH_MAX = 500
    MATCHED_TEXT_MAX = 100_000
    LINE_NUMBER_MAX = 1_000_000
    COLUMN_MAX = 10_000
    SEVERITY_MAX = 20
    REPO_PATH_MAX = 1000
    REPO_NAME_MAX = 200
    GIT_REMOTE_MAX = 500
    GIT_BRANCH_MAX = 200
    GIT_COMMIT_MAX = 50
    RULE_ID_MAX = 100
    PATTERN_MATCHES_MAX = 50_000


class TimeoutDetectorDefaults:
    FINALLY_LOOKAHEAD = 20
    TRY_CATCH_LOOKAHEAD = 50
    MAX_FINDINGS_PER_SEVERITY = 10


class StrategyThresholds:
    LOGGER_LOCAL_MAX = 5
    API_LOCAL_MAX = 3
    API_SHARED_MAX = 10
    DEFAULT_LOCAL_MAX = 3
    DEFAULT_SHARED_MAX = 8
    DB_LOCAL_MAX = 3


class BlockExtraction:
    FUNCTION_TAG_PREFIX = "function:"
    BLOCK_HASH_LENGTH = 12
    DEBUG_LOG_DEDUP_LIMIT = 10
    DEBUG_LOG_BLOCK_LIMIT = 3
