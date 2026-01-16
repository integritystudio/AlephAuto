#!/usr/bin/env python3
"""
Timeout Pattern Detector (Python Version)

Simpler Python implementation for detecting timeout anti-patterns.
Useful for Python-heavy projects or when ast-grep is not available.

Based on AlephAuto debugging session: Nov 18, 2025

Usage:
    python3 timeout_detector.py /path/to/repo
    python3 timeout_detector.py /path/to/repo --output report.md

Author: Derived from AnalyticsBot dashboard debugging session
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable

if TYPE_CHECKING:
    from collections.abc import Iterator


@dataclass
class Finding:
    """Represents a single finding."""

    file_path: str
    line_number: int
    severity: str
    category: str
    message: str
    code_snippet: str
    recommendation: str


@dataclass
class FileContext:
    """Context for scanning a single file."""

    file_path: Path
    content: str
    lines: list[str]

    def has_text_in_range(self, text: str, start_line: int, num_lines: int) -> bool:
        """Check if text exists within a range of lines."""
        end = min(start_line + num_lines, len(self.lines))
        return any(text in self.lines[j] for j in range(start_line - 1, end))

    def has_pattern_in_range(
        self, pattern: str, start_line: int, num_lines: int
    ) -> bool:
        """Check if regex pattern matches within a range of lines."""
        end = min(start_line + num_lines, len(self.lines))
        return any(re.search(pattern, self.lines[j]) for j in range(start_line - 1, end))


# ---------------------------------------------------------------------------
# Pattern Detector Functions
# ---------------------------------------------------------------------------
# Each detector returns a Finding if the pattern matches, None otherwise.
# This approach replaces nested if-statements with focused, testable functions.
# ---------------------------------------------------------------------------


def _detect_promise_race_no_timeout(
    ctx: FileContext, line_num: int, line: str
) -> Finding | None:
    """Detect Promise.race() without timeout wrapper."""
    if 'Promise.race' not in line:
        return None
    if 'timeout' in line.lower():
        return None

    return Finding(
        file_path=str(ctx.file_path),
        line_number=line_num,
        severity='high',
        category='promise_race_no_timeout',
        message='Promise.race() without timeout wrapper',
        code_snippet=line.strip(),
        recommendation='Wrap with withTimeout() or add setTimeout rejection',
    )


def _detect_loading_without_finally(
    ctx: FileContext, line_num: int, line: str
) -> Finding | None:
    """Detect setLoading(true) without finally block."""
    if 'setLoading(true)' not in line and 'setLoading( true )' not in line:
        return None

    if ctx.has_text_in_range('finally', line_num, 20):
        return None

    return Finding(
        file_path=str(ctx.file_path),
        line_number=line_num,
        severity='medium',
        category='loading_without_finally',
        message='setLoading(true) without finally block',
        code_snippet=line.strip(),
        recommendation='Add finally block with setLoading(false)',
    )


def _detect_async_no_error_handling(
    ctx: FileContext, line_num: int, line: str
) -> Finding | None:
    """Detect async function without try-catch."""
    if not re.match(r'^\s*async\s+(function|\w+)\s*\(', line):
        return None

    has_try = ctx.has_pattern_in_range(r'\btry\b', line_num, 50)
    has_catch = ctx.has_pattern_in_range(r'\bcatch\b', line_num, 50)

    if has_try and has_catch:
        return None

    return Finding(
        file_path=str(ctx.file_path),
        line_number=line_num,
        severity='low',
        category='async_no_error_handling',
        message='Async function without try-catch',
        code_snippet=line.strip(),
        recommendation='Add try-catch block for error handling',
    )


def _detect_settimeout_no_cleanup(
    ctx: FileContext, line_num: int, line: str
) -> Finding | None:
    """Detect setTimeout without clearTimeout cleanup."""
    if 'setTimeout' not in line:
        return None
    if 'clearTimeout' in ctx.content:
        return None
    if 'reject' not in line and 'timeout' not in line.lower():
        return None
    if 'clearTimeout' in ctx.content or 'return () =>' in ctx.content:
        return None

    return Finding(
        file_path=str(ctx.file_path),
        line_number=line_num,
        severity='low',
        category='settimeout_no_cleanup',
        message='setTimeout without cleanup in useEffect/cleanup',
        code_snippet=line.strip(),
        recommendation='Add cleanup function: return () => clearTimeout(timeoutId)',
    )


# Registry of all pattern detectors
PATTERN_DETECTORS: list[Callable[[FileContext, int, str], Finding | None]] = [
    _detect_promise_race_no_timeout,
    _detect_loading_without_finally,
    _detect_async_no_error_handling,
    _detect_settimeout_no_cleanup,
]


# ---------------------------------------------------------------------------
# Excluded Directories
# ---------------------------------------------------------------------------

EXCLUDED_DIRS = frozenset({'node_modules', '.git', 'dist', 'build'})


def _should_include_file(file_path: Path) -> bool:
    """Check if file should be included in scan."""
    return not any(excluded in file_path.parts for excluded in EXCLUDED_DIRS)


class TimeoutDetector:
    """Detects timeout and infinite loading patterns in codebases."""

    def __init__(self, logger: Callable[[str], None] | None = None) -> None:
        self.logger = logger or print
        self.findings: list[Finding] = []

    def scan_directory(self, repo_path: str) -> dict[str, Any]:
        """Scan a directory for timeout patterns."""
        path = Path(repo_path)
        self.logger(f"Scanning: {path}")

        files = list(self._find_files(path))
        self.logger(f"Found {len(files)} files to scan")

        for file_path in files:
            self._scan_file(file_path)

        return {
            'findings': [asdict(f) for f in self.findings],
            'statistics': self._calculate_statistics(),
        }

    def _find_files(self, repo_path: Path) -> Iterator[Path]:
        """Find all scannable files in repository."""
        extensions = {'.ts', '.tsx', '.js', '.jsx', '.py'}
        for ext in extensions:
            for file_path in repo_path.rglob(f'*{ext}'):
                if _should_include_file(file_path):
                    yield file_path

    def _scan_file(self, file_path: Path) -> None:
        """Scan a single file for patterns."""
        try:
            content = file_path.read_text(encoding='utf-8')
        except (OSError, UnicodeDecodeError) as e:
            self.logger(f"Error reading {file_path}: {e}")
            return

        ctx = FileContext(file_path=file_path, content=content, lines=content.split('\n'))

        for line_num, line in enumerate(ctx.lines, start=1):
            self._check_line(ctx, line_num, line)

    def _check_line(self, ctx: FileContext, line_num: int, line: str) -> None:
        """Check a line against all pattern detectors."""
        for detector in PATTERN_DETECTORS:
            finding = detector(ctx, line_num, line)
            if finding:
                self.findings.append(finding)

    def _calculate_statistics(self) -> dict[str, Any]:
        """Calculate statistics from findings."""
        from collections import Counter

        severity_counts = Counter(f.severity for f in self.findings)
        category_counts = Counter(f.category for f in self.findings)
        files_affected = {f.file_path for f in self.findings}

        return {
            'total_findings': len(self.findings),
            'files_affected': len(files_affected),
            'severity_breakdown': dict(severity_counts),
            'category_breakdown': dict(category_counts),
        }

    def generate_report(self, results: dict[str, Any]) -> str:
        """Generate markdown report."""
        stats = results['statistics']
        lines = [
            '# Timeout Pattern Detection Report',
            '',
            '## Statistics',
            '',
            f"- **Total Findings:** {stats['total_findings']}",
            f"- **Files Affected:** {stats['files_affected']}",
            '',
            '### Severity Breakdown',
            '',
        ]

        severity_emoji = {'high': '🔴', 'medium': '🟡', 'low': '🟢'}
        for severity, count in stats['severity_breakdown'].items():
            emoji = severity_emoji.get(severity, '⚪')
            lines.append(f"- {emoji} **{severity.upper()}:** {count}")

        lines.extend(['', '### Category Breakdown', ''])
        for category, count in stats['category_breakdown'].items():
            lines.append(f"- **{category}:** {count}")

        lines.extend(['', '## Findings', ''])
        self._add_findings_by_severity(lines)

        return '\n'.join(lines)

    def _add_findings_by_severity(self, lines: list[str], max_per_severity: int = 10) -> None:
        """Add findings grouped by severity to report lines."""
        for severity in ('high', 'medium', 'low'):
            severity_findings = [f for f in self.findings if f.severity == severity]
            if not severity_findings:
                continue

            lines.extend([f'### {severity.upper()} Severity ({len(severity_findings)})', ''])

            for finding in severity_findings[:max_per_severity]:
                lines.extend([
                    f"**{finding.file_path}:{finding.line_number}**",
                    f"- Category: {finding.category}",
                    f"- Message: {finding.message}",
                    f"- Code: `{finding.code_snippet}`",
                    f"- Recommendation: {finding.recommendation}",
                    '',
                ])

            remaining = len(severity_findings) - max_per_severity
            if remaining > 0:
                lines.append(f"*... and {remaining} more*\n")


def main():
    """Main CLI entry point"""
    if len(sys.argv) < 2:
        print("Usage: python3 timeout_detector.py <repo-path> [--output <file>]")
        print("")
        print("Examples:")
        print("  python3 timeout_detector.py ~/code/myproject")
        print("  python3 timeout_detector.py ~/code/myproject --output report.md")
        sys.exit(1)

    repo_path = sys.argv[1]
    output_file = None

    if '--output' in sys.argv:
        output_index = sys.argv.index('--output')
        if output_index + 1 < len(sys.argv):
            output_file = sys.argv[output_index + 1]

    # Run scan
    detector = TimeoutDetector()
    results = detector.scan_directory(repo_path)

    # Generate report
    if '--json' in sys.argv:
        output = json.dumps(results, indent=2)
    else:
        output = detector.generate_report(results)

    # Output
    if output_file:
        Path(output_file).write_text(output)
        print(f"Report saved to: {output_file}")
    else:
        print(output)

    # Exit code based on high severity findings
    high_severity_count = results['statistics']['severity_breakdown'].get('high', 0)
    sys.exit(1 if high_severity_count > 0 else 0)


if __name__ == '__main__':
    main()
