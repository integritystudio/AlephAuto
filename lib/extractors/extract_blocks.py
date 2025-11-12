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

import sys
import json
import hashlib
from pathlib import Path
from typing import List, Dict, Any

# Add lib/models to Python path
sys.path.insert(0, str(Path(__file__).parent.parent / 'models'))

from code_block import CodeBlock, SourceLocation, ASTNode
from duplicate_group import DuplicateGroup
from consolidation_suggestion import ConsolidationSuggestion, MigrationStep
from scan_report import ScanReport, RepositoryInfo, ScanConfiguration, ScanMetrics

def extract_code_blocks(pattern_matches: List[Dict], repository_info: Dict) -> List[CodeBlock]:
    """
    Extract CodeBlock models from pattern matches
    """
    blocks = []

    for i, match in enumerate(pattern_matches):
        try:
            # Generate unique block ID
            block_id = f"cb_{hashlib.sha256(f"{match['file_path']}:{match['line_start']}".encode()).hexdigest()[:12]}"

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
                source_code=match.get('matched_text', ''),
                language='javascript',  # TODO: Detect from file extension
                category=category,
                repository_path=repository_info['path'],
                line_count=match.get('line_end', match['line_start']) - match['line_start'] + 1
            )

            blocks.append(block)

        except Exception as e:
            print(f"Warning: Failed to extract block {i} from {match.get('file_path', 'unknown')}: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
            continue

    return blocks


def group_duplicates(blocks: List[CodeBlock]) -> List[DuplicateGroup]:
    """
    Group similar code blocks (basic implementation)
    """
    groups = []

    # Group by content hash (exact duplicates)
    hash_groups = {}
    for block in blocks:
        h = block.content_hash
        if h not in hash_groups:
            hash_groups[h] = []
        hash_groups[h].append(block)

    # Create groups for duplicates (2+ blocks with same hash)
    for h, group_blocks in hash_groups.items():
        if len(group_blocks) >= 2:
            group = DuplicateGroup(
                group_id=f"dg_{h[:12]}",
                pattern_id=group_blocks[0].pattern_id,
                member_block_ids=[b.block_id for b in group_blocks],
                similarity_score=1.0,  # Exact matches
                similarity_method='exact_match',  # Must match SimilarityMethod enum
                category=group_blocks[0].category,
                language=group_blocks[0].language,
                occurrence_count=len(group_blocks),
                total_lines=sum(b.line_count for b in group_blocks),
                affected_files=list(set(b.location.file_path for b in group_blocks)),
                affected_repositories=[group_blocks[0].repository_path]
            )
            groups.append(group)

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


def _determine_strategy(group: DuplicateGroup) -> tuple[str, str, str, str]:
    """
    Determine consolidation strategy based on group characteristics

    Returns: (strategy, rationale, complexity, risk)
    """
    occurrences = group.occurrence_count
    files = len(group.affected_files)
    category = group.category

    # Single file duplicates - simplest case
    if files == 1:
        return (
            'local_util',
            f"All {occurrences} occurrences in same file - extract to local function",
            'trivial',
            'minimal'
        )

    # Logger patterns - special handling
    if category in ['logger', 'config_access']:
        if occurrences <= 5:
            return (
                'local_util',
                f"Logger/config pattern used {occurrences} times - extract to module constant",
                'trivial',
                'minimal'
            )
        else:
            return (
                'shared_package',
                f"Logger/config pattern used {occurrences} times across {files} files - centralize configuration",
                'simple',
                'low'
            )

    # API handlers and auth checks - medium complexity
    if category in ['api_handler', 'auth_check', 'error_handler']:
        if occurrences <= 3:
            return (
                'local_util',
                f"API pattern used {occurrences} times - extract to middleware/util",
                'simple',
                'low'
            )
        elif occurrences <= 10:
            return (
                'shared_package',
                f"API pattern used {occurrences} times across {files} files - create shared middleware",
                'moderate',
                'medium'
            )
        else:
            return (
                'mcp_server',
                f"API pattern used {occurrences} times - candidate for framework/MCP abstraction",
                'complex',
                'high'
            )

    # Database operations - handle carefully
    if category == 'database_operation':
        if occurrences <= 3:
            return (
                'local_util',
                f"Database pattern used {occurrences} times - extract to repository method",
                'moderate',
                'medium'
            )
        else:
            return (
                'shared_package',
                f"Database pattern used {occurrences} times - create shared query builder",
                'complex',
                'high'
            )

    # General utilities and helpers
    if occurrences <= 3:
        return (
            'local_util',
            f"Utility pattern used {occurrences} times in {files} files - extract to local util",
            'trivial' if files == 2 else 'simple',
            'minimal'
        )
    elif occurrences <= 8:
        return (
            'shared_package',
            f"Utility pattern used {occurrences} times across {files} files - create shared utility",
            'simple',
            'low'
        )
    else:
        return (
            'mcp_server',
            f"Utility pattern used {occurrences} times - consider MCP tool or shared package",
            'moderate',
            'medium'
        )


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
            'structural_duplicates': 0,
            'semantic_duplicates': 0,
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
