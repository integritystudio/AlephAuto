# AlephAuto - Quick Reference Cheat Sheet

**Version**: 2.0 | **Last Updated**: 2025-12-02 | **Print This Page for Quick Reference**

---

## 🏗️ Complete System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  DASHBOARD (React/Vite)  ←──WebSocket──→  API SERVER (Express 5)   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │       JOB QUEUE FRAMEWORK      │
                    │       (SidequestServer)        │
                    │   ┌─────┬─────┬─────┬─────┐   │
                    │   │ DD  │ SE  │ GA  │ RC  │   │  10 Workers
                    │   └─────┴─────┴─────┴─────┘   │
                    └───────────────┬───────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
┌───────┴───────┐         ┌────────┴────────┐         ┌────────┴────────┐
│   SQLite DB   │         │   File System   │         │    External     │
│  (jobs.db)    │         │   (reports)     │         │  (Sentry, Git)  │
└───────────────┘         └─────────────────┘         └─────────────────┘
```

### System at a Glance

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React + Vite + Zustand | Real-time dashboard UI |
| **API** | Express 5 + WebSocket | REST API + real-time events |
| **Queue** | SidequestServer | Job lifecycle management |
| **Workers** | 10 specialized workers | Pipeline execution |
| **Database** | SQLite (WAL) | Job persistence |
| **Config** | Doppler | Secrets management |
| **Monitoring** | Sentry v8 | Error tracking |

---

## 🔄 7-Stage Pipeline Overview

```
Stage 1-2 (JavaScript)          Stage 3-7 (Python)
┌──────────────────┐           ┌──────────────────────────┐
│ Repo Scanner     │──JSON──▶  │ Block Extraction (3)     │
│ AST-Grep Rules   │  stdin/   │ Deduplication (3.5)      │
│                  │  stdout   │ Semantic Annotation (4)  │
└──────────────────┘           │ Duplicate Grouping (5)   │
                               │ Suggestions (6)          │
                               │ Reports (7)              │
                               └──────────────────────────┘
```

## ⚠️ Critical Patterns (MUST FOLLOW)

### 1. Two-Phase Similarity Algorithm
```python
# ✅ CORRECT: Extract features BEFORE normalization
features = extract_semantic_features(code)    # PHASE 1: Original code
normalized = normalize_code(code)             # PHASE 2: Normalize
penalty = calculate_semantic_penalty(features1, features2)  # PHASE 3

# ❌ WRONG: Normalizing first destroys semantic features
```
**Location**: `sidequest/pipeline-core/similarity/structural.py:29-93, 422-482`

### 2. Function-Based Deduplication
```python
# ✅ CORRECT: Use file:function_name
function_key = f"{file_path}:{function_name}"

# ❌ WRONG: Line numbers change during edits
function_key = f"{file_path}:{line_number}"
```
**Location**: `sidequest/pipeline-core/extractors/extract_blocks.py:108-163`

### 3. Correct Field Names
```python
# ✅ CORRECT: Use 'tags' field
CodeBlock(tags=[f"function:{name}"])

# ❌ WRONG: Field doesn't exist
CodeBlock(semantic_tags=[f"function:{name}"])
```
**Location**: `sidequest/pipeline-core/extractors/extract_blocks.py:231`

### 4. Backwards Function Search
```python
# ✅ CORRECT: Search backwards to find CLOSEST function
for i in range(line_start - 1, search_start - 1, -1):
    if 'function' in lines[i]:
        function_name = extract_function_name(lines[i])
        break
```
**Location**: `sidequest/pipeline-core/extractors/extract_blocks.py:80-98`

### 5. Nullish Coalescing for Numbers
```javascript
// ✅ CORRECT: Allows 0 as valid value
this.maxConcurrent = options.maxConcurrent ?? 5;

// ❌ WRONG: Treats 0 as falsy
this.maxConcurrent = options.maxConcurrent || 5;
```
**Location**: `sidequest/core/server.ts:18`

---

## 📊 Similarity Algorithm Penalties

| Difference Type | Example | Multiplier | Penalty |
|-----------------|---------|------------|---------|
| **HTTP Status** | 200 vs 201 | 0.70x | 30% |
| **Logical Ops** | === vs !== | 0.80x | 20% |
| **Semantic Methods** | Math.max vs Math.min | 0.75x | 25% |
| **Multiple** | All three | 0.42x | 58% |

**Penalties multiply**: `0.70 × 0.80 × 0.75 = 0.42`

---

## 🎯 Key Components

| Component | Purpose | Location |
|-----------|---------|----------|
| **Scan Orchestrator** | Pipeline coordinator | `sidequest/pipeline-core/scan-orchestrator.ts` |
| **Repository Scanner** | Git validation, repomix | `sidequest/pipeline-core/scanners/repository-scanner.ts` |
| **AST-Grep Detector** | Pattern detection (18 rules) | `sidequest/pipeline-core/scanners/ast-grep-detector.ts` |
| **Block Extractor** | Python stages 3-7 | `sidequest/pipeline-core/extractors/extract_blocks.py` |
| **Similarity Engine** | Multi-layer algorithm | `sidequest/pipeline-core/similarity/structural.py` |
| **AST-Grep Rules** | Detection patterns | `.ast-grep/rules/` |

---

## 🚀 Common Commands

```bash
# Run duplicate detection
doppler run -- node --strip-types sidequest/pipeline-core/scan-orchestrator.ts /path/to/repo

# Test immediately (bypass cron)
doppler run -- RUN_ON_STARTUP=true node --strip-types sidequest/pipeline-runners/duplicate-detection-pipeline.ts

# Similarity grouping regression test
PYTHONNOUSERSITE=1 python -m pytest -q sidequest/pipeline-core/similarity/test_grouping_layer3.py

# Start API server
doppler run -- node --strip-types api/server.ts

# Run tests
npm test                                    # All tests (132)
npm run test:api                            # REST API (16)
npm run test:websocket                      # WebSocket (15)

# Type checking
npm run typecheck
```

---

## 🔍 Data Models (Pydantic)

### CodeBlock
```python
{
  "content": str,              # Code text
  "file_path": str,            # Source file
  "line_start": int,           # Start line
  "line_end": int,             # End line
  "function_name": str,        # Containing function
  "tags": List[str],           # ["function:foo"] ✅ NOT semantic_tags!
  "pattern_name": str          # AST-grep rule name
}
```

### SemanticFeatures
```python
{
  "http_status_codes": Set[int],     # {200, 201, 404}
  "logical_operators": Set[str],     # {"===", "!=="}
  "semantic_methods": Set[str]       # {"Math.max", "Array.filter"}
}
```

### DuplicateGroup
```python
{
  "representative": CodeBlock,       # First block
  "duplicates": List[CodeBlock],     # Similar blocks
  "similarity_score": float,         # 0.0 - 1.0
  "layer": int                       # 0, 1, or 2
}
```

---

## 🐛 Troubleshooting Quick Reference

| Issue | Cause | Solution |
|-------|-------|----------|
| **False positives** | Penalties too lenient | Check similarity threshold (default: 0.90) |
| **Missing duplicates** | Threshold too strict | Lower threshold or check normalization |
| **Wrong function names** | Forward search | Verify backwards search (extract_blocks.py:80-98) |
| **Field errors** | semantic_tags used | Change to `tags` field |
| **0 treated as false** | Using \|\| operator | Use ?? instead |
| **Timeout errors** | Large repository | Check 10-minute timeout, optimize scan |
| **Redis errors** | Redis not running | `redis-cli ping` should return PONG |

---

## 📈 Accuracy Metrics

| Metric | Value | Meaning |
|--------|-------|---------|
| **Precision** | 100% | No false positives |
| **Recall** | 87.50% | Finds 7/8 duplicates |
| **F1 Score** | 93.33% | Balanced performance |
| **Performance** | ~5ms | Per comparison |

---

## 📁 Quick File References

**Critical Implementation Files**:
- `sidequest/pipeline-core/similarity/structural.py:29-93` - Feature extraction
- `sidequest/pipeline-core/similarity/structural.py:422-482` - Penalty calculation
- `sidequest/pipeline-core/extractors/extract_blocks.py:80-98` - Function name search
- `sidequest/pipeline-core/extractors/extract_blocks.py:108-163` - Deduplication logic
- `sidequest/pipeline-core/extractors/extract_blocks.py:231` - CodeBlock creation (use `tags`)
- `sidequest/core/server.ts:18` - Nullish coalescing pattern

**Documentation**:
- `docs/architecture/README.md` - Start here
- `docs/architecture/pipeline-data-flow.md` - Complete pipeline docs
- `docs/architecture/similarity-algorithm.md` - Algorithm deep dive
- `CLAUDE.md` - Project instructions

---

## 🔗 Multi-Layer Grouping

| Layer | Purpose | Threshold | Filter |
|-------|---------|-----------|--------|
| **Layer 0** | Remove trivial | ≥0.95 | Complexity check |
| **Layer 1** | High confidence | ≥0.90 | Semantic validation |
| **Layer 2** | Potential matches | ≥0.75 | Manual review needed |

---

## ⚙️ Configuration Access

```javascript
// ✅ CORRECT: Use centralized config
import { config } from './sidequest/core/config.ts';
const dsn = config.sentryDsn;

// ❌ WRONG: Never use process.env directly
const dsn = process.env.SENTRY_DSN;
```

---

## 🌐 API Quick Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Basic health check |
| `/api/status` | GET | Full system status |
| `/api/scans/start` | POST | Start intra-project scan |
| `/api/scans/start-multi` | POST | Start inter-project scan |
| `/api/scans/:id/status` | GET | Get scan status |
| `/api/scans/:id/results` | GET | Get scan results |
| `/api/jobs` | GET | List all jobs |
| `/api/jobs/:id` | GET | Job details |
| `/api/jobs/:id/cancel` | POST | Cancel job |
| `/api/jobs/:id/retry` | POST | Retry failed job |
| `/api/pipelines` | GET | List pipelines |

---

## 🔄 Job Lifecycle

```
Created → Queued → Running → Completed
                      ↓
               RetryPending → Failed
```

| State | Events | DB Update |
|-------|--------|-----------|
| **Created** | `job:created` | INSERT |
| **Running** | `job:started` | UPDATE |
| **Completed** | `job:completed` | UPDATE |
| **Failed** | `job:failed` | UPDATE |

---

## 📞 Need More Info?

- **System Architecture**: `docs/architecture/SYSTEM-DATA-FLOW.md` ⭐ NEW
- **Architecture Overview**: `docs/architecture/README.md`
- **Pipeline Details**: `docs/architecture/pipeline-data-flow.md`
- **Algorithm Deep Dive**: `docs/architecture/similarity-algorithm.md`
- **Project Instructions**: `CLAUDE.md`

**Print this page and keep it at your desk for quick reference!**
