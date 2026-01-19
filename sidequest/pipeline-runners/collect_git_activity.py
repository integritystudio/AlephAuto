#!/usr/bin/env python3
"""
Comprehensive Git Activity Report Generator

Scans multiple repositories, analyzes commits, generates visualizations,
and creates a formatted markdown report for Jekyll sites.

Usage:
    python3 collect_git_activity.py --start-date 2025-07-07 --end-date 2025-11-16
    python3 collect_git_activity.py --days 7  # Last 7 days
    python3 collect_git_activity.py --weekly  # Last week
"""

import argparse
import json
import math
import os
import subprocess
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path


# Configuration
CODE_DIR = Path.home() / 'code'
EXCLUDE_PATTERNS = ['vim/bundle', 'node_modules', '.git', 'venv', '.venv']
DEFAULT_MAX_DEPTH = 2

# Language/File Type Mapping
LANGUAGE_EXTENSIONS = {
    'Python': ['.py', '.pyw'],
    'JavaScript': ['.js', '.mjs', '.cjs'],
    'TypeScript': ['.ts', '.tsx'],
    'Ruby': ['.rb', '.rake', '.gemspec'],
    'HTML': ['.html', '.htm'],
    'CSS/SCSS': ['.css', '.scss', '.sass', '.less'],
    'Markdown': ['.md', '.markdown'],
    'JSON': ['.json'],
    'YAML': ['.yml', '.yaml'],
    'Shell': ['.sh', '.bash', '.zsh'],
    'SQL': ['.sql'],
    'Go': ['.go'],
    'Rust': ['.rs'],
    'C/C++': ['.c', '.cpp', '.cc', '.h', '.hpp'],
    'Java': ['.java'],
    'PHP': ['.php'],
    'Lock Files': ['.lock', 'package-lock.json', 'Gemfile.lock', 'yarn.lock', 'pnpm-lock.yaml'],
    'SVG': ['.svg'],
    'Images': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp'],
    'Data Files': ['.csv', '.xml', '.tsv', '.parquet'],
    'Text Files': ['.txt', '.log', '.ini', '.conf']
}


def find_git_repos(max_depth=DEFAULT_MAX_DEPTH):
    """Find all git repositories, excluding specified patterns"""
    print(f"Scanning for repositories in {CODE_DIR} (depth: {max_depth})...")
    cmd = f"find {CODE_DIR} -maxdepth {max_depth} -name .git -type d"
    result = subprocess.run(cmd.split(), capture_output=True, text=True)

    repos = []
    for line in result.stdout.strip().split('\n'):
        if line:
            repo_path = Path(line).parent
            # Exclude patterns
            if not any(pattern in str(repo_path) for pattern in EXCLUDE_PATTERNS):
                repos.append(repo_path)

    print(f"Found {len(repos)} repositories")
    return sorted(repos)


def get_repo_stats(repo_path, since_date, until_date=None):
    """Get commit statistics for a repository"""
    try:
        os.chdir(repo_path)

        # Build git log command
        git_cmd = f"git log --since={since_date} --all --oneline"
        if until_date:
            git_cmd += f" --until={until_date}"

        result = subprocess.run(git_cmd.split(), capture_output=True, text=True)
        commits = len(result.stdout.strip().split('\n')) if result.stdout.strip() else 0

        # Get file changes for language analysis
        git_cmd = f"git log --since={since_date} --all --name-only --pretty=format:"
        if until_date:
            git_cmd += f" --until={until_date}"

        result = subprocess.run(git_cmd.split(), capture_output=True, text=True)
        files = [f for f in result.stdout.strip().split('\n') if f]

        # Get parent directory (for organization/grouping)
        parent = repo_path.parent.name if repo_path.parent != CODE_DIR else None

        return {
            'path': str(repo_path),
            'name': repo_path.name,
            'parent': parent,
            'commits': commits,
            'files': files
        }
    except Exception as e:
        print(f"Error processing {repo_path}: {e}")
        return None


def analyze_languages(all_files):
    """Analyze file changes by programming language"""
    language_stats = defaultdict(int)

    for file_path in all_files:
        file_ext = Path(file_path).suffix.lower()
        file_name = Path(file_path).name

        # Map to language
        found = False
        for language, extensions in LANGUAGE_EXTENSIONS.items():
            if file_ext in extensions or file_name in extensions:
                language_stats[language] += 1
                found = True
                break

        if not found and file_ext:
            language_stats['Other'] += 1

    return dict(language_stats)


def find_project_websites(repositories):
    """Scan for CNAME files to discover GitHub Pages websites"""
    websites = {}
    for repo in repositories:
        repo_path = Path(repo['path'])
        cname_file = repo_path / 'CNAME'

        if cname_file.exists():
            try:
                website = cname_file.read_text().strip()
                if website and '.' in website:  # Basic validation
                    websites[repo['name']] = f"https://{website}"
            except Exception:
                pass

    return websites


def categorize_repositories(repositories):
    """Categorize repositories by project type"""
    categories = {
        'Data & Analytics': [],
        'Personal Sites': [],
        'Infrastructure': [],
        'MCP Servers': [],
        'Client Work': [],
        'Business Apps': [],
        'Legacy': []
    }

    for repo in repositories:
        name = repo['name'].lower()
        commits = repo['commits']

        # Categorization logic (customize based on your projects)
        if 'scraper' in name or 'analytics' in name or 'bot' in name:
            categories['Data & Analytics'].append(repo)
        elif 'personalsite' in name or 'github.io' in name:
            categories['Personal Sites'].append(repo)
        elif 'mcp' in name or 'server' in name:
            categories['MCP Servers'].append(repo)
        elif commits < 5:
            categories['Legacy'].append(repo)
        elif 'integrity' in name or 'studio' in name or 'visualizer' in name:
            categories['Infrastructure'].append(repo)
        elif 'inventory' in name or 'financial' in name:
            categories['Business Apps'].append(repo)
        else:
            categories['Client Work'].append(repo)

    return categories


def create_pie_chart_svg(data, title, output_file, width=800, height=600):
    """Create SVG pie chart without matplotlib dependency"""
    cx, cy = width / 2, height / 2
    radius = min(width, height) / 3

    colors = [
        '#0066cc', '#4da6ff', '#99ccff', '#00994d', '#ffcc00',
        '#ff6600', '#cc0000', '#9966cc', '#66cc99', '#ff6699'
    ]

    total = sum(data.values())
    if total == 0:
        return

    svg_parts = [
        f'<svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">',
        f'<text x="{cx}" y="30" text-anchor="middle" font-size="20" font-weight="bold">{title}</text>'
    ]

    start_angle = 0
    legend_y = 50

    for i, (label, value) in enumerate(data.items()):
        if value == 0:
            continue

        percent = (value / total) * 100
        angle = (value / total) * 360
        end_angle = start_angle + angle

        # Convert to radians
        start_rad = math.radians(start_angle - 90)
        end_rad = math.radians(end_angle - 90)

        # Calculate arc path
        x1 = cx + radius * math.cos(start_rad)
        y1 = cy + radius * math.sin(start_rad)
        x2 = cx + radius * math.cos(end_rad)
        y2 = cy + radius * math.sin(end_rad)

        large_arc = 1 if angle > 180 else 0

        # Create pie slice
        path = f'M {cx},{cy} L {x1},{y1} A {radius},{radius} 0 {large_arc},1 {x2},{y2} Z'
        color = colors[i % len(colors)]
        svg_parts.append(f'<path d="{path}" fill="{color}" stroke="white" stroke-width="2"/>')

        # Add legend
        legend_x = width - 200
        svg_parts.append(f'<rect x="{legend_x}" y="{legend_y}" width="15" height="15" fill="{color}"/>')
        svg_parts.append(f'<text x="{legend_x + 20}" y="{legend_y + 12}" font-size="12">{label}: {value} ({percent:.1f}%)</text>')
        legend_y += 25

        start_angle = end_angle

    svg_parts.append('</svg>')

    # Write to file
    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text('\n'.join(svg_parts))
    print(f"Created: {output_file.name}")


def create_bar_chart_svg(data, title, output_file, width=800, height=600):
    """Create SVG horizontal bar chart"""
    max_value = max(data.values()) if data else 1
    bar_height = 30
    spacing = 10
    chart_height = len(data) * (bar_height + spacing)
    margin_left = 250
    margin_top = 50

    actual_height = chart_height + margin_top + 50

    svg_parts = [
        f'<svg width="{width}" height="{actual_height}" xmlns="http://www.w3.org/2000/svg">',
        f'<text x="{width/2}" y="30" text-anchor="middle" font-size="20" font-weight="bold">{title}</text>'
    ]

    for i, (label, value) in enumerate(data.items()):
        y = margin_top + i * (bar_height + spacing)
        bar_width = ((width - margin_left - 100) * value / max_value)

        # Bar
        svg_parts.append(f'<rect x="{margin_left}" y="{y}" width="{bar_width}" height="{bar_height}" fill="#0066cc" stroke="#333" stroke-width="1"/>')

        # Label
        svg_parts.append(f'<text x="{margin_left - 10}" y="{y + bar_height/2 + 5}" text-anchor="end" font-size="14">{label}</text>')

        # Value
        svg_parts.append(f'<text x="{margin_left + bar_width + 5}" y="{y + bar_height/2 + 5}" font-size="14" font-weight="bold">{value}</text>')

    svg_parts.append('</svg>')

    # Write to file
    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text('\n'.join(svg_parts))
    print(f"Created: {output_file.name}")


# ---------------------------------------------------------------------------
# Helper Functions for Main
# ---------------------------------------------------------------------------

def _calculate_date_range(args) -> tuple[str, str | None] | None:
    """Calculate date range from command line arguments.

    Returns:
        (since_date, until_date) tuple, or None if invalid arguments
    """
    # Handle shorthand flags
    if args.weekly:
        args.days = 7
    elif args.monthly:
        args.days = 30

    if args.days:
        end_date = datetime.now()
        start_date = end_date - timedelta(days=args.days)
        return start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')

    if args.start_date:
        return args.start_date, args.end_date

    return None


def _resolve_output_dir(args) -> Path:
    """Resolve output directory from arguments or use default."""
    if args.output_dir:
        return Path(args.output_dir)

    year = datetime.now().year
    return Path.home() / 'code' / 'PersonalSite' / 'assets' / 'images' / f'git-activity-{year}'


def _collect_repository_stats(repos: list[Path], since_date: str, until_date: str | None) -> tuple[list, list]:
    """Collect statistics from all repositories.

    Returns:
        (repositories, all_files) tuple
    """
    print("\nCollecting commit statistics...")
    repositories = []
    all_files = []

    for repo in repos:
        stats = get_repo_stats(repo, since_date, until_date)
        if stats and stats['commits'] > 0:
            repositories.append(stats)
            all_files.extend(stats['files'])

    repositories.sort(key=lambda x: x['commits'], reverse=True)
    return repositories, all_files


def _compile_activity_data(
    repositories: list,
    all_files: list,
    since_date: str,
    until_date: str | None
) -> dict:
    """Compile all activity data into a single dictionary."""
    print("\nAnalyzing programming languages...")
    language_stats = analyze_languages(all_files)

    print("\nDiscovering project websites...")
    websites = find_project_websites(repositories)

    print("\nCategorizing projects...")
    categories = categorize_repositories(repositories)

    return {
        'date_range': {
            'start': since_date,
            'end': until_date or datetime.now().strftime('%Y-%m-%d')
        },
        'total_commits': sum(r['commits'] for r in repositories),
        'total_repositories': len(repositories),
        'total_files': len(all_files),
        'repositories': repositories,
        'languages': language_stats,
        'websites': websites,
        'categories': {
            cat: [{'name': r['name'], 'commits': r['commits']} for r in repos]
            for cat, repos in categories.items()
        }
    }


def _print_summary(data: dict, output_dir: Path) -> None:
    """Print activity summary to console."""
    repositories = data['repositories']
    language_stats = data['languages']
    websites = data['websites']

    print(f"\n{'='*60}")
    print("Summary")
    print(f"{'='*60}")
    print(f"Total commits: {data['total_commits']}")
    print(f"Active repositories: {len(repositories)}")
    print(f"File changes: {data['total_files']}")
    print(f"Languages detected: {len(language_stats)}")
    print(f"Websites found: {len(websites)}")

    print("\nTop 5 repositories:")
    for i, repo in enumerate(repositories[:5], 1):
        print(f"  {i}. {repo['name']}: {repo['commits']} commits")

    print("\nTop 5 languages:")
    sorted_langs = sorted(language_stats.items(), key=lambda x: x[1], reverse=True)
    for i, (lang, count) in enumerate(sorted_langs[:5], 1):
        print(f"  {i}. {lang}: {count} files")

    print(f"\n✅ Complete! Visualizations saved to: {output_dir}")
    print(f"{'='*60}\n")


def generate_jekyll_report(data: dict, output_file: Path) -> None:
    """Generate Jekyll-formatted markdown report with frontmatter."""
    date_range = data['date_range']
    start_date = date_range['start']
    end_date = date_range['end']

    # Calculate report type for title
    start = datetime.strptime(start_date, '%Y-%m-%d')
    end = datetime.strptime(end_date, '%Y-%m-%d')
    days = (end - start).days

    if days <= 7:
        report_type = "Weekly"
    elif days <= 31:
        report_type = "Monthly"
    else:
        report_type = f"{days}-Day"

    # Format date for filename and frontmatter
    report_date = datetime.now().strftime('%Y-%m-%d')

    # Build frontmatter
    frontmatter = f"""---
layout: single
title: "{report_type} Git Activity Report: {start_date} to {end_date}"
date: {report_date}
author_profile: true
breadcrumbs: true
categories: [git-activity, development-metrics]
tags: [git, commits, repositories, weekly-report, automation]
excerpt: "{data['total_commits']} commits across {data['total_repositories']} repositories with {data['total_files']} file changes."
header:
  overlay_image: /images/cover-reports.png
  teaser: /images/cover-reports.png
---
"""

    # Build report content
    content = f"""
# {report_type} Git Activity Report

**Report Period**: {start_date} to {end_date}
**Generated**: {datetime.now().strftime('%Y-%m-%d %H:%M')}
**Report Type**: Automated Git Activity Analysis

## Executive Summary

| Metric | Value |
|--------|-------|
| Total Commits | {data['total_commits']} |
| Active Repositories | {data['total_repositories']} |
| Files Changed | {data['total_files']} |
| Languages Detected | {len(data.get('languages', {}))} |

## Top Repositories by Commits

| Repository | Commits |
|------------|---------|
"""

    # Add top 10 repositories
    for repo in data['repositories'][:10]:
        parent_prefix = f"{repo['parent']}/" if repo['parent'] else ""
        content += f"| {parent_prefix}{repo['name']} | {repo['commits']} |\n"

    # Add language breakdown
    if data.get('languages'):
        content += "\n## Language Distribution\n\n"
        content += "| Language | File Changes |\n"
        content += "|----------|-------------|\n"

        sorted_langs = sorted(data['languages'].items(), key=lambda x: x[1], reverse=True)
        for lang, count in sorted_langs[:10]:
            content += f"| {lang} | {count} |\n"

    # Add category breakdown if available
    if data.get('categories'):
        content += "\n## Project Categories\n\n"
        content += "| Category | Repositories |\n"
        content += "|----------|-------------|\n"

        for category, repos in data['categories'].items():
            if repos:
                content += f"| {category} | {len(repos)} |\n"

    # Add detailed repository list
    content += "\n## Repository Details\n\n"
    for repo in data['repositories']:
        parent_prefix = f"{repo['parent']}/" if repo['parent'] else ""
        content += f"### {parent_prefix}{repo['name']}\n\n"
        content += f"- **Path**: `{repo['path']}`\n"
        content += f"- **Commits**: {repo['commits']}\n"
        content += f"- **Files Changed**: {len(repo['files'])}\n\n"

    # Add websites if found
    if data.get('websites'):
        content += "\n## Project Websites\n\n"
        for name, url in data['websites'].items():
            content += f"- [{name}]({url})\n"

    content += "\n---\n\n"
    content += "*This report was automatically generated by the AlephAuto Git Activity Pipeline.*\n"

    # Write file
    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text(frontmatter + content)
    print(f"✅ Jekyll report saved to: {output_file}")


def generate_visualizations(data, output_dir):
    """Generate all SVG visualizations"""
    print("\nGenerating SVG visualizations...")

    # Monthly commits (if available in data)
    if 'monthly' in data:
        monthly_data = {month: count for month, count in data['monthly'].items()}
        create_pie_chart_svg(
            monthly_data,
            f"Commits by Month ({data['total_commits']} total)",
            output_dir / 'monthly-commits.svg'
        )

    # Top 10 repositories
    top_10 = {}
    for repo in data['repositories'][:10]:
        name = repo['name']
        if repo['parent']:
            name = f"{repo['parent']}/{name}"
        top_10[name] = repo['commits']

    create_bar_chart_svg(
        top_10,
        'Top 10 Repositories by Commits',
        output_dir / 'top-10-repos.svg'
    )

    # Project categories
    if 'categories' in data:
        category_data = {cat: len(repos) for cat, repos in data['categories'].items() if repos}
        create_pie_chart_svg(
            category_data,
            f"Project Categories ({len(data['repositories'])} repos)",
            output_dir / 'project-categories.svg'
        )

    # Language distribution
    if 'languages' in data:
        language_data = data['languages']
        create_pie_chart_svg(
            language_data,
            f"File Changes by Language ({sum(language_data.values())} total)",
            output_dir / 'language-distribution.svg',
            width=900
        )


def main():
    parser = argparse.ArgumentParser(description='Generate comprehensive git activity report')
    parser.add_argument('--start-date', help='Start date (YYYY-MM-DD)')
    parser.add_argument('--end-date', help='End date (YYYY-MM-DD)', default=None)
    parser.add_argument('--days', type=int, help='Number of days back from today')
    parser.add_argument('--weekly', action='store_true', help='Last 7 days')
    parser.add_argument('--monthly', action='store_true', help='Last 30 days')
    parser.add_argument('--max-depth', type=int, default=DEFAULT_MAX_DEPTH, help='Max directory depth')
    parser.add_argument('--output-dir', help='Output directory for visualizations')
    parser.add_argument('--json-output', help='Output JSON data file')

    args = parser.parse_args()

    # Calculate date range
    date_range = _calculate_date_range(args)
    if date_range is None:
        print("Error: Must specify --start-date, --days, --weekly, or --monthly")
        return 1

    since_date, until_date = date_range

    # Print header
    print(f"\n{'='*60}")
    print("Git Activity Report Generator")
    print(f"{'='*60}")
    print(f"Date range: {since_date} to {until_date or 'now'}")
    print(f"Scan depth: {args.max_depth} directories")
    print(f"{'='*60}\n")

    # Find and process repositories
    repos = find_git_repos(args.max_depth)
    repositories, all_files = _collect_repository_stats(repos, since_date, until_date)

    # Compile all data
    data = _compile_activity_data(repositories, all_files, since_date, until_date)

    # Save Jekyll markdown report
    default_report_dir = Path.home() / 'code' / 'PersonalSite' / '_reports'
    default_report_dir.mkdir(parents=True, exist_ok=True)
    report_date = datetime.now().strftime('%Y-%m-%d')
    report_file = default_report_dir / f'{report_date}-git-activity-report.md'
    generate_jekyll_report(data, report_file)

    # Also save JSON for programmatic access if requested
    if args.json_output:
        with open(args.json_output, 'w') as f:
            json.dump(data, f, indent=2)
        print(f"✅ JSON data saved to: {args.json_output}")

    # Generate visualizations
    output_dir = _resolve_output_dir(args)
    generate_visualizations(data, output_dir)

    # Print summary
    _print_summary(data, output_dir)

    return 0


if __name__ == '__main__':
    exit(main())
