# JSON Report Viewer Component Design Guide

## Overview

This document provides UI/UX recommendations for displaying JSON report content in the job details modal. The component replaces the plain "Report Path" filepath with an interactive, readable JSON viewer that fetches and displays the actual report content.

## Design Philosophy

The JSON viewer should follow your existing design system while maintaining:
- **Simplicity**: No unnecessary visual noise
- **Scannability**: Clear visual hierarchy for nested data
- **Performance**: Graceful handling of large JSON files
- **Accessibility**: WCAG 2.1 Level AA compliance

## Component Architecture

### Mental Model

Users expect:
1. The report filepath link (familiar from previous design)
2. Visual indication that content is available
3. One-click access to formatted JSON content
4. Ability to collapse/expand sections to manage complexity

### Interaction Pattern

```
User Views Modal
    ↓
Sees "Report Available" indicator
    ↓
Clicks to expand/fetch
    ↓
JSON loads with syntax highlighting
    ↓
Can collapse sections (optional)
    ↓
Can copy entire JSON (optional)
```

## UI Components

### 1. Report Card Container

**Purpose**: Replace the simple "Report Path" field with an expanded report section.

**Design Decisions**:
- Use full-width layout for better content presentation
- Group-level styling with distinct visual separation
- Subtle border and background to indicate interactive content

**HTML Structure**:
```html
<div class="report-viewer">
  <div class="report-viewer-header">
    <span class="report-viewer-label">Report Content</span>
    <div class="report-viewer-controls">
      <button class="report-copy-btn" aria-label="Copy JSON to clipboard">
        <span class="icon">📋</span>
      </button>
      <button class="report-toggle-btn" aria-label="Expand/collapse report">
        <span class="icon">▼</span>
      </button>
    </div>
  </div>
  <div class="report-viewer-body">
    <div class="report-json-viewer"></div>
  </div>
</div>
```

**Reasoning**:
- Header contains filepath as context + controls
- Body area scrolls independently if content is large
- Icon buttons minimize space while remaining discoverable

### 2. Loading State

**When**: User clicks to expand or component initializes

**Design**:
```html
<div class="report-loading">
  <div class="loading-spinner"></div>
  <span>Loading report...</span>
</div>
```

**CSS**:
- Use existing spinner animation from dashboard
- Subtle text below spinner
- Centered, with padding to match content area

### 3. Error State

**When**: File fails to load (404, permission denied, parse error)

**Design**:
```html
<div class="report-error">
  <span class="error-icon">⚠️</span>
  <div class="error-content">
    <p class="error-title">Unable to Load Report</p>
    <p class="error-message">${error.message}</p>
    <p class="error-filepath">Path: ${reportPath}</p>
  </div>
  <button class="report-retry-btn">Retry</button>
</div>
```

**CSS**:
- Use `--color-error-bg` background
- `--color-error-dark` text
- Retry button with subtle styling

### 4. JSON Syntax Highlighting

**Approach**: Client-side syntax highlighting without external libraries

**Color Scheme** (using existing CSS variables):
- Keys: `--color-info-dark` (#1e40af)
- String values: `--color-success-dark` (#059669)
- Numbers: `--color-warning-dark` (#b45309)
- Boolean/null: `--color-gray-600` (#4b5563)
- Braces: `--color-gray-700` (#374151)

**Implementation**:
- Render JSON as `<pre>` with inline `<span>` elements
- Each element typed with class: `json-key`, `json-string`, `json-number`, `json-bool`, `json-null`, `json-brace`

**Example Output**:
```html
<pre class="json-content">
<span class="json-brace">{</span>
  <span class="json-key">"totalDuplicates"</span><span class="json-brace">:</span> <span class="json-number">42</span><span class="json-brace">,</span>
  <span class="json-key">"scanDuration"</span><span class="json-brace">:</span> <span class="json-number">2500</span>
<span class="json-brace">}</span>
</pre>
```

### 5. Nested Object Collapse/Expand

**For Large Objects**: Optional collapsible sections

**Design Decision**: Simple chevron toggle per object/array

**HTML Pattern**:
```html
<div class="json-object collapsible">
  <button class="json-toggle" aria-expanded="true">
    <span class="toggle-icon">▼</span>
    <span class="json-key">"results"</span><span class="json-brace">:</span>
  </button>
  <div class="json-content">
    <!-- nested content -->
  </div>
</div>
```

**Interaction**:
- Click toggle to collapse/expand
- Arrow icon rotates 90 degrees
- Content smoothly animates with `max-height` transition

### 6. Copy to Clipboard Button

**Placement**: Top-right of report viewer header

**Design**:
- Icon button (📋 or ⋯)
- Hover state: subtle background color
- Success feedback: "Copied!" toast or button text change

**Implementation**:
```javascript
copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(jsonData, null, 2));
    copyButton.classList.add('copied');
    setTimeout(() => copyButton.classList.remove('copied'), 2000);
  } catch (err) {
    console.error('Copy failed:', err);
  }
});
```

### 7. Responsive Behavior

**Desktop (>768px)**:
- Report viewer takes full width of modal
- JSON pre element scrolls horizontally if needed
- Controls remain sticky in header

**Mobile (<768px)**:
- Reduced font size for JSON content
- Report viewer header stacks vertically if needed
- Single-column layout maintained

## CSS Styling Guide

### Color System Integration

```css
.report-viewer {
  border: 1px solid var(--color-gray-200);
  background: var(--color-gray-50);
  border-radius: var(--radius-md);
  overflow: hidden;
}

/* JSON Syntax Highlighting */
.json-key {
  color: var(--color-info-dark);
  font-weight: 500;
}

.json-string {
  color: var(--color-success-dark);
}

.json-number {
  color: var(--color-warning-dark);
  font-weight: 500;
}

.json-bool,
.json-null {
  color: var(--color-gray-600);
  font-weight: 600;
}

.json-brace {
  color: var(--color-gray-700);
}
```

### Spacing and Typography

```css
.report-viewer-header {
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-gray-200);
  background: var(--color-white);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.report-viewer-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-gray-900);
}

.report-viewer-body {
  padding: var(--space-3);
  max-height: 400px;
  overflow-y: auto;
  overflow-x: auto;
  background: var(--color-white);
}

.json-content {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-gray-900);
  background: var(--color-gray-50);
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
}
```

### Interactive States

```css
/* Hover state for toggle buttons */
.report-toggle-btn:hover {
  background: var(--color-gray-100);
  border-radius: var(--radius-sm);
}

/* Expanded state */
.json-toggle[aria-expanded="true"] .toggle-icon {
  transform: rotate(0deg);
}

.json-toggle[aria-expanded="false"] .toggle-icon {
  transform: rotate(-90deg);
}

/* Smooth collapse animation */
.json-content {
  max-height: 1000px;
  overflow: hidden;
  transition: max-height var(--transition-base);
}

.json-toggle[aria-expanded="false"] + .json-content {
  max-height: 0;
}

/* Copy button feedback */
.report-copy-btn.copied {
  background: var(--color-success-bg);
  color: var(--color-success-dark);
}
```

## Accessibility Considerations

### Keyboard Navigation
- All buttons keyboard accessible via Tab
- Enter/Space activates toggles
- Escape can close modal (already implemented)

### Screen Reader Support
```html
<!-- Labels for controls -->
<button class="report-copy-btn" aria-label="Copy JSON to clipboard">
<button class="report-toggle-btn" aria-label="Expand report content" aria-expanded="true">

<!-- Live regions for state changes -->
<div aria-live="polite" aria-atomic="true" class="report-status">
  Loading report...
</div>

<!-- Semantic markup -->
<pre role="region" aria-label="JSON report content">
```

### Color Contrast
- All text meets WCAG AA 4.5:1 contrast ratio
- Icon buttons have sufficient size (32x32px minimum)
- Error states clearly distinguished by color + icon

### Readability
- Monospace font for code readability
- Line-height 1.6 for vertical spacing
- Maximum width controlled by modal constraint
- Generous padding around content

## Performance Optimization

### Large File Handling

**For files >500KB**:
1. Show preview of first 100 lines
2. Add "Show More" button to load rest
3. Implement virtual scrolling if needed

**Implementation Strategy**:
```javascript
const MAX_PREVIEW_SIZE = 100; // lines
const MAX_CHAR_SIZE = 50000;  // characters

if (jsonContent.length > MAX_CHAR_SIZE) {
  // Show preview with truncation indicator
  renderPreview(jsonContent.slice(0, MAX_PREVIEW_SIZE));
  showExpandButton();
}
```

### Loading Performance
- Fetch report async (don't block modal display)
- Show skeleton/spinner while loading
- Cache loaded reports in sessionStorage if needed

## Implementation Code Structure

### Vanilla JavaScript Component

```javascript
class JSONReportViewer {
  constructor(reportPath, container) {
    this.reportPath = reportPath;
    this.container = container;
    this.isExpanded = false;
    this.jsonData = null;
    this.init();
  }

  async init() {
    this.render();
    this.attachEventListeners();
  }

  render() {
    this.container.innerHTML = `
      <div class="report-viewer">
        <!-- header with controls -->
        <!-- body with placeholder -->
      </div>
    `;
  }

  attachEventListeners() {
    // Toggle expansion
    // Copy to clipboard
    // Handle errors
  }

  async fetchReport() {
    // Fetch, parse, cache
  }

  renderJSON(data) {
    // Syntax highlight and render
  }

  toggleExpansion() {
    // Show/hide content with smooth animation
  }

  copyToClipboard() {
    // Copy with feedback
  }
}
```

## Integration with Modal

### Modification to formatJobResult()

Current structure in `dashboard.js`:
```javascript
formatJobResult(job) {
  // Current: renders individual fields
  if (result.reportPath) {
    // Replace this section with JSON viewer
  }
}
```

**Recommendation**: Create separate method for report rendering:
```javascript
renderReportViewer(reportPath) {
  return `
    <div id="report-viewer-container-${reportPath}"></div>
    <script>
      new JSONReportViewer('${reportPath}',
        document.getElementById('report-viewer-container-${reportPath}'));
    </script>
  `;
}
```

## Design Specifications Summary

| Aspect | Specification |
|--------|---------------|
| **Container** | Full-width, `--color-gray-50` bg, `--radius-md` border |
| **Header Height** | `--space-2` × 2 + label height ≈ 44px |
| **Body Max Height** | 400px with overflow scroll |
| **Font Size (JSON)** | 12px monospace |
| **Line Height (JSON)** | 1.6 |
| **Key Color** | `--color-info-dark` (#1e40af) |
| **String Color** | `--color-success-dark` (#059669) |
| **Number Color** | `--color-warning-dark` (#b45309) |
| **Padding** | Consistent `--space-2`/`--space-3` |
| **Button Size** | 32px × 32px |
| **Animation** | 250ms cubic-bezier (existing transition) |
| **Border Radius** | `--radius-sm` for nested elements |

## Mockup Reference

```
┌─────────────────────────────────────────────┐
│ Report Content                       📋  ▼   │  ← Header
├─────────────────────────────────────────────┤
│                                             │
│ {                                           │
│   "totalDuplicates": 42,                    │
│   "totalBlocks": 156,                       │
│   "scanDuration": 2500,                     │
│   "results": [                              │  ← JSON Content
│     {                                       │     (scrollable)
│       "filePath": "...",                    │
│       "duplicateGroups": [...]              │
│     }                                       │
│   ]                                         │
│ }                                           │
│                                             │
├─────────────────────────────────────────────┤
│ Path: /Users/alyshialedlie/code/jobs/...   │  ← Footer (optional)
└─────────────────────────────────────────────┘

```

## Migration Path

### Phase 1: Basic Implementation
- Replace Report Path field with JSON viewer container
- Implement fetch + syntax highlighting
- Loading/error states
- Copy button

### Phase 2: Enhanced Features
- Collapsible nested objects (optional)
- Large file preview/truncation
- Syntax highlighting refinement

### Phase 3: Polish
- Keyboard shortcuts (Ctrl+C to copy)
- Search within JSON (optional)
- Export to file option

## Testing Checklist

- [ ] Load reports of various sizes (small, medium, large)
- [ ] Test with invalid JSON files
- [ ] Test with missing files (404)
- [ ] Test copy functionality
- [ ] Test keyboard navigation
- [ ] Test on mobile viewport
- [ ] Test collapse/expand transitions
- [ ] Verify screen reader announces state changes
- [ ] Test color contrast (AA compliance)
- [ ] Test with slow network (simulate with DevTools)

---

**Status**: Design Specification Ready
**Last Updated**: 2025-11-24
**Designer Notes**: This design prioritizes simplicity and readability while fitting naturally into the existing dashboard aesthetic. The JSON viewer should feel like a natural evolution of the current "Report Path" field, not a separate feature.
