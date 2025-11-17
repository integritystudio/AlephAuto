# Documentation Index

**Last Updated**: 2025-11-09 14:17 PST

Quick reference to all documentation in this repository.

## Start Here

| Document | When to Read | Purpose |
|----------|--------------|---------|
| **[QUICKSTART.md](QUICKSTART.md)** | First thing every session | Fast orientation and common tasks |
| **[session-handoff.md](session-handoff.md)** | Start of each session | Current state and next steps |
| **[README.md](README.md)** | When confused about dev docs | Dev documentation system guide |

## Repository Documentation

| Document | Location | Purpose |
|----------|----------|---------|
| Repository Structure | `../claude.md` | Complete file tree and directory overview |
| Main README | `../README.md` | Project overview and introduction |
| Setup Files | `.././setup/` | Installation and configuration guides |

## Active Tasks

Current active development tasks with context and task tracking:

| Task | Status | Location |
|------|--------|----------|
| File Tree Generation | ✅ Complete | [active/file-tree-generation/](active/file-tree-generation/) |

## Task Documentation Template

Each active task should have:
- `context.md` - Current state, decisions, blockers
- `tasks.md` - Task list with status markers

## Session Documentation

| Document | Purpose | Update Frequency |
|----------|---------|------------------|
| session-handoff.md | Session state transfer | End of each session |
| active/*/context.md | Task implementation details | During/end of task |
| active/*/tasks.md | Task completion tracking | As tasks progress |

## Setup Documentation

Located in `.././setup/`:

| File | Purpose |
|------|---------|
| brew-installed-packages.txt | Homebrew package list |
| claude-code-setup.md | Claude Code setup guide |
| doppler-setup-guide.md | Doppler configuration guide |
| doppler-test-fix-summary.md | Doppler troubleshooting |
| fix-history.md | Bug fix history |
| node-setup-history.md | Node.js setup history |
| repomix-implementation-log.md | Repomix setup log |
| terminal-journal.md | Terminal session notes |
| webscraper-setup.md | Web scraper setup guide |

## Configuration Files

| File | Purpose | Location |
|------|---------|----------|
| repomix.config.json | Repomix configuration | Root & subdirs |
| .repomixignore | Repomix ignore patterns | Root |
| package.json | Node.js dependencies | Root |
| tsconfig.json | TypeScript config | Root |
| .env | Environment variables | Root (not tracked) |
| .env.example | Env var template | Root |

## Code Documentation

| File | Purpose | Location |
|------|---------|----------|
| doc-enhancement-pipeline.js | Doc enhancement script | Root |
| index.js | Main entry point | Root |

## Generated Documentation

| Directory | Contents | Purpose |
|-----------|----------|---------|
| directory-scan-reports/ | Scan outputs | Automated directory scans |
| document-enhancement-impact-measurement/ | Enhancement reports | Doc quality tracking |
| logs/ | Operation logs | Repomix operation logs (6000+ files) |

## External Resources

Links to external documentation (add as needed):
- Project websites
- API documentation
- Third-party library docs
- Related repositories

## Documentation by Use Case

### "I'm starting a new session"
1. Read [QUICKSTART.md](QUICKSTART.md)
2. Read [session-handoff.md](session-handoff.md)
3. Run `git status`

### "I want to understand the repository"
1. Read `../claude.md` (file tree)
2. Read `../README.md` (overview)
3. Explore specific project directories

### "I'm working on a task"
1. Read `active/[task-name]/context.md`
2. Check `active/[task-name]/tasks.md`
3. Update as you work

### "I need to set something up"
1. Check `.././setup/` directory
2. Look for relevant setup guide
3. Follow configuration steps

### "I'm approaching context limit"
1. Update [session-handoff.md](session-handoff.md)
2. Update `active/*/context.md` files
3. Update `active/*/tasks.md` files
4. Commit important changes

### "I want to continue previous work"
1. Read [session-handoff.md](session-handoff.md)
2. Check git status for uncommitted changes
3. Review relevant `active/*/context.md`

## Document Maintenance

### Regular Updates
- **session-handoff.md**: End of every session
- **active/*/context.md**: During/after significant changes
- **active/*/tasks.md**: As tasks complete

### Periodic Updates
- **INDEX.md**: When adding new documentation
- **README.md**: When changing documentation structure
- **QUICKSTART.md**: When common tasks change

### Archive When
- Tasks are completed (move to archive/)
- Documentation becomes outdated
- Projects are deprecated

## Search Patterns

Find documentation quickly:

```bash
# Find all markdown files
find . -name "*.md"

# Find setup guides
ls ./setup/*.md

# Find active tasks
ls active/*/

# Search all docs for a term
grep -r "search-term" *.md
```

## Documentation Standards

- Use markdown format
- Include "Last Updated" timestamp
- Use clear, descriptive headings
- Include code examples where helpful
- Link related documents
- Keep QUICKSTART.md concise

## Contributing to Documentation

When adding new documentation:
1. Update this INDEX.md
2. Link from relevant existing docs
3. Follow naming conventions
4. Include update timestamp
5. Add to appropriate section

## Version History

- 2025-11-09: Initial documentation system created
  - Added QUICKSTART.md
  - Added session-handoff.md
  - Added README.md
  - Added INDEX.md
  - Created file-tree-generation task docs
