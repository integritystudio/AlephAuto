"""
Shared test runner for Python test files that run without pytest.
"""

from __future__ import annotations
from typing import Sequence


def run_test_classes(title: str, test_classes: Sequence[type]) -> int:
    """Run test classes and return 0 on success, 1 on failure."""
    print("\n" + "=" * 60)
    print(title)
    print("=" * 60)

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
