# GitHub Actions Configuration

## ast-grep Setup

**Important:** This project uses `@ast-grep/cli` for code pattern detection in the duplicate detection pipeline.

### Local Development
- `@ast-grep/cli` is installed via `npm install` as an **optionalDependency**
- Binary is located at `node_modules/.bin/ast-grep`
- If postinstall fails, it won't block npm install (optional)

### CI/CD (GitHub Actions)
- **We use the official ast-grep GitHub Action** instead of npm package installation
- `npm ci --omit=optional` skips @ast-grep/cli installation in CI
- Reason: The npm package postinstall script can fail in CI environments with "Failed to move @ast-grep/cli binary into place"
- Solution: `ast-grep/action@main` provides reliable binary installation across all platforms

```yaml
- name: Setup ast-grep
  uses: ast-grep/action@main
  with:
    version: latest
```

### Why Keep @ast-grep/cli in optionalDependencies?

Even though CI uses the GitHub Action, we keep `@ast-grep/cli` in `package.json` for:
1. **Local development** - Developers need ast-grep installed via npm
2. **Scripts** - Pipeline scripts reference ast-grep via node_modules/.bin
3. **Type definitions** - TypeScript types for ast-grep API
4. **Consistency** - Ensures version alignment between local and CI

### Troubleshooting

**If ast-grep postinstall fails locally:**
```bash
# Option 1: Install via npm (will retry postinstall)
npm install

# Option 2: Install via alternative package manager
brew install ast-grep  # macOS
cargo install ast-grep  # Rust

# Option 3: Use npx (no installation)
npx @ast-grep/cli --version
```

**If ast-grep not found in CI:**
- Ensure `ast-grep/action@main` is in the workflow
- Check the action runs before scripts that use ast-grep
- Verify the binary is available: `which ast-grep` or `ast-grep --version`

## Related Documentation
- [ast-grep GitHub Action](https://github.com/ast-grep/action)
- [ast-grep CLI Documentation](https://ast-grep.github.io/)
- [Duplicate Detection Pipeline](../docs/architecture/pipeline-data-flow.md)
