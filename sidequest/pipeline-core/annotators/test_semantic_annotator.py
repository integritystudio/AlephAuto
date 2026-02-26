"""
Tests for SemanticAnnotator.

Run with: python -m pytest test_semantic_annotator.py -v
Or:       python test_semantic_annotator.py
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

# Add parent directories to path for imports
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent))

from semantic_annotator import SemanticAnnotator, SemanticAnnotation


@dataclass
class MockCodeBlock:
    """Mock CodeBlock for testing."""
    source_code: str
    category: str = 'utility'
    tags: list = None

    def __post_init__(self):
        if self.tags is None:
            self.tags = []


class TestSemanticAnnotation:
    """Tests for SemanticAnnotation dataclass."""

    def test_all_tags_combines_sets(self):
        """Test all_tags() returns union of all tag sets."""
        ann = SemanticAnnotation(
            category='utility',
            operations={'filter', 'map'},
            domains={'user'},
            patterns={'guard_clause'},
            data_types={'array'},
        )
        all_tags = ann.all_tags()
        assert all_tags == {'filter', 'map', 'user', 'guard_clause', 'array'}

    def test_to_dict_serialization(self):
        """Test to_dict() returns sorted lists."""
        ann = SemanticAnnotation(
            category='utility',
            operations={'map', 'filter'},
            domains={'user', 'auth'},
            patterns=set(),
            data_types={'array'},
            intent='filter+map|on:auth+user',
        )
        d = ann.to_dict()
        assert d['category'] == 'utility'
        assert d['operations'] == ['filter', 'map']  # sorted
        assert d['domains'] == ['auth', 'user']  # sorted
        assert d['patterns'] == []
        assert d['data_types'] == ['array']
        assert d['intent'] == 'filter+map|on:auth+user'


class TestOperationExtraction:
    """Tests for operation extraction."""

    def test_array_filter_operation(self):
        """Test filter operation detection."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="users.filter(u => u.active)")
        ann = annotator.extract_annotation(block)
        assert 'filter' in ann.operations

    def test_array_map_operation(self):
        """Test map operation detection."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="items.map(i => i.name)")
        ann = annotator.extract_annotation(block)
        assert 'map' in ann.operations

    def test_array_reduce_operation(self):
        """Test reduce operation detection."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="nums.reduce((a, b) => a + b, 0)")
        ann = annotator.extract_annotation(block)
        assert 'reduce' in ann.operations

    def test_multiple_array_operations(self):
        """Test multiple operations in chain."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(
            source_code="users.filter(u => u.active).map(u => u.name).sort()"
        )
        ann = annotator.extract_annotation(block)
        assert 'filter' in ann.operations
        assert 'map' in ann.operations
        assert 'sort' in ann.operations

    def test_for_loop_iterate(self):
        """Test for loop detection."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="for (const item of items) { }")
        ann = annotator.extract_annotation(block)
        assert 'iterate' in ann.operations

    def test_crud_read_operation(self):
        """Test read/fetch operation detection."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="await api.get('/users')")
        ann = annotator.extract_annotation(block)
        assert 'read' in ann.operations

    def test_crud_create_operation(self):
        """Test create operation detection."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="await db.create({ name })")
        ann = annotator.extract_annotation(block)
        assert 'create' in ann.operations

    def test_fetch_api(self):
        """Test fetch API detection."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="await fetch('/api/data')")
        ann = annotator.extract_annotation(block)
        assert 'fetch' in ann.operations

    def test_json_parse(self):
        """Test JSON.parse detection."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="const data = JSON.parse(text)")
        ann = annotator.extract_annotation(block)
        assert 'parse' in ann.operations

    def test_json_stringify(self):
        """Test JSON.stringify detection."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="JSON.stringify(data, null, 2)")
        ann = annotator.extract_annotation(block)
        assert 'serialize' in ann.operations

    def test_validate_function(self):
        """Test validation function detection."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="if (!isValid(email)) return")
        ann = annotator.extract_annotation(block)
        assert 'validate' in ann.operations


class TestDomainExtraction:
    """Tests for domain concept extraction."""

    def test_user_domain(self):
        """Test user domain detection."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="const user = await getUser(userId)")
        ann = annotator.extract_annotation(block)
        assert 'user' in ann.domains

    def test_auth_domain(self):
        """Test auth domain detection."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="const token = await authenticate(credentials)")
        ann = annotator.extract_annotation(block)
        assert 'auth' in ann.domains

    def test_payment_domain(self):
        """Test payment domain detection."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="await stripe.createCharge(payment)")
        ann = annotator.extract_annotation(block)
        assert 'payment' in ann.domains

    def test_database_domain(self):
        """Test database domain detection."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="await prisma.user.findMany()")
        ann = annotator.extract_annotation(block)
        assert 'database' in ann.domains

    def test_api_domain(self):
        """Test API domain detection."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="router.get('/endpoint', handler)")
        ann = annotator.extract_annotation(block)
        assert 'api' in ann.domains

    def test_multiple_domains(self):
        """Test multiple domain detection."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(
            source_code="await api.post('/users', { user, token })"
        )
        ann = annotator.extract_annotation(block)
        assert 'api' in ann.domains
        assert 'user' in ann.domains

    def test_domain_from_tags(self):
        """Test domain extraction from tags."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(
            source_code="doSomething()",
            tags=['payment-processing']
        )
        ann = annotator.extract_annotation(block)
        assert 'payment' in ann.domains


class TestPatternExtraction:
    """Tests for code pattern extraction."""

    def test_guard_clause(self):
        """Test guard clause detection."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="if (!user) return null")
        ann = annotator.extract_annotation(block)
        assert 'guard_clause' in ann.patterns

    def test_null_check_equality(self):
        """Test null check detection (equality)."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="if (value === null) throw new Error()")
        ann = annotator.extract_annotation(block)
        assert 'null_check' in ann.patterns

    def test_null_check_nullish_coalescing(self):
        """Test null check detection (nullish coalescing)."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="const name = user ?? 'anonymous'")
        ann = annotator.extract_annotation(block)
        assert 'null_check' in ann.patterns

    def test_null_check_optional_chaining(self):
        """Test null check detection (optional chaining)."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="const name = user?.profile?.name")
        ann = annotator.extract_annotation(block)
        assert 'null_check' in ann.patterns

    def test_error_handling_try_catch(self):
        """Test error handling detection (try-catch)."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="try { doWork() } catch (e) { }")
        ann = annotator.extract_annotation(block)
        assert 'error_handling' in ann.patterns

    def test_error_handling_promise_catch(self):
        """Test error handling detection (promise catch)."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="fetch(url).catch(handleError)")
        ann = annotator.extract_annotation(block)
        assert 'error_handling' in ann.patterns

    def test_async_await_pattern(self):
        """Test async/await pattern detection."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="async function getData() { await fetch() }")
        ann = annotator.extract_annotation(block)
        assert 'async_await' in ann.patterns

    def test_promise_chain_pattern(self):
        """Test promise chain detection."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="fetch(url).then(r => r.json())")
        ann = annotator.extract_annotation(block)
        assert 'promise_chain' in ann.patterns

    def test_promise_all(self):
        """Test Promise.all detection."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="await Promise.all([p1, p2])")
        ann = annotator.extract_annotation(block)
        assert 'promise_composition' in ann.patterns

    def test_pagination_pattern(self):
        """Test pagination pattern detection."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="const { page, limit } = query")
        ann = annotator.extract_annotation(block)
        assert 'pagination' in ann.patterns


class TestDataTypeExtraction:
    """Tests for data type extraction."""

    def test_array_type(self):
        """Test array type detection."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="const items = []")
        ann = annotator.extract_annotation(block)
        assert 'array' in ann.data_types

    def test_object_type(self):
        """Test object type detection."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="const config = {}")
        ann = annotator.extract_annotation(block)
        assert 'object' in ann.data_types

    def test_string_type(self):
        """Test string type detection."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="const name = 'test'")
        ann = annotator.extract_annotation(block)
        assert 'string' in ann.data_types

    def test_promise_type(self):
        """Test promise type detection."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="new Promise((resolve) => resolve())")
        ann = annotator.extract_annotation(block)
        assert 'promise' in ann.data_types

    def test_date_type(self):
        """Test date type detection."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="const now = new Date()")
        ann = annotator.extract_annotation(block)
        assert 'date' in ann.data_types


class TestIntentInference:
    """Tests for intent inference."""

    def test_simple_operation_intent(self):
        """Test intent with just operations."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="items.filter(i => i.active)")
        ann = annotator.extract_annotation(block)
        assert 'filter' in ann.intent

    def test_operation_with_domain_intent(self):
        """Test intent with operations and domains."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="users.filter(u => u.active)")
        ann = annotator.extract_annotation(block)
        assert 'filter' in ann.intent
        assert 'on:user' in ann.intent

    def test_full_intent(self):
        """Test intent with operations, domains, and patterns."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(
            source_code="if (!userId) return null; return users.filter(u => u.id === userId)"
        )
        ann = annotator.extract_annotation(block)
        assert ann.intent != 'unknown'
        # Should have operations, domains, and patterns


class TestEdgeCases:
    """Tests for edge cases."""

    def test_empty_code(self):
        """Test annotation of empty code."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="")
        ann = annotator.extract_annotation(block)
        assert ann.category == 'utility'
        assert ann.operations == set()
        assert ann.domains == set()
        assert ann.intent == 'unknown'

    def test_whitespace_only(self):
        """Test annotation of whitespace-only code."""
        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="   \n\t  ")
        ann = annotator.extract_annotation(block)
        assert ann.intent == 'unknown'

    def test_category_enum_handling(self):
        """Test handling of enum category values."""
        from enum import Enum

        class MockCategory(Enum):
            UTILITY = 'utility'

        annotator = SemanticAnnotator()
        block = MockCodeBlock(source_code="test()")
        block.category = MockCategory.UTILITY
        ann = annotator.extract_annotation(block)
        assert ann.category == 'utility'


def run_tests():
    """Run all tests without pytest."""
    from utils.test_runner import run_test_classes  # path covered by sys.path.insert above

    return run_test_classes("Semantic Annotator Tests", [
        TestSemanticAnnotation,
        TestOperationExtraction,
        TestDomainExtraction,
        TestPatternExtraction,
        TestDataTypeExtraction,
        TestIntentInference,
        TestEdgeCases,
    ])


if __name__ == '__main__':
    sys.exit(run_tests())
