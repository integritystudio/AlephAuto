from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
import sys

import pytest


sys.path.insert(0, str(Path(__file__).parent))
import collect_git_activity as cga


class FrozenDateTime(datetime):
    @classmethod
    def now(cls, tz=None):
        return cls(2026, 3, 4, 12, 0, 0, tzinfo=tz)


def _result(stdout: str, stderr: str = "", returncode: int = 0) -> SimpleNamespace:
    return SimpleNamespace(stdout=stdout, stderr=stderr, returncode=returncode)


def _empty_activity_data(since_date: str, until_date: str | None) -> dict:
    return {
        "date_range": {"start": since_date, "end": until_date},
        "total_commits": 0,
        "total_additions": 0,
        "total_deletions": 0,
        "total_repositories": 0,
        "total_files": 0,
        "repositories": [],
        "languages": {},
        "categories": {},
        "websites": {},
        "monthly": {},
    }


def _frozen_report_date() -> str:
    return FrozenDateTime.now().strftime(cga.GitActivityDefaults.ISO_DATE_FORMAT)


def _frozen_weekly_title() -> str:
    end = FrozenDateTime.now()
    start = end - timedelta(days=cga.GitActivityDefaults.WEEKLY_WINDOW_DAYS)
    start_str = start.strftime(cga.GitActivityDefaults.ISO_DATE_FORMAT)
    end_str = end.strftime(cga.GitActivityDefaults.ISO_DATE_FORMAT)
    return f'title: "Weekly Git Activity Report: {start_str} to {end_str}"'


def test_find_git_repos_uses_argv_and_filters_excludes(monkeypatch, tmp_path):
    code_dir = tmp_path / "code root"
    reports_dir = tmp_path / "reports"
    extra_repo = tmp_path / "extra-repo"
    code_dir.mkdir(parents=True)
    reports_dir.mkdir(parents=True)
    (extra_repo / ".git").mkdir(parents=True)

    calls: list[list[str]] = []

    def fake_run(cmd, capture_output, text, cwd=None):
        calls.append(cmd)
        if cmd[1] == str(code_dir):
            return _result(
                f"{code_dir / 'repo-a' / '.git'}\n"
                f"{code_dir / 'node_modules' / 'ignored' / '.git'}\n"
            )
        if cmd[1] == str(reports_dir):
            return _result(f"{reports_dir / 'repo-b' / '.git'}\n")
        raise AssertionError(f"Unexpected command: {cmd}")

    monkeypatch.setattr(cga, "CODE_DIR", code_dir)
    monkeypatch.setattr(cga, "REPORTS_DIR", reports_dir)
    monkeypatch.setattr(cga, "ADDITIONAL_REPOS", [extra_repo])
    monkeypatch.setattr(cga, "EXCLUDE_PATTERNS", ["node_modules"])
    monkeypatch.setattr(cga.subprocess, "run", fake_run)

    repos = cga.find_git_repos(max_depth=2, include_dotfiles=False)

    assert calls[0] == [
        "find",
        str(code_dir),
        "-maxdepth",
        "2",
        "-name",
        ".git",
        "-type",
        "d",
    ]
    assert calls[1] == [
        "find",
        str(reports_dir),
        "-maxdepth",
        "2",
        "-name",
        ".git",
        "-type",
        "d",
    ]
    assert repos == sorted([code_dir / "repo-a", reports_dir / "repo-b", extra_repo])


def test_get_repo_stats_uses_cwd_and_parses_outputs(monkeypatch, tmp_path):
    repo_root = tmp_path / "group"
    repo_path = repo_root / "repo-one"
    repo_path.mkdir(parents=True)

    outputs = [
        _result("a1\nb2\n"),
        _result("2026-01\n2026-01\n2026-02\n"),
        _result("src/a.py\nsrc/b.ts\n"),
        _result("5\t2\tsrc/a.py\n-\t-\tbinary.bin\n3\t1\tsrc/b.ts\n"),
    ]
    calls: list[tuple[list[str], Path]] = []

    def fake_run(cmd, capture_output, text, cwd):
        calls.append((cmd, cwd))
        return outputs.pop(0)

    monkeypatch.setattr(cga.subprocess, "run", fake_run)
    monkeypatch.setattr(cga, "CODE_DIR", repo_root)
    monkeypatch.setattr(cga, "REPORTS_DIR", tmp_path / "reports")

    stats = cga.get_repo_stats(repo_path, "2026-01-01", "2026-02-01")

    assert stats is not None
    assert stats["commits"] == 2
    assert stats["monthly_commits"] == {"2026-01": 2, "2026-02": 1}
    assert stats["files"] == ["src/a.py", "src/b.ts"]
    assert stats["additions"] == 8
    assert stats["deletions"] == 3
    assert stats["parent"] is None

    assert len(calls) == 4
    for cmd, cwd in calls:
        assert cmd[:3] == ["git", "log", "--since=2026-01-01"]
        assert "--until=2026-02-01" in cmd
        assert cwd == repo_path

    assert "--oneline" in calls[0][0]
    assert "--date=format:%Y-%m" in calls[1][0]
    assert "--name-only" in calls[2][0]
    assert "--numstat" in calls[3][0]


def test_get_repo_stats_raises_on_subprocess_error(monkeypatch, tmp_path):
    repo_path = tmp_path / "repo"
    repo_path.mkdir()

    def fake_run(*args, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(cga.subprocess, "run", fake_run)
    with pytest.raises(RuntimeError, match="boom"):
        cga.get_repo_stats(repo_path, "2026-01-01", "2026-02-01")


def test_calculate_date_range_weekly_uses_fixed_now(monkeypatch):
    monkeypatch.setattr(cga, "datetime", FrozenDateTime)
    args = SimpleNamespace(
        weekly=True, monthly=False, days=None, start_date=None, end_date=None
    )

    assert cga._calculate_date_range(args) == ("2026-02-25", "2026-03-04")


def test_calculate_date_range_prefers_explicit_start_end(monkeypatch):
    monkeypatch.setattr(cga, "datetime", FrozenDateTime)
    args = SimpleNamespace(
        weekly=False,
        monthly=False,
        days=None,
        start_date="2026-01-10",
        end_date="2026-01-20",
    )

    assert cga._calculate_date_range(args) == ("2026-01-10", "2026-01-20")


def test_resolve_output_dir_relative_template(monkeypatch, tmp_path):
    monkeypatch.setattr(cga, "datetime", FrozenDateTime)
    monkeypatch.setattr(cga, "PERSONALSITE_DIR", tmp_path / "site")
    monkeypatch.setattr(
        cga, "VISUALIZATION_DIR_TEMPLATE", "assets/images/git-activity-{year}"
    )

    args = SimpleNamespace(output_dir=None)
    assert (
        cga._resolve_output_dir(args)
        == tmp_path / "site" / "assets/images/git-activity-2026"
    )


def test_resolve_output_dir_absolute_template(monkeypatch, tmp_path):
    monkeypatch.setattr(cga, "datetime", FrozenDateTime)
    absolute_template = str(tmp_path / "exports" / "git-{year}")
    monkeypatch.setattr(cga, "VISUALIZATION_DIR_TEMPLATE", absolute_template)

    args = SimpleNamespace(output_dir=None)
    assert cga._resolve_output_dir(args) == tmp_path / "exports" / "git-2026"


def test_compile_activity_data_aggregates_monthly_and_totals(monkeypatch):
    repos = [
        {
            "name": "repo-a",
            "commits": 3,
            "files": ["a.py", "b.py"],
            "additions": 10,
            "deletions": 2,
            "monthly_commits": {"2026-01": 2, "2026-02": 1},
        },
        {
            "name": "repo-b",
            "commits": 2,
            "files": ["c.ts"],
            "additions": 4,
            "deletions": 1,
            "monthly_commits": {"2026-01": 1, "2026-03": 1},
        },
    ]
    all_files = ["a.py", "b.py", "c.ts"]

    monkeypatch.setattr(
        cga, "analyze_languages", lambda files: {"Python": 2, "TypeScript": 1}
    )
    monkeypatch.setattr(
        cga,
        "find_project_websites",
        lambda repositories: {"repo-a": "https://a.example"},
    )
    monkeypatch.setattr(
        cga,
        "categorize_repositories",
        lambda repositories: {"Client Work": repositories, "Legacy": []},
    )

    data = cga._compile_activity_data(repos, all_files, "2026-01-01", "2026-03-01")

    assert data["total_commits"] == 5
    assert data["total_additions"] == 14
    assert data["total_deletions"] == 3
    assert data["total_repositories"] == 2
    assert data["total_files"] == 3
    assert data["monthly"] == {"2026-01": 3, "2026-02": 1, "2026-03": 1}
    assert data["categories"]["Client Work"] == [
        {"name": "repo-a", "commits": 3},
        {"name": "repo-b", "commits": 2},
    ]
    assert data["categories"]["Legacy"] == []


def test_collect_repository_stats_filters_zero_commit_repos(monkeypatch, tmp_path):
    repo_a = tmp_path / "repo-a"
    repo_b = tmp_path / "repo-b"
    repo_c = tmp_path / "repo-c"
    repo_a.mkdir()
    repo_b.mkdir()
    repo_c.mkdir()

    def fake_stats(repo, since, until):
        if repo.name == "repo-a":
            return {"name": "repo-a", "commits": 0, "files": ["a.py"]}
        if repo.name == "repo-b":
            return {"name": "repo-b", "commits": 2, "files": ["b.py", "c.ts"]}
        return None

    monkeypatch.setattr(cga, "get_repo_stats", fake_stats)
    repositories, all_files = cga._collect_repository_stats(
        [repo_a, repo_b, repo_c], "2026-01-01", "2026-02-01"
    )

    assert repositories == [{"name": "repo-b", "commits": 2, "files": ["b.py", "c.ts"]}]
    assert all_files == ["b.py", "c.ts"]


def test_generate_jekyll_report_writes_expected_content(monkeypatch, tmp_path):
    monkeypatch.setattr(cga, "datetime", FrozenDateTime)
    output_file = tmp_path / "report.md"
    data = {
        "date_range": {"start": "2026-02-25", "end": "2026-03-04"},
        "total_commits": 5,
        "total_repositories": 1,
        "total_files": 3,
        "repositories": [
            {
                "name": "repo-a",
                "parent": "group",
                "path": "/tmp/repo-a",
                "commits": 5,
                "files": ["a.py", "b.py", "c.ts"],
            },
        ],
        "languages": {"Python": 2, "TypeScript": 1},
        "categories": {"Client Work": [{"name": "repo-a", "commits": 5}]},
        "websites": {"repo-a": "https://repo-a.example"},
    }

    cga.generate_jekyll_report(data, output_file)
    content = output_file.read_text()

    assert 'title: "Weekly Git Activity Report: 2026-02-25 to 2026-03-04"' in content
    assert "| Total Commits | 5 |" in content
    assert "### group/repo-a" in content
    assert "- [repo-a](https://repo-a.example)" in content


def test_generate_visualizations_dispatches_expected_charts(monkeypatch, tmp_path):
    calls: list[tuple[str, Path]] = []

    def fake_pie(data, title, output_file, width=800, height=600):
        calls.append(("pie", output_file))

    def fake_bar(data, title, output_file, width=800, height=600):
        calls.append(("bar", output_file))

    monkeypatch.setattr(cga, "create_pie_chart_svg", fake_pie)
    monkeypatch.setattr(cga, "create_bar_chart_svg", fake_bar)

    data = {
        "monthly": {"2026-01": 2},
        "total_commits": 2,
        "repositories": [{"name": "repo-a", "parent": None, "commits": 2}],
        "categories": {"Client Work": [{"name": "repo-a", "commits": 2}]},
        "languages": {"Python": 1},
    }

    cga.generate_visualizations(data, tmp_path)

    assert ("pie", tmp_path / "monthly-commits.svg") in calls
    assert ("bar", tmp_path / "top-10-repos.svg") in calls
    assert ("pie", tmp_path / "project-categories.svg") in calls
    assert ("pie", tmp_path / "language-distribution.svg") in calls


def test_main_e2e_weekly_generates_markdown_and_json_without_visualizations(
    monkeypatch, tmp_path
):
    monkeypatch.setattr(cga, "datetime", FrozenDateTime)
    monkeypatch.setattr(cga, "PERSONALSITE_DIR", tmp_path / "site")
    monkeypatch.setattr(cga, "WORK_COLLECTION", "work")
    monkeypatch.setattr(cga, "find_git_repos", lambda max_depth: [tmp_path / "repo"])
    monkeypatch.setattr(
        cga, "_collect_repository_stats", lambda repos, since, until: ([], [])
    )
    monkeypatch.setattr(
        cga,
        "_compile_activity_data",
        lambda repositories, all_files, since_date, until_date: _empty_activity_data(
            since_date,
            until_date,
        ),
    )

    captured_summary = []
    monkeypatch.setattr(
        cga, "_print_summary", lambda data, output_dir=None: captured_summary.append(output_dir)
    )
    monkeypatch.setattr(
        cga,
        "generate_visualizations",
        lambda data, output_dir: (_ for _ in ()).throw(AssertionError("should not generate visualizations")),
    )

    monkeypatch.setattr(
        cga.sys,
        "argv",
        [
            "collect_git_activity.py",
            "--weekly",
            "--output-format",
            "both",
            "--no-visualizations",
        ],
    )

    exit_code = cga.main()
    assert exit_code == 0

    report_dir = tmp_path / "site" / "work"
    report_date = _frozen_report_date()
    markdown_report = report_dir / f"{report_date}-git-activity-report.md"
    json_report = report_dir / f"{report_date}-git-activity-report.json"

    assert markdown_report.exists()
    assert json_report.exists()
    assert _frozen_weekly_title() in markdown_report.read_text()
    assert captured_summary == [None]


def test_main_e2e_31_day_range_generates_monthly_report_title(monkeypatch, tmp_path):
    monkeypatch.setattr(cga, "datetime", FrozenDateTime)
    monkeypatch.setattr(cga, "PERSONALSITE_DIR", tmp_path / "site")
    monkeypatch.setattr(cga, "WORK_COLLECTION", "work")
    monkeypatch.setattr(cga, "find_git_repos", lambda max_depth: [tmp_path / "repo"])
    monkeypatch.setattr(
        cga, "_collect_repository_stats", lambda repos, since, until: ([], [])
    )
    monkeypatch.setattr(
        cga,
        "_compile_activity_data",
        lambda repositories, all_files, since_date, until_date: _empty_activity_data(
            since_date,
            until_date,
        ),
    )
    monkeypatch.setattr(cga, "_print_summary", lambda data, output_dir=None: None)
    monkeypatch.setattr(cga, "generate_visualizations", lambda data, output_dir: None)

    monkeypatch.setattr(
        cga.sys,
        "argv",
        [
            "collect_git_activity.py",
            "--start-date",
            "2026-01-01",
            "--end-date",
            "2026-02-01",
            "--no-visualizations",
        ],
    )

    exit_code = cga.main()
    assert exit_code == 0

    report_path = tmp_path / "site" / "work" / f"{_frozen_report_date()}-git-activity-report.md"
    assert report_path.exists()
    assert 'title: "Monthly Git Activity Report: 2026-01-01 to 2026-02-01"' in report_path.read_text()
