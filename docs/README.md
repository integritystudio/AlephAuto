# Documentation Index

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "APIReference",
  "name": "Documentation Index",
  "description": "This directory contains all project documentation organized by category.",
  "additionalType": "https://schema.org/TechArticle"
}
</script>


This directory contains all project documentation organized by category.

## Directory Structure

```
docs/
├── API_REFERENCE.md         # REST API endpoints (22 endpoints)
├── MCP_SERVERS.md           # MCP server configuration (Sentry, Redis, etc.)
│
├── architecture/            # System architecture and design
│   ├── CHEAT-SHEET.md       # Quick reference for common patterns
│   ├── ERROR_HANDLING.md    # Error classification and retry logic
│   ├── TYPE_SYSTEM.md       # Zod + TypeScript patterns
│   ├── SYSTEM-DATA-FLOW.md  # System-wide data flow diagrams
│   └── pipeline-data-flow.md
│
├── components/              # Component-specific documentation
│   ├── sidequest-alephauto-framework.md  # Core framework docs
│   ├── claude-health-monitor.md
│   ├── plugin-manager.md
│   ├── GIT-ACTIVITY-REPORTER-README.md
│   └── GITIGNORE_UPDATER_README.md
│
├── dashboard_ui/            # Dashboard UI documentation
│   ├── DASHBOARD.md         # Main dashboard docs
│   ├── DASHBOARD_INDEX.md   # Dashboard feature index
│   └── DATAFLOW_DIAGRAMS.md
│
├── deployment/              # Deployment guides
│   ├── README.md            # Deployment overview
│   ├── TRADITIONAL_SERVER_DEPLOYMENT.md
│   ├── CI_CD_UPDATES.md
│   └── VERIFICATION_QUICK_REFERENCE.md
│
├── runbooks/                # Operational runbooks
│   ├── troubleshooting.md   # Debugging guide
│   ├── pipeline-execution.md
│   ├── DOPPLER_CIRCUIT_BREAKER.md
│   └── DOPPLER_OUTAGE.md
│
├── setup/                   # Setup and configuration guides
│   ├── DOPPLER_SENTRY_SETUP.md
│   ├── SENTRY_SETUP.md
│   ├── DISCORD_QUICKSTART.md
│   └── DNS_CONFIGURATION_GUIDE.md
│
├── testing/                 # Test documentation
│   ├── README.md
│   └── TEST_INFRASTRUCTURE_IMPROVEMENTS.md
│
└── archive/                 # Historical documentation
    └── [archived docs]
```

## Quick Links

### Getting Started
- [Setup Guide](./setup/DOPPLER_SENTRY_SETUP.md) - Doppler and Sentry configuration
- [Sidequest Installation](./components/INSTALL.md) - Framework installation
- [Discord Quickstart](./setup/DISCORD_QUICKSTART.md) - Alert notifications

### API & Integration
- [API Reference](./API_REFERENCE.md) - REST API endpoints (22 endpoints)
- [MCP Servers](./MCP_SERVERS.md) - Sentry, Redis, TaskQueue, Filesystem MCP

### Architecture
- [Cheat Sheet](./architecture/CHEAT-SHEET.md) - Quick reference patterns
- [Error Handling](./architecture/ERROR_HANDLING.md) - Retry logic, circuit breaker
- [Type System](./architecture/TYPE_SYSTEM.md) - Zod + TypeScript patterns
- [System Data Flow](./architecture/SYSTEM-DATA-FLOW.md) - Architecture diagrams

### Operations
- [Troubleshooting](./runbooks/troubleshooting.md) - Debugging guide
- [Pipeline Execution](./runbooks/pipeline-execution.md) - Running pipelines
- [Doppler Outage](./runbooks/DOPPLER_OUTAGE.md) - Handling secrets service issues

### Deployment
- [Deployment Guide](./deployment/README.md) - Deployment overview
- [Traditional Server](./deployment/TRADITIONAL_SERVER_DEPLOYMENT.md) - PM2 deployment
- [CI/CD Updates](./deployment/CI_CD_UPDATES.md) - GitHub Actions configuration

### Component Documentation
- [Sidequest Framework](./components/sidequest-alephauto-framework.md) - Core job queue
- [Git Activity Reporter](./components/GIT-ACTIVITY-REPORTER-README.md)
- [Plugin Manager](./components/plugin-manager.md)

### Dashboard
- [Dashboard Overview](./dashboard_ui/DASHBOARD.md) - Real-time monitoring UI
- [Dashboard Index](./dashboard_ui/DASHBOARD_INDEX.md) - Feature documentation

## Related Documentation

The main project documentation remains in the root-level files:
- `/README.md` - Main project README
- `/CLAUDE.md` - Claude Code instructions

---

**Last Updated:** February 2026
