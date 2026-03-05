from __future__ import annotations

from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent))

from consolidation_suggestion import (
    ConsolidationStrategy,
    ConsolidationSuggestion,
    ImplementationComplexity,
    MigrationRisk,
)
from constants import EFFORT_ROI_HOURS_BY_TIER, EffortTier, ROIMultipliers, SuggestionDefaults

DEFAULT_IMPACT_SCORE = 50.0
EXPLICIT_IMPACT_SCORE = 40.0
EXPLICIT_EFFORT_HOURS = 8.0


def _build_suggestion(
    complexity: ImplementationComplexity,
    impact_score: float = DEFAULT_IMPACT_SCORE,
    estimated_effort_hours: float | None = None,
) -> ConsolidationSuggestion:
    return ConsolidationSuggestion(
        suggestion_id="cs_test_effort",
        duplicate_group_id="dg_test_effort",
        strategy=ConsolidationStrategy.LOCAL_UTIL,
        strategy_rationale="Test rationale",
        impact_score=impact_score,
        complexity=complexity,
        migration_risk=MigrationRisk.LOW,
        breaking_changes=False,
        affected_files_count=1,
        affected_repositories_count=1,
        confidence=0.9,
        estimated_effort_hours=estimated_effort_hours,
    )


def test_effort_roi_mapping_covers_all_effort_tiers():
    assert set(EFFORT_ROI_HOURS_BY_TIER.keys()) == set(EffortTier)


@pytest.mark.parametrize(
    ("complexity", "effort_tier"),
    [
        (ImplementationComplexity.TRIVIAL, EffortTier.TRIVIAL),
        (ImplementationComplexity.SIMPLE, EffortTier.SIMPLE),
        (ImplementationComplexity.MODERATE, EffortTier.MODERATE),
        (ImplementationComplexity.COMPLEX, EffortTier.COMPLEX),
        (ImplementationComplexity.VERY_COMPLEX, EffortTier.VERY_COMPLEX),
    ],
)
def test_roi_score_uses_effort_tier_defaults(
    complexity: ImplementationComplexity,
    effort_tier: EffortTier,
):
    suggestion = _build_suggestion(complexity=complexity, impact_score=DEFAULT_IMPACT_SCORE)
    expected_effort_hours = EFFORT_ROI_HOURS_BY_TIER[effort_tier]

    expected = min(
        round((DEFAULT_IMPACT_SCORE / expected_effort_hours) * SuggestionDefaults.ROI_NORMALIZER, 2),
        ROIMultipliers.MAX_SCORE,
    )
    assert suggestion.roi_score == expected


def test_roi_score_prefers_explicit_estimated_effort_hours():
    suggestion = _build_suggestion(
        complexity=ImplementationComplexity.TRIVIAL,
        impact_score=EXPLICIT_IMPACT_SCORE,
        estimated_effort_hours=EXPLICIT_EFFORT_HOURS,
    )

    expected = round(
        (EXPLICIT_IMPACT_SCORE / EXPLICIT_EFFORT_HOURS) * SuggestionDefaults.ROI_NORMALIZER,
        2,
    )
    assert suggestion.roi_score == expected
