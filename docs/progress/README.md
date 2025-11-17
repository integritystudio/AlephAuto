# Development Documentation

This directory contains development context, task tracking, and session handoff documentation.

## Directory Structure

```
dev/
├── README.md (this file)
├── session-handoff.md
└── active/
    └── file-tree-generation/
        ├── context.md
        └── tasks.md
```

## Purpose

This documentation system helps maintain continuity across development sessions, especially when approaching context limits or switching between different work streams.

## Documentation Types

### Session Handoff (`session-handoff.md`)
- Updated at the end of each session
- Contains current state, uncommitted changes, next steps
- Critical for resuming work after context reset
- **Always read this first** when starting a new session

### Active Tasks (`active/*/`)
Each active task gets its own directory with:
- `context.md`: Implementation state, decisions, blockers
- `tasks.md`: Task list with completion status

### Memory/Patterns (future)
Could include:
- Common patterns discovered
- Architecture decisions
- Integration points
- Performance optimizations

## When to Update

### Before Context Limit
- Update session-handoff.md
- Update active task context.md files
- Mark completed tasks in tasks.md files
- Document any partially completed work

### After Major Milestones
- Update context when completing significant features
- Document architectural decisions
- Record integration points

### When Switching Tasks
- Update current task context
- Create new active task directory if needed
- Link related tasks

## Quick Start for New Sessions

1. **Read session-handoff.md** - Get oriented to current state
2. **Check git status** - See uncommitted changes
3. **Review active task contexts** - Understand ongoing work
4. **Check tasks.md files** - See what's next

## File Naming Conventions

- Context files: `[task-name]-context.md`
- Task files: `[task-name]-tasks.md`
- Session handoff: `session-handoff.md` (one per repo)
- Use kebab-case for task directory names

## Task Status Markers

- ✅ Completed
- 🔄 In Progress
- ⏸️ Blocked
- ❌ Cancelled
- 📋 Planned

## Best Practices

1. **Update context before running out**: Don't wait until the last moment
2. **Be specific**: Include file paths, line numbers, exact states
3. **Document decisions**: Explain why choices were made
4. **Link related work**: Connect tasks and features
5. **Include commands**: Ready-to-run commands for next session
6. **Note blockers**: Document issues that need resolution

## Current Active Tasks

- `file-tree-generation/`: ✅ Completed - Created repository file tree documentation

## Repository Context

This is located in `/Users/alyshialedlie/code/jobs`, which appears to be:
- An archive repository containing multiple projects
- Multi-language codebase (Node.js, Python, PHP, Go)
- Contains documentation enhancement tools
- Has extensive logging from repomix operations

For detailed repository structure, see `../claude.md`.

## Maintenance

- Archive completed tasks monthly
- Clean up old session handoffs
- Review and update patterns/memory
- Prune inactive task directories

## Integration

This dev documentation works alongside:
- Repository README.md
- Project-specific documentation
- Setup files in `.././setup/`
- Git commit history

## Questions?

When in doubt:
1. Check session-handoff.md
2. Review the relevant context.md file
3. Look at git history
4. Check the main repository README.md
