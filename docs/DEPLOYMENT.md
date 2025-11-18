# AlephAuto Deployment Guide

Complete guide for deploying the AlephAuto Dashboard and pipelines to production.

## Table of Contents

1. [Deployment Strategy](#deployment-strategy)
2. [Prerequisites](#prerequisites)
3. [Deployment Options](#deployment-options)
   - [Option 1: Platform as a Service (Recommended)](#option-1-platform-as-a-service-recommended)
   - [Option 2: Traditional Server with PM2](#option-2-traditional-server-with-pm2)
4. [Environment Variables](#environment-variables)
5. [CI/CD Workflows](#cicd-workflows)
6. [Post-Deployment](#post-deployment)
7. [Troubleshooting](#troubleshooting)

---

## Deployment Strategy

Following the **environment-setup-analyzer** framework, we prioritize deployment methods by simplicity and reliability:

1. **🥇 Platform as a Service (PaaS)** - Railway, Render, Heroku (Fastest, most reliable)
2. **🥈 Traditional Server** - VPS with PM2 (More control, requires setup)

## Prerequisites

### All Deployments Need:

- **Node.js**: 18.x or 20.x
- **Python**: 3.11 or 3.12
- **Redis**: 7.x (for caching)
- **Doppler**: For secrets management (optional but recommended)

### Application Components:

- **Dashboard UI**: Vanilla JavaScript (no build step)
- **API Server**: Express.js (port 8080)
- **Background Workers**: Node.js pipelines (optional)

---

## Deployment Options

## Option 1: Platform as a Service (Recommended)

✅ **Best for**: Quick deployment, automatic scaling, managed infrastructure

### Railway

**Why Railway?**
- Zero-config deployment
- Automatic HTTPS
- Built-in Redis
- GitHub integration

**Deploy Steps:**

1. **Connect Repository**
   ```bash
   # Install Railway CLI (using package manager - method #1)
   brew install railway  # macOS
   # or
   npm install -g railway
   ```

2. **Create New Project**
   ```bash
   railway login
   railway init
   railway link
   ```

3. **Add Redis Service**
   ```bash
   railway add redis
   ```

4. **Set Environment Variables**
   ```bash
   railway variables set NODE_ENV=production
   railway variables set JOBS_API_PORT=8080
   railway variables set SENTRY_DSN=your_sentry_dsn
   ```

5. **Deploy**
   ```bash
   railway up
   ```

**Configuration**: `railway.json` is already configured

**Access**: Railway provides automatic URL: `https://your-app.railway.app`

---

### Render

**Why Render?**
- Automatic deploys from Git
- Free tier available
- Built-in load balancing
- Managed database/Redis

**Deploy Steps:**

1. **Connect Repository**
   - Go to [render.com](https://render.com)
   - Click "New" → "Blueprint"
   - Connect GitHub repository

2. **Configure Blueprint**
   - File: `render.yaml` (already configured)
   - Render will create:
     - Web service (dashboard + API)
     - Worker service (background jobs)
     - Redis instance

3. **Set Environment Variables**
   - In Render dashboard, add:
     - `SENTRY_DSN`
     - `DOPPLER_TOKEN` (if using Doppler)

4. **Deploy**
   - Push to `main` branch
   - Render deploys automatically

**Access**: `https://your-app.onrender.com`

---

### Heroku

**Why Heroku?**
- Mature platform
- Excellent documentation
- Add-on ecosystem

**Deploy Steps:**

1. **Install Heroku CLI**
   ```bash
   brew install heroku/brew/heroku  # macOS
   ```

2. **Create Application**
   ```bash
   heroku create aleph-dashboard
   ```

3. **Add Redis Add-on**
   ```bash
   heroku addons:create heroku-redis:mini
   ```

4. **Configure Environment**
   ```bash
   heroku config:set NODE_ENV=production
   heroku config:set JOBS_API_PORT=8080
   heroku config:set SENTRY_DSN=your_sentry_dsn
   ```

5. **Deploy**
   ```bash
   git push heroku main
   ```

**Configuration**: `Procfile` is already configured

**Access**: `https://aleph-dashboard.herokuapp.com`

---

## Option 2: Traditional Server with PM2

✅ **Best for**: Full control, custom infrastructure, existing VPS

**📘 Complete Guide:** See [TRADITIONAL_SERVER_DEPLOYMENT.md](TRADITIONAL_SERVER_DEPLOYMENT.md) for comprehensive step-by-step instructions.

**🚀 Quick Start:**
```bash
# Initial setup (run once)
sudo ./scripts/deploy-traditional-server.sh --setup

# Deploy/update application
sudo ./scripts/deploy-traditional-server.sh --update

# Check status
./scripts/deploy-traditional-server.sh --status
```

### Prerequisites

- Ubuntu 20.04+ or similar Linux distribution
- SSH access
- Doppler CLI (for secrets)
- PM2 (for process management)

### Setup Steps

1. **Install Node.js (using package manager - method #1)**
   ```bash
   # Use NodeSource repository
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. **Install Python**
   ```bash
   sudo apt-get install -y python3.11 python3.11-venv python3-pip
   ```

3. **Install Redis**
   ```bash
   sudo apt-get install -y redis-server
   sudo systemctl enable redis-server
   sudo systemctl start redis-server
   ```

4. **Install Doppler CLI**
   ```bash
   curl -sLf --retry 3 --tlsv1.2 --proto "=https" 'https://packages.doppler.com/public/cli/gpg.DE2A7741.key' | sudo apt-key add -
   echo "deb https://packages.doppler.com/public/cli/deb/debian any-version main" | sudo tee /etc/apt/sources.list.d/doppler-cli.list
   sudo apt-get update && sudo apt-get install doppler
   ```

5. **Install PM2**
   ```bash
   sudo npm install -g pm2
   ```

6. **Clone Repository**
   ```bash
   cd /var/www
   git clone <your-repo-url> aleph-dashboard
   cd aleph-dashboard
   ```

7. **Install Dependencies**
   ```bash
   npm ci --production
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

8. **Configure Doppler**
   ```bash
   doppler login
   doppler setup
   ```

9. **Start Services with PM2**
   ```bash
   # Start dashboard
   doppler run -- pm2 start api/server.js --name aleph-dashboard

   # Start duplicate detection pipeline (optional)
   doppler run -- pm2 start pipelines/duplicate-detection-pipeline.js --name duplicate-scanner

   # Save PM2 configuration
   pm2 save
   pm2 startup
   ```

10. **Configure Nginx (optional)**
    ```nginx
    server {
        listen 80;
        server_name your-domain.com;

        location / {
            proxy_pass http://localhost:8080;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
    ```

### GitHub Actions Deployment

The repository includes `.github/workflows/deploy.yml` for automated deployment.

**Required Secrets** (set in GitHub repository settings):
- `DOPPLER_TOKEN`: Your Doppler service token
- `DEPLOY_HOST`: Server hostname/IP
- `DEPLOY_USER`: SSH username
- `DEPLOY_PATH`: Deployment directory path
- `DEPLOY_SSH_KEY`: SSH private key

**Deploy Process:**
1. Push to `main` branch
2. GitHub Actions runs tests
3. If tests pass, deploys to server
4. Restarts PM2 services
5. Runs health check

---

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `JOBS_API_PORT` | API server port | `8080` |
| `REDIS_HOST` | Redis hostname | `localhost` or `redis` |
| `REDIS_PORT` | Redis port | `6379` |

### Optional

| Variable | Description | Example |
|----------|-------------|---------|
| `SENTRY_DSN` | Sentry error tracking | `https://...@sentry.io/...` |
| `CRON_SCHEDULE` | Repomix cron | `0 2 * * *` (2 AM daily) |
| `DOC_CRON_SCHEDULE` | Doc enhancement cron | `0 3 * * *` (3 AM daily) |
| `GIT_CRON_SCHEDULE` | Git activity cron | `0 20 * * 0` (Sunday 8 PM) |
| `PLUGIN_CRON_SCHEDULE` | Plugin audit cron | `0 9 * * 1` (Monday 9 AM) |

### Using Doppler

```bash
# Set up Doppler project
doppler setup

# Run commands with Doppler
doppler run -- npm run dashboard

# Export environment variables
doppler secrets download --no-file --format env > .env
```

---

## CI/CD Workflows

### GitHub Actions Workflows

Three workflows are configured:

#### 1. CI - Tests and Checks (`.github/workflows/ci.yml`)

**Triggers**: Pull requests and pushes to `main`

**Jobs**:
- Run unit tests with Node 18/20 and Python 3.11/3.12
- Run integration tests with Redis
- TypeScript type checking
- Security audit
- Validate dashboard files
- Test API server startup

**Matrix Strategy**: Tests run on multiple Node.js and Python versions

#### 2. CD - Production Deployment (`.github/workflows/deploy.yml`)

**Triggers**: Pushes to `main` or manual dispatch

**Process**:
1. Install dependencies
2. Validate deployment files
3. Deploy with rsync
4. Install dependencies on server
5. Restart PM2 services
6. Health check
7. Rollback on failure

**Required**: GitHub secrets for SSH deployment

#### 3. CD - Platform Deployment (`.github/workflows/deploy-platform.yml`)

**Triggers**: Pushes to `main` or manual dispatch

**Process**:
1. Validate configuration
2. Run tests
3. Notify readiness for platform deployment

**Note**: Platform (Railway/Render/Heroku) handles actual deployment via git push

---

## Post-Deployment

### 1. Verify Dashboard

```bash
# Health check
curl https://your-domain.com/health

# Dashboard
open https://your-domain.com

# WebSocket status
curl https://your-domain.com/ws/status
```

### 2. Monitor Services

**PM2**:
```bash
pm2 status
pm2 logs aleph-dashboard
pm2 monit
```

### 3. Set Up Monitoring

- **Sentry**: Error tracking (configure `SENTRY_DSN`)
- **PM2 Plus**: Process monitoring (optional)
- **Redis**: Monitor cache usage

### 4. Configure Cron Jobs

Pipelines run automatically based on cron schedules. To test immediately:

```bash
# Duplicate detection
RUN_ON_STARTUP=true npm run duplicate-scan

# Documentation enhancement
RUN_ON_STARTUP=true npm run docs:enhance

# Git activity report
RUN_ON_STARTUP=true npm run git:weekly
```

---

## Troubleshooting

### Dashboard Not Loading

**Check 1**: Verify files exist
```bash
ls -la public/
# Should show: index.html, dashboard.css, dashboard.js
```

**Check 2**: Check server logs
```bash
pm2 logs aleph-dashboard
```

**Check 3**: Verify port is open
```bash
curl http://localhost:8080/health
```

### WebSocket Connection Failed

**Issue**: Dashboard shows "Connecting..." indefinitely

**Solutions**:
1. Check firewall allows WebSocket connections
2. Verify reverse proxy (Nginx) has WebSocket support:
   ```nginx
   proxy_set_header Upgrade $http_upgrade;
   proxy_set_header Connection 'upgrade';
   ```
3. Check browser console for errors

### Redis Connection Failed

**Check Redis status**:
```bash
redis-cli ping  # Should return "PONG"
```

**Check environment variables**:
```bash
echo $REDIS_HOST
echo $REDIS_PORT
```

**Check connection**:
```bash
redis-cli -h $REDIS_HOST -p $REDIS_PORT ping
```

### Python Pipeline Errors

**Issue**: Python version incompatibility

**Solution**: Use virtual environment with correct Python version
```bash
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### PM2 Process Crashes

**Check logs**:
```bash
pm2 logs aleph-dashboard --lines 100
```

**Restart services**:
```bash
pm2 restart all
pm2 save
```

**Check memory**:
```bash
pm2 monit
```

---

## Best Practices

### Security

1. **Use Doppler** for secrets management
2. **Enable HTTPS** with Let's Encrypt or platform SSL
3. **Set up firewall** to restrict access
4. **Regular updates**: Keep dependencies updated
5. **Monitor logs**: Use Sentry for error tracking

### Performance

1. **Redis caching**: Configured with 30-day TTL
2. **PM2 clustering**: Run multiple instances
3. **Nginx caching**: Cache static assets
4. **CDN**: Serve static files from CDN (optional)

### Monitoring

1. **Health checks**: Automated in workflows
2. **Uptime monitoring**: Use UptimeRobot or similar
3. **Error tracking**: Sentry integration
4. **Performance**: PM2 Plus or DataDog

### Maintenance

1. **Backup Redis data**: Regular snapshots
2. **Log rotation**: Configure log rotation
3. **Dependency updates**: Monthly security patches
4. **Load testing**: Test with expected traffic

---

## Quick Reference

### Common Commands

```bash
# Start dashboard
npm run dashboard

# Deploy with PM2
doppler run -- pm2 start api/server.js --name aleph-dashboard

# Health check
curl http://localhost:8080/health

# View logs
pm2 logs aleph-dashboard

# Restart
pm2 restart aleph-dashboard
```

### Deployment Checklist

- [ ] Install Node.js, Python, Redis
- [ ] Clone repository
- [ ] Install dependencies
- [ ] Configure environment variables
- [ ] Start services
- [ ] Verify health check
- [ ] Set up monitoring
- [ ] Configure backups
- [ ] Test WebSocket connection
- [ ] Verify dashboard loads

---

## Additional Resources

- [Dashboard Documentation](../public/README.md)
- [API Documentation](../CLAUDE.md#rest-api--websocket-server)
- [Architecture Diagrams](DATAFLOW_DIAGRAMS.md)
- [Environment Setup Analyzer](~/.claude/skills/environment-setup-analyzer/SKILL.md)

---

**Last Updated**: 2025-11-17
**Maintained By**: AlephAuto Team
**Support**: Create an issue on GitHub
