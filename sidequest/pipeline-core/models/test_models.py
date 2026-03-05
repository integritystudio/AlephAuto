"""
Test script for Pydantic models

Run with: python test_models.py

Tests basic functionality of all models without requiring
the actual pydantic package (design validation).
"""


def test_model_structure():
    """Test that model files have correct structure"""
    from pathlib import Path

    models_dir = Path(__file__).parent

    models = [
        "code_block",
        "duplicate_group",
        "consolidation_suggestion",
        "scan_report",
    ]


    for model_name in models:
        model_path = models_dir / f"{model_name}.py"

        if not model_path.exists():
            continue

        # Check file can be read
        try:
            with open(model_path, "r") as f:
                content = f.read()

            # Basic validation checks
            checks = {
                "Has docstring": '"""' in content,
                "Imports BaseModel": "from pydantic import BaseModel" in content,
                "Imports Field": "Field" in content,
                "Defines class": "class " in content and "(BaseModel)" in content,
                "Has model_config": "model_config" in content,
            }

            all_passed = all(checks.values())
            symbol = "✅" if all_passed else "⚠️"


            for check, passed in checks.items():
                status = "✓" if passed else "✗"

        except Exception as e:
            print(f"❌ {model_name}.py - Error: {e}")



def test_sample_data():
    """Test with sample data structure (without pydantic)"""

    # Sample CodeBlock data
    code_block_data = {
        "block_id": "cb_test_001",
        "pattern_id": "object-manipulation",
        "location": {
            "file_path": "/test/file.js",
            "line_start": 10,
            "line_end": 12,
        },
        "relative_path": "src/test/file.js",
        "source_code": "JSON.stringify(data, null, 2)",
        "language": "javascript",
        "category": "utility",
        "repository_path": "/test",
        "line_count": 3,
    }

    # Sample DuplicateGroup data
    duplicate_group_data = {
        "group_id": "dg_test_001",
        "pattern_id": "object-manipulation",
        "member_block_ids": ["cb_test_001", "cb_test_002", "cb_test_003"],
        "similarity_score": 0.95,
        "similarity_method": "structural",
        "category": "utility",
        "language": "javascript",
        "occurrence_count": 3,
        "total_lines": 9,
        "affected_files": ["file1.js", "file2.js"],
        "affected_repositories": ["/test"],
    }

    # Sample ConsolidationSuggestion data
    consolidation_data = {
        "suggestion_id": "cs_test_001",
        "duplicate_group_id": "dg_test_001",
        "strategy": "local_util",
        "strategy_rationale": "Simple utility function used within single project",
        "impact_score": 75.0,
        "complexity": "trivial",
        "migration_risk": "low",
        "breaking_changes": False,
        "affected_files_count": 3,
        "affected_repositories_count": 1,
        "confidence": 0.9,
    }

    # Sample ScanReport data
    scan_report_data = {
        "report_id": "scan_test_001",
        "scan_name": "Test Scan",
        "configuration": {
            "rules_used": ["object-manipulation", "array-operations"],
            "min_similarity_threshold": 0.8,
            "min_duplicate_size": 3,
        },
        "repositories": [
            {
                "repository_path": "/test",
                "repository_name": "test-repo",
                "total_files": 10,
                "total_lines": 1000,
            }
        ],
        "metrics": {
            "total_code_blocks": 50,
            "total_duplicate_groups": 5,
            "exact_duplicates": 2,
            "structural_duplicates": 3,
            "semantic_duplicates": 0,
            "total_duplicated_lines": 100,
            "potential_loc_reduction": 75,
            "duplication_percentage": 10.0,
            "total_suggestions": 5,
            "quick_wins": 2,
            "high_priority_suggestions": 3,
        },
        "output_directory": "/test/output",
    }

    samples = [
        ("CodeBlock", code_block_data),
        ("DuplicateGroup", duplicate_group_data),
        ("ConsolidationSuggestion", consolidation_data),
        ("ScanReport", scan_report_data),
    ]

    for name, data in samples:
        required_fields = len(data)



def test_computed_fields_logic():
    """Test the logic of computed fields (without pydantic)"""

    # Test DuplicateGroup impact_score calculation
    def calculate_impact_score(occurrence_count, similarity_score, total_lines):
        occurrence_factor = min(occurrence_count / 20.0, 1.0)
        similarity_factor = similarity_score
        loc_factor = min(total_lines / 100.0, 1.0)
        score = occurrence_factor * 40 + similarity_factor * 35 + loc_factor * 25
        return round(score, 2)

    test_cases = [
        (3, 0.95, 9, "Low occurrence, high similarity, small size"),
        (10, 0.9, 50, "Moderate occurrence, high similarity, moderate size"),
        (20, 0.8, 100, "High occurrence, good similarity, large size"),
    ]

    for occurrence, similarity, lines, desc in test_cases:
        score = calculate_impact_score(occurrence, similarity, lines)

    # Test ROI score calculation
    def calculate_roi_score(impact_score, estimated_hours):
        if estimated_hours == 0:
            return 100.0
        roi = (impact_score / estimated_hours) * 10
        return min(round(roi, 2), 100.0)

    roi_tests = [
        (75.0, 0.5, "High impact, trivial effort"),
        (50.0, 2.0, "Medium impact, simple effort"),
        (25.0, 40.0, "Low impact, complex effort"),
    ]

    for impact, hours, desc in roi_tests:
        roi = calculate_roi_score(impact, hours)



def main():
    """Run all tests"""

    test_model_structure()
    test_sample_data()
    test_computed_fields_logic()



if __name__ == "__main__":
    main()
