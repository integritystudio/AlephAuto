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

**Docs Version:** 2.3.20

## Directory Structure

```
docs/
├── ADDING_PIPELINES.md      # How to add a new pipeline/job type
├── API_REFERENCE.md         # REST API endpoints (22 endpoints)
├── MCP_SERVERS.md           # MCP server configuration (Sentry, Redis, etc.)
├── ROADMAP.md               # Future enhancements (Phases 5-7)
├── changelog/               # Versioned release-cycle changelogs
│
├── architecture/            # System architecture and design
│   ├── ERROR_HANDLING.md    # Error handling, circuit breakers, worker registry
│   ├── TYPE_SYSTEM.md       # Zod + TypeScript patterns
│   ├── SYSTEM-DATA-FLOW.md  # System-wide data flow + mermaid diagrams
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
│   ├── DASHBOARD.md         # Operations: quick start, config, troubleshooting
│   ├── DASHBOARD_DESIGN.md  # Design system: layout, tokens, components, patterns
│   └── DATAFLOW_DIAGRAMS.md # System architecture diagrams
│
├── deployment/              # Deployment guides
│   ├── README.md            # Deployment overview
│   ├── TRADITIONAL_SERVER_DEPLOYMENT.md
│   └── VERIFICATION_QUICK_REFERENCE.md
│
├── runbooks/                # Operational runbooks
│   ├── troubleshooting.md   # Debugging guide
│   ├── pipeline-execution.md
│   └── DOPPLER_OUTAGE.md
│
├── setup/                   # Setup and configuration guides
│   ├── DOPPLER_SENTRY_SETUP.md
│   ├── SENTRY_SETUP.md
│   └── DISCORD_QUICKSTART.md
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
- [Adding New Pipelines](./ADDING_PIPELINES.md) - Step-by-step guide to adding a new job type
- [Setup Guide](./setup/DOPPLER_SENTRY_SETUP.md) - Doppler and Sentry configuration
- [Sidequest Installation](./INSTALL.md) - Framework installation
- [Discord Quickstart](./setup/DISCORD_QUICKSTART.md) - Alert notifications

### API & Integration
- [API Reference](./API_REFERENCE.md) - REST API endpoints (22 endpoints)
- [MCP Servers](./MCP_SERVERS.md) - Sentry, Redis, TaskQueue, Filesystem MCP

### Architecture
- [Error Handling](./architecture/ERROR_HANDLING.md) - Error classification, circuit breakers, worker registry
- [Type System](./architecture/TYPE_SYSTEM.md) - Zod + TypeScript patterns
- [System Data Flow](./architecture/SYSTEM-DATA-FLOW.md) - Architecture + mermaid diagrams

### Operations
- [Troubleshooting](./runbooks/troubleshooting.md) - Debugging guide
- [Pipeline Execution](./runbooks/pipeline-execution.md) - Running pipelines
- [Doppler Outage](./runbooks/DOPPLER_OUTAGE.md) - Handling secrets service issues

### Deployment
- [Deployment Guide](./deployment/README.md) - Deployment overview
- [Traditional Server](./deployment/TRADITIONAL_SERVER_DEPLOYMENT.md) - PM2 deployment
- [CI/CD Updates](./archive/CI_CD_UPDATES.md) - GitHub Actions configuration (archived)

### Component Documentation
- [Sidequest Framework](./components/sidequest-alephauto-framework.md) - Core job queue
- [Bugfix Audit](./components/bugfix-audit.md) - Automated bug detection and fixing
- [Dashboard Populate](./components/dashboard-populate.md) - Quality metrics pipeline
- [Git Activity Reporter](./components/GIT-ACTIVITY-REPORTER-README.md)
- [Plugin Manager](./components/plugin-manager.md)

### Dashboard
- [Dashboard Overview](./dashboard_ui/DASHBOARD.md) - Operations, config, troubleshooting
- [Dashboard Design](./dashboard_ui/DASHBOARD_DESIGN.md) - Design system, tokens, components

### Planning
- [Roadmap](./ROADMAP.md) - Future enhancements (Phases 5-7)
- [Release Changelogs](./changelog/CHANGELOG.md) - Versioned progress by release cycle

## Related Documentation

The main project documentation remains in the root-level files:
- `/README.md` - Main project README
- `/CLAUDE.md` - Claude Code instructions

---

**Last Updated:** March 4, 2026
