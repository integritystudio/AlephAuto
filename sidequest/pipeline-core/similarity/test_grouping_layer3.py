"""
Tests for Layer 3 (Semantic Similarity) grouping.

Run with: python -m pytest test_grouping_layer3.py -v
Or:       python test_grouping_layer3.py
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import List

# Add parent directories to path for imports
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent / 'models'))
sys.path.insert(0, str(Path(__file__).parent.parent / 'annotators'))

from grouping import (
    _calculate_jaccard_similarity,
    _calculate_semantic_similarity,
    _intents_compatible,
    _group_by_semantic_similarity,
    SEMANTIC_WEIGHTS,
)
from semantic_annotator import SemanticAnnotation


@dataclass
class MockCodeBlock:
    """Mock CodeBlock for testing."""
    block_id: str
    source_code: str
    category: str = 'utility'
    tags: list = field(default_factory=list)
    pattern_id: str = 'test-pattern'
    line_count: int = 5
    location: object = None
    repository_path: str = '/test'
    language: str = 'javascript'
    content_hash: str = 'abc123'

    def __post_init__(self):
        if self.location is None:
            self.location = type('Location', (), {
                'file_path': '/test/file.js',
                'line_start': 1
            })()


class TestJaccardSimilarity:
    """Tests for Jaccard similarity calculation."""

    def test_identical_sets(self):
        """Test identical sets have similarity 1.0."""
        result = _calculate_jaccard_similarity({'a', 'b', 'c'}, {'a', 'b', 'c'})
        assert result == 1.0

    def test_disjoint_sets(self):
        """Test disjoint sets have similarity 0.0."""
        result = _calculate_jaccard_similarity({'a', 'b'}, {'c', 'd'})
        assert result == 0.0

    def test_partial_overlap(self):
        """Test partial overlap calculates correctly."""
        result = _calculate_jaccard_similarity({'a', 'b', 'c'}, {'b', 'c', 'd'})
        # Intersection: {b, c} = 2, Union: {a, b, c, d} = 4
        assert result == 0.5

    def test_both_empty(self):
        """Test both empty sets return 1.0 (compatible)."""
        result = _calculate_jaccard_similarity(set(), set())
        assert result == 1.0

    def test_one_empty(self):
        """Test one empty set returns 0.5 (partial match)."""
        result = _calculate_jaccard_similarity({'a', 'b'}, set())
        assert result == 0.5
        result = _calculate_jaccard_similarity(set(), {'a', 'b'})
        assert result == 0.5

    def test_subset(self):
        """Test subset relationship."""
        result = _calculate_jaccard_similarity({'a'}, {'a', 'b'})
        # Intersection: {a} = 1, Union: {a, b} = 2
        assert result == 0.5


class TestSemanticSimilarity:
    """Tests for weighted semantic similarity calculation."""

    def test_identical_annotations(self):
        """Test identical annotations have similarity 1.0."""
        ann = SemanticAnnotation(
            category='utility',
            operations={'filter', 'map'},
            domains={'user'},
            patterns={'guard_clause'},
            data_types={'array'},
        )
        result = _calculate_semantic_similarity(ann, ann)
        assert result == 1.0

    def test_different_operations_major_impact(self):
        """Test operations have 40% weight."""
        ann1 = SemanticAnnotation(
            category='utility',
            operations={'filter'},
            domains={'user'},
            patterns=set(),
            data_types={'array'},
        )
        ann2 = SemanticAnnotation(
            category='utility',
            operations={'reduce'},  # Different operation
            domains={'user'},
            patterns=set(),
            data_types={'array'},
        )
        result = _calculate_semantic_similarity(ann1, ann2)
        # Operations differ (0.0 * 0.4), others match
        expected = 0.0 * 0.4 + 1.0 * 0.25 + 1.0 * 0.20 + 1.0 * 0.15
        assert abs(result - expected) < 0.01

    def test_different_domains_moderate_impact(self):
        """Test domains have 25% weight."""
        ann1 = SemanticAnnotation(
            category='utility',
            operations={'filter'},
            domains={'user'},
            patterns=set(),
            data_types={'array'},
        )
        ann2 = SemanticAnnotation(
            category='utility',
            operations={'filter'},
            domains={'payment'},  # Different domain
            patterns=set(),
            data_types={'array'},
        )
        result = _calculate_semantic_similarity(ann1, ann2)
        # Domains differ (0.0 * 0.25), others match
        expected = 1.0 * 0.4 + 0.0 * 0.25 + 1.0 * 0.20 + 1.0 * 0.15
        assert abs(result - expected) < 0.01

    def test_similar_operations_high_score(self):
        """Test overlapping operations produce high score."""
        ann1 = SemanticAnnotation(
            category='utility',
            operations={'filter', 'map'},
            domains={'user'},
            patterns=set(),
            data_types={'array'},
        )
        ann2 = SemanticAnnotation(
            category='utility',
            operations={'filter', 'map', 'sort'},  # 2/3 overlap
            domains={'user'},
            patterns=set(),
            data_types={'array'},
        )
        result = _calculate_semantic_similarity(ann1, ann2)
        # Operations: 2/3 = 0.667
        assert result >= 0.85  # High due to other matches

    def test_weights_sum_to_one(self):
        """Verify weights sum to 1.0."""
        total = sum(SEMANTIC_WEIGHTS.values())
        assert abs(total - 1.0) < 0.001


class TestIntentCompatibility:
    """Tests for intent compatibility checking."""

    def test_identical_intents(self):
        """Test identical intents are compatible."""
        assert _intents_compatible('filter+map|on:user', 'filter+map|on:user')

    def test_shared_operation(self):
        """Test intents with shared operation are compatible."""
        assert _intents_compatible('filter+map|on:user', 'filter|on:auth')

    def test_no_shared_operation(self):
        """Test intents with no shared operation are not compatible."""
        assert not _intents_compatible('filter|on:user', 'reduce|on:user')

    def test_unknown_intent(self):
        """Test unknown intent is not compatible."""
        assert not _intents_compatible('unknown', 'filter|on:user')
        assert not _intents_compatible('filter|on:user', 'unknown')

    def test_both_unknown(self):
        """Test both unknown are not compatible."""
        assert not _intents_compatible('unknown', 'unknown')

    def test_empty_operations(self):
        """Test empty operation parts."""
        # Intent with just domain
        assert not _intents_compatible('|on:user', '|on:auth')


class TestSemanticGrouping:
    """Tests for semantic similarity grouping."""

    def test_groups_same_category_similar_operations(self):
        """Test blocks with same category and similar ops are grouped."""
        blocks = [
            MockCodeBlock(
                block_id='b1',
                source_code='users.filter(u => u.active)',
                category='utility'
            ),
            MockCodeBlock(
                block_id='b2',
                source_code='items.filter(i => i.enabled)',
                category='utility'
            ),
        ]

        annotations = {
            'b1': SemanticAnnotation(
                category='utility',
                operations={'filter'},
                domains={'user'},
                patterns=set(),
                data_types={'array'},
                intent='filter|on:user',
            ),
            'b2': SemanticAnnotation(
                category='utility',
                operations={'filter'},
                domains=set(),
                patterns=set(),
                data_types={'array'},
                intent='filter',
            ),
        }

        groups = _group_by_semantic_similarity(blocks, annotations, threshold=0.70)
        assert len(groups) == 1
        assert len(groups[0][0]) == 2

    def test_different_categories_not_grouped(self):
        """Test blocks with different categories are not grouped."""
        blocks = [
            MockCodeBlock(block_id='b1', source_code='code1', category='utility'),
            MockCodeBlock(block_id='b2', source_code='code2', category='validator'),
        ]

        annotations = {
            'b1': SemanticAnnotation(
                category='utility',
                operations={'filter'},
                domains={'user'},
                patterns=set(),
                data_types={'array'},
                intent='filter|on:user',
            ),
            'b2': SemanticAnnotation(
                category='validator',  # Different category
                operations={'filter'},
                domains={'user'},
                patterns=set(),
                data_types={'array'},
                intent='filter|on:user',
            ),
        }

        groups = _group_by_semantic_similarity(blocks, annotations, threshold=0.70)
        assert len(groups) == 0

    def test_incompatible_intents_not_grouped(self):
        """Test blocks with incompatible intents are not grouped."""
        blocks = [
            MockCodeBlock(block_id='b1', source_code='code1', category='utility'),
            MockCodeBlock(block_id='b2', source_code='code2', category='utility'),
        ]

        annotations = {
            'b1': SemanticAnnotation(
                category='utility',
                operations={'filter'},
                domains={'user'},
                patterns=set(),
                data_types={'array'},
                intent='filter|on:user',
            ),
            'b2': SemanticAnnotation(
                category='utility',
                operations={'reduce'},  # Different operation
                domains={'user'},
                patterns=set(),
                data_types={'array'},
                intent='reduce|on:user',  # Incompatible intent
            ),
        }

        groups = _group_by_semantic_similarity(blocks, annotations, threshold=0.70)
        assert len(groups) == 0

    def test_below_threshold_not_grouped(self):
        """Test blocks below similarity threshold are not grouped."""
        blocks = [
            MockCodeBlock(block_id='b1', source_code='code1', category='utility'),
            MockCodeBlock(block_id='b2', source_code='code2', category='utility'),
        ]

        annotations = {
            'b1': SemanticAnnotation(
                category='utility',
                operations={'filter', 'map'},
                domains={'user'},
                patterns={'guard_clause'},
                data_types={'array'},
                intent='filter+map|on:user|with:guard_clause',
            ),
            'b2': SemanticAnnotation(
                category='utility',
                operations={'filter'},  # Partial overlap
                domains={'payment'},  # Different domain
                patterns=set(),  # No patterns
                data_types={'object'},  # Different type
                intent='filter|on:payment',
            ),
        }

        # Use high threshold
        groups = _group_by_semantic_similarity(blocks, annotations, threshold=0.90)
        assert len(groups) == 0

    def test_empty_blocks_returns_empty(self):
        """Test empty blocks list returns empty groups."""
        groups = _group_by_semantic_similarity([], {}, threshold=0.70)
        assert groups == []

    def test_single_block_returns_empty(self):
        """Test single block returns empty (need 2+ for group)."""
        blocks = [MockCodeBlock(block_id='b1', source_code='code1')]
        annotations = {
            'b1': SemanticAnnotation(
                category='utility',
                operations={'filter'},
                domains=set(),
                patterns=set(),
                data_types=set(),
                intent='filter',
            ),
        }
        groups = _group_by_semantic_similarity(blocks, annotations, threshold=0.70)
        assert groups == []

    def test_multiple_groups_formed(self):
        """Test multiple distinct groups can be formed."""
        blocks = [
            MockCodeBlock(block_id='b1', source_code='filter1', category='utility'),
            MockCodeBlock(block_id='b2', source_code='filter2', category='utility'),
            MockCodeBlock(block_id='b3', source_code='validate1', category='validator'),
            MockCodeBlock(block_id='b4', source_code='validate2', category='validator'),
        ]

        annotations = {
            'b1': SemanticAnnotation(
                category='utility', operations={'filter'}, domains={'user'},
                patterns=set(), data_types={'array'}, intent='filter|on:user',
            ),
            'b2': SemanticAnnotation(
                category='utility', operations={'filter'}, domains={'user'},
                patterns=set(), data_types={'array'}, intent='filter|on:user',
            ),
            'b3': SemanticAnnotation(
                category='validator', operations={'validate'}, domains={'auth'},
                patterns=set(), data_types={'object'}, intent='validate|on:auth',
            ),
            'b4': SemanticAnnotation(
                category='validator', operations={'validate'}, domains={'auth'},
                patterns=set(), data_types={'object'}, intent='validate|on:auth',
            ),
        }

        groups = _group_by_semantic_similarity(blocks, annotations, threshold=0.70)
        assert len(groups) == 2

    def test_missing_annotation_skipped(self):
        """Test blocks without annotations are skipped."""
        blocks = [
            MockCodeBlock(block_id='b1', source_code='code1', category='utility'),
            MockCodeBlock(block_id='b2', source_code='code2', category='utility'),
        ]

        # Only b1 has annotation
        annotations = {
            'b1': SemanticAnnotation(
                category='utility', operations={'filter'}, domains=set(),
                patterns=set(), data_types=set(), intent='filter',
            ),
        }

        groups = _group_by_semantic_similarity(blocks, annotations, threshold=0.70)
        assert groups == []


def run_tests():
    """Run all tests without pytest."""
    print("\n" + "=" * 60)
    print("Layer 3 Grouping Tests")
    print("=" * 60)

    test_classes = [
        TestJaccardSimilarity,
        TestSemanticSimilarity,
        TestIntentCompatibility,
        TestSemanticGrouping,
    ]

    passed = 0
    failed = 0

    for test_class in test_classes:
        print(f"\n{test_class.__name__}:")
        instance = test_class()

        for name in dir(instance):
            if name.startswith('test_'):
                method = getattr(instance, name)
                try:
                    method()
                    print(f"  ✅ {name}")
                    passed += 1
                except AssertionError as e:
                    print(f"  ❌ {name}: {e}")
                    failed += 1
                except Exception as e:
                    print(f"  ❌ {name}: Unexpected error: {e}")
                    failed += 1

    print("\n" + "=" * 60)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 60 + "\n")

    return 0 if failed == 0 else 1


if __name__ == '__main__':
    sys.exit(run_tests())
