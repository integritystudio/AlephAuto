#!/usr/bin/env python3
"""
Code Block Extraction Pipeline

Reads JSON from stdin containing:
- repository_info
- pattern_matches

Outputs JSON to stdout containing:
- code_blocks
- duplicate_groups
- suggestions
- metrics
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Sequence

# Debug mode - set PIPELINE_DEBUG=1 to enable verbose output
DEBUG = os.environ.get('PIPELINE_DEBUG', '').lower() in ('1', 'true', 'yes')


def _debug(msg: str) -> None:
    """Print debug message if DEBUG is enabled."""
    if DEBUG:
        print(f"DEBUG {msg}", file=sys.stderr)

# Add lib/models and lib/similarity to Python path
sys.path.insert(0, str(Path(__file__).parent.parent / 'models'))
sys.path.insert(0, str(Path(__file__).parent.parent))

from code_block import CodeBlock, SourceLocation, ASTNode
from duplicate_group import DuplicateGroup
from consolidation_suggestion import ConsolidationSuggestion, MigrationStep
from scan_report import ScanReport, RepositoryInfo, ScanConfiguration, ScanMetrics
from similarity.grouping import group_by_similarity


# ---------------------------------------------------------------------------
# Function Name Extraction Patterns
# ---------------------------------------------------------------------------

FUNCTION_NAME_PATTERNS: tuple[str, ...] = (
    r'function\s+(\w+)\s*\(',              # function name(
    r'const\s+(\w+)\s*=\s*(?:async\s+)?function',  # const name = function
    r'const\s+(\w+)\s*=\s*(?:async\s+)?\(',        # const name = ( or const name = async (
    r'let\s+(\w+)\s*=\s*(?:async\s+)?function',    # let name = function
    r'let\s+(\w+)\s*=\s*(?:async\s+)?\(',          # let name = (
    r'var\s+(\w+)\s*=\s*(?:async\s+)?function',    # var name = function
    r'var\s+(\w+)\s*=\s*(?:async\s+)?\(',          # var name = (
    r'async\s+function\s+(\w+)\s*\(',      # async function name(
    r'(\w+)\s*:\s*function',               # name: function
    r'(\w+)\s*:\s*async\s+function',       # name: async function
    r'export\s+function\s+(\w+)',          # export function name
    r'export\s+const\s+(\w+)\s*=',         # export const name =
)


def _match_function_pattern(text: str, multiline: bool = False) -> str | None:
    """Try to match function name patterns against text."""
    flags = re.MULTILINE if multiline else 0
    for pattern in FUNCTION_NAME_PATTERNS:
        match = re.search(pattern, text, flags)
        if match and match.group(1):
            return match.group(1)
    return None


def _search_file_for_function_name(
    file_path: str,
    line_start: int,
    repo_path: str,
) -> str | None:
    """Search backwards in file to find function declaration."""
    full_path = Path(repo_path) / file_path
    _debug(f"attempting to read {full_path} at line {line_start}")

    if not full_path.exists():
        _debug(f"file does not exist: {full_path}")
        return None

    try:
        lines = full_path.read_text(encoding='utf-8').splitlines()
    except (OSError, UnicodeDecodeError) as e:
        print(f"Warning: Could not read file context for {file_path}: {e}", file=sys.stderr)
        return None

    # Search backwards from match line (up to 10 lines before)
    search_start = max(0, line_start - 11)
    for i in range(line_start - 1, search_start - 1, -1):
        if i < 0 or i >= len(lines):
            continue

        func_name = _match_function_pattern(lines[i])
        if func_name:
            _debug(f"found function name '{func_name}' at line {i+1} (match was at {line_start})")
            return func_name

    _debug(f"no function name found in lines {search_start+1}-{line_start} for {file_path}:{line_start}")
    return None


def extract_function_name(
    source_code: str,
    file_path: str | None = None,
    line_start: int | None = None,
    repo_path: str | None = None,
) -> str | None:
    """Extract function name from source code using regex patterns.

    Priority 1: Function-Level Extraction
    This enables proper matching between detected and expected duplicates.

    If function name can't be found in source_code, reads the actual file
    to get more context (lines before the match).
    """
    _debug(f"extract_function_name called: file_path={file_path}, line_start={line_start}")

    if not source_code:
        return None

    # Try to find function name in the matched source code
    func_name = _match_function_pattern(source_code, multiline=True)
    if func_name:
        return func_name

    # Fall back to reading file context if we have location info
    if file_path and line_start and repo_path:
        return _search_file_for_function_name(file_path, line_start, repo_path)

    return None

def _get_function_name_from_tags(tags: list[str]) -> str | None:
    """Extract function name from block tags."""
    for tag in tags:
        if tag.startswith('function:'):
            return tag[9:]  # Remove 'function:' prefix
    return None


def _try_add_by_function(
    block: CodeBlock,
    function_name: str,
    seen_functions: dict[str, CodeBlock],
    unique_blocks: list[CodeBlock],
) -> bool:
    """Try to add block using function-based deduplication.

    Returns True if block was processed (added or skipped as duplicate).
    """
    function_key = f"{block.location.file_path}:{function_name}"

    if function_key not in seen_functions:
        seen_functions[function_key] = block
        unique_blocks.append(block)
        return True

    # Already seen this function - keep the earlier occurrence
    existing_block = seen_functions[function_key]
    if block.location.line_start < existing_block.location.line_start:
        unique_blocks.remove(existing_block)
        seen_functions[function_key] = block
        unique_blocks.append(block)
    else:
        _debug(f"dedup: skipping duplicate {function_name} at line {block.location.line_start} (kept line {existing_block.location.line_start})")

    return True


def _try_add_by_location(
    block: CodeBlock,
    seen_locations: set[str],
    unique_blocks: list[CodeBlock],
) -> None:
    """Add block using location-based deduplication."""
    location_key = f"{block.location.file_path}:{block.location.line_start}"
    if location_key not in seen_locations:
        seen_locations.add(location_key)
        unique_blocks.append(block)


def deduplicate_blocks(blocks: list[CodeBlock]) -> list[CodeBlock]:
    """Remove duplicate code blocks from the same location and function.

    Priority 4: Deduplicate Pattern Matches
    ast-grep patterns can match the same code multiple times within a function.
    This removes duplicates based on file:function_name, keeping only the earliest match.
    """
    seen_locations: set[str] = set()
    seen_functions: dict[str, CodeBlock] = {}
    unique_blocks: list[CodeBlock] = []

    for i, block in enumerate(blocks):
        function_name = _get_function_name_from_tags(block.tags)

        if DEBUG and i < 10:
            _debug(f"dedup block {i}: {block.location.file_path}:{block.location.line_start}, func={function_name}")

        if function_name:
            _try_add_by_function(block, function_name, seen_functions, unique_blocks)
        else:
            _try_add_by_location(block, seen_locations, unique_blocks)

    removed = len(blocks) - len(unique_blocks)
    if removed > 0:
        print(f"Deduplication: Removed {removed} duplicate blocks ({len(seen_functions)} unique functions, {len(seen_locations)} unique locations)", file=sys.stderr)

    return unique_blocks


def extract_code_blocks(pattern_matches: List[Dict], repository_info: Dict) -> List[CodeBlock]:
    """
    Extract CodeBlock models from pattern matches
    """
    if DEBUG:
        print(f"DEBUG extract_code_blocks: repository_info={repository_info}", file=sys.stderr)
        print(f"DEBUG extract_code_blocks: got {len(pattern_matches)} pattern matches", file=sys.stderr)
    blocks = []

    for i, match in enumerate(pattern_matches):
        if DEBUG and i == 0:  # Debug first match only
            print(f"DEBUG first match: file_path={match.get('file_path')}, line_start={match.get('line_start')}", file=sys.stderr)
        try:
            # Generate unique block ID
            # Python 3.11 doesn't support nested f-strings, so construct the string first
            block_key = f"{match['file_path']}:{match['line_start']}"
            block_hash = hashlib.sha256(block_key.encode()).hexdigest()[:12]
            block_id = f"cb_{block_hash}"

            # Map pattern_id to category (must match SemanticCategory enum)
            category_map = {
                'object-manipulation': 'utility',
                'array-map-filter': 'utility',
                'string-manipulation': 'utility',
                'type-checking': 'utility',
                'validation': 'validator',
                'express-route-handlers': 'api_handler',
                'auth-checks': 'auth_check',
                'error-responses': 'error_handler',
                'request-validation': 'validator',
                'prisma-operations': 'database_operation',
                'query-builders': 'database_operation',
                'connection-handling': 'database_operation',
                'await-patterns': 'async_pattern',
                'promise-chains': 'async_pattern',
                'env-variables': 'config_access',
                'config-objects': 'config_access',
                'console-statements': 'logger',
                'logger-patterns': 'logger'
            }

            category = category_map.get(match['rule_id'], 'utility')

            # Extract function name from source code (Priority 1: Function-Level Extraction)
            source_code = match.get('matched_text', '')
            function_name = extract_function_name(
                source_code,
                file_path=match['file_path'],
                line_start=match['line_start'],
                repo_path=repository_info['path']
            )

            # Create CodeBlock
            # Note: file_path from ast-grep is already relative to repository root
            block = CodeBlock(
                block_id=block_id,
                pattern_id=match['rule_id'],
                location=SourceLocation(
                    file_path=match['file_path'],
                    line_start=match['line_start'],
                    line_end=match.get('line_end', match['line_start'])
                ),
                relative_path=match['file_path'],  # Already relative from ast-grep
                source_code=source_code,
                language='javascript',  # TODO: Detect from file extension
                category=category,
                repository_path=repository_info['path'],
                line_count=match.get('line_end', match['line_start']) - match['line_start'] + 1,
                # Store function name in tags field
                tags=[f"function:{function_name}"] if function_name else []
            )

            # Debug: confirm tags are set
            if DEBUG and i < 3:  # Only log first 3 blocks
                print(f"DEBUG block created: file={block.relative_path}, line={block.location.line_start}, tags={block.tags}", file=sys.stderr)

            blocks.append(block)

        except Exception as e:
            print(f"Warning: Failed to extract block {i} from {match.get('file_path', 'unknown')}: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
            continue

    return blocks


def group_duplicates(blocks: List[CodeBlock]) -> List[DuplicateGroup]:
    """
    Group similar code blocks using multi-layer similarity algorithm.

    Priority 2: Structural Similarity
    Uses the enhanced grouping algorithm that combines:
    - Layer 1: Exact matching (hash-based)
    - Layer 2: Structural similarity (AST-based)
    - Layer 3: Semantic equivalence (TODO)
    """
    # Use the multi-layer grouping algorithm
    groups = group_by_similarity(blocks, similarity_threshold=0.85)

    return groups


def generate_suggestions(groups: List[DuplicateGroup]) -> List[ConsolidationSuggestion]:
    """
    Generate consolidation suggestions with enhanced strategy logic
    """
    suggestions = []

    for group in groups:
        # Determine strategy based on multiple factors
        strategy, rationale, complexity, risk = _determine_strategy(group)

        # Generate migration steps
        migration_steps = _generate_migration_steps(group, strategy)

        # Generate code example
        code_example = _generate_code_example(group, strategy)

        # Calculate ROI score (higher for simpler, lower-risk refactoring)
        roi_score = _calculate_roi(group, complexity, risk)

        # Determine if this is a breaking change
        breaking_changes = _is_breaking_change(group, strategy)

        suggestion = ConsolidationSuggestion(
            suggestion_id=f"cs_{group.group_id}",
            duplicate_group_id=group.group_id,
            strategy=strategy,
            strategy_rationale=rationale,
            target_location=_suggest_target_location(group, strategy),
            migration_steps=migration_steps,
            code_example=code_example,
            impact_score=min(group.impact_score, 100.0),
            complexity=complexity,
            migration_risk=risk,
            estimated_effort_hours=_estimate_effort(group, complexity),
            breaking_changes=breaking_changes,
            affected_files_count=len(group.affected_files),
            affected_repositories_count=len(group.affected_repositories),
            confidence=0.9 if group.similarity_score >= 0.95 else 0.7,
            roi_score=roi_score
        )

        suggestions.append(suggestion)

    return suggestions


# ---------------------------------------------------------------------------
# Strategy Determination Rules (Data-Driven)
# ---------------------------------------------------------------------------
# Each category has rules with occurrence thresholds defining the strategy.
# Format: (max_occurrences, strategy, rationale_template, complexity, risk)
# Rules are evaluated in order; first matching rule wins.
# ---------------------------------------------------------------------------

@dataclass
class StrategyRule:
    """Rule for determining consolidation strategy."""

    max_occurrences: int | None  # None means unlimited
    strategy: str
    rationale_template: str
    complexity: str
    risk: str


# Category-specific strategy rules
CATEGORY_STRATEGY_RULES: dict[str, list[StrategyRule]] = {
    'logger': [
        StrategyRule(5, 'local_util', "Logger/config pattern used {occ} times - extract to module constant", 'trivial', 'minimal'),
        StrategyRule(None, 'shared_package', "Logger/config pattern used {occ} times across {files} files - centralize configuration", 'simple', 'low'),
    ],
    'config_access': [
        StrategyRule(5, 'local_util', "Logger/config pattern used {occ} times - extract to module constant", 'trivial', 'minimal'),
        StrategyRule(None, 'shared_package', "Logger/config pattern used {occ} times across {files} files - centralize configuration", 'simple', 'low'),
    ],
    'api_handler': [
        StrategyRule(3, 'local_util', "API pattern used {occ} times - extract to middleware/util", 'simple', 'low'),
        StrategyRule(10, 'shared_package', "API pattern used {occ} times across {files} files - create shared middleware", 'moderate', 'medium'),
        StrategyRule(None, 'mcp_server', "API pattern used {occ} times - candidate for framework/MCP abstraction", 'complex', 'high'),
    ],
    'auth_check': [
        StrategyRule(3, 'local_util', "API pattern used {occ} times - extract to middleware/util", 'simple', 'low'),
        StrategyRule(10, 'shared_package', "API pattern used {occ} times across {files} files - create shared middleware", 'moderate', 'medium'),
        StrategyRule(None, 'mcp_server', "API pattern used {occ} times - candidate for framework/MCP abstraction", 'complex', 'high'),
    ],
    'error_handler': [
        StrategyRule(3, 'local_util', "API pattern used {occ} times - extract to middleware/util", 'simple', 'low'),
        StrategyRule(10, 'shared_package', "API pattern used {occ} times across {files} files - create shared middleware", 'moderate', 'medium'),
        StrategyRule(None, 'mcp_server', "API pattern used {occ} times - candidate for framework/MCP abstraction", 'complex', 'high'),
    ],
    'database_operation': [
        StrategyRule(3, 'local_util', "Database pattern used {occ} times - extract to repository method", 'moderate', 'medium'),
        StrategyRule(None, 'shared_package', "Database pattern used {occ} times - create shared query builder", 'complex', 'high'),
    ],
}

# Default rules for categories not explicitly listed
DEFAULT_STRATEGY_RULES: list[StrategyRule] = [
    StrategyRule(3, 'local_util', "Utility pattern used {occ} times in {files} files - extract to local util", 'simple', 'minimal'),
    StrategyRule(8, 'shared_package', "Utility pattern used {occ} times across {files} files - create shared utility", 'simple', 'low'),
    StrategyRule(None, 'mcp_server', "Utility pattern used {occ} times - consider MCP tool or shared package", 'moderate', 'medium'),
]


def _apply_strategy_rules(
    rules: list[StrategyRule],
    occurrences: int,
    files: int,
) -> tuple[str, str, str, str]:
    """Apply strategy rules and return first matching result."""
    for rule in rules:
        if rule.max_occurrences is None or occurrences <= rule.max_occurrences:
            rationale = rule.rationale_template.format(occ=occurrences, files=files)
            return (rule.strategy, rationale, rule.complexity, rule.risk)

    # Fallback (should not reach here if rules are properly defined)
    last_rule = rules[-1]
    return (last_rule.strategy, last_rule.rationale_template.format(occ=occurrences, files=files), last_rule.complexity, last_rule.risk)


def _determine_strategy(group: DuplicateGroup) -> tuple[str, str, str, str]:
    """Determine consolidation strategy based on group characteristics.

    Returns: (strategy, rationale, complexity, risk)
    """
    occurrences = group.occurrence_count
    files = len(group.affected_files)
    category = group.category

    # Single file duplicates - simplest case (always local_util)
    if files == 1:
        return (
            'local_util',
            f"All {occurrences} occurrences in same file - extract to local function",
            'trivial',
            'minimal',
        )

    # Get category-specific rules or use defaults
    rules = CATEGORY_STRATEGY_RULES.get(category, DEFAULT_STRATEGY_RULES)
    return _apply_strategy_rules(rules, occurrences, files)


def _generate_migration_steps(group: DuplicateGroup, strategy: str) -> List[MigrationStep]:
    """Generate specific migration steps based on strategy"""

    if strategy == 'local_util':
        steps = [
            ("Create utility function in local utils module", True, "15min"),
            ("Extract common logic from duplicate blocks", False, "30min"),
            ("Replace each occurrence with function call", True, "20min"),
            ("Add unit tests for extracted function", False, "30min"),
            ("Run existing tests to verify behavior", True, "10min")
        ]
    elif strategy == 'shared_package':
        steps = [
            ("Create shared package/module for utility", False, "1h"),
            ("Extract and parameterize common logic", False, "1h"),
            ("Add comprehensive tests to shared package", False, "45min"),
            ("Update each file to import from shared package", True, "30min"),
            ("Replace duplicates with shared function calls", True, "30min"),
            ("Update package.json/requirements.txt dependencies", False, "15min"),
            ("Run full test suite across affected projects", True, "20min")
        ]
    elif strategy == 'mcp_server':
        steps = [
            ("Design MCP tool interface for functionality", False, "2h"),
            ("Create MCP server with tool implementation", False, "4h"),
            ("Add MCP tool schema and documentation", False, "1h"),
            ("Test MCP tool independently", False, "1h"),
            ("Update projects to use MCP client", False, "2h"),
            ("Replace duplicates with MCP tool calls", True, "1h"),
            ("Add integration tests", False, "2h"),
            ("Document MCP tool usage", False, "1h")
        ]
    else:  # autonomous_agent
        steps = [
            ("Define agent capabilities and workflow", False, "3h"),
            ("Design agent prompt and tool access", False, "2h"),
            ("Implement agent logic and orchestration", False, "8h"),
            ("Create agent tests and safety checks", False, "3h"),
            ("Integrate agent with existing systems", False, "4h"),
            ("Replace complex duplicate logic with agent calls", False, "2h"),
            ("Monitor agent performance and behavior", False, "ongoing"),
            ("Document agent usage and limitations", False, "2h")
        ]

    # Convert to MigrationStep objects
    return [
        MigrationStep(
            step_number=i + 1,
            description=desc,
            automated=automated,
            estimated_time=time
        )
        for i, (desc, automated, time) in enumerate(steps)
    ]


def _generate_code_example(group: DuplicateGroup, strategy: str) -> str:
    """Generate example code showing the refactoring"""

    pattern = group.pattern_id
    category = group.category

    if strategy == 'local_util':
        if category == 'logger':
            return """// Before:
logger.info({ userId }, 'User action');
logger.info({ userId }, 'User action');

// After:
const logUserAction = (userId) => logger.info({ userId }, 'User action');
logUserAction(userId);
logUserAction(userId);"""

        return """// Before: Duplicated code in multiple places
function foo() {
  // ... duplicate logic ...
}

// After: Extracted to utility function
import { sharedUtil } from './utils';
function foo() {
  sharedUtil();
}"""

    elif strategy == 'shared_package':
        return """// Before: Duplicated across files
// file1.js: { check logic }
// file2.js: { check logic }

// After: Shared package
import { validateInput } from '@shared/validators';
validateInput(data);"""

    elif strategy == 'mcp_server':
        return """// Before: Complex duplicated logic
async function processData() {
  // ... complex logic ...
}

// After: MCP tool
const result = await mcp.callTool('process-data', { input });"""

    return "// Refactoring example not available"


def _calculate_roi(group: DuplicateGroup, complexity: str, risk: str) -> float:
    """Calculate return on investment score (0-100)"""

    # Start with impact score
    roi = group.impact_score

    # Adjust based on complexity (simpler = higher ROI)
    complexity_multipliers = {
        'trivial': 1.3,
        'simple': 1.1,
        'moderate': 0.9,
        'complex': 0.7
    }
    roi *= complexity_multipliers.get(complexity, 1.0)

    # Adjust based on risk (lower risk = higher ROI)
    risk_multipliers = {
        'minimal': 1.2,
        'low': 1.1,
        'medium': 0.9,
        'high': 0.7
    }
    roi *= risk_multipliers.get(risk, 1.0)

    return min(roi, 100.0)


def _is_breaking_change(group: DuplicateGroup, strategy: str) -> bool:
    """Determine if consolidation would be a breaking change"""

    # Local utils are not breaking
    if strategy == 'local_util':
        return False

    # Shared packages might be breaking if they change APIs
    if strategy == 'shared_package':
        return group.category in ['api_handler', 'auth_check']

    # MCP servers and agents are potentially breaking
    return True


def _suggest_target_location(group: DuplicateGroup, strategy: str) -> str:
    """Suggest where the consolidated code should live"""

    if strategy == 'local_util':
        # Extract to utils in same directory
        first_file = group.affected_files[0] if group.affected_files else ''
        if '/' in first_file:
            dir_path = '/'.join(first_file.split('/')[:-1])
            return f"{dir_path}/utils.js"
        return "utils.js"

    elif strategy == 'shared_package':
        category = group.category
        if category == 'logger':
            return "shared/logging/logger-utils.js"
        elif category in ['api_handler', 'auth_check']:
            return "shared/middleware/auth-middleware.js"
        elif category == 'database_operation':
            return "shared/database/query-builder.js"
        elif category == 'validator':
            return "shared/validation/validators.js"
        else:
            return f"shared/utils/{category}.js"

    elif strategy == 'mcp_server':
        return f"mcp-servers/{group.pattern_id}-server/"

    else:  # autonomous_agent
        return f"agents/{group.pattern_id}-agent/"


def _estimate_effort(group: DuplicateGroup, complexity: str) -> float:
    """Estimate effort in hours"""

    base_hours = {
        'trivial': 0.5,
        'simple': 1.0,
        'moderate': 3.0,
        'complex': 8.0
    }

    hours = base_hours.get(complexity, 2.0)

    # Add time per affected file (more files = more refactoring)
    hours += len(group.affected_files) * 0.25

    # Add time for testing
    hours += 0.5

    return round(hours, 1)


def main():
    """
    Main pipeline execution
    """
    try:
        # Read input from stdin
        input_data = json.load(sys.stdin)

        repository_info = input_data['repository_info']
        pattern_matches = input_data['pattern_matches']

        # Stage 3: Extract code blocks
        blocks = extract_code_blocks(pattern_matches, repository_info)

        # Stage 3.5: Deduplicate blocks (Priority 4)
        blocks = deduplicate_blocks(blocks)

        # Stage 4: Semantic annotation (TODO: Implement full annotator)
        # For now, blocks already have basic category from extraction

        # Stage 5: Group duplicates
        groups = group_duplicates(blocks)

        # Stage 6: Generate suggestions
        suggestions = generate_suggestions(groups)

        # Stage 7: Calculate metrics
        metrics = {
            'total_code_blocks': len(blocks),
            'total_duplicate_groups': len(groups),
            'exact_duplicates': len([g for g in groups if g.similarity_method == 'exact']),
            'structural_duplicates': len([g for g in groups if g.similarity_method == 'structural']),
            'semantic_duplicates': 0,  # TODO: Implement semantic grouping
            'total_duplicated_lines': sum(g.total_lines for g in groups),
            'potential_loc_reduction': sum(g.total_lines - g.total_lines // g.occurrence_count for g in groups),
            'duplication_percentage': 0.0,  # TODO: Calculate properly
            'total_suggestions': len(suggestions),
            'quick_wins': len([s for s in suggestions if s.complexity == 'trivial']),
            'high_priority_suggestions': len([s for s in suggestions if s.impact_score >= 75])
        }

        # Output result as JSON (use mode='json' to serialize datetime objects)
        result = {
            'code_blocks': [b.model_dump(mode='json') for b in blocks],
            'duplicate_groups': [g.model_dump(mode='json') for g in groups],
            'suggestions': [s.model_dump(mode='json') for s in suggestions],
            'metrics': metrics
        }

        json.dump(result, sys.stdout, indent=2)

    except Exception as e:
        print(f"Error in extraction pipeline: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
