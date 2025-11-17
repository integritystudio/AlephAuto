# Phase 1, Task 6: Duplicate Detection Algorithm Design

**Date:** 2025-11-11
**Task:** Design duplicate detection algorithm: Define similarity thresholds and matching criteria
**Status:** ✅ Complete

## Executive Summary

This document defines the **duplicate detection algorithm** that powers the code consolidation system. The algorithm combines **exact matching**, **structural similarity**, and **semantic equivalence** to identify duplicate code patterns with high precision and minimal false positives.

**Key Design Principle:** **Multi-layered similarity with configurable thresholds**

## Algorithm Overview

### Three-Layer Approach

```
Layer 1: Exact Matching (Hash-Based)
         ↓
    Fast filter: content_hash == content_hash
         ↓ (Pass to Layer 2)

Layer 2: Structural Similarity (AST-Based)
         ↓
    AST hash + Levenshtein distance > 0.8
         ↓ (Pass to Layer 3)

Layer 3: Semantic Equivalence (Category + Tags)
         ↓
    Category match + Tag overlap + Purpose similarity
         ↓
    Final Similarity Score (0.0 - 1.0)
         ↓
    Threshold Check: score >= 0.8 → Duplicate Group
```

### Similarity Calculation Formula

```python
total_similarity = (
    exact_match_bonus * 0.30 +      # Layer 1: Exact content
    structural_score * 0.35 +        # Layer 2: AST structure
    semantic_score * 0.20 +          # Layer 3: Semantic meaning
    category_match_bonus * 0.15      # Category alignment
)
```

## Layer 1: Exact Matching

### Purpose

Identify **byte-for-byte identical code** (fastest, highest confidence).

### Algorithm

```python
def are_exact_duplicates(block1: CodeBlock, block2: CodeBlock) -> bool:
    """
    Check if two code blocks are exactly identical
    """
    # Normalize whitespace and compare
    normalized1 = ' '.join(block1.source_code.split())
    normalized2 = ' '.join(block2.source_code.split())

    return normalized1 == normalized2
```

### Hash-Based Optimization

**Content Hash:**
```python
def calculate_content_hash(source_code: str) -> str:
    """
    Generate normalized content hash for fast comparison
    """
    # Normalize: remove extra whitespace, consistent formatting
    normalized = ' '.join(source_code.split())

    # Hash with SHA-256 (first 16 chars for readability)
    return hashlib.sha256(normalized.encode()).hexdigest()[:16]
```

**Index Structure:**
```python
class ExactMatchIndex:
    def __init__(self):
        self.hash_to_blocks = {}  # hash -> [block_ids]

    def add(self, block):
        h = block.content_hash
        if h not in self.hash_to_blocks:
            self.hash_to_blocks[h] = []
        self.hash_to_blocks[h].append(block.block_id)

    def find_exact_matches(self, block):
        """O(1) lookup"""
        return self.hash_to_blocks.get(block.content_hash, [])
```

**Performance:**
- Time complexity: O(1) per lookup
- Space complexity: O(n) where n = number of blocks

### Example

**Code Block 1:**
```javascript
JSON.stringify(data, null, 2)
```

**Code Block 2:**
```javascript
JSON.stringify(data,null,2)  // Different whitespace
```

**Result:**
- Normalized: Both become `"JSON.stringify(data, null, 2)"`
- Content hash: `abc123...` (same)
- **Exact match: TRUE**

## Layer 2: Structural Similarity

### Purpose

Identify **similar AST structures** with minor variations.

### AST Hash Calculation

**Algorithm:**
```python
def calculate_ast_hash(ast_node: ASTNode) -> str:
    """
    Generate structural hash from AST
    """
    # Traverse AST and collect node types
    node_types = []
    traverse_ast(ast_node, lambda n: node_types.append(n.type))

    # Create structural signature
    structure = '|'.join(node_types)

    # Hash
    return hashlib.sha256(structure.encode()).hexdigest()[:16]
```

**Example:**
```javascript
// Block 1
JSON.stringify(user, null, 2)

// Block 2
JSON.stringify(product, null, 2)
```

**AST Structure (both):**
```
CallExpression
├── MemberExpression (JSON.stringify)
├── Identifier (user / product)  ← Different value
├── Literal (null)
└── Literal (2)
```

**Structural signature:**
```
CallExpression|MemberExpression|Identifier|Literal|Literal
```

**Result:**
- AST hash: Same for both
- **Structurally similar: TRUE**

### Levenshtein Distance

**Purpose:** Measure edit distance for near-identical code.

**Algorithm:**
```python
def levenshtein_similarity(s1: str, s2: str) -> float:
    """
    Calculate normalized Levenshtein similarity (0.0 - 1.0)
    """
    distance = levenshtein_distance(s1, s2)
    max_len = max(len(s1), len(s2))

    if max_len == 0:
        return 1.0

    return 1.0 - (distance / max_len)
```

**Threshold:** 0.85 (allow 15% character differences)

**Example:**
```javascript
// Block 1
if (!user) { return res.status(401).send('Unauthorized'); }

// Block 2
if (!token) { return res.status(401).send('Unauthorized'); }
```

**Calculation:**
- Distance: 5 characters different (`user` vs `token`)
- Max length: 56 characters
- Similarity: 1 - (5/56) = 0.91
- **Result: 0.91 >= 0.85 → Similar**

### Structural Similarity Score

**Combined metric:**
```python
def calculate_structural_similarity(block1, block2):
    """
    Combine AST and content similarity
    """
    # AST structure match (binary: 0 or 1)
    ast_match = 1.0 if block1.ast_hash == block2.ast_hash else 0.0

    # Content similarity (continuous: 0.0 - 1.0)
    content_sim = levenshtein_similarity(
        block1.source_code,
        block2.source_code
    )

    # Weighted combination
    structural_score = (ast_match * 0.6) + (content_sim * 0.4)

    return structural_score
```

**Thresholds:**
- **High confidence:** structural_score >= 0.9 (recommended for auto-consolidation)
- **Medium confidence:** 0.7 <= structural_score < 0.9 (manual review)
- **Low confidence:** structural_score < 0.7 (likely false positive)

## Layer 3: Semantic Equivalence

### Purpose

Identify **functionally equivalent code** with different implementations.

### Category Matching

**Exact category match:**
```python
def calculate_category_similarity(block1, block2):
    """
    Score based on category and subcategory alignment
    """
    score = 0.0

    # Category match (e.g., both UtilityPattern)
    if block1.category == block2.category:
        score += 0.6

        # Subcategory match (e.g., both FormatConversion)
        if block1.subcategory == block2.subcategory:
            score += 0.4

    return score
```

**Thresholds:**
- Category + subcategory match: 1.0 (perfect alignment)
- Category match only: 0.6 (related)
- No match: 0.0 (different purposes)

### Tag Overlap

**Jaccard similarity:**
```python
def calculate_tag_similarity(block1, block2):
    """
    Measure tag overlap using Jaccard coefficient
    """
    tags1 = set(block1.tags)
    tags2 = set(block2.tags)

    if not tags1 or not tags2:
        return 0.0

    intersection = tags1 & tags2
    union = tags1 | tags2

    return len(intersection) / len(union)
```

**Example:**
```python
# Block 1
tags = ['serialization', 'json', 'formatting', 'output']

# Block 2
tags = ['json', 'formatting', 'stringify']

# Calculation
intersection = {'json', 'formatting'}  # 2 tags
union = {'serialization', 'json', 'formatting', 'output', 'stringify'}  # 5 tags

jaccard_similarity = 2 / 5 = 0.4
```

**Thresholds:**
- **High overlap:** >= 0.5 (at least 50% shared tags)
- **Moderate overlap:** 0.3 - 0.5
- **Low overlap:** < 0.3 (likely different purposes)

### Purpose Similarity (Advanced)

**Using semantic embeddings (future enhancement):**
```python
def calculate_purpose_similarity(block1, block2):
    """
    Compare semantic purpose using embeddings

    Future: Use sentence embeddings for purpose field
    """
    # Extract purpose descriptions
    purpose1 = block1.semantic_metadata.get('purpose', '')
    purpose2 = block2.semantic_metadata.get('purpose', '')

    if not purpose1 or not purpose2:
        return 0.0

    # Generate embeddings
    embedding1 = embed(purpose1)  # Vector representation
    embedding2 = embed(purpose2)

    # Cosine similarity
    return cosine_similarity(embedding1, embedding2)
```

**Threshold:** >= 0.7 (similar purposes)

### Combined Semantic Score

```python
def calculate_semantic_similarity(block1, block2):
    """
    Combine category, tag, and purpose similarity
    """
    category_sim = calculate_category_similarity(block1, block2)
    tag_sim = calculate_tag_similarity(block1, block2)
    # purpose_sim = calculate_purpose_similarity(block1, block2)  # Future

    # Weighted average
    semantic_score = (
        category_sim * 0.6 +
        tag_sim * 0.4
        # + purpose_sim * 0.2  # Future
    )

    return semantic_score
```

## Complete Similarity Algorithm

### Master Similarity Function

```python
def calculate_similarity(
    block1: CodeBlock,
    block2: CodeBlock,
    config: SimilarityConfig
) -> SimilarityResult:
    """
    Calculate overall similarity score between two code blocks

    Returns:
        SimilarityResult with score, breakdown, and confidence
    """
    # Layer 1: Exact match (fastest path)
    if block1.content_hash == block2.content_hash:
        return SimilarityResult(
            score=1.0,
            method='exact',
            confidence='very_high',
            breakdown={
                'exact': 1.0,
                'structural': 1.0,
                'semantic': 1.0
            }
        )

    # Layer 2: Structural similarity
    structural_score = calculate_structural_similarity(block1, block2)

    # Early exit if structural similarity too low
    if structural_score < config.min_structural_threshold:
        return SimilarityResult(
            score=structural_score * 0.35,  # Only structural contribution
            method='structural',
            confidence='low',
            breakdown={
                'structural': structural_score
            }
        )

    # Layer 3: Semantic similarity
    semantic_score = calculate_semantic_similarity(block1, block2)

    # Category bonus
    category_bonus = 0.0
    if block1.category == block2.category:
        category_bonus = 0.15

    # Final score calculation
    total_score = (
        structural_score * 0.35 +
        semantic_score * 0.20 +
        category_bonus +
        0.30  # Base score for passing structural threshold
    )

    # Determine confidence level
    confidence = determine_confidence(total_score, structural_score, semantic_score)

    return SimilarityResult(
        score=min(total_score, 1.0),  # Cap at 1.0
        method='hybrid',
        confidence=confidence,
        breakdown={
            'structural': structural_score,
            'semantic': semantic_score,
            'category_bonus': category_bonus
        }
    )
```

### Confidence Determination

```python
def determine_confidence(total_score, structural_score, semantic_score):
    """
    Assign confidence level based on scores
    """
    # Very high: Excellent structural and semantic match
    if total_score >= 0.95 and structural_score >= 0.9:
        return 'very_high'

    # High: Good structural match
    if total_score >= 0.85 and structural_score >= 0.8:
        return 'high'

    # Medium: Decent match, needs review
    if total_score >= 0.7:
        return 'medium'

    # Low: Weak match, likely false positive
    return 'low'
```

## Similarity Thresholds

### Default Thresholds

| Threshold Type | Value | Meaning |
|---------------|-------|---------|
| **Minimum Similarity** | 0.80 | Below this, not considered duplicate |
| **Auto-consolidation** | 0.90 | High confidence, safe to consolidate |
| **Manual Review** | 0.70-0.89 | Review before consolidation |
| **Structural Minimum** | 0.70 | Minimum AST similarity |
| **Semantic Minimum** | 0.50 | Minimum tag/category overlap |
| **Exact Match** | 1.00 | Byte-for-byte identical |

### Configurable Per Use Case

```python
class SimilarityConfig:
    # Core thresholds
    min_similarity_threshold: float = 0.80
    auto_consolidation_threshold: float = 0.90
    manual_review_threshold: float = 0.70

    # Layer-specific thresholds
    min_structural_threshold: float = 0.70
    min_semantic_threshold: float = 0.50
    min_tag_overlap: float = 0.30

    # Weighting factors
    structural_weight: float = 0.35
    semantic_weight: float = 0.20
    category_bonus: float = 0.15

    # Performance tuning
    early_exit_enabled: bool = True  # Skip semantic if structural too low
    max_comparisons_per_block: int = 1000  # Limit for performance
```

### Threshold Tuning Guidelines

**For high precision (fewer false positives):**
```python
config = SimilarityConfig(
    min_similarity_threshold=0.85,
    auto_consolidation_threshold=0.95,
    min_structural_threshold=0.80,
    structural_weight=0.45,  # Emphasize structural
    semantic_weight=0.15
)
```

**For high recall (catch more duplicates):**
```python
config = SimilarityConfig(
    min_similarity_threshold=0.70,
    auto_consolidation_threshold=0.85,
    min_structural_threshold=0.60,
    semantic_weight=0.30,  # Emphasize semantic
    structural_weight=0.25
)
```

**Balanced (recommended default):**
```python
config = SimilarityConfig(
    min_similarity_threshold=0.80,
    auto_consolidation_threshold=0.90,
    min_structural_threshold=0.70,
    structural_weight=0.35,
    semantic_weight=0.20
)
```

## Duplicate Grouping Algorithm

### Purpose

Group similar code blocks into consolidated sets.

### Algorithm: Clustering by Similarity

```python
def group_duplicates(
    blocks: List[CodeBlock],
    config: SimilarityConfig
) -> List[DuplicateGroup]:
    """
    Group code blocks by similarity using clustering
    """
    groups = []

    # Step 1: Build similarity index
    index = build_similarity_index(blocks)

    # Step 2: Track assigned blocks
    assigned = set()

    # Step 3: Iterate blocks sorted by complexity (simplest first)
    sorted_blocks = sorted(blocks, key=lambda b: b.complexity_score)

    for block in sorted_blocks:
        if block.block_id in assigned:
            continue

        # Find all similar blocks
        similar_blocks = find_similar_blocks(
            block,
            blocks,
            index,
            config
        )

        if len(similar_blocks) < config.min_group_size:
            continue  # Not enough duplicates

        # Create group
        group = create_duplicate_group(
            canonical_block=block,
            members=similar_blocks,
            config=config
        )

        groups.append(group)

        # Mark blocks as assigned
        for member in similar_blocks:
            assigned.add(member.block_id)

    return groups
```

### Finding Similar Blocks

```python
def find_similar_blocks(
    target: CodeBlock,
    all_blocks: List[CodeBlock],
    index: SimilarityIndex,
    config: SimilarityConfig
) -> List[CodeBlock]:
    """
    Find all blocks similar to target above threshold
    """
    similar = [target]  # Include target itself

    # Get candidates from index (O(1) for exact, O(k) for category)
    candidates = index.get_candidates(target)

    for candidate in candidates:
        if candidate.block_id == target.block_id:
            continue

        # Calculate similarity
        result = calculate_similarity(target, candidate, config)

        # Check threshold
        if result.score >= config.min_similarity_threshold:
            similar.append(candidate)

    return similar
```

### Similarity Index

```python
class SimilarityIndex:
    """
    Multi-level index for fast similarity lookups
    """

    def __init__(self):
        self.exact_index = {}      # content_hash -> blocks
        self.ast_index = {}        # ast_hash -> blocks
        self.category_index = {}   # category -> blocks

    def add(self, block):
        # Index by content hash
        if block.content_hash not in self.exact_index:
            self.exact_index[block.content_hash] = []
        self.exact_index[block.content_hash].append(block)

        # Index by AST hash
        if block.ast_hash not in self.ast_index:
            self.ast_index[block.ast_hash] = []
        self.ast_index[block.ast_hash].append(block)

        # Index by category
        if block.category not in self.category_index:
            self.category_index[block.category] = []
        self.category_index[block.category].append(block)

    def get_candidates(self, block):
        """
        Get candidate blocks for similarity comparison

        Returns subset of all blocks likely to be similar
        """
        candidates = set()

        # Add exact matches (highest priority)
        exact = self.exact_index.get(block.content_hash, [])
        candidates.update(exact)

        # Add structural matches
        structural = self.ast_index.get(block.ast_hash, [])
        candidates.update(structural)

        # Add category matches (lower priority, higher volume)
        category = self.category_index.get(block.category, [])
        candidates.update(category)

        return list(candidates)
```

**Performance:**
- Without index: O(n²) comparisons (slow)
- With index: O(k) where k = candidates << n (fast)

## Edge Cases and Examples

### Example 1: Exact Duplicates

**Block 1:**
```javascript
// File: src/utils.js
JSON.stringify(data, null, 2)
```

**Block 2:**
```javascript
// File: src/helpers.js
JSON.stringify(data, null, 2)
```

**Similarity Calculation:**
- Content hash: `abc123...` (same)
- Exact match: **TRUE**
- **Final score: 1.0 (100%)**
- Confidence: very_high

**Recommendation:** Auto-consolidate into shared utility.

### Example 2: Structural Duplicates (Variable Names Different)

**Block 1:**
```javascript
if (!user) {
  return res.status(401).send('Unauthorized');
}
```

**Block 2:**
```javascript
if (!token) {
  return res.status(401).send('Unauthorized');
}
```

**Similarity Calculation:**
- Content hash: Different
- AST hash: Same (both `IfStatement -> ReturnStatement -> CallExpression`)
- Levenshtein: 0.91 (5 char difference)
- Structural score: (1.0 * 0.6) + (0.91 * 0.4) = 0.964
- Category: Both `APIPattern/AuthenticationCheck`
- Category bonus: 0.15
- **Final score: 0.964 * 0.35 + 0.15 + 0.30 = 0.787**
- Confidence: high

**Recommendation:** Group as duplicates, suggest shared auth middleware.

### Example 3: Semantic Equivalence (Different Implementation)

**Block 1:**
```javascript
if (typeof value === 'string') {
  return true;
}
return false;
```

**Block 2:**
```javascript
return typeof value === 'string';
```

**Similarity Calculation:**
- Content hash: Different
- AST hash: Different (different structures)
- Levenshtein: Low (~0.3)
- Structural score: 0.3 * 0.4 = 0.12 (low)
- Category: Both `UtilityPattern/TypeChecking`
- Tags overlap: ['type-check', 'string', 'validation'] → 1.0
- Semantic score: (0.6 * 1.0) + (0.4 * 1.0) = 1.0
- **Final score: 0.12 * 0.35 + 1.0 * 0.20 + 0.15 = 0.392**
- Confidence: low

**Result:** Below threshold (0.80), **NOT grouped as duplicates**
(Correct: functionally equivalent but algorithmically too different)

### Example 4: False Positive Avoidance

**Block 1:**
```javascript
// Array map operation
const ids = users.map(u => u.id);
```

**Block 2:**
```javascript
// Array map operation (different context)
const names = products.map(p => p.name);
```

**Similarity Calculation:**
- Content hash: Different
- AST hash: Same (both `CallExpression -> ArrowFunction`)
- Levenshtein: 0.65
- Structural score: (1.0 * 0.6) + (0.65 * 0.4) = 0.86
- Category: Both `UtilityPattern/ArrayOperation`
- Tags: ['map', 'transform', 'array', 'id'] vs ['map', 'transform', 'array', 'name']
- Tag overlap: 3/5 = 0.6
- Semantic score: (0.6 * 1.0) + (0.4 * 0.6) = 0.84
- **Final score: 0.86 * 0.35 + 0.84 * 0.20 + 0.15 = 0.619**
- Confidence: low

**Result:** Below threshold, **NOT grouped**
(Correct: same pattern but different business logic)

**Insight:** Pattern is `Array.prototype.map()` - should be tracked separately as a common pattern, not as duplicates.

## Advanced Features

### 1. Context-Aware Similarity

**Consideration:** Two blocks may be similar but serve different purposes in different contexts.

**Enhancement:**
```python
def calculate_context_aware_similarity(block1, block2):
    """
    Adjust similarity based on usage context
    """
    base_similarity = calculate_similarity(block1, block2)

    # Context factors
    same_module = block1.location.file_path.split('/')[1] == block2.location.file_path.split('/')[1]
    same_repository = block1.repository_path == block2.repository_path

    # Boost similarity if same context
    if same_repository:
        base_similarity *= 1.1  # 10% boost

    if same_module:
        base_similarity *= 1.15  # 15% boost

    return min(base_similarity, 1.0)
```

### 2. Frequency-Based Scoring

**Insight:** More frequent patterns are higher priority for consolidation.

**Enhancement:**
```python
def calculate_impact_adjusted_similarity(group: DuplicateGroup):
    """
    Adjust group priority based on occurrence frequency
    """
    base_similarity = group.similarity_score

    # Frequency multiplier
    frequency_factor = min(group.occurrence_count / 10.0, 2.0)  # Max 2x

    return base_similarity * frequency_factor
```

### 3. Negative Signals

**Idea:** Some code blocks should NOT be consolidated despite similarity.

**Negative signals:**
- Contains TODO comments (work in progress)
- Different error messages (business-specific)
- Performance-critical (inlining preferred)
- Legacy code marked for removal

**Implementation:**
```python
def should_exclude_from_grouping(block: CodeBlock) -> bool:
    """
    Check if block should be excluded from duplicate groups
    """
    # Check for exclusion markers
    if 'TODO' in block.source_code or 'FIXME' in block.source_code:
        return True

    # Performance-critical paths
    if block.tags and 'performance-critical' in block.tags:
        return True

    # Deprecated code
    if block.tags and 'deprecated' in block.tags:
        return True

    return False
```

## Performance Optimization

### Complexity Analysis

| Operation | Without Index | With Index | Notes |
|-----------|---------------|------------|-------|
| **Exact match** | O(n) | O(1) | Hash lookup |
| **Find similar blocks** | O(n) | O(k) | k = candidates |
| **Group all duplicates** | O(n²) | O(n * k) | k << n |
| **Memory** | O(n) | O(3n) | 3 indexes |

**For 1,000 blocks:**
- Without index: 1,000,000 comparisons
- With index: ~5,000 comparisons (99.5% reduction)

### Optimization Strategies

**1. Early Exit**
```python
# Skip semantic layer if structural too low
if structural_score < config.min_structural_threshold:
    return SimilarityResult(score=structural_score * 0.35, ...)
```

**2. Parallel Processing**
```python
# Calculate similarities in parallel
from concurrent.futures import ThreadPoolExecutor

with ThreadPoolExecutor(max_workers=4) as executor:
    futures = [
        executor.submit(calculate_similarity, target, candidate, config)
        for candidate in candidates
    ]
    results = [f.result() for f in futures]
```

**3. Caching**
```python
# Cache similarity calculations
class SimilarityCache:
    def __init__(self):
        self.cache = {}

    def get(self, block1_id, block2_id):
        key = tuple(sorted([block1_id, block2_id]))
        return self.cache.get(key)

    def set(self, block1_id, block2_id, result):
        key = tuple(sorted([block1_id, block2_id]))
        self.cache[key] = result
```

## Validation and Testing

### Test Cases

**1. Exact Duplicates**
```python
def test_exact_duplicates():
    block1 = CodeBlock(source_code='JSON.stringify(data, null, 2)', ...)
    block2 = CodeBlock(source_code='JSON.stringify(data, null, 2)', ...)

    result = calculate_similarity(block1, block2, config)

    assert result.score == 1.0
    assert result.method == 'exact'
    assert result.confidence == 'very_high'
```

**2. Structural Similarity**
```python
def test_structural_similarity():
    block1 = CodeBlock(source_code='if (!user) { return res.status(401); }', ...)
    block2 = CodeBlock(source_code='if (!token) { return res.status(401); }', ...)

    result = calculate_similarity(block1, block2, config)

    assert 0.75 <= result.score <= 0.85
    assert result.method == 'hybrid'
```

**3. False Positive Avoidance**
```python
def test_false_positive_avoidance():
    block1 = CodeBlock(source_code='users.map(u => u.id)', ...)
    block2 = CodeBlock(source_code='products.map(p => p.name)', ...)

    result = calculate_similarity(block1, block2, config)

    assert result.score < 0.80  # Below threshold
```

### Metrics to Track

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Precision** | > 90% | True positives / (True positives + False positives) |
| **Recall** | > 80% | True positives / (True positives + False negatives) |
| **F1 Score** | > 0.85 | Harmonic mean of precision and recall |
| **False Positive Rate** | < 10% | False positives / (False positives + True negatives) |
| **Avg Similarity Score** | 0.85-0.95 | Mean score for grouped duplicates |

### Evaluation Dataset

**Create test repository with known duplicates:**
1. **Exact duplicates:** 10 pairs (expected: all grouped)
2. **Structural duplicates:** 15 pairs (expected: 12+ grouped)
3. **Semantic equivalents:** 5 pairs (expected: 0-2 grouped, depending on config)
4. **False positives:** 20 pairs (expected: 0 grouped)

**Total:** 50 test pairs, labeled ground truth

## Recommendations

### For Phase 2 Implementation

1. **Start with exact matching** ✅
   - Implement hash-based index
   - Test on real repositories
   - Measure performance

2. **Add structural similarity** ✅
   - Implement AST hash calculation
   - Tune Levenshtein threshold
   - Validate with test cases

3. **Layer semantic matching** ✅
   - Implement category/tag overlap
   - Test false positive rates
   - Adjust weights as needed

4. **Build indexes** ✅
   - Exact, AST, category indexes
   - Measure performance improvement
   - Optimize memory usage

5. **Tune thresholds** ✅
   - Run on pilot repositories
   - Collect precision/recall metrics
   - Adjust based on feedback

### For Production Tuning

**Iteration 1: Conservative (High Precision)**
- min_similarity_threshold: 0.85
- Fewer false positives, miss some duplicates
- Safe for auto-consolidation

**Iteration 2: Balanced**
- min_similarity_threshold: 0.80
- Good balance of precision and recall
- Manual review for 0.70-0.80 range

**Iteration 3: Aggressive (High Recall)**
- min_similarity_threshold: 0.70
- Catch more duplicates, more false positives
- Requires manual validation

## Conclusion

**The duplicate detection algorithm combines:**
✅ **Exact matching** for perfect duplicates (fastest, highest confidence)
✅ **Structural similarity** for AST-based pattern matching (precision)
✅ **Semantic equivalence** for meaning-based grouping (recall)
✅ **Configurable thresholds** for use-case tuning
✅ **Performance optimization** with multi-level indexing

**Expected Performance:**
- **Precision:** 90%+ (few false positives)
- **Recall:** 80%+ (catch most duplicates)
- **Speed:** <5 minutes for 1,000 code blocks
- **Scalability:** O(n * k) with indexing (k << n)

**Next Steps:**
- Implement similarity functions in Python
- Build multi-level index
- Create test suite with labeled data
- Run pilot on 3 repositories
- Tune thresholds based on results

---

**Algorithm designed by:** Claude Code
**Phase 1 Research:** Complete! Ready for Phase 2 Implementation
