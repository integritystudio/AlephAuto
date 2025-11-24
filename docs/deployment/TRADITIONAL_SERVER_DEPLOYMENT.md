# Traditional Server Deployment Guide
## PM2 + Doppler + Nginx Setup

Complete step-by-step guide for deploying AlephAuto Dashboard to a traditional VPS or dedicated server using PM2 for process management, Doppler for secrets, and Nginx as a reverse proxy.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Server Setup](#server-setup)
3. [Install Dependencies](#install-dependencies)
4. [Configure Doppler](#configure-doppler)
5. [Deploy Application](#deploy-application)
6. [Configure PM2](#configure-pm2)
7. [Configure Nginx](#configure-nginx)
8. [SSL/HTTPS Setup](#sslhttps-setup)
9. [Monitoring & Logging](#monitoring--logging)
10. [Maintenance](#maintenance)
11. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Server Requirements

- **OS:** Ubuntu 20.04+ or Debian 11+ (or similar Linux distribution)
- **RAM:** Minimum 2GB (4GB recommended)
- **CPU:** 2+ cores recommended
- **Disk:** 20GB+ available
- **Access:** SSH access with sudo privileges

### Local Requirements

- SSH client
- Git (for cloning repository)
- Domain name (optional, but recommended for HTTPS)

### Accounts Needed

- **Doppler Account**: For secrets management (free tier available)
- **GitHub Account**: For repository access

---

## Server Setup

### 1. Connect to Server

```bash
ssh user@your-server-ip
```

### 2. Update System

```bash
sudo apt update
sudo apt upgrade -y
```

### 3. Create Deployment User (Recommended)

```bash
# Create user for running the application
sudo adduser aleph --disabled-password --gecos ""

# Add to sudo group (optional)
sudo usermod -aG sudo aleph

# Switch to deployment user
sudo su - aleph
cd ~
```

### 4. Set Up Firewall

```bash
# Install UFW if not already installed
sudo apt install ufw -y

# Allow SSH
sudo ufw allow OpenSSH

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw --force enable

# Check status
sudo ufw status
```

---

## Install Dependencies

### 1. Install Node.js 20.x

Using NodeSource repository (recommended method from environment-setup-analyzer):

```bash
# Download and run NodeSource setup script
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install Node.js
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

### 2. Install Python 3.11

```bash
# Add deadsnakes PPA for Python 3.11
sudo apt install software-properties-common -y
sudo add-apt-repository ppa:deadsnakes/ppa -y
sudo apt update

# Install Python 3.11 and related packages
sudo apt install -y \
  python3.11 \
  python3.11-venv \
  python3.11-dev \
  python3-pip \
  build-essential

# Verify installation
python3.11 --version  # Should show Python 3.11.x
```

### 3. Install Redis

```bash
# Install Redis server
sudo apt install redis-server -y

# Configure Redis to start on boot
sudo systemctl enable redis-server

# Start Redis
sudo systemctl start redis-server

# Verify Redis is running
redis-cli ping  # Should return "PONG"

# Check Redis status
sudo systemctl status redis-server
```

### 4. Install PM2

```bash
# Install PM2 globally
sudo npm install -g pm2

# Verify installation
pm2 --version

# Set up PM2 to start on boot
pm2 startup systemd
# Follow the command it outputs (will be something like):
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u aleph --hp /home/aleph
```

### 5. Install Doppler CLI

```bash
# Install Doppler CLI using the official installer
curl -sLf --retry 3 --tlsv1.2 --proto "=https" 'https://packages.doppler.com/public/cli/gpg.DE2A7741.key' | sudo apt-key add -

# Add Doppler repository
echo "deb https://packages.doppler.com/public/cli/deb/debian any-version main" | sudo tee /etc/apt/sources.list.d/doppler-cli.list

# Update and install
sudo apt-get update
sudo apt-get install doppler

# Verify installation
doppler --version
```

### 6. Install Nginx

```bash
# Install Nginx
sudo apt install nginx -y

# Enable Nginx to start on boot
sudo systemctl enable nginx

# Start Nginx
sudo systemctl start nginx

# Verify Nginx is running
sudo systemctl status nginx

# Test default page (should show Nginx welcome page)
curl http://localhost
```

---

## Configure Doppler

### 1. Login to Doppler

```bash
# Login to Doppler (will open browser)
doppler login

# Verify login
doppler me
```

### 2. Set Up Doppler Project

**Option A: Link Existing Project**

```bash
# Navigate to your application directory
cd /var/www/aleph-dashboard

# Link to existing Doppler project
doppler setup

# Select your project and config (e.g., "jobs" project, "production" config)
```

**Option B: Create New Project**

```bash
# Create project via CLI
doppler projects create jobs

# Navigate to your application directory
cd /var/www/aleph-dashboard

# Link to project
doppler setup --project jobs --config production
```

### 3. Configure Required Secrets

```bash
# Set environment variables in Doppler
doppler secrets set NODE_ENV=production
doppler secrets set JOBS_API_PORT=8080
doppler secrets set REDIS_HOST=localhost
doppler secrets set REDIS_PORT=6379

# Set Sentry DSN (if using Sentry)
doppler secrets set SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# Set cron schedules (optional)
doppler secrets set CRON_SCHEDULE="0 2 * * *"
doppler secrets set DOC_CRON_SCHEDULE="0 3 * * *"
doppler secrets set GIT_CRON_SCHEDULE="0 20 * * 0"
doppler secrets set PLUGIN_CRON_SCHEDULE="0 9 * * 1"

# Verify secrets
doppler secrets
```

### 4. Generate Service Token (for PM2)

```bash
# Generate a service token for the production config
doppler configs tokens create pm2-production --config production

# Copy the token (you'll need it for PM2 configuration)
# Token format: dp.st.production.xxxxxxxxxxxxxxxxxxxxx
```

**Save this token securely!** You'll need it for PM2 ecosystem configuration.

---

## Deploy Application

### 1. Clone Repository

```bash
# Create deployment directory
sudo mkdir -p /var/www/aleph-dashboard
sudo chown aleph:aleph /var/www/aleph-dashboard

# Clone repository
cd /var/www/aleph-dashboard
git clone <your-repo-url> .

# Or if already cloned locally, use rsync to deploy
# From local machine:
# rsync -avz --exclude 'node_modules' --exclude 'venv' ./ aleph@your-server:/var/www/aleph-dashboard/
```

### 2. Install Node.js Dependencies

```bash
cd /var/www/aleph-dashboard

# Install production dependencies only
npm ci --production

# Verify critical files exist
ls -la public/index.html api/server.js
```

### 3. Install Python Dependencies

```bash
cd /var/www/aleph-dashboard

# Create virtual environment
python3.11 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install dependencies
pip install -r requirements.txt

# Deactivate for now
deactivate

# Verify Python packages
./venv/bin/pip list
```

### 4. Set Correct Permissions

```bash
# Set ownership
sudo chown -R aleph:aleph /var/www/aleph-dashboard

# Set permissions
sudo chmod -R 755 /var/www/aleph-dashboard

# Make scripts executable if needed
chmod +x scripts/*.sh 2>/dev/null || true
```

---

## Configure PM2

### 1. Create PM2 Ecosystem File

Create `ecosystem.config.js` in the project root:

```bash
cd /var/www/aleph-dashboard
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'aleph-dashboard',
      script: 'api/server.js',
      cwd: '/var/www/aleph-dashboard',
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        DOPPLER_TOKEN: 'dp.st.production.YOUR_TOKEN_HERE'
      },
      error_file: '/var/www/aleph-dashboard/logs/pm2-error.log',
      out_file: '/var/www/aleph-dashboard/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      interpreter: 'doppler',
      interpreter_args: 'run --'
    },
    {
      name: 'aleph-worker',
      script: 'pipelines/duplicate-detection-pipeline.js',
      cwd: '/var/www/aleph-dashboard',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        DOPPLER_TOKEN: 'dp.st.production.YOUR_TOKEN_HERE'
      },
      error_file: '/var/www/aleph-dashboard/logs/worker-error.log',
      out_file: '/var/www/aleph-dashboard/logs/worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      interpreter: 'doppler',
      interpreter_args: 'run --'
    }
  ]
};
EOF
```

**Replace `YOUR_TOKEN_HERE` with your Doppler service token!**

### 2. Alternative: Using Doppler Directly

If you prefer not to store the token in the file:

```bash
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'aleph-dashboard',
      script: 'api/server.js',
      cwd: '/var/www/aleph-dashboard',
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      error_file: '/var/www/aleph-dashboard/logs/pm2-error.log',
      out_file: '/var/www/aleph-dashboard/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
EOF

# Then start with doppler run
doppler run -- pm2 start ecosystem.config.js
```

### 3. Create Logs Directory

```bash
mkdir -p /var/www/aleph-dashboard/logs
```

### 4. Start Applications with PM2

```bash
cd /var/www/aleph-dashboard

# Start using ecosystem file
pm2 start ecosystem.config.js

# Or start dashboard only
doppler run -- pm2 start api/server.js --name aleph-dashboard -i 2

# View status
pm2 status

# View logs
pm2 logs aleph-dashboard --lines 50
```

### 5. Save PM2 Configuration

```bash
# Save current PM2 processes
pm2 save

# Verify saved configuration
cat ~/.pm2/dump.pm2
```

### 6. Test Application

```bash
# Wait a few seconds for startup
sleep 5

# Test health endpoint
curl http://localhost:8080/health

# Expected output:
# {"status":"healthy","timestamp":"2025-11-17T...","version":"1.0.0"}

# Test dashboard
curl -I http://localhost:8080/

# Should return HTTP 200 OK
```

---

## Configure Nginx

### 1. Create Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/aleph-dashboard
```

**Basic Configuration:**

```nginx
# Basic HTTP configuration
server {
    listen 80;
    listen [::]:80;

    server_name your-domain.com www.your-domain.com;

    # Logging
    access_log /var/log/nginx/aleph-dashboard-access.log;
    error_log /var/log/nginx/aleph-dashboard-error.log;

    # Proxy settings
    proxy_http_version 1.1;
    proxy_cache_bypass $http_upgrade;

    # Proxy headers
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Dashboard and API
    location / {
        proxy_pass http://localhost:8080;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Static files caching
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://localhost:8080;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

**Advanced Configuration with Rate Limiting:**

```nginx
# Rate limiting zone
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=dashboard_limit:10m rate=30r/s;

# Upstream configuration
upstream aleph_backend {
    least_conn;
    server localhost:8080 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;

    server_name your-domain.com www.your-domain.com;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Logging
    access_log /var/log/nginx/aleph-dashboard-access.log;
    error_log /var/log/nginx/aleph-dashboard-error.log warn;

    # Client upload size
    client_max_body_size 10M;

    # Dashboard (with rate limiting)
    location / {
        limit_req zone=dashboard_limit burst=20 nodelay;

        proxy_pass http://aleph_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        # Buffer settings
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 24 4k;
        proxy_busy_buffers_size 8k;
        proxy_max_temp_file_size 2048m;
        proxy_temp_file_write_size 32k;
    }

    # API endpoints (stricter rate limiting)
    location /api/ {
        limit_req zone=api_limit burst=5 nodelay;

        proxy_pass http://aleph_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health check (no rate limiting)
    location /health {
        proxy_pass http://aleph_backend;
        access_log off;
    }

    # WebSocket (no rate limiting)
    location /ws {
        proxy_pass http://aleph_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # Static files with aggressive caching
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://aleph_backend;
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Deny access to sensitive files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
```

### 2. Enable Site Configuration

```bash
# Create symbolic link to enable site
sudo ln -s /etc/nginx/sites-available/aleph-dashboard /etc/nginx/sites-enabled/

# Remove default site (optional)
sudo rm /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

# If test passes, reload Nginx
sudo systemctl reload nginx
```

### 3. Test Nginx Configuration

```bash
# Check Nginx status
sudo systemctl status nginx

# Test from local machine (replace with your server IP or domain)
curl http://your-server-ip/health

# Should return:
# {"status":"healthy","timestamp":"...","version":"1.0.0"}

# Test dashboard HTML
curl http://your-server-ip/ | head -20
```

---

## SSL/HTTPS Setup

### Using Certbot (Let's Encrypt - Free)

### 1. Install Certbot

```bash
# Install Certbot and Nginx plugin
sudo apt install certbot python3-certbot-nginx -y
```

### 2. Obtain SSL Certificate

```bash
# Replace with your actual email and domain
sudo certbot --nginx -d your-domain.com -d www.your-domain.com --email your-email@example.com --agree-tos --no-eff-email

# Certbot will automatically:
# 1. Obtain the certificate
# 2. Modify your Nginx configuration
# 3. Set up automatic renewal
```

### 3. Test SSL Configuration

```bash
# Test HTTPS
curl -I https://your-domain.com/health

# Check SSL certificate
openssl s_client -connect your-domain.com:443 -servername your-domain.com < /dev/null
```

### 4. Set Up Auto-Renewal

```bash
# Certbot installs a systemd timer for auto-renewal
# Verify it's active
sudo systemctl status certbot.timer

# Test renewal process (dry run)
sudo certbot renew --dry-run

# Manual renewal if needed
sudo certbot renew
```

### Final Nginx Configuration (with SSL)

After Certbot, your config will look like:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name your-domain.com www.your-domain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;

    server_name your-domain.com www.your-domain.com;

    # SSL configuration (added by Certbot)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/your-domain.com/chain.pem;

    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256...';
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_stapling on;
    ssl_stapling_verify on;

    # Rest of your configuration...
}
```

---

## Monitoring & Logging

### 1. PM2 Monitoring

```bash
# Real-time monitoring
pm2 monit

# View logs
pm2 logs aleph-dashboard --lines 100

# View error logs only
pm2 logs aleph-dashboard --err

# Clear logs
pm2 flush

# View process information
pm2 info aleph-dashboard

# View PM2 dashboard (web interface)
pm2 web
# Access at http://localhost:9615
```

### 2. Set Up PM2 Log Rotation

```bash
# Install PM2 log rotate module
pm2 install pm2-logrotate

# Configure log rotation (keep 30 days of logs)
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
```

### 3. Nginx Logs

```bash
# View access logs
sudo tail -f /var/log/nginx/aleph-dashboard-access.log

# View error logs
sudo tail -f /var/log/nginx/aleph-dashboard-error.log

# View all Nginx logs
sudo journalctl -u nginx -f

# Analyze access patterns
sudo cat /var/log/nginx/aleph-dashboard-access.log | awk '{print $1}' | sort | uniq -c | sort -rn | head -10
```

### 4. System Monitoring

```bash
# Install htop for better process monitoring
sudo apt install htop -y

# Monitor system resources
htop

# Check disk space
df -h

# Check memory usage
free -h

# Check Redis memory usage
redis-cli info memory

# Check PM2 memory usage
pm2 list
```

### 5. Set Up Monitoring Alerts (Optional)

**Install monitoring tools:**

```bash
# Install netdata for comprehensive monitoring
bash <(curl -Ss https://my-netdata.io/kickstart.sh)

# Access Netdata dashboard
# http://your-server-ip:19999
```

---

## Maintenance

### Regular Maintenance Tasks

### 1. Update Application

```bash
# Navigate to application directory
cd /var/www/aleph-dashboard

# Pull latest changes
git pull origin main

# Install new dependencies
npm ci --production

# Update Python dependencies
source venv/bin/activate
pip install -r requirements.txt --upgrade
deactivate

# Restart PM2 processes
pm2 restart all

# Save PM2 configuration
pm2 save
```

### 2. Update System Packages

```bash
# Update package lists
sudo apt update

# Upgrade packages
sudo apt upgrade -y

# Upgrade Node.js (if needed)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Restart services after updates
pm2 restart all
sudo systemctl restart nginx
```

### 3. Database/Cache Maintenance

```bash
# Clear Redis cache if needed
redis-cli FLUSHALL

# Backup Redis data
redis-cli SAVE
sudo cp /var/lib/redis/dump.rdb /var/backups/redis-$(date +%Y%m%d).rdb

# Check Redis memory usage
redis-cli info memory

# Optimize Redis if needed
redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

### 4. Log Rotation & Cleanup

```bash
# PM2 logs are handled by pm2-logrotate

# Nginx logs (configure in /etc/logrotate.d/nginx)
sudo nano /etc/logrotate.d/nginx

# Application logs cleanup script
cat > /home/aleph/cleanup-logs.sh << 'EOF'
#!/bin/bash
# Clean up logs older than 30 days
find /var/www/aleph-dashboard/logs -name "*.log" -mtime +30 -delete
EOF

chmod +x /home/aleph/cleanup-logs.sh

# Add to crontab
crontab -e
# Add: 0 2 * * * /home/aleph/cleanup-logs.sh
```

### 5. Backup Strategy

```bash
# Create backup script
cat > /home/aleph/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/aleph-dashboard"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup application code
tar -czf $BACKUP_DIR/app-$DATE.tar.gz -C /var/www aleph-dashboard \
  --exclude='node_modules' \
  --exclude='venv' \
  --exclude='logs'

# Backup Doppler secrets (as JSON)
cd /var/www/aleph-dashboard
doppler secrets download --no-file --format json > $BACKUP_DIR/secrets-$DATE.json

# Backup Redis
sudo cp /var/lib/redis/dump.rdb $BACKUP_DIR/redis-$DATE.rdb

# Backup Nginx config
sudo cp /etc/nginx/sites-available/aleph-dashboard $BACKUP_DIR/nginx-$DATE.conf

# Remove backups older than 7 days
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
find $BACKUP_DIR -name "*.json" -mtime +7 -delete
find $BACKUP_DIR -name "*.rdb" -mtime +7 -delete

echo "Backup completed: $DATE"
EOF

chmod +x /home/aleph/backup.sh

# Add to crontab (daily at 3 AM)
crontab -e
# Add: 0 3 * * * /home/aleph/backup.sh >> /var/log/backup.log 2>&1
```

---

## Troubleshooting

### Common Issues & Solutions

### 1. PM2 Process Crashes

```bash
# Check PM2 logs
pm2 logs aleph-dashboard --lines 100 --err

# Check if port is already in use
sudo lsof -i :8080

# Restart process
pm2 restart aleph-dashboard

# If still failing, delete and recreate
pm2 delete aleph-dashboard
doppler run -- pm2 start api/server.js --name aleph-dashboard -i 2
pm2 save
```

### 2. Doppler Authentication Issues

```bash
# Re-login to Doppler
doppler login

# Verify authentication
doppler me

# Check project configuration
doppler setup
cd /var/www/aleph-dashboard && cat .doppler/.doppler.yaml

# Test secrets access
doppler secrets

# Generate new service token if needed
doppler configs tokens create pm2-production-new --config production
```

### 3. Nginx 502 Bad Gateway

```bash
# Check if application is running
curl http://localhost:8080/health

# Check PM2 status
pm2 status

# Check Nginx error logs
sudo tail -f /var/log/nginx/aleph-dashboard-error.log

# Check Nginx configuration
sudo nginx -t

# Restart services
pm2 restart all
sudo systemctl restart nginx
```

### 4. Redis Connection Issues

```bash
# Check Redis status
sudo systemctl status redis-server

# Test Redis connection
redis-cli ping

# Check Redis logs
sudo journalctl -u redis-server -n 50

# Restart Redis
sudo systemctl restart redis-server

# Check Redis configuration
sudo nano /etc/redis/redis.conf
# Ensure: bind 127.0.0.1 ::1
# Ensure: protected-mode yes
```

### 5. SSL Certificate Issues

```bash
# Check certificate expiry
sudo certbot certificates

# Renew certificate manually
sudo certbot renew

# Test renewal
sudo certbot renew --dry-run

# If renewal fails, check logs
sudo cat /var/log/letsencrypt/letsencrypt.log

# Force renewal if needed
sudo certbot renew --force-renewal
```

### 6. High Memory Usage

```bash
# Check memory usage
free -h

# Check which process is using memory
ps aux --sort=-%mem | head -10

# Check PM2 memory usage
pm2 list

# Restart processes to clear memory
pm2 restart all

# Set memory limit for PM2 processes
pm2 delete aleph-dashboard
pm2 start api/server.js --name aleph-dashboard --max-memory-restart 500M -i 2
pm2 save
```

### 7. Disk Space Issues

```bash
# Check disk space
df -h

# Find large files
sudo du -h / | sort -rh | head -20

# Clean up old logs
sudo find /var/log -name "*.log" -mtime +30 -delete
pm2 flush

# Clean up old backups
sudo find /var/backups -mtime +7 -delete

# Clean npm cache
npm cache clean --force

# Clean apt cache
sudo apt clean
sudo apt autoclean
sudo apt autoremove -y
```

### 8. WebSocket Connection Issues

```bash
# Check Nginx WebSocket configuration
sudo nginx -t
sudo nano /etc/nginx/sites-available/aleph-dashboard

# Ensure these headers are present:
# proxy_set_header Upgrade $http_upgrade;
# proxy_set_header Connection "upgrade";

# Reload Nginx
sudo systemctl reload nginx

# Test WebSocket from another terminal
# Install wscat: npm install -g wscat
wscat -c ws://your-domain.com/ws
```

---

## Performance Tuning

### 1. PM2 Clustering

```bash
# Run in cluster mode (utilizes all CPU cores)
pm2 delete aleph-dashboard
pm2 start api/server.js --name aleph-dashboard -i max
pm2 save

# Or specify number of instances
pm2 start api/server.js --name aleph-dashboard -i 4
```

### 2. Nginx Optimization

Add to `/etc/nginx/nginx.conf`:

```nginx
# Worker processes (set to number of CPU cores)
worker_processes auto;

# Worker connections
events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

# Optimize http block
http {
    # Sendfile
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;

    # Keepalive
    keepalive_timeout 65;
    keepalive_requests 100;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript
               application/x-javascript application/xml+rss application/json;

    # Buffer sizes
    client_body_buffer_size 128k;
    client_max_body_size 10m;
    client_header_buffer_size 1k;
    large_client_header_buffers 4 4k;

    # File descriptors
    open_file_cache max=2000 inactive=20s;
    open_file_cache_valid 60s;
    open_file_cache_min_uses 5;
    open_file_cache_errors off;
}
```

Reload Nginx after changes:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 3. Redis Optimization

Edit `/etc/redis/redis.conf`:

```bash
# Memory optimization
maxmemory 256mb
maxmemory-policy allkeys-lru

# Persistence (if needed)
save 900 1
save 300 10
save 60 10000

# Restart Redis
sudo systemctl restart redis-server
```

---

## Quick Reference Commands

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

# Update application
cd /var/www/aleph-dashboard
git pull
npm ci --production
pm2 restart all
```

### Emergency Commands

```bash
# Stop everything
pm2 stop all
sudo systemctl stop nginx

# Start everything
pm2 start all
sudo systemctl start nginx

# Full restart
pm2 restart all
sudo systemctl restart nginx
sudo systemctl restart redis-server

# Check what's using port 8080
sudo lsof -i :8080

# Kill process on port 8080
sudo kill -9 $(sudo lsof -t -i:8080)
```

---

## Security Checklist

- [ ] Firewall configured (UFW enabled)
- [ ] SSH key authentication only (disable password auth)
- [ ] Fail2ban installed and configured
- [ ] Regular security updates scheduled
- [ ] SSL/HTTPS enabled with valid certificate
- [ ] Nginx security headers configured
- [ ] Rate limiting enabled
- [ ] Sensitive files denied in Nginx
- [ ] Doppler secrets used (not .env files)
- [ ] Redis protected mode enabled
- [ ] Regular backups automated
- [ ] Monitoring and alerting configured

---

## Next Steps

1. Set up monitoring (Netdata, PM2 Plus, or Datadog)
2. Configure automated backups to remote storage
3. Set up CI/CD pipeline (GitHub Actions)
4. Configure log aggregation (ELK stack or similar)
5. Set up uptime monitoring (UptimeRobot, Pingdom)
6. Configure alerts (email, Slack, PagerDuty)

---

## Additional Resources

- [PM2 Documentation](https://pm2.keymetrics.io/docs/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [Doppler Documentation](https://docs.doppler.com/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [Redis Documentation](https://redis.io/documentation)

---

**Last Updated:** 2025-11-17
**Deployment Method:** Traditional Server (PM2 + Doppler + Nginx)
**Difficulty:** Intermediate
**Estimated Setup Time:** 1-2 hours
