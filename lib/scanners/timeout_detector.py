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

import os
import sys
import re
import json
from pathlib import Path
from typing import List, Dict, Any
from dataclasses import dataclass, asdict


@dataclass
class Finding:
    """Represents a single finding"""
    file_path: str
    line_number: int
    severity: str
    category: str
    message: str
    code_snippet: str
    recommendation: str


class TimeoutDetector:
    """Detects timeout and infinite loading patterns in codebases"""

    def __init__(self, logger=None):
        self.logger = logger or print
        self.findings: List[Finding] = []

    def scan_directory(self, repo_path: str) -> Dict[str, Any]:
        """Scan a directory for timeout patterns"""
        repo_path = Path(repo_path)

        self.logger(f"Scanning: {repo_path}")

        # Find all TypeScript/JavaScript/Python files
        extensions = ['.ts', '.tsx', '.js', '.jsx', '.py']
        files = []

        for ext in extensions:
            files.extend(repo_path.rglob(f'*{ext}'))

        # Skip node_modules and other common excludes
        files = [
            f for f in files
            if 'node_modules' not in str(f)
            and '.git' not in str(f)
            and 'dist' not in str(f)
            and 'build' not in str(f)
        ]

        self.logger(f"Found {len(files)} files to scan")

        # Scan each file
        for file_path in files:
            self._scan_file(file_path)

        # Generate statistics
        stats = self._calculate_statistics()

        return {
            'findings': [asdict(f) for f in self.findings],
            'statistics': stats
        }

    def _scan_file(self, file_path: Path):
        """Scan a single file for patterns"""
        try:
            content = file_path.read_text(encoding='utf-8')
            lines = content.split('\n')

            for i, line in enumerate(lines, start=1):
                # Pattern 1: Promise.race without timeout
                if 'Promise.race' in line and 'timeout' not in line.lower():
                    self.findings.append(Finding(
                        file_path=str(file_path),
                        line_number=i,
                        severity='high',
                        category='promise_race_no_timeout',
                        message='Promise.race() without timeout wrapper',
                        code_snippet=line.strip(),
                        recommendation='Wrap with withTimeout() or add setTimeout rejection'
                    ))

                # Pattern 2: setLoading(true) without finally
                if 'setLoading(true)' in line or 'setLoading( true )' in line:
                    # Check if there's a finally block in the next 20 lines
                    has_finally = any(
                        'finally' in lines[j]
                        for j in range(i, min(i + 20, len(lines)))
                    )

                    if not has_finally:
                        self.findings.append(Finding(
                            file_path=str(file_path),
                            line_number=i,
                            severity='medium',
                            category='loading_without_finally',
                            message='setLoading(true) without finally block',
                            code_snippet=line.strip(),
                            recommendation='Add finally block with setLoading(false)'
                        ))

                # Pattern 3: async function without try-catch
                if re.match(r'^\s*async\s+(function|\w+)\s*\(', line):
                    # Look ahead for try-catch
                    has_try_catch = any(
                        re.search(r'\btry\b', lines[j]) and re.search(r'\bcatch\b', lines[j + 10] if j + 10 < len(lines) else '')
                        for j in range(i, min(i + 50, len(lines)))
                    )

                    if not has_try_catch:
                        self.findings.append(Finding(
                            file_path=str(file_path),
                            line_number=i,
                            severity='low',
                            category='async_no_error_handling',
                            message='Async function without try-catch',
                            code_snippet=line.strip(),
                            recommendation='Add try-catch block for error handling'
                        ))

                # Pattern 4: setTimeout without clearTimeout
                if 'setTimeout' in line and 'clearTimeout' not in content:
                    # Check if it's part of a timeout pattern
                    if 'reject' in line or 'timeout' in line.lower():
                        # This is likely a timeout pattern, check for cleanup
                        has_cleanup = 'clearTimeout' in content or 'return () =>' in content

                        if not has_cleanup:
                            self.findings.append(Finding(
                                file_path=str(file_path),
                                line_number=i,
                                severity='low',
                                category='settimeout_no_cleanup',
                                message='setTimeout without cleanup in useEffect/cleanup',
                                code_snippet=line.strip(),
                                recommendation='Add cleanup function: return () => clearTimeout(timeoutId)'
                            ))

        except Exception as e:
            self.logger(f"Error scanning {file_path}: {e}")

    def _calculate_statistics(self) -> Dict[str, Any]:
        """Calculate statistics from findings"""
        severity_breakdown = {}
        category_breakdown = {}
        files_affected = set()

        for finding in self.findings:
            # Severity
            severity_breakdown[finding.severity] = severity_breakdown.get(finding.severity, 0) + 1

            # Category
            category_breakdown[finding.category] = category_breakdown.get(finding.category, 0) + 1

            # Files
            files_affected.add(finding.file_path)

        return {
            'total_findings': len(self.findings),
            'files_affected': len(files_affected),
            'severity_breakdown': severity_breakdown,
            'category_breakdown': category_breakdown
        }

    def generate_report(self, results: Dict[str, Any]) -> str:
        """Generate markdown report"""
        lines = [
            '# Timeout Pattern Detection Report',
            '',
            '## Statistics',
            '',
            f"- **Total Findings:** {results['statistics']['total_findings']}",
            f"- **Files Affected:** {results['statistics']['files_affected']}",
            '',
            '### Severity Breakdown',
            ''
        ]

        for severity, count in results['statistics']['severity_breakdown'].items():
            emoji = {'high': '🔴', 'medium': '🟡', 'low': '🟢'}.get(severity, '⚪')
            lines.append(f"- {emoji} **{severity.upper()}:** {count}")

        lines.extend(['', '### Category Breakdown', ''])

        for category, count in results['statistics']['category_breakdown'].items():
            lines.append(f"- **{category}:** {count}")

        lines.extend(['', '## Findings', ''])

        # Group by severity
        for severity in ['high', 'medium', 'low']:
            severity_findings = [
                f for f in self.findings
                if f.severity == severity
            ]

            if severity_findings:
                lines.extend([f'### {severity.upper()} Severity ({len(severity_findings)})', ''])

                for finding in severity_findings[:10]:  # Limit to 10 per severity
                    lines.extend([
                        f"**{finding.file_path}:{finding.line_number}**",
                        f"- Category: {finding.category}",
                        f"- Message: {finding.message}",
                        f"- Code: `{finding.code_snippet}`",
                        f"- Recommendation: {finding.recommendation}",
                        ''
                    ])

                if len(severity_findings) > 10:
                    lines.append(f"*... and {len(severity_findings) - 10} more*\n")

        return '\n'.join(lines)


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
