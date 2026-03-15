# Installation & Deployment

## Prerequisites

- Node.js >= 22.0.0, Python 3.10+ (for Duplicate Detection pipeline only), Git
- pnpm (`npm i -g pnpm`)
- [Doppler CLI](https://docs.doppler.com/docs/install-cli) (required for all pipelines)

## Setup

```bash
cd ~/code/jobs
pnpm install
doppler setup --project integrity-studio --config dev
npm run build:frontend
```

Verify:
```bash
npm run typecheck
npm run test:all:core
npm start                       # Dev mode (reads .env)
curl http://localhost:8080/health
```

## Production (PM2 + Doppler)

```bash
npm run build:frontend
doppler run -c prd -- pm2 start config/ecosystem.config.cjs
pm2 save && pm2 startup
```

First-time: `./scripts/deploy/deploy-traditional-server.sh --setup`
Updates: `./scripts/deploy/deploy-traditional-server.sh --update`

### systemd (Linux)

```ini
# /etc/systemd/system/aleph-auto.service
[Unit]
Description=AlephAuto Job Queue
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/opt/aleph-auto
ExecStart=/usr/bin/node --strip-types api/server.ts
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable aleph-auto && sudo systemctl start aleph-auto
```

## GitHub Pages (Static Preview)

> **Note:** The Pages workflow (`.github/workflows/pages.yml`) references a legacy `public/` directory. The active frontend builds to `frontend/dist/`. The workflow needs updating.

URL: `https://aledlie.github.io/AlephAuto/`

Static-only -- no backend API, WebSocket, or live data. To point at a backend, set API/WebSocket URLs in `frontend/src/services/{api,websocket}.ts` and rebuild.

Pages setup: Repository **Settings** > **Pages** > Source: **GitHub Actions**.

## Pipeline-Specific Setup

### Git Activity Reporter

```bash
node --strip-types sidequest/pipeline-runners/git-activity-pipeline.ts --run --weekly
```

### Duplicate Detection

```bash
doppler run -- node --strip-types sidequest/pipeline-runners/duplicate-detection-pipeline.ts --run-now
```

## Configuration

- **Dev:** `.env` file -- `npm start` loads it automatically
- **Production:** Doppler -- `doppler run -- node --strip-types api/server.ts`
- **Never** use `process.env` directly -- use `import { config } from './sidequest/core/config.ts'`
- **Paths:** Set `CODE_BASE_DIR` env var or edit `sidequest/git-report-config.json`

## Monitoring

- `pm2 status` / `pm2 logs`
- `GET /health`
- Sentry dashboard for errors
- GitHub Actions tab for Pages deployments

## Troubleshooting

| Problem | Fix |
|---------|-----|
| TypeScript fails to start | `pnpm install && node --version` (>= 22.0.0) |
| Python script won't execute (Duplicate Detection) | Verify `python3 --version` >= 3.10 |
| No repositories found | Check `$CODE_BASE_DIR` or edit `sidequest/git-report-config.json` |
| Jobs not completing | `pm2 logs`, check `logs/*.json`, check Sentry |
| Dashboard "Connection Failed" | Expected on Pages (no backend); on self-hosted check `pm2 status`, port 8080, firewall |
| Pages workflow fails | Legacy `public/` files missing -- see note above |

## Related

- [README](../README.md) - Overview and commands
- [Pipeline Execution](runbooks/pipeline-execution.md) - PM2/Doppler patterns
- [Troubleshooting](runbooks/troubleshooting.md) - Debugging guide
- [Adding Pipelines](ADDING_PIPELINES.md) - Pipeline creation guide
- [Frontend README](../frontend/README.md) - React dashboard

---

**Last Updated:** 2026-03-14
**Version:** 2.3.20
