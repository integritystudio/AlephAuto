"""
Tests for extract_blocks module.

Run with: python -m pytest test_extract_blocks.py -v
Or:       python test_extract_blocks.py
"""

from dataclasses import dataclass, field
import io
import json
from pathlib import Path
import sys

# Add parent directories to path for imports
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent / "models"))

from extract_blocks import detect_language, LANGUAGE_MAP, calculate_metrics
import extract_blocks as eb
from extract_blocks import _estimate_effort
from constants import (
    EFFORT_IMPLEMENTATION_DEFAULT_HOURS,
    EFFORT_IMPLEMENTATION_HOURS_BY_TIER,
    EFFORT_IMPLEMENTATION_PER_FILE_INCREMENT_HOURS,
    EFFORT_IMPLEMENTATION_TESTING_OVERHEAD_HOURS,
    EffortTier,
)


# ---------------------------------------------------------------------------
# Mock classes for testing
# ---------------------------------------------------------------------------


@dataclass
class MockLocation:
    file_path: str = "/test/file.js"
    line_start: int = 1
    line_end: int = 5


@dataclass
class MockCodeBlock:
    block_id: str
    line_count: int = 5
    location: MockLocation = field(default_factory=MockLocation)
    tags: list = field(default_factory=list)


@dataclass
class MockDuplicateGroup:
    group_id: str
    similarity_method: str
    occurrence_count: int
    total_lines: int
    affected_files: list = field(default_factory=list)

    def __post_init__(self):
        if not self.affected_files:
            self.affected_files = ["/test/file.js"]


@dataclass
class MockSuggestion:
    suggestion_id: str
    complexity: str
    impact_score: float


def test_detect_language_javascript():
    """Test JavaScript file detection."""
    assert detect_language("src/app.js") == "javascript"
    assert detect_language("components/Button.jsx") == "javascript"
    assert detect_language("lib/utils.mjs") == "javascript"
    assert detect_language("config.cjs") == "javascript"


def test_detect_language_typescript():
    """Test TypeScript file detection."""
    assert detect_language("src/app.ts") == "typescript"
    assert detect_language("components/Button.tsx") == "typescript"
    assert detect_language("lib/utils.mts") == "typescript"
    assert detect_language("config.cts") == "typescript"


def test_detect_language_python():
    """Test Python file detection."""
    assert detect_language("script.py") == "python"
    assert detect_language("src/module/utils.py") == "python"


def test_detect_language_other_languages():
    """Test detection of other supported languages."""
    assert detect_language("main.go") == "go"
    assert detect_language("lib.rs") == "rust"
    assert detect_language("Main.java") == "java"
    assert detect_language("App.kt") == "kotlin"
    assert detect_language("ViewController.swift") == "swift"
    assert detect_language("main.c") == "c"
    assert detect_language("main.cpp") == "cpp"
    assert detect_language("main.cc") == "cpp"
    assert detect_language("header.h") == "c"
    assert detect_language("header.hpp") == "cpp"
    assert detect_language("Program.cs") == "csharp"
    assert detect_language("index.php") == "php"
    assert detect_language("Main.scala") == "scala"
    assert detect_language("App.vue") == "vue"
    assert detect_language("Component.svelte") == "svelte"
    assert detect_language("app.rb") == "ruby"


def test_detect_language_case_insensitive():
    """Test that extension detection is case-insensitive."""
    assert detect_language("file.JS") == "javascript"
    assert detect_language("file.TS") == "typescript"
    assert detect_language("file.PY") == "python"
    assert detect_language("file.Jsx") == "javascript"


def test_detect_language_unknown():
    """Test unknown file extensions return 'unknown'."""
    assert detect_language("file.txt") == "unknown"
    assert detect_language("file.md") == "unknown"
    assert detect_language("file.json") == "unknown"
    assert detect_language("file.yaml") == "unknown"
    assert detect_language("noextension") == "unknown"


def test_detect_language_with_paths():
    """Test detection works with various path formats."""
    assert detect_language("/absolute/path/to/file.js") == "javascript"
    assert detect_language("relative/path/file.ts") == "typescript"
    assert detect_language("./local/file.py") == "python"
    assert detect_language("../parent/file.go") == "go"


def test_language_map_has_expected_entries():
    """Test LANGUAGE_MAP contains expected extensions."""
    expected = {".js", ".jsx", ".ts", ".tsx", ".py", ".go", ".rs", ".java"}
    assert expected.issubset(set(LANGUAGE_MAP.keys()))


# ---------------------------------------------------------------------------
# Metrics Tests
# ---------------------------------------------------------------------------


def test_calculate_metrics_empty():
    """Test metrics with empty inputs."""
    metrics = calculate_metrics([], [], [])
    assert metrics["total_code_blocks"] == 0
    assert metrics["total_duplicate_groups"] == 0
    assert metrics["exact_duplicates"] == 0
    assert metrics["structural_duplicates"] == 0
    assert metrics["semantic_duplicates"] == 0
    assert metrics["duplication_percentage"] == 0.0


def test_calculate_metrics_counts_by_method():
    """Test metrics correctly count by similarity method."""
    blocks = [MockCodeBlock(f"b{i}", line_count=5) for i in range(10)]
    groups = [
        MockDuplicateGroup("g1", "exact_match", 3, 15),
        MockDuplicateGroup("g2", "exact_match", 2, 10),
        MockDuplicateGroup("g3", "structural", 2, 8),
        MockDuplicateGroup("g4", "semantic", 2, 6),
        MockDuplicateGroup("g5", "semantic", 3, 12),
    ]
    suggestions = []

    metrics = calculate_metrics(blocks, groups, suggestions)

    assert metrics["exact_duplicates"] == 2
    assert metrics["structural_duplicates"] == 1
    assert metrics["semantic_duplicates"] == 2
    assert metrics["total_duplicate_groups"] == 5


def test_calculate_metrics_line_totals():
    """Test metrics correctly sum line counts."""
    blocks = [MockCodeBlock("b1", line_count=100)]
    groups = [
        MockDuplicateGroup("g1", "exact_match", 3, 30),  # 30 lines total
        MockDuplicateGroup("g2", "structural", 2, 20),  # 20 lines total
    ]

    metrics = calculate_metrics(blocks, groups, [])

    assert metrics["total_duplicated_lines"] == 50


def test_calculate_metrics_loc_reduction():
    """Test potential LOC reduction calculation."""
    blocks = [MockCodeBlock("b1", line_count=100)]
    groups = [
        # 3 occurrences of 10 lines each = 30 total
        # Keep 1 copy (10 lines), remove 20 lines
        MockDuplicateGroup("g1", "exact_match", 3, 30),
    ]

    metrics = calculate_metrics(blocks, groups, [])

    # 30 - (30 // 3) = 30 - 10 = 20
    assert metrics["potential_loc_reduction"] == 20


def test_calculate_metrics_duplication_percentage():
    """Test duplication percentage calculation."""
    # 10 blocks of 10 lines each = 100 total lines
    blocks = [MockCodeBlock(f"b{i}", line_count=10) for i in range(10)]
    # 25 lines duplicated
    groups = [MockDuplicateGroup("g1", "exact_match", 5, 25)]

    metrics = calculate_metrics(blocks, groups, [])

    # 25 / 100 * 100 = 25%
    assert metrics["duplication_percentage"] == 25.0


def test_calculate_metrics_duplication_percentage_with_total():
    """Test duplication percentage with explicit total_repo_lines."""
    blocks = [MockCodeBlock("b1", line_count=10)]
    groups = [MockDuplicateGroup("g1", "exact_match", 2, 50)]

    # Override with explicit total
    metrics = calculate_metrics(blocks, groups, [], total_repo_lines=1000)

    # 50 / 1000 * 100 = 5%
    assert metrics["duplication_percentage"] == 5.0


def test_calculate_metrics_quick_wins():
    """Test quick wins identification."""
    blocks = [MockCodeBlock("b1")]
    groups = [
        # Quick win: <=3 occurrences, 1 file
        MockDuplicateGroup("g1", "exact_match", 2, 10, ["/file1.js"]),
        MockDuplicateGroup("g2", "exact_match", 3, 15, ["/file1.js"]),
        # Not quick win: >3 occurrences
        MockDuplicateGroup("g3", "structural", 4, 20, ["/file1.js"]),
        # Not quick win: multiple files
        MockDuplicateGroup("g4", "structural", 2, 10, ["/file1.js", "/file2.js"]),
    ]

    metrics = calculate_metrics(blocks, groups, [])

    assert metrics["quick_wins"] == 2


def test_calculate_metrics_high_impact():
    """Test high impact identification."""
    blocks = [MockCodeBlock("b1")]
    groups = [
        # High impact: >=20 lines
        MockDuplicateGroup("g1", "exact_match", 2, 25),
        MockDuplicateGroup("g2", "structural", 2, 20),
        # High impact: >=5 occurrences
        MockDuplicateGroup("g3", "semantic", 5, 10),
        MockDuplicateGroup("g4", "semantic", 6, 8),
        # Not high impact
        MockDuplicateGroup("g5", "exact_match", 2, 10),
    ]

    metrics = calculate_metrics(blocks, groups, [])

    assert metrics["high_impact_suggestions"] == 4


def test_calculate_metrics_suggestion_complexity():
    """Test suggestion complexity breakdown."""
    blocks = [MockCodeBlock("b1")]
    suggestions = [
        MockSuggestion("s1", "trivial", 50),
        MockSuggestion("s2", "trivial", 40),
        MockSuggestion("s3", "simple", 60),
        MockSuggestion("s4", "moderate", 70),
        MockSuggestion("s5", "complex", 80),
    ]

    metrics = calculate_metrics(blocks, [], suggestions)

    assert metrics["trivial_suggestions"] == 2
    assert metrics["simple_suggestions"] == 1
    assert metrics["moderate_suggestions"] == 1
    assert metrics["complex_suggestions"] == 1
    assert metrics["total_suggestions"] == 5


def test_calculate_metrics_high_priority():
    """Test high priority suggestion count."""
    blocks = [MockCodeBlock("b1")]
    suggestions = [
        MockSuggestion("s1", "trivial", 80),  # High priority (>=75)
        MockSuggestion("s2", "simple", 75),  # High priority (>=75)
        MockSuggestion("s3", "moderate", 74),  # Not high priority
        MockSuggestion("s4", "complex", 50),  # Not high priority
    ]

    metrics = calculate_metrics(blocks, [], suggestions)

    assert metrics["high_priority_suggestions"] == 2


def test_calculate_metrics_semantic_annotation_coverage():
    """Test semantic annotation coverage metrics."""
    blocks = [
        MockCodeBlock("b1", tags=["utility", "async"]),  # 2 tags
        MockCodeBlock("b2", tags=["validator"]),  # 1 tag
        MockCodeBlock("b3", tags=[]),  # 0 tags
        MockCodeBlock("b4", tags=["logger", "io", "fs"]),  # 3 tags
        MockCodeBlock("b5", tags=[]),  # 0 tags
    ]

    metrics = calculate_metrics(blocks, [], [])

    # 3 out of 5 blocks have tags
    assert metrics["blocks_with_tags"] == 3
    # 3/5 = 60%
    assert metrics["blocks_with_tags_percentage"] == 60.0
    # (2+1+0+3+0)/5 = 6/5 = 1.2
    assert metrics["avg_tags_per_block"] == 1.2


def test_calculate_metrics_empty_semantic_annotation():
    """Test semantic annotation metrics with no tagged blocks."""
    blocks = [
        MockCodeBlock("b1", tags=[]),
        MockCodeBlock("b2", tags=[]),
    ]

    metrics = calculate_metrics(blocks, [], [])

    assert metrics["blocks_with_tags"] == 0
    assert metrics["blocks_with_tags_percentage"] == 0.0
    assert metrics["avg_tags_per_block"] == 0.0


def test_estimate_effort_uses_implementation_effort_mapping():
    """Regression: ensure EffortTier-based simple estimate remains stable."""
    group = MockDuplicateGroup(
        "g_effort",
        "exact_match",
        2,
        12,
        ["/test/a.js", "/test/b.js"],
    )

    expected = round(
        EFFORT_IMPLEMENTATION_HOURS_BY_TIER[EffortTier.SIMPLE]
        + (len(group.affected_files) * EFFORT_IMPLEMENTATION_PER_FILE_INCREMENT_HOURS)
        + EFFORT_IMPLEMENTATION_TESTING_OVERHEAD_HOURS,
        1,
    )
    assert _estimate_effort(group, EffortTier.SIMPLE.value) == expected


def test_estimate_effort_falls_back_to_default_for_unknown_complexity():
    """Regression: unknown complexity should use default implementation effort."""
    group = MockDuplicateGroup("g_effort_fallback", "exact_match", 2, 12, ["/test/a.js"])

    expected = round(
        EFFORT_IMPLEMENTATION_DEFAULT_HOURS
        + (len(group.affected_files) * EFFORT_IMPLEMENTATION_PER_FILE_INCREMENT_HOURS)
        + EFFORT_IMPLEMENTATION_TESTING_OVERHEAD_HOURS,
        1,
    )
    assert _estimate_effort(group, "unknown-tier") == expected


def test_extract_blocks_main_e2e_emits_expected_json_shape(monkeypatch):
    """E2E pipeline smoke test for stdin->JSON orchestration."""
    default_count = 1

    class StubModel:
        def __init__(self, payload):
            self._payload = payload

        def model_dump(self, mode="python"):
            return self._payload

    block = StubModel({"block_id": "cb_1"})
    group = StubModel({"group_id": "dg_1"})
    suggestion = StubModel({"suggestion_id": "cs_1"})

    monkeypatch.setattr(eb, "extract_code_blocks", lambda *_args, **_kwargs: [block])
    monkeypatch.setattr(eb, "deduplicate_blocks", lambda blocks: blocks)
    monkeypatch.setattr(eb, "group_duplicates", lambda *_args, **_kwargs: [group])
    monkeypatch.setattr(eb, "generate_suggestions", lambda *_args, **_kwargs: [suggestion])
    monkeypatch.setattr(
        eb,
        "calculate_metrics",
        lambda *_args, **_kwargs: {
            "total_code_blocks": default_count,
            "total_duplicate_groups": default_count,
        },
    )

    payload = {
        "repository_info": {
            "path": "/tmp/repo",
            "name": "repo",
        },
        "pattern_matches": [
            {
                "file_path": "src/a.ts",
                "rule_id": "validation",
                "matched_text": "const x = 1;",
                "line_start": default_count,
                "line_end": default_count,
            }
        ],
    }

    fake_stdin = io.StringIO(json.dumps(payload))
    fake_stdout = io.StringIO()

    monkeypatch.setattr(eb.sys, "stdin", fake_stdin)
    monkeypatch.setattr(eb.sys, "stdout", fake_stdout)

    eb.main()
    result = json.loads(fake_stdout.getvalue())

    assert result["code_blocks"] == [{"block_id": "cb_1"}]
    assert result["duplicate_groups"] == [{"group_id": "dg_1"}]
    assert result["suggestions"] == [{"suggestion_id": "cs_1"}]
    assert result["metrics"]["total_code_blocks"] == default_count


def main():
    """Run tests without pytest."""

    tests = [
        # Language detection tests
        test_detect_language_javascript,
        test_detect_language_typescript,
        test_detect_language_python,
        test_detect_language_other_languages,
        test_detect_language_case_insensitive,
        test_detect_language_unknown,
        test_detect_language_with_paths,
        test_language_map_has_expected_entries,
        # Metrics tests
        test_calculate_metrics_empty,
        test_calculate_metrics_counts_by_method,
        test_calculate_metrics_line_totals,
        test_calculate_metrics_loc_reduction,
        test_calculate_metrics_duplication_percentage,
        test_calculate_metrics_duplication_percentage_with_total,
        test_calculate_metrics_quick_wins,
        test_calculate_metrics_high_impact,
        test_calculate_metrics_suggestion_complexity,
        test_calculate_metrics_high_priority,
        test_calculate_metrics_semantic_annotation_coverage,
        test_calculate_metrics_empty_semantic_annotation,
    ]

    passed = 0
    failed = 0

    for test in tests:
        try:
            test()
            passed += 1
        except AssertionError as e:
            failed += 1
        except Exception as e:
            failed += 1


    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
