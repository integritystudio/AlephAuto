#!/bin/bash
#
# Traditional Server Deployment Script
# Automates deployment of AlephAuto Dashboard to a VPS/dedicated server
#
# Usage:
#   ./scripts/deploy-traditional-server.sh [--setup|--update|--rollback]
#
# Options:
#   --setup     Initial server setup (dependencies, PM2, Nginx)
#   --update    Update application code and restart services
#   --rollback  Rollback to previous version
#

set -e  # Exit on error
set -u  # Exit on undefined variable

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="aleph-dashboard"
APP_DIR="/var/www/${APP_NAME}"
BACKUP_DIR="/var/backups/${APP_NAME}"
NGINX_SITE="/etc/nginx/sites-available/${APP_NAME}"
LOG_FILE="/var/log/${APP_NAME}-deploy.log"

# Functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

# Check if running as root or with sudo
check_sudo() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run with sudo privileges"
    fi
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Initial setup
setup_server() {
    log "Starting initial server setup..."

    # Update system
    log "Updating system packages..."
    apt update && apt upgrade -y

    # Install Node.js
    if ! command_exists node; then
        log "Installing Node.js 20.x..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    else
        info "Node.js already installed: $(node --version)"
    fi

    # Install Python 3.11
    if ! command_exists python3.11; then
        log "Installing Python 3.11..."
        apt install -y software-properties-common
        add-apt-repository -y ppa:deadsnakes/ppa
        apt update
        apt install -y python3.11 python3.11-venv python3.11-dev python3-pip build-essential
    else
        info "Python 3.11 already installed: $(python3.11 --version)"
    fi

    # Install Redis
    if ! command_exists redis-cli; then
        log "Installing Redis..."
        apt install -y redis-server
        systemctl enable redis-server
        systemctl start redis-server
    else
        info "Redis already installed: $(redis-cli --version)"
    fi

    # Install PM2
    if ! command_exists pm2; then
        log "Installing PM2..."
        npm install -g pm2
        pm2 startup systemd -u $(logname) --hp /home/$(logname)
    else
        info "PM2 already installed: $(pm2 --version)"
    fi

    # Install Doppler
    if ! command_exists doppler; then
        log "Installing Doppler CLI..."
        curl -sLf --retry 3 --tlsv1.2 --proto "=https" 'https://packages.doppler.com/public/cli/gpg.DE2A7741.key' | apt-key add -
        echo "deb https://packages.doppler.com/public/cli/deb/debian any-version main" | tee /etc/apt/sources.list.d/doppler-cli.list
        apt-get update
        apt-get install -y doppler
    else
        info "Doppler already installed: $(doppler --version)"
    fi

    # Install Nginx
    if ! command_exists nginx; then
        log "Installing Nginx..."
        apt install -y nginx
        systemctl enable nginx
        systemctl start nginx
    else
        info "Nginx already installed: $(nginx -v 2>&1)"
    fi

    # Install UFW firewall
    if ! command_exists ufw; then
        log "Installing UFW firewall..."
        apt install -y ufw
    fi

    # Configure firewall
    log "Configuring firewall..."
    ufw --force enable
    ufw allow OpenSSH
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw status

    # Create application directory
    log "Creating application directory..."
    mkdir -p "$APP_DIR"
    mkdir -p "$BACKUP_DIR"
    mkdir -p "$(dirname "$LOG_FILE")"

    # Create deployment user (if not exists)
    if ! id -u aleph >/dev/null 2>&1; then
        log "Creating deployment user 'aleph'..."
        adduser aleph --disabled-password --gecos ""
        chown -R aleph:aleph "$APP_DIR"
    fi

    log "✅ Server setup completed successfully!"
    info "Next steps:"
    info "  1. Login to Doppler: doppler login"
    info "  2. Set up Doppler project: cd $APP_DIR && doppler setup"
    info "  3. Clone repository to $APP_DIR"
    info "  4. Run: sudo $0 --update"
}

# Update application
update_application() {
    log "Starting application update..."

    # Check if application directory exists
    if [[ ! -d "$APP_DIR" ]]; then
        error "Application directory not found: $APP_DIR"
    fi

    cd "$APP_DIR"

    # Create backup
    log "Creating backup..."
    BACKUP_FILE="$BACKUP_DIR/backup-$(date +%Y%m%d_%H%M%S).tar.gz"
    tar -czf "$BACKUP_FILE" \
        --exclude='node_modules' \
        --exclude='venv' \
        --exclude='logs' \
        -C "$(dirname "$APP_DIR")" "$(basename "$APP_DIR")"
    log "Backup created: $BACKUP_FILE"

    # Pull latest code
    if [[ -d .git ]]; then
        log "Pulling latest code from git..."
        sudo -u aleph git pull origin main || warn "Git pull failed, using existing code"
    else
        warn "Not a git repository, skipping git pull"
    fi

    # Install Node.js dependencies
    log "Installing Node.js dependencies..."
    sudo -u aleph npm ci --production

    # Install/Update Python dependencies
    log "Setting up Python virtual environment..."
    if [[ ! -d venv ]]; then
        sudo -u aleph python3.11 -m venv venv
    fi

    log "Installing Python dependencies..."
    sudo -u aleph bash -c "source venv/bin/activate && pip install --upgrade pip && pip install -r requirements.txt"

    # Set correct permissions
    log "Setting permissions..."
    chown -R aleph:aleph "$APP_DIR"
    chmod -R 755 "$APP_DIR"

    # Restart PM2 processes
    log "Restarting PM2 processes..."
    sudo -u aleph bash -c "cd $APP_DIR && pm2 restart all || pm2 start ecosystem.config.js"
    sudo -u aleph pm2 save

    # Reload Nginx
    log "Reloading Nginx..."
    nginx -t && systemctl reload nginx

    # Health check
    log "Performing health check..."
    sleep 3
    if curl -f http://localhost:8080/health >/dev/null 2>&1; then
        log "✅ Health check passed!"
    else
        warn "Health check failed, check logs with: pm2 logs"
    fi

    # Check PM2 status
    log "PM2 Status:"
    sudo -u aleph pm2 status

    log "✅ Application updated successfully!"
}

# Rollback to previous version
rollback_application() {
    log "Starting rollback..."

    # Check if backup directory exists
    if [[ ! -d "$BACKUP_DIR" ]]; then
        error "Backup directory not found: $BACKUP_DIR"
    fi

    # Find latest backup
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/backup-*.tar.gz 2>/dev/null | head -1)

    if [[ -z "$LATEST_BACKUP" ]]; then
        error "No backup found in $BACKUP_DIR"
    fi

    log "Rolling back to: $LATEST_BACKUP"

    # Stop PM2 processes
    log "Stopping PM2 processes..."
    sudo -u aleph pm2 stop all

    # Remove current application
    log "Removing current application..."
    rm -rf "${APP_DIR:?}"/*

    # Restore from backup
    log "Restoring from backup..."
    tar -xzf "$LATEST_BACKUP" -C "$(dirname "$APP_DIR")"

    cd "$APP_DIR"

    # Reinstall dependencies
    log "Reinstalling dependencies..."
    sudo -u aleph npm ci --production
    sudo -u aleph bash -c "source venv/bin/activate && pip install -r requirements.txt"

    # Restart PM2 processes
    log "Restarting PM2 processes..."
    sudo -u aleph bash -c "cd $APP_DIR && pm2 restart all"
    sudo -u aleph pm2 save

    # Reload Nginx
    log "Reloading Nginx..."
    systemctl reload nginx

    # Health check
    log "Performing health check..."
    sleep 3
    if curl -f http://localhost:8080/health >/dev/null 2>&1; then
        log "✅ Health check passed!"
    else
        warn "Health check failed, check logs with: pm2 logs"
    fi

    log "✅ Rollback completed successfully!"
}

# Show status
show_status() {
    log "=== System Status ==="

    info "PM2 Processes:"
    sudo -u aleph pm2 status

    info ""
    info "Nginx Status:"
    systemctl status nginx --no-pager -l

    info ""
    info "Redis Status:"
    systemctl status redis-server --no-pager -l

    info ""
    info "Health Check:"
    curl -s http://localhost:8080/health | jq . 2>/dev/null || curl -s http://localhost:8080/health

    info ""
    info "Disk Usage:"
    df -h "$APP_DIR"

    info ""
    info "Memory Usage:"
    free -h

    info ""
    info "Recent Logs:"
    sudo -u aleph pm2 logs --nostream --lines 10
}

# Main script
main() {
    case "${1:-}" in
        --setup)
            check_sudo
            setup_server
            ;;
        --update)
            check_sudo
            update_application
            ;;
        --rollback)
            check_sudo
            rollback_application
            ;;
        --status)
            show_status
            ;;
        *)
            echo "AlephAuto Dashboard - Traditional Server Deployment"
            echo ""
            echo "Usage: $0 [OPTION]"
            echo ""
            echo "Options:"
            echo "  --setup      Initial server setup (install dependencies)"
            echo "  --update     Update application and restart services"
            echo "  --rollback   Rollback to previous backup"
            echo "  --status     Show current system status"
            echo ""
            echo "Examples:"
            echo "  sudo $0 --setup     # First-time server setup"
            echo "  sudo $0 --update    # Deploy new version"
            echo "  sudo $0 --rollback  # Revert to previous version"
            echo "  $0 --status         # Check current status"
            echo ""
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
