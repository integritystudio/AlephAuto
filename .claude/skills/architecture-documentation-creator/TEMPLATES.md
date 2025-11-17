# Architecture Documentation Templates

This file contains ready-to-use templates for creating comprehensive technical documentation.

## Table of Contents

- [README.md Template](#readmemd-template)
- [Detailed Documentation Template](#detailed-documentation-template)
- [Cheat Sheet Template](#cheat-sheet-template)
- [Algorithm Documentation Template](#algorithm-documentation-template)
- [Data Flow Documentation Template](#data-flow-documentation-template)
- [Troubleshooting Guide Template](#troubleshooting-guide-template)
- [API Reference Template](#api-reference-template)

---

## README.md Template

```markdown
# System Name - Architecture Documentation

**Version**: 1.0 | **Last Updated**: YYYY-MM-DD

## Overview

[2-3 paragraph overview of what this system does, why it exists, and its key characteristics]

## Quick Start

1. [First step to get started]
2. [Second step]
3. [Third step]

## Documentation Structure

This documentation is organized into several files:

- **[README.md](README.md)** (this file) - Architecture overview and navigation
- **[{system}-data-flow.md]({system}-data-flow.md)** - Detailed data flow and component breakdown
- **[{algorithm}.md]({algorithm}.md)** - Algorithm deep dive and implementation details
- **[CHEAT-SHEET.md](CHEAT-SHEET.md)** - One-page print-friendly quick reference

## Architecture Overview

[High-level description of system architecture]

### System Diagram

\`\`\`mermaid
flowchart TD
    A[Component A] --> B[Component B]
    B --> C[Component C]
    C --> D[Output]
\`\`\`

## Key Components

| Component | Purpose | Location |
|-----------|---------|----------|
| Component A | What it does | `path/to/file.ext` |
| Component B | What it does | `path/to/file.ext` |
| Component C | What it does | `path/to/file.ext` |

## Critical Patterns

### Pattern 1: [Name]

**Why it matters**: [Explanation]

\`\`\`language
# ✅ CORRECT
[correct code example]

# ❌ WRONG
[incorrect code example]
\`\`\`

**Location**: `file.ext:line-range`

### Pattern 2: [Name]

[Similar structure]

## Quick Reference

### Common Commands

\`\`\`bash
# Start the system
command start

# Run tests
command test

# Check status
command status
\`\`\`

### Configuration

- `CONFIG_VAR_1`: Description (default: value)
- `CONFIG_VAR_2`: Description (default: value)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Common error 1 | How to fix |
| Common error 2 | How to fix |

For detailed troubleshooting, see [CHEAT-SHEET.md](CHEAT-SHEET.md).

## Performance

| Metric | Value | Notes |
|--------|-------|-------|
| Throughput | 1000/sec | Typical workload |
| Latency | 10ms | P95 |

## Getting Help

For detailed information:
- **Data Flow**: See [data flow documentation]({system}-data-flow.md)
- **Algorithms**: See [algorithm documentation]({algorithm}.md)
- **Quick Reference**: See [cheat sheet](CHEAT-SHEET.md)

## References

- Related documentation links
- External resources
- Project links

---

**Next Steps**: [Link to getting started guide or detailed docs]
```

---

## Detailed Documentation Template

```markdown
# System Name - Detailed Technical Documentation

**Version**: 1.0 | **Last Updated**: YYYY-MM-DD

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Component Breakdown](#component-breakdown)
- [Data Flow](#data-flow)
- [Data Models](#data-models)
- [Performance](#performance)
- [Error Handling](#error-handling)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## Overview

### Purpose

[What this system does and why]

### Key Features

- Feature 1: Description
- Feature 2: Description
- Feature 3: Description

### Architecture Principles

1. Principle 1: Explanation
2. Principle 2: Explanation
3. Principle 3: Explanation

## Architecture

### High-Level Overview

\`\`\`mermaid
flowchart TD
    A[Input] --> B[Stage 1]
    B --> C[Stage 2]
    C --> D[Stage 3]
    D --> E[Output]
\`\`\`

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|----------|
| Frontend | [Tech] | [Purpose] |
| Backend | [Tech] | [Purpose] |
| Database | [Tech] | [Purpose] |

## Component Breakdown

### Component 1: [Name]

**Purpose**: [What this component does]

**Location**: `path/to/component.ext`

**Dependencies**:
- Dependency 1
- Dependency 2

**Input**: [What it receives]

**Processing**: [What it does]

**Output**: [What it produces]

#### Component Diagram

\`\`\`mermaid
flowchart LR
    Input --> Processing
    Processing --> Output
\`\`\`

#### Implementation Details

\`\`\`language
// Key implementation code
function componentLogic() {
  // ...
}
\`\`\`

**Critical Patterns**:

\`\`\`language
// ✅ CORRECT
[correct pattern]

// ❌ WRONG
[incorrect pattern]
\`\`\`

### Component 2: [Name]

[Same structure as Component 1]

## Data Flow

### Complete Flow Diagram

\`\`\`mermaid
sequenceDiagram
    participant A as Component A
    participant B as Component B
    participant C as Component C

    A->>B: Request (JSON)
    B->>C: Process
    C-->>B: Result
    B-->>A: Response (JSON)
\`\`\`

### Stage-by-Stage Flow

#### Stage 1: [Name]

**Input Format**:
\`\`\`json
{
  "field1": "value",
  "field2": 123
}
\`\`\`

**Processing**:
1. Step 1
2. Step 2
3. Step 3

**Output Format**:
\`\`\`json
{
  "result": "value",
  "status": "success"
}
\`\`\`

**Performance**: ~Xms typical

#### Stage 2: [Name]

[Same structure]

## Data Models

### Model 1: [Name]

**Definition**:
\`\`\`language
class ModelName {
  field1: Type
  field2: Type
  field3: Type
}
\`\`\`

**Field Descriptions**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| field1 | Type | Yes | What it contains |
| field2 | Type | No | What it contains |

**Example**:
\`\`\`json
{
  "field1": "example",
  "field2": "example"
}
\`\`\`

**Validation Rules**:
- Rule 1
- Rule 2

### Model 2: [Name]

[Same structure]

## Performance

### Benchmarks

| Operation | Small | Medium | Large |
|-----------|-------|--------|-------|
| Operation 1 | 10ms | 100ms | 1s |
| Operation 2 | 20ms | 200ms | 2s |

### Bottleneck Analysis

1. **Component X**: Why it's slow, optimization strategy
2. **Component Y**: Why it's slow, optimization strategy

### Optimization Strategies

- Strategy 1: Description and expected improvement
- Strategy 2: Description and expected improvement

## Error Handling

### Error Types

| Error Code | Meaning | Cause | Solution |
|------------|---------|-------|----------|
| ERR_001 | Description | Why it happens | How to fix |
| ERR_002 | Description | Why it happens | How to fix |

### Error Flow

\`\`\`mermaid
flowchart TD
    A[Error Occurs] --> B{Recoverable?}
    B -->|Yes| C[Retry]
    B -->|No| D[Log & Alert]
    C --> E{Success?}
    E -->|Yes| F[Continue]
    E -->|No| D
\`\`\`

## Examples

### Example 1: [Common Use Case]

**Scenario**: [Description]

**Code**:
\`\`\`language
// Complete working example
const result = system.process({
  input: "data"
});
// Expected: { status: "success", result: "processed" }
\`\`\`

**Explanation**: [What's happening and why]

### Example 2: [Edge Case]

[Same structure]

## Troubleshooting

### Issue: [Problem Description]

**Symptoms**:
- Observable behavior 1
- Observable behavior 2

**Root Cause**: [Why this happens]

**Solution**:
1. Step 1
2. Step 2

**Verification**: [How to confirm it's fixed]

### Issue: [Another Problem]

[Same structure]

## References

- File locations with line numbers
- Related documentation
- External resources

---

**For Quick Reference**: See [CHEAT-SHEET.md](CHEAT-SHEET.md)
```

---

## Cheat Sheet Template

```markdown
# System Name - Quick Reference Cheat Sheet

**Version**: 1.0 | **Last Updated**: YYYY-MM-DD | **Print This Page**

---

## System Overview

\`\`\`
[ASCII diagram of system architecture]
Component A → Component B → Component C → Output
\`\`\`

## ⚠️ Critical Patterns (MUST FOLLOW)

### 1. Pattern Name

\`\`\`language
// ✅ CORRECT
[correct code]

// ❌ WRONG
[incorrect code]
\`\`\`
**Location**: `file.ext:line-range`

### 2. Pattern Name

[Same structure]

### 3. Pattern Name

[Same structure]

---

## Key Components

| Component | Purpose | Location |
|-----------|---------|----------|
| Component A | What it does | `path/to/file.ext` |
| Component B | What it does | `path/to/file.ext` |

---

## Common Commands

\`\`\`bash
# Start system
command start

# Run tests
command test

# Check status
command status
\`\`\`

---

## Data Models

### ModelName
\`\`\`json
{
  "field1": "type",    // Description
  "field2": 123,       // Description
  "field3": []         // Description
}
\`\`\`

---

## Quick Reference Tables

### Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| option1 | value | What it does |
| option2 | value | What it does |

### Performance Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| Throughput | 1000/s | Typical |
| Latency | 10ms | P95 |

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Error 1 | Why | How to fix |
| Error 2 | Why | How to fix |
| Error 3 | Why | How to fix |

---

## File Locations

**Critical Files**:
- `path/to/file1.ext:line-range` - What it contains
- `path/to/file2.ext:line-range` - What it contains

**Documentation**:
- `docs/README.md` - Start here
- `docs/detailed.md` - Deep dive
- `docs/CHEAT-SHEET.md` - This page

---

**Print this page and keep it at your desk for quick reference!**
```

---

## Algorithm Documentation Template

```markdown
# Algorithm Name

**Version**: 1.0 | **Last Updated**: YYYY-MM-DD

## Overview

[1-2 paragraph explanation of what this algorithm does and why]

## Use Cases

- Use case 1: Description
- Use case 2: Description

## Architecture

### High-Level Flow

\`\`\`mermaid
flowchart TD
    A[Phase 1: Name] --> B[Phase 2: Name]
    B --> C[Phase 3: Name]
    C --> D[Output]
\`\`\`

### Key Characteristics

- Characteristic 1: Description
- Characteristic 2: Description

## Phase-by-Phase Breakdown

### Phase 1: [Name]

**Purpose**: [What this phase does]

**Input**: [What it receives]

**Processing**:
1. Step 1: Description
2. Step 2: Description
3. Step 3: Description

**Output**: [What it produces]

**Code Example**:
\`\`\`language
function phase1(input) {
  // Implementation
  return result;
}
\`\`\`

**Performance**: ~Xms typical

### Phase 2: [Name]

[Same structure as Phase 1]

### Phase 3: [Name]

[Same structure as Phase 1]

## Complete Algorithm Flow

\`\`\`language
function completeAlgorithm(input) {
  // Phase 1
  const phase1Result = phase1(input);

  // Phase 2
  const phase2Result = phase2(phase1Result);

  // Phase 3
  const finalResult = phase3(phase2Result);

  return finalResult;
}
\`\`\`

## Implementation Examples

### Example 1: Typical Case

**Input**:
\`\`\`language
input = {
  field1: "value",
  field2: 123
}
\`\`\`

**Processing**:
\`\`\`language
// Phase 1: ...
// Phase 2: ...
// Phase 3: ...
\`\`\`

**Output**:
\`\`\`language
output = {
  result: "processed",
  score: 0.95
}
\`\`\`

**Explanation**: [What happened and why]

### Example 2: Edge Case

[Same structure]

### Example 3: Error Case

[Same structure]

## Common Pitfalls

### Pitfall 1: [Name]

**Problem**: [What developers do wrong]

\`\`\`language
// ✅ CORRECT
[correct approach]

// ❌ WRONG
[incorrect approach]
\`\`\`

**Why it matters**: [Consequences of doing it wrong]

### Pitfall 2: [Name]

[Same structure]

## Performance Characteristics

### Time Complexity

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| Phase 1 | O(n) | Linear |
| Phase 2 | O(n log n) | Sorting |
| Overall | O(n log n) | Dominated by Phase 2 |

### Space Complexity

- Phase 1: O(n)
- Phase 2: O(1)
- Overall: O(n)

### Benchmarks

| Input Size | Processing Time |
|------------|----------------|
| Small (<100) | 5ms |
| Medium (100-1k) | 50ms |
| Large (1k-10k) | 500ms |

## Accuracy Metrics

[If applicable]

| Metric | Value | Interpretation |
|--------|-------|----------------|
| Precision | 95% | Few false positives |
| Recall | 90% | Most positives found |
| F1 Score | 92.5% | Balanced |

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| threshold | 0.90 | Cutoff for acceptance |
| maxIterations | 100 | Stop condition |

## References

- Implementation: `path/to/file.ext:line-range`
- Tests: `path/to/test.ext`
- Related algorithms: [Link]

---

**For Quick Reference**: See [CHEAT-SHEET.md](CHEAT-SHEET.md)
```

---

## Data Flow Documentation Template

```markdown
# System Name - Data Flow Documentation

**Version**: 1.0 | **Last Updated**: YYYY-MM-DD

## Overview

[Description of the overall data flow]

## Complete Flow Diagram

\`\`\`mermaid
flowchart TD
    A[Input Source] --> B[Stage 1]
    B --> C[Stage 2]
    C --> D[Stage 3]
    D --> E[Output Destination]
\`\`\`

## Data Format Specifications

### Input Format

\`\`\`json
{
  "field1": "string",
  "field2": 123,
  "nested": {
    "field3": true
  }
}
\`\`\`

**JSON Schema**:
\`\`\`json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "field1": { "type": "string" },
    "field2": { "type": "integer" }
  },
  "required": ["field1"]
}
\`\`\`

### Output Format

[Same structure as input]

## Stage-by-Stage Data Flow

### Stage 1: [Name]

**Purpose**: [What this stage does]

**Input**:
\`\`\`json
{
  "field1": "value"
}
\`\`\`

**Processing**:
1. Validates input format
2. Extracts field1
3. Transforms data

**Output**:
\`\`\`json
{
  "field1": "transformed_value",
  "metadata": {
    "stage": 1,
    "timestamp": "2025-11-17T12:00:00Z"
  }
}
\`\`\`

**Transformations**:
- field1: string → uppercase string
- Adds metadata object

**Error Handling**:
- If field1 missing → Error: MISSING_REQUIRED_FIELD
- If field1 empty → Error: EMPTY_VALUE

**Performance**: ~10ms typical

#### Stage 1 Diagram

\`\`\`mermaid
flowchart LR
    A[Input] --> B{Valid?}
    B -->|Yes| C[Transform]
    B -->|No| D[Error]
    C --> E[Output]
\`\`\`

### Stage 2: [Name]

[Same structure as Stage 1]

### Stage 3: [Name]

[Same structure as Stage 1]

## Data Transformations

### Transformation 1: [Name]

**Input**: `original_value`
**Output**: `transformed_value`
**Logic**: [Transformation logic]

**Example**:
\`\`\`
Input:  "hello world"
Output: "HELLO WORLD"
\`\`\`

### Transformation 2: [Name]

[Same structure]

## Error Handling

### Error Flow

\`\`\`mermaid
flowchart TD
    A[Error Occurs] --> B{Stage?}
    B -->|Stage 1| C[Validation Error]
    B -->|Stage 2| D[Processing Error]
    B -->|Stage 3| E[Output Error]
    C --> F[Log & Return Error Response]
    D --> F
    E --> F
\`\`\`

### Error Codes

| Code | Stage | Meaning | Recovery |
|------|-------|---------|----------|
| E001 | 1 | Invalid input | Fix input format |
| E002 | 2 | Processing failed | Retry with different parameters |
| E003 | 3 | Output error | Check output destination |

## Performance Characteristics

### Processing Time by Stage

| Stage | Typical | P95 | P99 |
|-------|---------|-----|-----|
| Stage 1 | 10ms | 20ms | 50ms |
| Stage 2 | 50ms | 100ms | 200ms |
| Stage 3 | 5ms | 10ms | 20ms |
| **Total** | **65ms** | **130ms** | **270ms** |

### Bottleneck Analysis

1. **Stage 2 - Processing**: Most time-consuming, consider parallelization
2. **Stage 1 - Validation**: JSON parsing overhead, consider schema caching

## Examples

### Example 1: Complete Success Flow

**Input**:
\`\`\`json
{
  "field1": "hello",
  "field2": 123
}
\`\`\`

**Stage 1 Output**:
\`\`\`json
{
  "field1": "HELLO",
  "field2": 123,
  "metadata": { "stage": 1 }
}
\`\`\`

**Stage 2 Output**:
\`\`\`json
{
  "field1": "HELLO",
  "field2": 123,
  "processed": true,
  "metadata": { "stage": 2 }
}
\`\`\`

**Final Output**:
\`\`\`json
{
  "result": "HELLO",
  "count": 123,
  "status": "success"
}
\`\`\`

### Example 2: Error Case

[Same structure showing error flow]

## References

- Implementation files with line numbers
- Related documentation
- External specifications

---

**For Quick Reference**: See [CHEAT-SHEET.md](CHEAT-SHEET.md)
```

---

## Troubleshooting Guide Template

```markdown
# System Name - Troubleshooting Guide

**Version**: 1.0 | **Last Updated**: YYYY-MM-DD

## Quick Troubleshooting Table

| Issue | Cause | Solution |
|-------|-------|----------|
| Error message 1 | Why it happens | How to fix |
| Error message 2 | Why it happens | How to fix |
| Error message 3 | Why it happens | How to fix |

## Detailed Troubleshooting

### Issue: [Problem Description]

**Category**: [Performance / Error / Configuration]

**Symptoms**:
- Observable behavior 1
- Observable behavior 2
- Error messages or logs

**Common Causes**:
1. Cause 1: Description
2. Cause 2: Description
3. Cause 3: Description

**Diagnostic Steps**:
1. Check X: `command to check`
2. Verify Y: `command to verify`
3. Inspect Z: `where to look`

**Solution**:

**For Cause 1**:
\`\`\`bash
# Step 1
command fix-step-1

# Step 2
command fix-step-2
\`\`\`

**For Cause 2**:
[Similar structure]

**Verification**:
\`\`\`bash
# Verify the fix worked
command verify
# Expected output: ...
\`\`\`

**Prevention**:
- How to avoid this in the future
- Configuration changes
- Best practices

**Related Issues**: [Links to related problems]

### Issue: [Another Problem]

[Same structure]

## Common Error Messages

### Error: "ERROR_CODE_001"

**Full Message**:
\`\`\`
ERROR: ERROR_CODE_001 - Detailed error message here
\`\`\`

**Meaning**: [What this error actually means]

**Causes**:
1. Most common cause
2. Less common cause

**Fix**:
\`\`\`bash
# Quick fix
command fix
\`\`\`

**See**: [Link to detailed issue section]

### Error: "ERROR_CODE_002"

[Same structure]

## Performance Issues

### Symptom: Slow Processing

**Diagnosis**:
\`\`\`bash
# Check processing time
command benchmark

# Check resource usage
command monitor
\`\`\`

**Common Causes**:
1. Large input size → Solution: Batch processing
2. Inefficient algorithm → Solution: Optimize
3. Resource constraints → Solution: Scale up

**Optimization Steps**:
1. Step 1 with code example
2. Step 2 with code example

**Expected Improvement**: [Quantified improvement]

## Configuration Issues

### Issue: Incorrect Configuration

**Symptoms**:
- System behavior
- Error messages

**Check Configuration**:
\`\`\`bash
# View current config
command show-config

# Validate config
command validate-config
\`\`\`

**Common Mistakes**:

| Configuration | Wrong Value | Correct Value | Impact |
|--------------|-------------|---------------|--------|
| config1 | wrong | correct | What breaks |
| config2 | wrong | correct | What breaks |

**Fix Configuration**:
\`\`\`bash
# Update config
command set-config key=value

# Restart system
command restart
\`\`\`

## Debugging Tools

### Tool 1: [Name]

**Purpose**: [What it helps with]

**Usage**:
\`\`\`bash
command --option value
\`\`\`

**Output Interpretation**:
- Output 1: Meaning
- Output 2: Meaning

### Tool 2: [Name]

[Same structure]

## Getting Help

If troubleshooting steps don't resolve your issue:

1. **Check Logs**:
   - Location: `path/to/logs`
   - Look for: Error patterns

2. **Gather Information**:
   - System version: `command --version`
   - Configuration: `command show-config`
   - Error messages: Full text

3. **Report Issue**:
   - Include gathered information
   - Steps to reproduce
   - Expected vs actual behavior

## References

- Main documentation: [Link]
- Configuration guide: [Link]
- API reference: [Link]

---

**For Quick Reference**: See [CHEAT-SHEET.md](CHEAT-SHEET.md)
```

---

## API Reference Template

```markdown
# System Name - API Reference

**Version**: 1.0 | **Last Updated**: YYYY-MM-DD

## Overview

[Brief description of the API]

**Base URL**: `https://api.example.com/v1`

**Authentication**: [Method used]

## Endpoints

### GET /resource

**Description**: [What this endpoint does]

**Authentication**: Required / Not Required

**Request**:

**Headers**:
\`\`\`
Authorization: Bearer {token}
Content-Type: application/json
\`\`\`

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| param1 | string | Yes | Description |
| param2 | integer | No | Description (default: value) |

**Example Request**:
\`\`\`bash
curl -X GET "https://api.example.com/v1/resource?param1=value" \
  -H "Authorization: Bearer token"
\`\`\`

**Response**:

**Success (200 OK)**:
\`\`\`json
{
  "status": "success",
  "data": {
    "field1": "value",
    "field2": 123
  }
}
\`\`\`

**Error (400 Bad Request)**:
\`\`\`json
{
  "status": "error",
  "error": {
    "code": "INVALID_PARAM",
    "message": "param1 is required"
  }
}
\`\`\`

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| status | string | "success" or "error" |
| data | object | Response data |

### POST /resource

[Same structure as GET]

### PUT /resource/:id

[Same structure]

### DELETE /resource/:id

[Same structure]

## Data Models

### Model: Resource

\`\`\`json
{
  "id": "string",
  "name": "string",
  "created_at": "2025-11-17T12:00:00Z",
  "metadata": {}
}
\`\`\`

**Field Descriptions**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique identifier |
| name | string | Yes | Resource name |

## Error Codes

| Code | HTTP Status | Meaning | Solution |
|------|-------------|---------|----------|
| INVALID_PARAM | 400 | Missing required parameter | Provide parameter |
| UNAUTHORIZED | 401 | Invalid or missing token | Check authentication |
| NOT_FOUND | 404 | Resource doesn't exist | Verify resource ID |

## Rate Limiting

- **Limit**: 1000 requests per hour
- **Headers**:
  - `X-RateLimit-Limit`: Total limit
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Reset timestamp

## Examples

### Example 1: Create Resource

\`\`\`bash
curl -X POST "https://api.example.com/v1/resource" \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "example",
    "metadata": {}
  }'
\`\`\`

**Response**:
\`\`\`json
{
  "status": "success",
  "data": {
    "id": "res_123",
    "name": "example"
  }
}
\`\`\`

### Example 2: [Another Use Case]

[Same structure]

## SDKs and Libraries

- **JavaScript**: [Link to SDK]
- **Python**: [Link to SDK]
- **Go**: [Link to SDK]

## References

- Authentication guide: [Link]
- Changelog: [Link]
- Support: [Link]

---

**For Quick Reference**: See [CHEAT-SHEET.md](CHEAT-SHEET.md)
```
