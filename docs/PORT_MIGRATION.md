# Port Migration: API_PORT → JOBS_API_PORT

**Date:** 2025-11-17
**Change:** Migrated from `API_PORT` (port 3000) to `JOBS_API_PORT` (port 8080)
**Reason:** Use Doppler-managed variables with project-specific naming convention

## Summary

Changed the AlephAuto Dashboard API port configuration to:
- Use Doppler environment variable management
- Change variable name from `API_PORT` to `JOBS_API_PORT`
- Change default port from `3000` to `8080`

## Changes Made

### 1. Configuration (`sidequest/config.js`)

**Added:**
```javascript
// API server port
apiPort: parseInt(process.env.JOBS_API_PORT || '8080', 10),
```

### 2. API Server (`api/server.js`)

**Before:**
```javascript
const PORT = config.apiPort || process.env.API_PORT || 3000;
```

**After:**
```javascript
const PORT = config.apiPort; // Now using JOBS_API_PORT from Doppler (default: 8080)
```

### 3. Deployment Configuration Files

Updated all deployment configuration files:

- **railway.json**: `API_PORT: "3000"` → `JOBS_API_PORT: "8080"`
- **render.yaml**: `API_PORT: 3000` → `JOBS_API_PORT: 8080`
- **Dockerfile**: `API_PORT=3000` + `EXPOSE 3000` → `JOBS_API_PORT=8080` + `EXPOSE 8080`
- **docker-compose.yml**: Port mapping `3000:3000` → `8080:8080`, env `API_PORT=3000` → `JOBS_API_PORT=8080`
- **.github/workflows/ci.yml**: Test port `3000` → `8080`, env `API_PORT` → `JOBS_API_PORT`

### 4. Health Checks

Updated health check commands in:
- **Dockerfile**: `localhost:3000/health` → `localhost:8080/health`
- **docker-compose.yml**: `localhost:3000/health` → `localhost:8080/health`

### 5. Documentation

Updated references in:
- **docs/DEPLOYMENT.md**: All port `3000` references → `8080`, `API_PORT` → `JOBS_API_PORT`
  - Application Components section
  - Railway configuration
  - Heroku configuration
  - Nginx proxy configuration
  - Environment variables table
  - Docker compose examples
  - Kubernetes deployment examples
  - Health check examples
  - Common commands section

- **public/README.md**: All port `3000` references → `8080`, `API_PORT` → `JOBS_API_PORT`
  - Dashboard access URLs
  - Customization section
  - Troubleshooting section
  - Environment variables section

### 6. Doppler

**Saved to Doppler:**
```bash
doppler secrets set JOBS_API_PORT=8080
```

**Verification:**
```bash
$ doppler secrets get JOBS_API_PORT
┌───────────────┬───────┬──────┐
│ NAME          │ VALUE │ NOTE │
├───────────────┼───────┼──────┤
│ JOBS_API_PORT │ 8080  │      │
└───────────────┴───────┴──────┘
```

## Files Modified

### Core Application
1. `sidequest/config.js` - Added `apiPort` configuration
2. `api/server.js` - Simplified to use config.apiPort

### Deployment Configuration
3. `railway.json` - Updated environment variables
4. `render.yaml` - Updated environment variables
5. `Dockerfile` - Updated ENV and EXPOSE
6. `docker-compose.yml` - Updated ports and environment
7. `.github/workflows/ci.yml` - Updated test configuration

### Documentation
8. `docs/DEPLOYMENT.md` - Comprehensive updates throughout
9. `public/README.md` - Updated all port references

**Total:** 9 files modified

## Migration Steps for Existing Deployments

### Option 1: Platform as a Service (Railway, Render, Heroku)

**Railway:**
```bash
railway variables set JOBS_API_PORT=8080
railway variables delete API_PORT  # Optional cleanup
railway up
```

**Render:**
1. Go to Dashboard → Environment Variables
2. Add `JOBS_API_PORT` = `8080`
3. Delete `API_PORT` (optional)
4. Redeploy

**Heroku:**
```bash
heroku config:set JOBS_API_PORT=8080
heroku config:unset API_PORT  # Optional cleanup
```

### Option 2: Traditional Server (PM2)

```bash
# Update Doppler
doppler secrets set JOBS_API_PORT=8080

# Restart services
doppler run -- pm2 restart aleph-dashboard

# Verify
curl http://localhost:8080/health
```

### Option 3: Docker

```bash
# Rebuild with new configuration
docker-compose down
docker-compose build
docker-compose up -d

# Verify
curl http://localhost:8080/health
```

## Testing

### Configuration Test
```bash
doppler run -- node -e "import('./sidequest/config.js').then(m => console.log('API Port:', m.config.apiPort))"
# Expected output: API Port: 8080
```

### Server Start Test
```bash
npm run dashboard
# Expected output:
# 🚀 AlephAuto API Server & Dashboard running on port 8080
# 📊 Dashboard: http://localhost:8080/
# ❤️  Health check: http://localhost:8080/health
# 🔌 WebSocket: ws://localhost:8080/ws
# 📡 API: http://localhost:8080/api/
```

### Health Check Test
```bash
curl http://localhost:8080/health
# Expected output: {"status":"healthy","timestamp":"...","version":"1.0.0"}
```

## Breaking Changes

### For Developers

**Before:**
```bash
# Old way
API_PORT=3000 npm run dashboard
```

**After:**
```bash
# New way
JOBS_API_PORT=8080 npm run dashboard
```

### For Deployments

- **Default port changed:** `3000` → `8080`
- **Environment variable changed:** `API_PORT` → `JOBS_API_PORT`
- **Docker port mapping changed:** `3000:3000` → `8080:8080`

### For Nginx/Reverse Proxies

**Update proxy_pass:**
```nginx
# Before
proxy_pass http://localhost:3000;

# After
proxy_pass http://localhost:8080;
```

## Rollback Procedure

If you need to rollback to the old port:

```bash
# Set old port in Doppler
doppler secrets set JOBS_API_PORT=3000

# Restart services
doppler run -- pm2 restart aleph-dashboard

# Or for Docker
docker-compose down
docker-compose up -d
```

Note: The code will still work as the config has a default fallback to `8080`, but you can override it.

## Benefits of This Change

1. **Doppler Integration**: All configuration managed in one place
2. **Project-Specific Naming**: `JOBS_API_PORT` makes it clear this is for the jobs project
3. **Port Conflict Avoidance**: Port `8080` is less commonly used than `3000`
4. **Consistency**: All environment variables now sourced from Doppler
5. **Better Defaults**: Default port `8080` is common for HTTP alternative services

## Related Documentation

- [Deployment Guide](DEPLOYMENT.md)
- [Dashboard README](../public/README.md)
- [Main Documentation](../CLAUDE.md)

---

**Status:** ✅ Complete
**Doppler Updated:** ✅ Yes
**Documentation Updated:** ✅ Yes
**Deployment Configs Updated:** ✅ Yes
**Tested:** ✅ Yes
