# Quick Start Guide

**Last Updated**: 2025-11-09 14:16 PST

## Starting a New Session

### 1. Orient Yourself (2 minutes)

```bash
# Navigate to repository
cd /Users/alyshialedlie/code/jobs

# Check what was done last
cat dev/session-handoff.md

# Check git state
git status

# View repository structure
cat claude.md
```

### 2. Review Active Work (1 minute)

```bash
# List active tasks
ls dev/active/

# Read latest task context
cat dev/active/file-tree-generation/context.md
```

### 3. Current Repository State

**Location**: `/Users/alyshialedlie/code/jobs`

**Git Branch**: `main` (up to date with origin)

**Uncommitted Changes**:
- Modified: `repomix-output.xml`
- Untracked: `.repomixignore`, `claude.md`, `repomix.config.json`, `dev/`

**Last Task**: File tree documentation (completed)

## What This Repository Is

An **archive repository** containing:
- 20+ projects in `condense/` directory
- Documentation enhancement tools
- Multi-language projects (Node.js, Python, PHP, Go)
- Heavy logging infrastructure (6000+ log files)

**Not a single-purpose project** - more like a workspace/archive.

## Common Tasks

### View Repository Structure
```bash
cat claude.md
# or regenerate:
tree -a -I '.git|node_modules|.DS_Store' -L 2 --dirsfirst
```

### Check Repository Size
```bash
du -sh .
du -sh condense/*/
```

### View Setup Documentation
```bash
ls ./setup/
cat ./setup/claude-code-setup.md
```

### Clean Old Logs (if needed)
```bash
# Count current logs
find logs/ -name "*.json" | wc -l

# Remove logs older than 30 days
find logs/ -name "*.json" -mtime +30 -delete
```

### Commit Documentation
```bash
git add claude.md dev/
git commit -m "docs: add repository documentation and dev tracking"
```

## Key Files

| File | Purpose |
|------|---------|
| `claude.md` | Repository file tree and structure |
| `dev/session-handoff.md` | Current session state and next steps |
| `dev/README.md` | Dev documentation guide |
| `README.md` | Main repository README |
| `package.json` | Node.js dependencies |
| `repomix.config.json` | Repomix configuration |

## Important Directories

| Directory | Contents |
|-----------|----------|
| `condense/` | Archive of 20+ projects |
| `logs/` | 6000+ operation log files |
| `./setup/` | Installation and setup docs |
| `dev/` | Development documentation |
| `directory-scan-reports/` | Automated scan outputs |

## Red Flags / Things to Know

1. **Large File**: `repomix-output.xml` is 28MB
2. **Many Logs**: Over 6000 log files in `logs/`
3. **Archive Nature**: This isn't a single project
4. **Multi-Language**: Different projects use different languages
5. **Git History**: Only 2 commits (new repository)

## Quick Decisions

**Should I commit changes?**
- Documentation files (claude.md, dev/*): YES
- Config files (.repomixignore, repomix.config.json): MAYBE (review first)
- repomix-output.xml: NO (consider adding to .gitignore)

**Should I clean up logs?**
- If they're old (>30 days): Probably YES
- If they're recent: Keep them for now

**Should I work on something in condense/?**
- Check the project's README first
- It may be archived/inactive
- Ask user for clarification

## Next Steps (Suggested)

Choose based on need:

**A. Continue Documentation**
- Document key projects in condense/
- Create project index
- Add setup guides

**B. Repository Cleanup**
- Clean old log files
- Consolidate configs
- Add .gitignore rules
- Organize condense/ projects

**C. New Development**
- Ask user which project to work on
- Review project-specific README
- Check ./setup/ for dependencies

**D. Exploration**
- Analyze repository metrics
- Map project dependencies
- Review code quality

## Emergency Recovery

If completely lost:

1. You're in `/Users/alyshialedlie/code/jobs`
2. Read `claude.md` for structure overview
3. Read `dev/session-handoff.md` for current state
4. Run `git status` to see changes
5. This is an archive repo, not a single project

## Getting Help

- Check `./setup/` for installation guides
- Review `README.md` for project overview
- Look at `dev/active/*/context.md` for task details
- Read git commit messages: `git log --oneline -10`

## Typical Workflow

```bash
# 1. Start of session
cd /Users/alyshialedlie/code/jobs
cat dev/session-handoff.md
git status

# 2. Work on task
# ... do work ...

# 3. Before context limit
# Update dev/session-handoff.md
# Update dev/active/[task]/context.md
# Commit important changes

# 4. End of session
git add [important-files]
git commit -m "descriptive message"
```

## Environment

- **OS**: macOS (darwin)
- **Location**: `/Users/alyshialedlie/code/jobs`
- **Git**: Branch `main`, remote `origin`
- **Node.js**: Check with `node --version`
- **Python**: Check with `python3 --version`

## That's It!

You're ready to work. Remember:
1. Read session-handoff.md first
2. Check git status
3. Choose your task
4. Update documentation before context limit
