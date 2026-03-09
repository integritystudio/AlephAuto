"""
Shared test runner for Python test files that run without pytest.
"""

from __future__ import annotations
from typing import Sequence


def run_test_classes(title: str, test_classes: Sequence[type]) -> int:
    """Run test classes and return 0 on success, 1 on failure."""

    passed = 0
    failed = 0

    for test_class in test_classes:
        instance = test_class()

        for name in dir(instance):
            if name.startswith("test_"):
                method = getattr(instance, name)
                try:
                    method()
                    passed += 1
                except AssertionError as e:
                    failed += 1
                except Exception as e:
                    failed += 1


    return 0 if failed == 0 else 1
