# JSON Report Viewer - Implementation Checklist

Quick reference for implementing the JSON report viewer component in your dashboard.

## Pre-Implementation

- [ ] Review `JSON_REPORT_VIEWER.md` for design overview
- [ ] Review `JSON_VIEWER_IMPLEMENTATION.md` for code
- [ ] Review `JSON_VIEWER_DESIGN_DECISIONS.md` to understand trade-offs
- [ ] Understand current modal structure in `dashboard.js`
- [ ] Have test report files available

---

## Phase 1: Core Component Implementation

### 1. CSS Styling

- [ ] Copy JSON Report Viewer CSS section from `JSON_VIEWER_IMPLEMENTATION.md`
- [ ] Add to `/Users/alyshialedlie/code/jobs/public/dashboard.css`
- [ ] Verify all CSS variables exist (check :root section)
- [ ] Test syntax highlighting colors in browser DevTools
- [ ] Verify responsive layout at 768px breakpoint

**Estimated time**: 15 minutes

### 2. JavaScript Class

- [ ] Copy `JSONReportViewer` class from `JSON_VIEWER_IMPLEMENTATION.md`
- [ ] Save as new file or append to `dashboard.js`
- [ ] Verify syntax (no typos in method names)
- [ ] Check that `escapeHtml()` method works correctly
- [ ] Test JSON highlighting function with sample data

**Files to modify**:
- `/Users/alyshialedlie/code/jobs/public/dashboard.js` (or new file)

**Estimated time**: 20 minutes

### 3. Modal Integration

- [ ] Locate `formatJobResult()` method in `dashboard.js` (line ~1169)
- [ ] Replace the "Report Path" field section with JSON viewer instantiation
- [ ] Test modal opens with report viewer placeholder
- [ ] Verify report viewer loads when user clicks toggle

**Code change location**:
```javascript
// Around line 1176 in dashboard.js
if (result.reportPath) {
    // REPLACE THIS SECTION
}
```

**Estimated time**: 10 minutes

### 4. Manual Testing

- [ ] [ ] Test with small report file (< 10KB)
  - [ ] Viewer renders collapsed
  - [ ] Click toggle expands
  - [ ] JSON displays with syntax highlighting
  - [ ] Colors are applied correctly

- [ ] [ ] Test with medium report file (10KB - 100KB)
  - [ ] Loading spinner shows for ~100-300ms
  - [ ] Content displays fully
  - [ ] Scrolling works smoothly

- [ ] [ ] Test copy button
  - [ ] Click copy button
  - [ ] Button shows "✅" feedback
  - [ ] JSON is in clipboard (paste in text editor)
  - [ ] Button reverts after 2 seconds

- [ ] [ ] Test error handling
  - [ ] Non-existent report path → Error state displays
  - [ ] Error message is clear and specific
  - [ ] Retry button reloads report

- [ ] [ ] Test responsive layout
  - [ ] Desktop (1024px+): Full width, good readability
  - [ ] Tablet (768px): Slightly condensed, still readable
  - [ ] Mobile (< 768px): Content wraps, font reduced

- [ ] [ ] Test keyboard navigation
  - [ ] Tab to copy button → Focus visible
  - [ ] Tab to toggle button → Focus visible
  - [ ] Enter/Space activates buttons
  - [ ] Escape closes modal

**Estimated time**: 30 minutes

---

## Phase 2: Accessibility & Refinement

### 5. Accessibility Validation

- [ ] [ ] Test with screen reader (NVDA on Windows or VoiceOver on Mac)
  - [ ] aria-expanded state announced
  - [ ] aria-labels on buttons read correctly
  - [ ] Error messages announced clearly

- [ ] [ ] Color contrast verification
  - [ ] Use WebAIM Contrast Checker
  - [ ] Verify each syntax color meets WCAG AA (4.5:1)
  - [ ] Check on both light and dark backgrounds (if applicable)

- [ ] [ ] Keyboard-only testing
  - [ ] Tab through entire modal without mouse
  - [ ] All interactive elements reachable
  - [ ] Focus visible on all buttons

- [ ] [ ] Mobile touch testing
  - [ ] 32x32px buttons are easy to tap
  - [ ] No accidental scrolling when tapping buttons
  - [ ] Copy feedback visible on mobile

**Tools**:
- WebAIM Contrast Checker: https://webaim.org/resources/contrastchecker/
- NVDA (Windows): https://www.nvaccess.org/
- macOS VoiceOver: Built-in (Cmd+F5)

**Estimated time**: 20 minutes

### 6. Performance Testing

- [ ] [ ] Test with slow network (DevTools Throttling)
  - [ ] Set to "Slow 3G"
  - [ ] Click to expand report
  - [ ] Verify loading spinner shows for ~1-2 seconds
  - [ ] Content loads completely

- [ ] [ ] Test with large file (> 500KB)
  - [ ] Component doesn't freeze
  - [ ] Shows preview indicator
  - [ ] Still copyable

- [ ] [ ] Memory profiling
  - [ ] Open DevTools → Memory tab
  - [ ] Take heap snapshot before
  - [ ] Load multiple reports
  - [ ] Take heap snapshot after
  - [ ] Memory increase reasonable (~3x JSON size)

**Estimated time**: 15 minutes

---

## Phase 3: Cross-Browser Testing

### 7. Browser Compatibility

- [ ] [ ] Chrome/Chromium
  - [ ] Component renders correctly
  - [ ] Copy to clipboard works
  - [ ] Animations smooth

- [ ] [ ] Firefox
  - [ ] Syntax highlighting colors accurate
  - [ ] Scrolling performance good
  - [ ] No console errors

- [ ] [ ] Safari (macOS)
  - [ ] JSON displays completely
  - [ ] Touch feedback works on trackpad
  - [ ] No layout issues

- [ ] [ ] Safari (iOS)
  - [ ] Mobile layout responsive
  - [ ] Copy button works on mobile
  - [ ] Scrolling smooth

- [ ] [ ] Edge
  - [ ] All features work
  - [ ] No visual issues

**Note**: IE11 not required (uses modern APIs)

**Estimated time**: 30 minutes (if you have multiple devices available)

---

## Phase 4: Documentation & Handoff

### 8. Code Documentation

- [ ] [ ] Add JSDoc comments to `JSONReportViewer` class
  ```javascript
  /**
   * JSON Report Viewer Component
   *
   * Fetches and displays JSON reports with syntax highlighting
   *
   * @param {string} reportPath - Path to JSON report file
   * @param {HTMLElement} container - Container element
   * @param {Object} options - Configuration options
   */
  ```

- [ ] [ ] Add inline comments to complex sections
  - [ ] Syntax highlighting algorithm
  - [ ] Error handling
  - [ ] Copy mechanism

**Estimated time**: 10 minutes

### 9. Component Usage Documentation

- [ ] [ ] Create `JSON_VIEWER_USAGE.md` with examples:
  ```javascript
  // Example 1: Basic usage
  const viewer = new JSONReportViewer('/path/to/report.json', container);

  // Example 2: With options
  const viewer = new JSONReportViewer(path, container, {
      expandByDefault: false,
      enableCollapse: true
  });
  ```

- [ ] [ ] Document public API
  - [ ] Constructor parameters
  - [ ] Public methods
  - [ ] State object
  - [ ] Events/callbacks (if any)

**Estimated time**: 10 minutes

### 10. Update Main Dashboard Documentation

- [ ] [ ] Update `/Users/alyshialedlie/code/jobs/CLAUDE.md`
  - [ ] Add note about JSON report viewer
  - [ ] Link to implementation docs

- [ ] [ ] Update `/Users/alyshialedlie/code/jobs/docs/API_REFERENCE.md`
  - [ ] Note about report file accessibility
  - [ ] CORS/security considerations

**Estimated time**: 5 minutes

---

## Optional: Phase 5 Enhancements

(These are listed for future iteration, not required for launch)

### 11. Collapsible Objects (Phase 2 Enhancement)

- [ ] Implement JSON toggle buttons for nested objects
- [ ] Add collapse/expand state tracking
- [ ] Add animation for expand/collapse
- [ ] Test with deeply nested JSON structures

### 12. Search Functionality (Phase 3 Enhancement)

- [ ] Add search input field
- [ ] Implement search highlighting in JSON
- [ ] Show match count
- [ ] Add next/previous navigation

### 13. Download Feature (Phase 3 Enhancement)

- [ ] Add "Download as JSON" button
- [ ] Generate filename from report path
- [ ] Handle large files
- [ ] Track in analytics

---

## Deployment Checklist

### Pre-Deployment

- [ ] All tests passing
- [ ] No console errors in any browser
- [ ] CSS minified and bundled (if using build process)
- [ ] JavaScript minified and bundled
- [ ] Performance acceptable on slow networks

### Staging Deployment

- [ ] Deploy to staging environment
- [ ] Test with production-like reports
- [ ] Verify all file paths resolve correctly
- [ ] Check CORS headers (if reports on different domain)
- [ ] Monitor error logs for issues

### Production Deployment

- [ ] Create git commit with clear message
- [ ] Tag with version number (e.g., v1.2.0)
- [ ] Deploy to production
- [ ] Monitor error tracking (Sentry) for new errors
- [ ] Gather user feedback

### Post-Deployment

- [ ] Monitor for error spikes
- [ ] Check performance metrics
- [ ] Collect user feedback
- [ ] Plan Phase 2 enhancements based on usage

---

## Quick Validation Script

Use this to verify implementation completeness:

```bash
#!/bin/bash
# JSON Viewer Implementation Validator

echo "Checking JSON Viewer Implementation..."

# 1. Check CSS exists
if grep -q "json-key\|json-string\|json-number" public/dashboard.css; then
    echo "✓ CSS styling added"
else
    echo "✗ CSS styling missing"
fi

# 2. Check JavaScript class exists
if grep -q "class JSONReportViewer" public/dashboard.js; then
    echo "✓ JavaScript class implemented"
else
    echo "✗ JavaScript class missing"
fi

# 3. Check modal integration
if grep -q "new JSONReportViewer" public/dashboard.js; then
    echo "✓ Modal integration complete"
else
    echo "✗ Modal integration missing"
fi

# 4. Check for required methods
if grep -q "renderJSON\|handleCopy\|highlightJSON" public/dashboard.js; then
    echo "✓ Core methods implemented"
else
    echo "✗ Core methods incomplete"
fi

echo "Validation complete!"
```

---

## Common Issues & Fixes

### Issue: Colors not showing

**Cause**: CSS not loaded or variables not defined
**Fix**:
1. Verify CSS section copied completely
2. Check --color-* variables exist in :root
3. Clear browser cache (Ctrl+Shift+R)
4. Check DevTools for CSS errors

### Issue: JSON not displaying after click

**Cause**: fetch() failing silently
**Fix**:
1. Check browser console for errors
2. Verify report file path is correct
3. Check if file exists on disk
4. Check CORS headers (if cross-domain)
5. Open DevTools Network tab and check fetch request

### Issue: Syntax highlighting not working

**Cause**: highlightJSON() function returning plain text
**Fix**:
1. Check for regex errors in browser console
2. Verify JSON.stringify works on data
3. Test highlightJSON() in console directly
4. Check escapeHtml() doesn't break HTML

### Issue: Modal becomes huge with report

**Cause**: max-height: 400px not applied
**Fix**:
1. Check CSS specificity (dashboard-css might override)
2. Verify .report-viewer-body class in HTML
3. Add !important if necessary (last resort)
4. Check DevTools computed styles

### Issue: Copy button not working

**Cause**: navigator.clipboard not available or permission denied
**Fix**:
1. Check browser supports clipboard API (all modern browsers do)
2. Verify site is HTTPS (clipboard requires secure context)
3. Check browser console for security errors
4. Test on different domain to isolate issue

---

## Time Estimates

| Phase | Task | Time | Total |
|-------|------|------|-------|
| 1 | CSS Styling | 15 min | 15 min |
| 1 | JavaScript Class | 20 min | 35 min |
| 1 | Modal Integration | 10 min | 45 min |
| 1 | Manual Testing | 30 min | 75 min |
| 2 | Accessibility | 20 min | 95 min |
| 2 | Performance | 15 min | 110 min |
| 3 | Browser Testing | 30 min | 140 min |
| 4 | Documentation | 20 min | 160 min |

**Total Estimated Time**: ~2.5 hours (can vary based on testing depth)

---

## Success Criteria

Implementation is complete when:
- [ ] Report viewer renders with syntax highlighting
- [ ] Copy button successfully copies JSON
- [ ] Error states display helpful messages
- [ ] Mobile layout is responsive
- [ ] All keyboard navigation works
- [ ] WCAG AA accessibility met
- [ ] Performance acceptable on slow networks
- [ ] Works in Chrome, Firefox, Safari, Edge
- [ ] No console errors
- [ ] User can see actual report content instead of just filepath

---

**Last Updated**: 2025-11-24
**Difficulty**: Medium (1-2 hours for experienced developer)
**Dependencies**: None (vanilla JS, no external libraries)
