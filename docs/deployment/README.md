# Deployment Documentation

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "Deployment Documentation",
  "description": "This directory contains comprehensive deployment guides for the AlephAuto Dashboard.",
  "dateModified": "2026-01-19T02:09:57.629Z",
  "inLanguage": "en-US"
}
</script>


This directory contains comprehensive deployment guides for the AlephAuto Dashboard.

## 📚 Available Guides

### [TRADITIONAL_SERVER_DEPLOYMENT.md](./TRADITIONAL_SERVER_DEPLOYMENT.md)
**Complete guide for deploying to VPS/dedicated servers**

- **Setup Time:** 1-2 hours
- **Difficulty:** Intermediate
- **Stack:** PM2 + Doppler + Nginx
- **Best For:** Full control, custom infrastructure, existing servers

**What's Included:**
- Step-by-step server setup
- Dependency installation (Node.js, Python, Redis)
- PM2 process management configuration
- Doppler secrets management
- Nginx reverse proxy with SSL
- Monitoring and logging setup
- Maintenance procedures
- Troubleshooting guide

**Quick Start:**
```bash
# Initial setup (run once)
sudo ./scripts/deploy-traditional-server.sh --setup

# Deploy/update application
sudo ./scripts/deploy-traditional-server.sh --update

# Check status
./scripts/deploy-traditional-server.sh --status
```

### [CI_CD_UPDATES.md](../archive/CI_CD_UPDATES.md) *(archived)*
**CI/CD deployment updates and workflow details** (completed 2025-11-26)

### [BUGFIX_VERIFICATION.md](../archive/BUGFIX_VERIFICATION.md) *(archived)*
**Deployment verification playbook** (completed 2025-11-24)

## 🛠️ Deployment Scripts

### `scripts/deploy-traditional-server.sh`
**Automated deployment script for traditional servers**

```bash
# Options:
--setup     # Initial server setup (dependencies, PM2, Nginx)
--update    # Update application code and restart services
--rollback  # Rollback to previous version
--status    # Show current system status
```

**Features:**
- ✅ Automated dependency installation
- ✅ Git-based updates
- ✅ Automatic backups before updates
- ✅ Rollback capability
- ✅ Health checks
- ✅ Colored output and logging

## 📋 Configuration Templates

### `config/ecosystem.config.cjs`
**PM2 ecosystem configuration**

Use the committed config directly and customize environment via Doppler:

```bash
nano config/ecosystem.config.cjs
doppler run -- pm2 start config/ecosystem.config.cjs
```

**Features:**
- Dashboard server (fork mode, 1 instance)
- Background worker (fork mode, 1 instance)
- Doppler integration
- Log rotation
- Memory limits
- Auto-restart configuration
- Cron-based restarts

## 🔐 Environment Variables

### Required Variables (via Doppler)

```bash
# Production
NODE_ENV=production
JOBS_API_PORT=8080
REDIS_HOST=localhost
REDIS_PORT=6379

# Optional
SENTRY_DSN=https://...
CRON_SCHEDULE="0 2 * * *"
DOC_CRON_SCHEDULE="0 3 * * *"
GIT_CRON_SCHEDULE="0 20 * * 0"
PLUGIN_CRON_SCHEDULE="0 9 * * 1"
```

### Setting Variables

**Doppler CLI:**
```bash
doppler secrets set JOBS_API_PORT=8080
doppler secrets set NODE_ENV=production
```

## 🚀 Quick Deployment

### Traditional Server Deployment

```bash
# 1. Initial setup (one-time)
sudo ./scripts/deploy-traditional-server.sh --setup

# 2. Configure Doppler
doppler login
doppler setup
doppler secrets set JOBS_API_PORT=8080

# 3. Deploy
sudo ./scripts/deploy-traditional-server.sh --update
```
**Time:** 1-2 hours

## 📊 Post-Deployment Checklist

After deployment, verify:

- [ ] Health check responds: `curl https://your-domain.com/health`
- [ ] Dashboard loads: Visit `https://your-domain.com`
- [ ] WebSocket connects: Check browser console
- [ ] PM2 processes running: `pm2 status`
- [ ] Redis responding: `redis-cli ping`
- [ ] SSL certificate valid: Check browser
- [ ] Logs accessible: `pm2 logs`
- [ ] Backups scheduled: Check cron
- [ ] Monitoring configured: View dashboards
- [ ] Alerts working: Test notifications

## 🔧 Maintenance Commands

### Daily Operations

```bash
# Check status
pm2 status
sudo systemctl status nginx
redis-cli ping

# View logs
pm2 logs aleph-dashboard --lines 50
sudo tail -f /var/log/nginx/aleph-dashboard-error.log

# Restart services
pm2 restart all
sudo systemctl reload nginx
```

### Weekly Maintenance

```bash
# Update application
cd /var/www/aleph-dashboard
git pull
npm ci --production
pm2 restart all

# Check disk space
df -h

# Review logs
pm2 logs --lines 100

# Check security updates
sudo apt update && sudo apt list --upgradable
```

### Monthly Maintenance

```bash
# Full system update
sudo apt update && sudo apt upgrade -y

# Clean up old logs
pm2 flush
sudo find /var/log/nginx -name "*.log" -mtime +30 -delete

# Review backups
ls -lh /var/backups/aleph-dashboard/

# SSL certificate renewal check
sudo certbot certificates
```

## 🆘 Troubleshooting

### Quick Diagnostics

```bash
# Full status check
./scripts/deploy-traditional-server.sh --status

# Check all services
systemctl status nginx redis-server --no-pager
pm2 status

# Test connectivity
curl http://localhost:8080/health
redis-cli ping
```

### Common Issues

**Dashboard not loading:**
```bash
# Check PM2
pm2 status
pm2 logs aleph-dashboard --err

# Check Nginx
sudo nginx -t
sudo systemctl status nginx
```

**WebSocket not connecting:**
```bash
# Check Nginx WebSocket config
sudo nano /etc/nginx/sites-available/aleph-dashboard
# Ensure: proxy_set_header Upgrade $http_upgrade;
```

**High memory usage:**
```bash
# Restart with memory limit
pm2 delete aleph-dashboard
pm2 start api/server.ts --name aleph-dashboard --max-memory-restart 500M -i 2
```

## 📚 Additional Resources

- [PM2 Documentation](https://pm2.keymetrics.io/docs/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [Doppler Documentation](https://docs.doppler.com/)
- [Let's Encrypt Docs](https://letsencrypt.org/docs/)

## 🤝 Support

For deployment issues:

1. Check the [TRADITIONAL_SERVER_DEPLOYMENT.md](./TRADITIONAL_SERVER_DEPLOYMENT.md) troubleshooting section
2. Review logs: `pm2 logs` and `/var/log/nginx/`
3. Create an issue on GitHub with deployment details

---

**Last Updated:** 2025-11-30
**Documentation Version:** 1.0.0
