# macOS Deployment Script Changes

## Overview
Updated `scripts/deploy-traditional-server.sh` to support both macOS and Linux platforms with automatic OS detection.

## Key Changes

### 1. OS Detection
- Automatically detects Darwin (macOS) vs Linux
- Sets platform-specific configuration variables
- Provides appropriate command examples in help text

### 2. Platform-Specific Paths

**macOS:**
- `APP_DIR`: `$HOME/code/jobs` (uses current project directory)
- `BACKUP_DIR`: `$HOME/.aleph-backups`
- `NGINX_SITE`: `/usr/local/etc/nginx/servers/aleph-dashboard`
- `LOG_FILE`: `$HOME/.aleph-logs/aleph-dashboard-deploy.log`
- `DEPLOY_USER`: `$USER` (current user)

**Linux:**
- `APP_DIR`: `/var/www/aleph-dashboard`
- `BACKUP_DIR`: `/var/backups/aleph-dashboard`
- `NGINX_SITE`: `/etc/nginx/sites-available/aleph-dashboard`
- `LOG_FILE`: `/var/log/aleph-dashboard-deploy.log`
- `DEPLOY_USER`: `aleph` (dedicated deployment user)

### 3. Package Management

**macOS (Homebrew):**
```bash
brew update
brew install node@20
brew install python@3.11
brew install redis
brew install nginx
brew install dopplerhq/cli/doppler
```

**Linux (apt-get):**
```bash
apt-get update && apt-get upgrade -y
apt-get install -y nodejs
apt-get install -y python3.11
apt-get install -y redis-server
apt-get install -y nginx
apt-get install -y doppler
```

### 4. Service Management

**macOS (Homebrew Services):**
```bash
brew services start redis
brew services start nginx
brew services restart nginx
```

**Linux (systemd):**
```bash
systemctl enable redis-server
systemctl start redis-server
systemctl enable nginx
systemctl start nginx
systemctl reload nginx
```

### 5. PM2 Startup

**macOS:**
```bash
pm2 startup launchd  # Uses launchd
```

**Linux:**
```bash
pm2 startup systemd  # Uses systemd
```

### 6. User Permissions

**macOS:**
- Runs commands as current user (no sudo -u needed)
- No dedicated deployment user creation
- Warning if run as root

**Linux:**
- Creates dedicated 'aleph' deployment user
- Uses `sudo -u aleph` for application commands
- Requires sudo for setup/update/rollback

### 7. Python Command

**macOS:**
- Uses `python3` (Homebrew default)

**Linux:**
- Uses `python3.11` (from deadsnakes PPA)

### 8. Firewall Configuration

**macOS:**
- No UFW installation
- Note about using System Preferences > Security & Privacy

**Linux:**
- Installs and configures UFW
- Opens ports 22, 80, 443

## Usage

### macOS
```bash
# First-time setup (requires Homebrew)
./scripts/deploy-traditional-server.sh --setup

# Deploy new version
./scripts/deploy-traditional-server.sh --update

# Rollback to previous version
./scripts/deploy-traditional-server.sh --rollback

# Check system status
./scripts/deploy-traditional-server.sh --status
```

### Linux
```bash
# First-time setup (requires sudo)
sudo ./scripts/deploy-traditional-server.sh --setup

# Deploy new version (requires sudo)
sudo ./scripts/deploy-traditional-server.sh --update

# Rollback to previous version (requires sudo)
sudo ./scripts/deploy-traditional-server.sh --rollback

# Check system status (no sudo needed)
./scripts/deploy-traditional-server.sh --status
```

## Prerequisites

### macOS
1. **Homebrew** - Required (https://brew.sh)
2. **Xcode Command Line Tools** - `xcode-select --install`

### Linux
1. **Ubuntu/Debian** - Script is designed for Debian-based systems
2. **Root/sudo access** - Required for system package installation

## Testing

The script automatically detects the OS and shows platform-specific help:

```bash
./scripts/deploy-traditional-server.sh
# Shows macOS-specific examples on macOS
# Shows Linux-specific examples with sudo on Linux
```

## Notes

1. **Directory Structure:**
   - macOS uses existing project directory (`~/code/jobs`)
   - Linux creates new directory (`/var/www/aleph-dashboard`)

2. **Backup Location:**
   - macOS: `~/.aleph-backups`
   - Linux: `/var/backups/aleph-dashboard`

3. **Service Management:**
   - macOS uses `brew services` (launchd)
   - Linux uses `systemctl` (systemd)

4. **Permissions:**
   - macOS runs as current user
   - Linux uses dedicated deployment user

5. **Python Version:**
   - macOS uses system python3 from Homebrew
   - Linux installs specific python3.11 from deadsnakes

## Backward Compatibility

The script maintains full backward compatibility with Linux deployments while adding macOS support. Existing Linux deployments will continue to work without modification.

## Additional Required Files

The deployment script now requires these files to be present:

### 1. requirements.txt (Python Dependencies)
```txt
# Python Dependencies for AlephAuto Duplicate Detection Pipeline
# Used by the code consolidation system for data models and processing

# Core data validation and models
pydantic>=2.12.0
```

**Location:** `/Users/alyshialedlie/code/jobs/requirements.txt`

### 2. config/ecosystem.config.cjs (PM2 Configuration)

**Important:** Must use `.cjs` extension (not `.js`) because the project uses ES modules.

**PM2 + Doppler Integration Pattern:**
```javascript
{
  name: 'aleph-dashboard',
  script: 'doppler',  // Script is doppler itself
  args: 'run -- node api/server.js',  // Pass the actual command as args
  cwd: APP_DIR,
  // ... other config
}
```

**Why this pattern?**
- PM2's `interpreter` field doesn't work correctly with Doppler
- Using `script: 'doppler'` with `args: 'run -- node script.js'` is the correct approach
- This ensures environment variables are properly injected from Doppler

**Location:** `/Users/alyshialedlie/code/jobs/config/ecosystem.config.cjs`

**Template Location:** `/Users/alyshialedlie/code/jobs/ecosystem.config.template.js`

## Troubleshooting

### Common Issues

1. **"No such file or directory: 'requirements.txt'"**
   - **Cause:** Missing Python dependencies file
   - **Fix:** Create `requirements.txt` with `pydantic>=2.12.0`

2. **"File config/ecosystem.config.js not found"**
   - **Cause:** Missing PM2 configuration file
   - **Fix:** Create `config/ecosystem.config.cjs` (use `.cjs` extension for ES module projects)

3. **"Doppler Error: fork/exec ... permission denied"**
   - **Cause:** Incorrect PM2 + Doppler integration pattern
   - **Fix:** Use `script: 'doppler'` with `args: 'run -- node script.js'` instead of `interpreter: 'doppler'`

4. **PM2 processes restart loop**
   - **Cause:** Application crashes immediately on startup
   - **Fix:** Check logs with `pm2 logs` and fix application errors first

5. **Health check fails**
   - **Cause:** Application hasn't fully started yet
   - **Fix:** Wait 5-10 seconds and retry, or check `pm2 logs` for errors

### Verification Steps

After deployment, verify everything is working:

```bash
# Check PM2 status
pm2 status

# Check health endpoint
curl http://localhost:8080/health

# Check application logs
pm2 logs aleph-dashboard --lines 50

# Check worker logs
pm2 logs aleph-worker --lines 50

# View recent deployment logs
tail -50 ~/.aleph-logs/aleph-dashboard-deploy.log
```

## Future Improvements

Potential enhancements for future versions:

1. Add FreeBSD/OpenBSD support
2. Add Docker-based deployment option
3. Add health check retry logic with timeout
4. Add deployment notification hooks (Slack, email)
5. Add database migration support
6. Add SSL certificate management (Let's Encrypt)
7. Add pre-deployment test suite execution
8. Add automatic rollback on failed health checks

---

**Last Updated:** 2025-11-17
**Recent Fixes:**
- Added `requirements.txt` for Python dependencies
- Created `config/ecosystem.config.cjs` for PM2 configuration (macOS-specific)
- Fixed PM2 + Doppler integration pattern (use `script: 'doppler'` instead of `interpreter`)
- Added troubleshooting section for common deployment issues
