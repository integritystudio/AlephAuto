# Dashboard Deployment Guide

## GitHub Pages Deployment

The AlephAuto dashboard is automatically deployed to GitHub Pages when changes are pushed to the `main` branch.

### Live URL

Once deployed, the dashboard will be available at:
```
https://aledlie.github.io/AlephAuto/
```

### Important Notes

**Static vs. Full-Stack Deployment:**

GitHub Pages serves only **static files** (HTML, CSS, JavaScript). The dashboard UI will load, but you'll see a "Connection Failed" status because:

1. ❌ **No Backend API** - GitHub Pages doesn't run Node.js servers
2. ❌ **No WebSocket** - Real-time updates require a running server
3. ❌ **No Live Data** - Pipeline and job queue data comes from the API

**What Works on GitHub Pages:**
- ✅ Dashboard UI and design
- ✅ Documentation tabs
- ✅ Mock/demo data display
- ✅ Responsive layout

**What Requires a Backend:**
- ❌ Real-time pipeline status
- ❌ Job queue monitoring
- ❌ WebSocket live updates
- ❌ Scan triggering

## Full Deployment (with Backend)

For a fully functional dashboard, you need to deploy the complete application:

### Option 1: Traditional Server (PM2 + Nginx)

```bash
# Deploy to VPS
./scripts/deploy-traditional-server.sh --setup
./scripts/deploy-traditional-server.sh --update

# Dashboard will be available at:
# http://your-server-ip:8080
```

**See:** `docs/TRADITIONAL_SERVER_DEPLOYMENT.md`

## Configuration

### API URL Override

To connect the GitHub Pages dashboard to a separate backend API:

1. Deploy the backend to a server (Railway, Render, VPS)
2. Update `public/dashboard.js` before deploying:

```javascript
// Change this line:
this.apiBaseUrl = window.location.origin;

// To point to your backend:
this.apiBaseUrl = 'https://your-api-server.com';
```

3. Update WebSocket URL:

```javascript
// Change this line:
const wsUrl = `ws://${window.location.host}/ws`;

// To:
const wsUrl = 'wss://your-api-server.com/ws';
```

## Workflow Details

The GitHub Pages deployment workflow (`.github/workflows/pages.yml`):

1. **Triggers on:**
   - Push to `main` branch (when `public/` files change)
   - Manual workflow dispatch

2. **Build steps:**
   - Verifies dashboard files exist
   - Creates deployment artifact from `public/` directory
   - Uploads to GitHub Pages

3. **Deploy:**
   - Deploys to GitHub Pages environment
   - Shows deployment URL

## First-Time Setup

To enable GitHub Pages for this repository:

1. Go to repository **Settings** → **Pages**
2. Under **Source**, select **GitHub Actions**
3. Workflow will run automatically on next push to `main`

## Monitoring Deployments

Check deployment status:
- **Actions tab** in GitHub repository
- Look for "Deploy to GitHub Pages" workflow runs
- Each run shows build and deployment logs

## Troubleshooting

### Dashboard shows "Connection Failed"

**On GitHub Pages:**
- Expected behavior - no backend API is running
- Dashboard will show mock data for demonstration

**On self-hosted deployment:**
- Check API server is running: `pm2 status`
- Verify port 8080 is accessible
- Check firewall settings
- Review logs: `pm2 logs aleph-dashboard`

### Workflow fails

Common issues:
- Missing `public/` directory files
- Permissions not set correctly in workflow
- Repository Pages not enabled

Check workflow logs in GitHub Actions tab for details.

## Related Documentation

- General Deployment: `docs/DEPLOYMENT.md`
- Traditional Server: `docs/TRADITIONAL_SERVER_DEPLOYMENT.md`
- macOS Deployment: `docs/MACOS_DEPLOYMENT_CHANGES.md`
- Dashboard README: `public/README.md`

---

**Last Updated:** 2025-11-17
