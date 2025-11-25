# GitHub Actions Configuration

## ast-grep Setup

**Important:** This project uses `@ast-grep/cli` for code pattern detection in the duplicate detection pipeline.

### Local Development
- `@ast-grep/cli` is installed via `npm install` as an **optionalDependency**
- Binary is located at `node_modules/.bin/ast-grep`
- If postinstall fails, it won't block npm install (optional)

### CI/CD (GitHub Actions)
- `npm ci --omit=optional` skips @ast-grep/cli installation in CI (it's optional)
- We install ast-grep globally with `npm install -g` as a **best-effort** installation
- Installation failures are **non-critical** (`continue-on-error: true`)
- Reason: The npm package postinstall can fail in CI, but our pipelines can work without it
- Most tests don't require ast-grep; only the duplicate detection pipeline uses it

```yaml
- name: Install ast-grep (best effort)
  run: npm install -g @ast-grep/cli@latest || echo "⚠️ ast-grep installation failed (non-critical)"
  continue-on-error: true
```

### Why Keep @ast-grep/cli in optionalDependencies?

Even though CI uses a global install, we keep `@ast-grep/cli` in `package.json` for:
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
- Check if the global install step completed successfully
- This is expected and OK - most tests don't need ast-grep
- Only the duplicate detection pipeline integration tests require it
- CI will still pass even if ast-grep is not available

### Why This Approach?

**The pragmatic solution:**
- ast-grep has unreliable postinstall scripts in CI environments
- Only 1 pipeline (duplicate detection) actually uses ast-grep
- All other tests, builds, and validations work without it
- By making it optional + best-effort, we don't block CI on a single dependency

**Trade-offs:**
- ✅ CI is robust - doesn't fail on ast-grep issues
- ✅ Most tests run successfully
- ⚠️ Duplicate detection tests might be skipped if ast-grep unavailable
- ⚠️ Need to ensure local development has ast-grep working

## Related Documentation
- [ast-grep CLI Documentation](https://ast-grep.github.io/)
- [Duplicate Detection Pipeline](../docs/architecture/pipeline-data-flow.md)
- [CI/CD Cross-Platform Best Practices](~/.claude/skills/cicd-cross-platform/)
