# Dashboard Populate Pipeline

**Job Type:** `dashboard-populate`
**Cron:** `0 6,18 * * *` (twice daily: 6 AM, 6 PM)
**Git Workflow:** No

## Purpose

Populates the quality-metrics-dashboard with 7 quality metrics derived from Claude Code session telemetry. Runs the 3-step pipeline from the `observability-toolkit/dashboard` submodule and uploads aggregated results to Cloudflare Workers KV.

## Metrics

| Step | Metrics | Method |
|------|---------|--------|
| derive-evaluations | tool_correctness, evaluation_latency, task_completion | Rule-based (trace analysis) |
| judge-evaluations | relevance, coherence, faithfulness, hallucination | LLM-as-Judge (or `--seed` for synthetic) |
| sync-to-kv | Aggregated summaries per period (24h, 7d, 30d) + role views | Cloudflare KV upload |

## Usage

```bash
npm run dashboard:populate             # Run once with --seed (offline)
npm run dashboard:populate:full        # Run once with real LLM judge (needs ANTHROPIC_API_KEY)
npm run dashboard:populate:dry         # Dry run preview
npm run dashboard:populate:schedule    # Start cron scheduler
```

## Files

| Component | Path |
|-----------|------|
| Worker | `sidequest/workers/dashboard-populate-worker.js` |
| Pipeline Runner | `sidequest/pipeline-runners/dashboard-populate-pipeline.js` |
| External Scripts | `~/.claude/mcp-servers/observability-toolkit/dashboard/scripts/` |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DASHBOARD_CRON_SCHEDULE` | `0 6,18 * * *` | Cron schedule |
| `DASHBOARD_SEED` | `true` | Use synthetic judge scores |
| `RUN_ON_STARTUP` | `false` | Run immediately on startup |
| `ANTHROPIC_API_KEY` | — | Required for real LLM judge (`--no-seed`) |

## Data Flow

1. Build parent `observability-toolkit` (produces `dist/` needed by sync step)
2. Run `npm run populate` in the dashboard directory with flag passthrough
3. Parse step timings from stdout
4. Generate HTML/JSON report in `output/reports/`

## API Endpoint

```bash
curl "https://quality-metrics-api.alyshia-b38.workers.dev/api/dashboard?period=7d&role=executive"
```
