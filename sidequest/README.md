# Test Suite Refactoring Script

Analyzes test suites for duplication patterns and generates modular utility files.

## Usage

```bash
# From the sidequest directory
npx ts-node refactor-test-suite.ts /path/to/project

# Or make it executable
chmod +x refactor-test-suite.ts
./refactor-test-suite.ts /path/to/project
```

## What It Does

1. **Scans** test files for common patterns
2. **Analyzes** for refactoring opportunities:
   - `render + waitFor` boilerplate
   - Link validation assertions
   - Semantic HTML checks
   - Form interactions
   - Hardcoded strings
   - Duplicate assertions

3. **Generates** utility modules:
   - `assertions.ts` - Link validation helpers
   - `semantic-validators.ts` - HTML structure validators
   - `form-helpers.ts` - Form testing utilities
   - `test-constants.ts` - Extracted content strings
   - `render-helpers.ts` - renderAndWait utilities
   - `e2e/fixtures/navigation.ts` - Playwright helpers

## Output

```
🔍 Test Suite Refactoring Script
================================

Project: /path/to/project

Detected framework: vitest
Found 27 test files

Analysis Results:
─────────────────
  render + waitFor patterns: 45
  Link validation patterns: 23
  Semantic checks: 31
  Form interactions: 18
  Hardcoded strings (3+ occurrences): 15
  Duplicate assertions: 8

Recommendations:
────────────────
  1. Create renderAndWait helper to reduce render + waitFor boilerplate
  2. Create link assertion helpers (expectExternalLink, expectInternalLink, etc.)
  3. Extract hardcoded strings to test-constants.ts

Generating utility files:
─────────────────────────
  ✓ Created tests/utils/assertions.ts
  ✓ Created tests/utils/semantic-validators.ts
  ✓ Created tests/utils/form-helpers.ts
  ✓ Created tests/utils/test-constants.ts
  ✓ Created tests/utils/index.ts

✅ Refactoring complete!
```

## Dependencies

```bash
npm install -D glob
```

## Example Refactored Tests

### Before
```typescript
it('renders footer links', async () => {
  render(<Footer />);
  await waitFor(() => {
    const link = screen.getByText('Contact');
    expect(link.closest('a')).toHaveAttribute('href', '#contact');
  });
});
```

### After
```typescript
import { renderAndWait, expectSectionLink } from '../utils';

it('renders footer links', async () => {
  await renderAndWait(<Footer />, () => {
    expectSectionLink(screen.getByText('Contact'), 'contact');
  });
});
```

## Customization

After running, review and customize:

1. **test-constants.ts** - Organize extracted strings into meaningful groups
2. **form-helpers.ts** - Adjust field selectors for your form structure
3. **assertions.ts** - Add project-specific assertion helpers
