# Job Details Modal - UX Audit & Improvement Recommendations

**Date:** November 24, 2025
**Focus:** User experience, information architecture, visual hierarchy, accessibility
**Scope:** Modal opened from pipeline details panel, displaying job metadata and results

---

## Executive Summary

The Job Details modal provides essential job information but suffers from several UX challenges that reduce its utility:

1. **Information overload** - Six sections with minimal visual distinction create cognitive friction
2. **Poor task prioritization** - Critical information (Status, Error) mixed with secondary details
3. **Weak visual hierarchy** - All sections treated equally; timestamps given same prominence as actionable results
4. **Content density issues** - Compact 2-column grid reduces readability for long values
5. **Accessibility gaps** - Missing context for screen readers; insufficient color contrast; inadequate focus management

**Impact:** Users struggle to quickly assess job health and extract actionable insights.

---

## 1. UX Issues & Pain Points

### 1.1 Information Architecture Problems

**Issue: Unclear hierarchy of importance**
- Current order: Overview → Timestamps → Parameters → Result → Error → Git
- Problem: Doesn't follow user's actual mental model of what matters first
- User's likely priority: Status/Error → Result → When it ran → Parameters → Git
- Impact: Users scroll unnecessarily to find why a job failed or what it produced

**Issue: Status section lacks actionability**
- Overview shows Status but no context for failures (no link to error section)
- Users must hunt through content to understand what "failed" means
- Error section is buried at the bottom

**Issue: Timestamps and Parameters treated as equally important**
- Timestamps (created/started/completed) take up 1/6 of modal real estate
- These are informational, not actionable
- Should be collapsible or de-emphasized

**Issue: Git Workflow section lacks visual context**
- PR URL is valuable but presented as plain text link
- No indication of PR status (merged, open, draft)
- Changed files presented as comma-separated string (hard to scan)

### 1.2 Visual Hierarchy Problems

**Issue: Monotonous section design**
- All h4 section titles styled identically (12px, gray-600, uppercase)
- Grid layouts identical across all sections
- No visual distinction between Overview, Parameters, and Error sections
- Error section should visually stand out from informational sections

**Issue: Color palette lacks semantic meaning**
- Status badge uses `status-${job.status}` class but styling unclear from CSS
- Field values all use gray-900 (uniform, no distinction)
- Error content styled in gray-100 background, but not prominent enough
- Warning/critical information not visually distinct from routine data

**Issue: Modal doesn't breathe**
- Padding: `var(--space-3)` (12px) between sections
- Max-width: 600px creates crowded appearance
- Content fills container edge-to-edge
- No visual rest areas

**Issue: Typography lacks contrast**
- Field labels: 11px, font-weight 500 (too small, looks like metadata)
- Field values: 13px, font-weight 500 (only 2px larger)
- Labels and values visually similar instead of clearly distinguished
- Pre-formatted content in monospace but same size as regular text

### 1.3 Content Density Issues

**Issue: 2-column grid forces awkward wrapping**
- Long job IDs (UUIDs) wrap to multiple lines
- Repository paths get truncated
- Code output in Result section becomes hard to read in narrow columns
- Mobile breakpoint (768px) only fixes this partially

**Issue: Error section uses `<pre>` with `white-space: pre-wrap`**
- Indented JSON errors can become 3-4x wider than container
- Horizontal scrolling required but unclear to user
- Long error messages lose structure

**Issue: Parameters section inconsistent formatting**
- Uses `JSON.stringify(value, null, 2)` for objects (good)
- But wrapped in `field-value` span which doesn't preserve indentation well
- Code blocks should use monospace with proper syntax highlighting

### 1.4 Interaction & Keyboard Navigation Issues

**Issue: Modal close interactions unclear**
- Three ways to close: X button, backdrop click, Escape key
- No visual feedback on which interactions are available
- Close button styling uses `&times;` character (inconsistent with SVG buttons elsewhere)
- No confirmation if closing modal with unsaved context

**Issue: Long content not scrollable intuitively**
- Body has `overflow-y: auto` but no scroll indicators
- User may not realize sections are scrollable
- Scroll behavior different on different browsers

**Issue: Focus management**
- No focus trap or focus return after closing
- Tab order may jump unexpectedly in/out of modal
- Close button receives focus but no indicator

**Issue: Copy-to-clipboard missing**
- Job IDs, branch names, commit SHAs valuable to copy
- No affordance for this common action
- Users resort to manual selection/copy (error-prone)

### 1.5 Accessibility Gaps

**Issue: Semantic HTML incomplete**
- Modal structure uses `<div>` with `display: flex` instead of `<dialog>` element
- No `role="dialog"` on container
- Header lacks `<header>` tag
- Sections use `<div>` instead of semantic landmarks

**Issue: ARIA attributes missing**
- No `aria-labelledby` connecting modal title to header
- Sections not marked as `aria-label` regions
- Status values need `role="status"` for screen readers to announce

**Issue: Color contrast concerns**
- Gray field labels (color-gray-600) on gray-50 background may fail WCAG AA
- Error text (color-error-dark) needs verification against white background
- Pre-formatted code (gray-100 background with gray-900 text) needs checking

**Issue: Screen reader experience**
- Dense grid layout without clear relationships between labels and values
- JSONReportViewer may not be navigable by keyboard
- Status badges need semantic markup (not just visual class)
- Timestamps presented as raw ISO strings instead of human-readable format

**Issue: Mobile accessibility**
- Modal max-height 90vh on mobile can hide content
- 2-column grid collapses to 1-column, increasing height
- Touch targets on fields (not interactive) waste space
- Close button (32x32px) adequate, but positioned far right

---

## 2. Information Architecture Improvements

### 2.1 Restructured Section Order

**Recommended Priority Order:**

```
1. QUICK STATUS (Collapsible, always visible)
   - Status badge (large, semantic color)
   - Duration
   - Key outcome metric (Total Duplicates, PR URL, etc.)

2. CRITICAL DETAILS (Conditional visibility)
   - Error section (if job failed) - visual prominence
   - Result section (if job succeeded) - show key metrics

3. METADATA (Collapsible, secondary)
   - Overview (Job ID, Pipeline)
   - Timestamps (Created, Started, Completed)
   - Parameters (Input configuration)
   - Git Workflow (Branch, Commit, PR, Files)
```

**Rationale:**
- Users scan top-to-bottom; put most critical info first
- Errors should be impossible to miss
- Secondary information collapsible saves scrolling
- Metadata grouped together at bottom

### 2.2 Conditional Section Visibility

**Proposal: Smart visibility based on job state**

| Job State | Visible Sections | Hidden Sections |
|-----------|------------------|-----------------|
| `completed` | Status, Result, Git | Error |
| `failed` | Status, Error, Git | Result, Parameters |
| `queued` | Status, Overview | Result, Error, Timestamps |
| `running` | Status, Overview | Result, Error (until completion) |

**Implementation:** Only render relevant HTML sections, reducing modal height and improving focus.

### 2.3 Improved Field Grouping

**Current approach:** Fields scattered across grid with weak connections.

**Proposed approach:** Semantic groupings with clearer relationships

```
Status Section:
├─ Status (badge)
├─ Duration (formatted)
└─ Completion Rate/Outcome (pipeline-specific)

Execution Timeline:
├─ Created At
├─ Started At
└─ Completed At
(Present as timeline, not grid)

Job Identification:
├─ Job ID (with copy button)
└─ Pipeline Type

Git Changes (if git workflow enabled):
├─ Branch (with copy button)
├─ Commit SHA (with copy button)
├─ PR Status (badge + link)
└─ Changed Files (list with file icons)
```

### 2.4 Result Section Reorganization

**Current:** Flat list of fields with mixed data types

**Proposed:** Context-aware rendering

```javascript
// Duplicate Detection Result
Status: X duplicates found
├─ Total Duplicates (large number)
├─ Total Code Blocks Analyzed
├─ Scan Duration
└─ Report Viewer (interactive JSON explorer)

// Schema Enhancement Result
Status: X files enhanced
├─ Files Modified (list)
├─ SEO Impact Score
└─ Validation Results

// Git Activity Result
Status: Report generated
└─ Report Viewer (interactive JSON explorer)
```

---

## 3. Visual Hierarchy Recommendations

### 3.1 Section Styling System

**Create three section types:**

**Type A: Critical Status Section** (Always prominent)
```css
.job-details-section--critical {
    background: var(--color-success-bg);     /* If completed */
    border-left: 4px solid var(--color-success);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    margin-bottom: var(--space-4);
}

.job-details-section--error {
    background: var(--color-error-bg);
    border-left: 4px solid var(--color-error);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    margin-bottom: var(--space-4);
}
```

**Type B: Secondary Sections** (Collapsible metadata)
```css
.job-details-section--secondary {
    border: 1px solid var(--color-gray-200);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    margin-bottom: var(--space-2);
}
```

**Type C: Expandable Sections** (With toggle)
```css
.job-details-section--expandable {
    border: none;
    padding: 0;
}

.job-details-section--expandable .section-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) 0;
    cursor: pointer;
    background: none;
    border: none;
}

.job-details-section--expandable .section-toggle:hover h4 {
    color: var(--color-gray-900);
}

.job-details-section--expandable .section-content {
    max-height: 500px;
    overflow: hidden;
    transition: max-height var(--transition-normal);
}

.job-details-section--expandable.collapsed .section-content {
    max-height: 0;
    opacity: 0;
}
```

### 3.2 Typography Improvements

**Restructure field hierarchy:**

```css
.field-label {
    font-size: 11px;              /* Keep small */
    font-weight: 600;              /* Increase weight for prominence */
    color: var(--color-gray-500);  /* Lighter than current gray-600 */
    text-transform: uppercase;
    letter-spacing: 0.5px;
    display: block;
    margin-bottom: var(--space-1);
}

.field-value {
    font-size: 14px;               /* Increase from 13px */
    font-weight: 400;              /* Decrease from 500 */
    color: var(--color-gray-900);
    display: block;
    line-height: 1.5;              /* Improve readability */
    word-break: break-word;
}

/* For important values (IDs, statuses) */
.field-value--prominent {
    font-weight: 600;
    font-family: var(--font-mono);
    background: var(--color-gray-50);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
}

/* For status badges */
.field-value--status {
    font-weight: 600;
    font-size: 13px;
    padding: var(--space-1) var(--space-2);
    border-radius: 4px;
    display: inline-block;
}
```

### 3.3 Color Semantic Improvements

**Ensure job status colors are clear:**

```css
.status-completed,
.status-succeeded {
    background: var(--color-success-light);
    color: var(--color-success-dark);
    border: 1px solid var(--color-success);
}

.status-failed,
.status-error {
    background: var(--color-error-light);
    color: var(--color-error-dark);
    border: 1px solid var(--color-error);
}

.status-running,
.status-active {
    background: var(--color-info-light);
    color: var(--color-info-dark);
    border: 1px solid var(--color-info);
    animation: pulse-status 2s infinite;
}

.status-queued,
.status-pending {
    background: var(--color-warning-light);
    color: var(--color-warning-dark);
    border: 1px solid var(--color-warning);
}

@keyframes pulse-status {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
}
```

### 3.4 Grid Layout Refinement

**Replace 2-column grid with flexible layout:**

```css
.job-details-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);            /* Increase from space-2 */
}

/* Contextual full-width fields */
.job-details-field--full-width {
    grid-column: 1 / -1;
}

/* For code/error blocks */
.job-details-field--code {
    grid-column: 1 / -1;
    background: var(--color-gray-900);
    color: var(--color-gray-50);
    border-radius: var(--radius-md);
    overflow: hidden;
}

.job-details-field--code pre {
    margin: 0;
    padding: var(--space-3);
    font-size: 12px;
    font-family: var(--font-mono);
    overflow-x: auto;
}

/* Single-column on tablet and below */
@media (max-width: 768px) {
    .job-details-grid {
        grid-template-columns: 1fr;
    }
}
```

---

## 4. Interaction Pattern Suggestions

### 4.1 Copy-to-Clipboard Actions

**Add persistent copy buttons for key identifiers:**

```html
<div class="job-details-field">
    <span class="field-label">Job ID</span>
    <div class="field-value-with-action">
        <span class="field-value">${job.id}</span>
        <button
            class="copy-btn"
            data-text="${job.id}"
            title="Copy to clipboard"
            aria-label="Copy Job ID"
        >
            <svg><!-- copy icon --></svg>
        </button>
    </div>
</div>
```

**Styling:**

```css
.field-value-with-action {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    background: var(--color-gray-50);
    padding: var(--space-2);
    border-radius: var(--radius-sm);
}

.copy-btn {
    flex-shrink: 0;
    background: transparent;
    border: 1px solid var(--color-gray-300);
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
    display: flex;
    align-items: center;
    justify-content: center;
}

.copy-btn:hover {
    background: var(--color-gray-100);
    border-color: var(--color-gray-400);
}

.copy-btn:active {
    background: var(--color-info);
    border-color: var(--color-info);
    color: white;
}
```

**JavaScript behavior:**
- Click copies text to clipboard
- Button shows checkmark for 2 seconds
- Toast notification "Copied to clipboard"
- Keyboard accessible (Tab + Enter)

### 4.2 Expandable/Collapsible Sections

**Proposal: Metadata sections collapse by default**

```html
<div class="job-details-section--expandable">
    <button class="section-toggle" aria-expanded="false">
        <svg class="toggle-icon"><!-- chevron --></svg>
        <h4>Metadata</h4>
    </button>
    <div class="section-content" hidden>
        <!-- timestamps, parameters, overview -->
    </div>
</div>
```

**Benefits:**
- Reduces initial modal height (especially on mobile)
- Still accessible for users who need this info
- Clear visual affordance (chevron icon)
- Keyboard accessible (Space/Enter to toggle)

### 4.3 Error Section Emphasis

**When job.status === 'failed':**

```html
<div class="job-details-section--error">
    <div class="section-header">
        <span class="error-icon">⚠</span>
        <h4>Error</h4>
    </div>
    <div class="error-content">
        <p class="error-summary">${errorSummary}</p>
        <details>
            <summary>Full Error Details</summary>
            <pre>${fullError}</pre>
        </details>
    </div>
</div>
```

**Styling:**

```css
.job-details-section--error {
    background: var(--color-error-light);
    border: 2px solid var(--color-error);
    border-left: 4px solid var(--color-error);
}

.error-icon {
    font-size: 18px;
    line-height: 1;
    margin-right: var(--space-1);
}

.error-summary {
    color: var(--color-error-dark);
    font-weight: 500;
    margin: 0 0 var(--space-2) 0;
}

details {
    cursor: pointer;
}

details summary {
    color: var(--color-error-dark);
    font-weight: 600;
    padding: var(--space-2);
    background: var(--color-white);
    border-radius: var(--radius-sm);
    margin: var(--space-2) 0 0 0;
    border: 1px solid var(--color-error);
}

details[open] summary {
    border-bottom: none;
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

details pre {
    background: var(--color-gray-900);
    color: var(--color-error-light);
    padding: var(--space-3);
    border-radius: 0 0 var(--radius-sm) var(--radius-sm);
    overflow-x: auto;
    margin: 0;
}
```

### 4.4 Timeline Visualization for Timestamps

**Replace grid layout with visual timeline:**

```html
<div class="job-timeline">
    <div class="timeline-item">
        <div class="timeline-marker created"></div>
        <div class="timeline-content">
            <span class="timeline-label">Created</span>
            <time>${createdAt}</time>
        </div>
    </div>
    <div class="timeline-item">
        <div class="timeline-marker started"></div>
        <div class="timeline-content">
            <span class="timeline-label">Started</span>
            <time>${startTime}</time>
            <span class="timeline-duration">+${queueDuration}s</span>
        </div>
    </div>
    <div class="timeline-item">
        <div class="timeline-marker completed"></div>
        <div class="timeline-content">
            <span class="timeline-label">Completed</span>
            <time>${endTime}</time>
            <span class="timeline-duration">+${executionDuration}s</span>
        </div>
    </div>
</div>
```

**Styling:**

```css
.job-timeline {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) 0;
}

.timeline-item {
    display: flex;
    gap: var(--space-3);
}

.timeline-marker {
    flex-shrink: 0;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--color-gray-400);
    margin-top: 2px;
    position: relative;
}

.timeline-marker::after {
    content: '';
    position: absolute;
    width: 2px;
    height: 24px;
    background: var(--color-gray-300);
    left: 5px;
    top: 12px;
}

.timeline-item:last-child .timeline-marker::after {
    display: none;
}

.timeline-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.timeline-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-gray-600);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.timeline-content time {
    font-size: 13px;
    color: var(--color-gray-900);
    font-weight: 500;
}

.timeline-duration {
    font-size: 11px;
    color: var(--color-gray-500);
}
```

**Benefit:** Instantly shows job progression and timing, much clearer than grid.

### 4.5 Git Workflow Section Enhancements

**Current:** Plain text links. Proposed: Rich visual cards.

```html
<div class="git-workflow-content">
    <div class="git-field branch-field">
        <span class="field-label">Branch</span>
        <div class="field-value-with-action">
            <code>${git.branchName}</code>
            <button class="copy-btn"><!-- copy --></button>
        </div>
    </div>

    <div class="git-field commit-field">
        <span class="field-label">Commit</span>
        <div class="field-value-with-action">
            <code>${git.commitSha.substring(0, 7)}</code>
            <button class="copy-btn"><!-- copy --></button>
        </div>
    </div>

    <div class="git-field pr-field">
        <span class="field-label">Pull Request</span>
        <a href="${git.prUrl}" target="_blank" class="pr-link">
            <span class="pr-number">#${prNumber}</span>
            <span class="pr-title">${prTitle}</span>
            <span class="pr-status" data-status="${prStatus}">${prStatus}</span>
            <svg class="external-icon"><!-- external link --></svg>
        </a>
    </div>

    <div class="git-field files-field">
        <span class="field-label">Changed Files</span>
        <ul class="changed-files-list">
            ${git.changedFiles.map(file => `
                <li>
                    <span class="file-icon" data-type="${fileType(file)}"></span>
                    <code>${file}</code>
                </li>
            `).join('')}
        </ul>
    </div>
</div>
```

**Styling:**

```css
.git-workflow-content {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-3);
}

.git-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}

.pr-link {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
    background: var(--color-info-light);
    border: 1px solid var(--color-info);
    border-radius: var(--radius-sm);
    color: var(--color-info-dark);
    text-decoration: none;
    transition: all var(--transition-fast);
}

.pr-link:hover {
    background: var(--color-info);
    color: white;
}

.pr-number {
    font-weight: 600;
    font-size: 13px;
}

.pr-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.pr-status {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 3px;
    background: var(--color-white);
    color: var(--color-info-dark);
}

.pr-status[data-status="open"] {
    background: var(--color-success);
    color: white;
}

.pr-status[data-status="merged"] {
    background: var(--color-purple);
    color: white;
}

.pr-status[data-status="closed"] {
    background: var(--color-gray-400);
    color: white;
}

.external-icon {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    opacity: 0.7;
}

.changed-files-list {
    list-style: none;
    margin: 0;
    padding: var(--space-2);
    background: var(--color-gray-50);
    border-radius: var(--radius-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}

.changed-files-list li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 12px;
    color: var(--color-gray-700);
}

.changed-files-list code {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
}

.file-icon {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
}

.file-icon[data-type="js"]::before { content: '{}'; }
.file-icon[data-type="ts"]::before { content: '{}'; }
.file-icon[data-type="json"]::before { content: '[]'; }
.file-icon[data-type="md"]::before { content: '📄'; }
.file-icon::before { content: '📄'; }
```

---

## 5. Accessibility Improvements

### 5.1 Semantic HTML Restructuring

**Current:**
```html
<div class="job-details-modal">
    <div class="job-details-content">
        <div class="job-details-header">
            <h3>Job Details</h3>
            <button>×</button>
        </div>
        <div class="job-details-body">
            <div class="job-details-section">
                <h4>Overview</h4>
                <div class="job-details-grid">...</div>
            </div>
        </div>
    </div>
</div>
```

**Recommended:**
```html
<dialog class="job-details-modal" id="jobDetailsModal">
    <div class="job-details-content">
        <header class="job-details-header">
            <h2 id="jobDetailsTitle">Job Details</h2>
            <button
                type="button"
                class="job-details-close"
                aria-label="Close job details"
                aria-controls="jobDetailsModal"
            >
                <svg aria-hidden="true"><!-- close icon --></svg>
            </button>
        </header>

        <main class="job-details-body" role="main">
            <section class="job-details-section" aria-labelledby="statusHeading">
                <h3 id="statusHeading">Status</h3>
                <!-- content -->
            </section>

            <section
                class="job-details-section--expandable"
                aria-labelledby="metadataHeading"
            >
                <button
                    class="section-toggle"
                    aria-expanded="false"
                    aria-controls="metadataContent"
                >
                    <h3 id="metadataHeading">Metadata</h3>
                </button>
                <div id="metadataContent" hidden>
                    <!-- content -->
                </div>
            </section>
        </main>
    </div>
</dialog>
```

**Improvements:**
- Use `<dialog>` element (native browser handling)
- Proper `<header>` and `<main>` landmarks
- `aria-labelledby` connects sections to headings
- `aria-expanded` for toggles
- `aria-controls` for button/target relationship
- `aria-hidden="true"` on decorative SVGs

### 5.2 ARIA Enhancements

**Status announcement:**
```html
<div class="field-value field-value--status" role="status" aria-live="polite">
    ${job.status}
</div>
```

**Error alerts:**
```html
<section
    class="job-details-section--error"
    role="alert"
    aria-live="assertive"
>
    <h3>Error</h3>
    <p>${errorMessage}</p>
</section>
```

**Loading states:**
```html
<div role="status" aria-live="polite" aria-busy="true">
    Loading job details...
</div>
```

**Expandable content:**
```html
<button
    aria-expanded="false"
    aria-controls="parameters-content"
>
    Expand Parameters
</button>
<div id="parameters-content" hidden aria-label="Job parameters">
    <!-- parameters -->
</div>
```

### 5.3 Color Contrast Fixes

**Current potential issues:**

| Element | Current | WCAG AA | WCAG AAA | Recommendation |
|---------|---------|---------|---------|-----------------|
| Field label (gray-600 on white) | ~4.5:1 | Pass | Fail | Keep for secondary info |
| Field label (gray-600 on gray-50) | ~3.5:1 | Fail | Fail | **Change to gray-700 (5.5:1)** |
| Status completed (green-light) | TBD | Check | Check | Ensure 5:1+ ratio |
| Error text (red on white) | TBD | Check | Check | Ensure 5:1+ ratio |
| Code background (gray-900) | TBD | Check | Check | Ensure 7:1+ contrast |

**Action Items:**
- Test all color combinations with contrast checker
- Adjust palette if needed: gray-700, gray-800 for labels on light backgrounds
- Ensure error colors meet minimum 5:1 ratio

### 5.4 Focus Management

**Modal open:**
```javascript
showJobDetails(index) {
    // ... existing code ...

    const modal = document.getElementById('job-details-modal');
    modal.style.display = 'flex';

    // Move focus to modal
    // Use showModal() if using native <dialog>
    modal.focus();

    // Create focus trap
    this.manageFocus = this.createFocusTrap(modal);
}
```

**Focus trap implementation:**
```javascript
createFocusTrap(element) {
    const focusableElements = element.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    return (e) => {
        if (e.key !== 'Tab') return;

        if (e.shiftKey && document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
        }
    };
}

// Remove on close
closeJobDetails() {
    const modal = document.getElementById('job-details-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    if (this.manageFocus) {
        document.removeEventListener('keydown', this.manageFocus);
    }
    // Return focus to trigger element
    const triggerButton = document.activeElement;
    if (triggerButton) triggerButton.focus();
}
```

### 5.5 Mobile Accessibility

**Touch targets:**
- Copy buttons: 28x28px minimum (currently adequate)
- Close button: 32x32px (adequate)
- Expandable section toggles: 44x44px recommended (increase from implicit)

**Readability on mobile:**
- Max-width on modal too constraining
- Increase font sizes 10-15% on mobile
- Single column layout (already responsive)

**Keyboard navigation:**
- Virtual keyboard shouldn't obscure critical info
- Scrollable content should be accessible without opening virtualkeyboard
- Consider `inputmode="none"` on non-interactive fields

---

## 6. Section-by-Section Recommendations

### 6.1 Overview Section

**Current:** Generic grid of Status, Pipeline, Duration, Job ID

**Issues:**
- Job ID (UUID) takes excessive space
- No visual distinction of status
- Pipeline type not actionable

**Recommendations:**

```html
<section class="job-details-section--critical">
    <div class="overview-content">
        <div class="overview-header">
            <div class="status-large" data-status="${job.status}">
                <span class="status-icon" aria-hidden="true"></span>
                <span>${job.status.toUpperCase()}</span>
            </div>
            <div class="overview-metrics">
                <div class="metric">
                    <span class="metric-label">Duration</span>
                    <span class="metric-value">${duration}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Pipeline</span>
                    <span class="metric-value">${pipelineType}</span>
                </div>
            </div>
        </div>

        <div class="overview-id">
            <span class="field-label">Job ID</span>
            <div class="field-value-with-action">
                <code>${jobId}</code>
                <button class="copy-btn" data-text="${jobId}">
                    <!-- copy -->
                </button>
            </div>
        </div>
    </div>
</section>
```

**CSS:**
```css
.overview-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.overview-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
}

.status-large {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 18px;
    font-weight: 700;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-success);
    color: white;
}

.status-large[data-status="failed"] {
    background: var(--color-error);
}

.status-large[data-status="running"] {
    background: var(--color-info);
}

.status-icon {
    display: inline-block;
    width: 20px;
    height: 20px;
    background-size: contain;
}

.overview-metrics {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.metric {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.metric-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-gray-600);
}

.metric-value {
    font-size: 13px;
    color: var(--color-gray-900);
}
```

### 6.2 Timestamps Section

**Current:** 3 fields in grid (Created, Started, Completed)

**Issues:**
- Grid layout wastes space
- Durations between events not shown
- Difficult to understand queue vs execution time

**Recommendation:** Use timeline visualization (see section 4.4)

### 6.3 Parameters Section

**Current:** Key-value grid, JSON.stringify for objects

**Issues:**
- Objects lose indentation in grid
- Long parameters wrap awkwardly
- No syntax highlighting

**Recommendation:**

```html
<section class="job-details-section--expandable" aria-labelledby="parametersHeading">
    <button class="section-toggle" aria-expanded="false">
        <h3 id="parametersHeading">Parameters</h3>
    </button>
    <div class="section-content" hidden>
        <div class="parameters-list">
            ${Object.entries(parameters).map(([key, value]) => `
                <div class="parameter-item">
                    <span class="param-key">${key}</span>
                    <div class="param-value">
                        ${typeof value === 'object'
                            ? `<pre>${JSON.stringify(value, null, 2)}</pre>`
                            : `<span>${value}</span>`
                        }
                    </div>
                </div>
            `).join('')}
        </div>
    </div>
</section>
```

**CSS:**
```css
.parameters-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.parameter-item {
    border: 1px solid var(--color-gray-200);
    border-radius: var(--radius-sm);
    padding: var(--space-2);
}

.param-key {
    display: block;
    font-size: 11px;
    font-weight: 600;
    color: var(--color-gray-600);
    margin-bottom: var(--space-1);
}

.param-value {
    font-size: 12px;
}

.param-value code,
.param-value pre {
    background: var(--color-gray-900);
    color: var(--color-gray-50);
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    overflow-x: auto;
    font-size: 11px;
    margin: 0;
}
```

### 6.4 Result Section

**Current:** Pipeline-specific fields + JSONReportViewer

**Issues:**
- Mixed data types (numbers, strings, objects, HTML)
- No visual affordance for interactive viewer
- Long output gets truncated

**Recommendation:**

```html
<section class="job-details-section--critical" aria-labelledby="resultHeading">
    <div class="result-header">
        <h3 id="resultHeading">Results</h3>
        ${result.scanDuration ? `
            <span class="result-metadata">
                Completed in ${result.scanDuration}ms
            </span>
        ` : ''}
    </div>

    <div class="result-content">
        ${result.totalDuplicates !== undefined ? `
            <div class="result-metric">
                <span class="metric-label">Duplicates Found</span>
                <span class="metric-value large">${result.totalDuplicates}</span>
            </div>
        ` : ''}

        ${result.reportPath ? `
            <div class="result-report" id="reportViewer-${job.id}"></div>
        ` : ''}

        ${result.output ? `
            <details>
                <summary>Raw Output</summary>
                <pre>${result.output}</pre>
            </details>
        ` : ''}
    </div>
</section>
```

**CSS:**
```css
.result-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-2);
}

.result-metadata {
    font-size: 12px;
    color: var(--color-gray-600);
}

.result-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.result-metric {
    text-align: center;
    padding: var(--space-3);
    background: var(--color-success-light);
    border-radius: var(--radius-md);
}

.result-metric .metric-label {
    display: block;
    font-size: 12px;
    color: var(--color-gray-600);
    margin-bottom: var(--space-1);
}

.result-metric .metric-value {
    display: block;
    font-size: 28px;
    font-weight: 700;
    color: var(--color-success-dark);
}

.result-metric .metric-value.large {
    font-size: 36px;
}

.result-report {
    border: 1px solid var(--color-gray-200);
    border-radius: var(--radius-md);
    overflow: hidden;
}

.result-report details {
    cursor: pointer;
}

.result-report summary {
    padding: var(--space-2) var(--space-3);
    background: var(--color-gray-50);
    border-bottom: 1px solid var(--color-gray-200);
    font-weight: 600;
    color: var(--color-gray-900);
}

.result-report details[open] summary {
    border-bottom-color: transparent;
}

.result-report pre {
    background: var(--color-gray-900);
    color: var(--color-gray-50);
    padding: var(--space-3);
    margin: 0;
    overflow-x: auto;
    font-size: 11px;
}
```

### 6.5 Error Section

**Current:** `<pre>` block with JSON.stringify

**Issues:**
- Styled identically to regular content
- No visual distinction of severity
- Long errors get cut off
- No parsing for readability

**Recommendation:** (See section 4.3 - Error Section Emphasis)

### 6.6 Git Workflow Section

**Current:** Plain text fields and links

**Issues:**
- No visual indication of PR status
- File paths hard to scan
- Commit SHA not copyable

**Recommendation:** (See section 4.5 - Git Workflow Section Enhancements)

---

## 7. Summary of Priority Improvements

### Tier 1 (High Impact, Low Effort)
1. Add copy-to-clipboard buttons for Job ID, Branch, Commit SHA
2. Restructure modal content order: Status → Error/Result → Metadata
3. Add status badge styling with semantic colors
4. Make Timestamps/Parameters/Overview collapsible
5. Increase field-label font-weight and field-value font-size for better hierarchy

### Tier 2 (High Impact, Medium Effort)
6. Implement timeline visualization for timestamps
7. Restructure Error section with prominent styling and details widget
8. Enhance Git Workflow section with PR badges and file icons
9. Create three section types (critical, secondary, expandable) with distinct styling
10. Improve Result section for pipeline-specific data (duplicates count, etc.)

### Tier 3 (Medium Impact, Medium Effort)
11. Implement focus trap and focus return for accessibility
12. Add keyboard shortcuts (Cmd+C for copy, Ctrl+K for search)
13. Implement syntax highlighting for code blocks
14. Add animations for state transitions (collapsible sections)
15. Create mobile-specific optimizations (larger touch targets, adjusted typography)

### Tier 4 (Accessibility, Lower Priority)
16. Audit and fix color contrast ratios
17. Add proper ARIA labels and roles (use semantic HTML)
18. Implement proper error announcements with `role="alert"`
19. Test with screen readers and keyboard navigation
20. Create focus indicators that meet WCAG 2.1 Level AAA

---

## 8. Implementation Checklist

- [ ] Refactor HTML structure to use semantic elements (`<dialog>`, `<section>`, `<header>`)
- [ ] Create CSS class variants for section types (critical, secondary, expandable)
- [ ] Implement copy-to-clipboard functionality with visual feedback
- [ ] Create collapsible section toggle with aria-expanded state
- [ ] Redesign timestamps as timeline instead of grid
- [ ] Restructure error section with details widget and prominent styling
- [ ] Enhance git workflow fields with copy buttons and PR badges
- [ ] Update typography hierarchy (label font-weight, value font-size)
- [ ] Test color contrast ratios and adjust palette if needed
- [ ] Implement focus trap and focus return management
- [ ] Add ARIA labels, roles, and live regions
- [ ] Test keyboard navigation (Tab, Enter, Escape)
- [ ] Test with screen readers (NVDA, JAWS, VoiceOver)
- [ ] Verify mobile responsiveness (< 768px, < 480px)
- [ ] Add loading states and error handling
- [ ] Document modal behavior in accessibility guide

---

**Document Version:** 1.0
**Last Updated:** November 24, 2025
**Status:** Ready for implementation planning
