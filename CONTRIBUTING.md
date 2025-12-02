# Contributing to AlephAuto

Thank you for your interest in contributing to AlephAuto! This document provides guidelines and standards for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Install dependencies: `npm ci`
4. Set up Doppler for secrets: `doppler setup --project bottleneck --config dev`
5. Run tests: `npm test`

## Code Quality Standards

### Complexity Limits
- Cyclomatic Complexity: <=10
- Cognitive Complexity: <=15
- Function Length: <=50 lines
- Nesting Depth: <=4 levels

### Security Standards
- Never use eval() or new Function() with dynamic input
- Validate all user input at system boundaries
- Use parameterized queries for database access

### Automated Checks
- Pre-commit hooks validate dangerous patterns
- CI/CD runs complexity analysis on PRs
- Security scanning blocks eval() usage

## Development Guidelines

### TypeScript Best Practices
- Use Zod schemas for runtime validation
- Infer TypeScript types from Zod schemas (no duplication)
- Use `unknown` for error handling with proper type guards
- Prefer named constants over magic numbers

### Testing Requirements
- All new features require unit tests
- Use `createTempRepository()` from test fixtures (never hardcode /tmp/ paths)
- Integration tests should use the test database
- Run `npm run test:integration` before submitting PRs

### Configuration
- Always use `sidequest/config.js` for configuration (never `process.env` directly)
- All commands require Doppler: `doppler run -- <command>`

## Submitting Changes

1. Create a feature branch from `main`
2. Make your changes following the guidelines above
3. Run the full test suite: `npm test && npm run test:integration`
4. Run type checking: `npm run typecheck`
5. Submit a pull request with a clear description

## Questions?

Open an issue for any questions about contributing.
