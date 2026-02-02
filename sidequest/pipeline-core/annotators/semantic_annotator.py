"""
Semantic Annotator - Stage 4 of the Duplicate Detection Pipeline

Extracts rich semantic metadata from code blocks to enable Layer 3
(semantic similarity) grouping.

Semantic tags are organized into four categories:
- Operations: What the code does (filter, map, validate, fetch, etc.)
- Domains: What domain concepts are involved (user, auth, payment, etc.)
- Patterns: What code patterns are used (guard_clause, null_check, etc.)
- Data Types: What data types are processed (array, object, promise, etc.)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..models.code_block import CodeBlock


@dataclass
class SemanticAnnotation:
    """Rich semantic metadata for a code block.

    Attributes:
        category: The semantic category (from CodeBlock)
        operations: Set of operations performed (filter, map, validate, etc.)
        domains: Set of domain concepts (user, auth, payment, etc.)
        patterns: Set of code patterns (guard_clause, null_check, etc.)
        data_types: Set of data types processed (array, object, promise, etc.)
        intent: High-level description of what the code does
    """

    category: str
    operations: set[str] = field(default_factory=set)
    domains: set[str] = field(default_factory=set)
    patterns: set[str] = field(default_factory=set)
    data_types: set[str] = field(default_factory=set)
    intent: str = ""

    def all_tags(self) -> set[str]:
        """Return all semantic tags as a single set."""
        return self.operations | self.domains | self.patterns | self.data_types

    def to_dict(self) -> dict:
        """Convert to dictionary for serialization."""
        return {
            'category': self.category,
            'operations': sorted(self.operations),
            'domains': sorted(self.domains),
            'patterns': sorted(self.patterns),
            'data_types': sorted(self.data_types),
            'intent': self.intent,
        }


# ---------------------------------------------------------------------------
# Pattern Libraries
# ---------------------------------------------------------------------------
# NOTE: All regex patterns use bounded quantifiers (\s{0,20} instead of \s*)
# to prevent ReDoS (Regular Expression Denial of Service) attacks. (H3 fix)
# Max 20 whitespace chars is sufficient for all valid code patterns.

# Array/collection operations
ARRAY_OPERATION_PATTERNS: dict[str, str] = {
    r'\.filter\s{0,20}\(': 'filter',
    r'\.map\s{0,20}\(': 'map',
    r'\.reduce\s{0,20}\(': 'reduce',
    r'\.find\s{0,20}\(': 'find',
    r'\.findIndex\s{0,20}\(': 'find',
    r'\.some\s{0,20}\(': 'some',
    r'\.every\s{0,20}\(': 'every',
    r'\.sort\s{0,20}\(': 'sort',
    r'\.includes\s{0,20}\(': 'includes',
    r'\.indexOf\s{0,20}\(': 'find',
    r'\.forEach\s{0,20}\(': 'iterate',
    r'for\s{0,20}\(\s{0,20}(?:const|let|var)\s{1,20}\w+\s{1,20}(?:of|in)': 'iterate',
    r'for\s{0,20}\(\s{0,20}(?:let|var)\s{1,20}\w+\s{0,20}=': 'iterate',
    r'while\s{0,20}\(': 'iterate',
    r'\.flat\s{0,20}\(': 'flatten',
    r'\.flatMap\s{0,20}\(': 'flatten',
    r'\.concat\s{0,20}\(': 'concat',
    r'\.slice\s{0,20}\(': 'slice',
    r'\.splice\s{0,20}\(': 'splice',
    r'\.push\s{0,20}\(': 'append',
    r'\.pop\s{0,20}\(': 'remove',
    r'\.shift\s{0,20}\(': 'remove',
    r'\.unshift\s{0,20}\(': 'prepend',
}

# CRUD/data operations
CRUD_OPERATION_PATTERNS: dict[str, str] = {
    r'\.(get|fetch|read|load|retrieve)\s{0,20}\(': 'read',
    r'\.(post|create|insert|add|save|write)\s{0,20}\(': 'create',
    r'\.(put|update|patch|modify|set)\s{0,20}\(': 'update',
    r'\.(delete|remove|destroy|clear)\s{0,20}\(': 'delete',
    r'fetch\s{0,20}\(': 'fetch',
    r'axios\.(get|post|put|patch|delete)\s{0,20}\(': 'fetch',
    r'http\.(get|post|put|patch|delete)\s{0,20}\(': 'fetch',
}

# Transformation operations
TRANSFORM_OPERATION_PATTERNS: dict[str, str] = {
    r'JSON\.parse\s{0,20}\(': 'parse',
    r'JSON\.stringify\s{0,20}\(': 'serialize',
    r'\.toString\s{0,20}\(': 'transform',
    r'\.toUpperCase\s{0,20}\(': 'transform',
    r'\.toLowerCase\s{0,20}\(': 'transform',
    r'\.trim\s{0,20}\(': 'transform',
    r'\.split\s{0,20}\(': 'split',
    r'\.join\s{0,20}\(': 'join',
    r'\.replace\s{0,20}\(': 'replace',
    r'parseInt\s{0,20}\(': 'parse',
    r'parseFloat\s{0,20}\(': 'parse',
    r'Number\s{0,20}\(': 'transform',
    r'String\s{0,20}\(': 'transform',
    r'Boolean\s{0,20}\(': 'transform',
    r'Object\.keys\s{0,20}\(': 'extract',
    r'Object\.values\s{0,20}\(': 'extract',
    r'Object\.entries\s{0,20}\(': 'extract',
    r'Object\.assign\s{0,20}\(': 'merge',
    r'\.\.\.\w+': 'spread',
}

# Validation operations
VALIDATION_OPERATION_PATTERNS: dict[str, str] = {
    r'(validate|isValid|check|verify|assert)\s{0,20}\(': 'validate',
    r'\.test\s{0,20}\(': 'validate',
    r'\.match\s{0,20}\(': 'validate',
    r'schema\.(validate|parse|safeParse)\s{0,20}\(': 'validate',
    r'z\.\w+\s{0,20}\(': 'validate',
    r'joi\.\w+': 'validate',
    r'yup\.\w+': 'validate',
}

# Domain patterns
DOMAIN_PATTERNS: dict[str, str] = {
    r'\b(user|users|account|accounts|profile|profiles|member)\b': 'user',
    r'\b(auth|authentication|login|logout|signin|signout|token|session|jwt|oauth|password|credential|secret|apikey|api_key)\b': 'auth',
    r'\b(payment|charge|invoice|billing|subscription|stripe|paypal)\b': 'payment',
    r'\b(order|orders|cart|checkout|purchase)\b': 'commerce',
    r'\b(email|mail|notification|alert|notify|message|sms)\b': 'notification',
    r'\b(file|files|upload|download|attachment|blob|storage)\b': 'file',
    r'\b(database|db|query|record|table|collection|document)\b': 'database',
    r'\b(prisma|mongoose|sequelize|typeorm|knex)\b': 'database',
    r'\b(cache|redis|memcached|cached)\b': 'cache',
    r'\b(queue|job|jobs|worker|task|tasks|bull|rabbitmq)\b': 'queue',
    r'\b(api|endpoint|route|routes|request|response|req|res)\b': 'api',
    r'\b(webhook|webhooks|callback|hook)\b': 'webhook',
    r'\b(event|events|emit|publish|subscribe|listener)\b': 'event',
    r'\b(log|logs|logger|logging|trace|debug|info|warn|error)\b': 'logging',
    r'\b(config|configuration|settings|options|env|environment)\b': 'config',
    r'\b(test|tests|spec|describe|it\s{0,20}\(|expect\s{0,20}\()\b': 'test',
}

# Code patterns
CODE_PATTERN_PATTERNS: dict[str, str] = {
    # Guard clause / early return
    r'if\s{0,20}\([^)]+\)\s{0,20}(?:return|throw)': 'guard_clause',
    r'if\s{0,20}\(\s{0,20}!\s{0,20}\w+\s{0,20}\)\s{0,20}(?:return|throw)': 'guard_clause',

    # Null/undefined checks
    r'===?\s{0,20}null\b': 'null_check',
    r'!==?\s{0,20}null\b': 'null_check',
    r'===?\s{0,20}undefined\b': 'null_check',
    r'!==?\s{0,20}undefined\b': 'null_check',
    r'\?\?': 'null_check',
    r'\?\s{0,20}\.': 'null_check',
    r'typeof\s{1,20}\w+\s{0,20}[!=]==?\s{0,20}["\']undefined["\']': 'null_check',

    # Error handling
    r'try\s{0,20}\{': 'error_handling',
    r'catch\s{0,20}\(': 'error_handling',
    r'\.catch\s{0,20}\(': 'error_handling',
    r'finally\s{0,20}\{': 'error_handling',
    r'throw\s{1,20}new\s{1,20}\w*Error': 'error_handling',

    # Retry logic
    r'retry|retries|attempts|maxAttempts|backoff': 'retry_logic',

    # Timeout handling
    r'timeout|setTimeout|setInterval|clearTimeout|clearInterval': 'timeout',

    # Async patterns
    r'async\s{1,20}': 'async_await',
    r'await\s{1,20}': 'async_await',
    r'\.then\s{0,20}\(': 'promise_chain',
    r'Promise\.(all|race|allSettled|any)\s{0,20}\(': 'promise_composition',
    r'new\s{1,20}Promise\s{0,20}\(': 'promise_creation',

    # Caching patterns
    r'cache\.(get|set|has|delete)': 'caching',
    r'memoize|memo|cached': 'caching',

    # Pagination
    r'\b(page|pages|offset|limit|cursor|skip|take)\b': 'pagination',

    # Batching
    r'\b(batch|batches|chunk|chunks)\b': 'batching',

    # Streaming
    r'\b(stream|streams|pipe|readable|writable)\b': 'streaming',

    # Locking/mutex
    r'\b(lock|unlock|mutex|semaphore)\b': 'locking',

    # Rate limiting
    r'\b(rateLimit|throttle|debounce)\b': 'rate_limiting',
}

# Data type patterns
DATA_TYPE_PATTERNS: dict[str, str] = {
    # Array
    r'\[\s{0,20}\]': 'array',
    r'\bArray\b': 'array',
    r'\.length\b': 'array',
    r'Array\.isArray\s{0,20}\(': 'array',
    r'\.push\s{0,20}\(': 'array',

    # Object
    r'\{\s{0,20}\}': 'object',
    r'\bObject\b': 'object',
    r'\.keys\s{0,20}\(': 'object',
    r'\.values\s{0,20}\(': 'object',
    r'\.entries\s{0,20}\(': 'object',
    r'\.hasOwnProperty\s{0,20}\(': 'object',

    # String
    r'["\'][^"\']*["\']': 'string',
    r'`[^`]*`': 'string',
    r'\.toString\s{0,20}\(': 'string',
    r'\.trim\s{0,20}\(': 'string',
    r'\.substring\s{0,20}\(': 'string',
    r'\.substr\s{0,20}\(': 'string',

    # Number
    r'\b\d+\.?\d*\b': 'number',
    r'Number\s{0,20}\(': 'number',
    r'parseInt\s{0,20}\(': 'number',
    r'parseFloat\s{0,20}\(': 'number',
    r'Math\.\w+': 'number',

    # Boolean
    r'\b(true|false)\b': 'boolean',
    r'Boolean\s{0,20}\(': 'boolean',

    # Date
    r'new\s{1,20}Date\s{0,20}\(': 'date',
    r'Date\.(now|parse)\s{0,20}\(': 'date',
    r'\.toISOString\s{0,20}\(': 'date',
    r'moment\s{0,20}\(': 'date',
    r'dayjs\s{0,20}\(': 'date',

    # Promise/async
    r'\bPromise\b': 'promise',
    r'\.then\s{0,20}\(': 'promise',
    r'async\s{1,20}': 'promise',
    r'await\s{1,20}': 'promise',

    # Null/undefined
    r'\bnull\b': 'null',
    r'\bundefined\b': 'undefined',

    # Map/Set
    r'new\s{1,20}Map\s{0,20}\(': 'map',
    r'new\s{1,20}Set\s{0,20}\(': 'set',
    r'\.has\s{0,20}\(': 'collection',

    # Buffer/Binary
    r'\bBuffer\b': 'buffer',
    r'ArrayBuffer': 'buffer',
    r'Uint8Array': 'buffer',

    # Regex
    r'/[^/]+/[gim]*': 'regex',
    r'new\s{1,20}RegExp\s{0,20}\(': 'regex',
}

# ---------------------------------------------------------------------------
# Pre-compiled Regex Patterns (L4 fix - avoid recompilation on each call)
# ---------------------------------------------------------------------------


def _compile_patterns(
    patterns: dict[str, str], flags: int = 0
) -> list[tuple[re.Pattern[str], str]]:
    """Pre-compile regex patterns for efficient reuse."""
    return [(re.compile(pattern, flags), tag) for pattern, tag in patterns.items()]


# Compiled pattern lists (module-level for one-time compilation)
_COMPILED_ARRAY_OPS = _compile_patterns(ARRAY_OPERATION_PATTERNS, re.IGNORECASE)
_COMPILED_CRUD_OPS = _compile_patterns(CRUD_OPERATION_PATTERNS, re.IGNORECASE)
_COMPILED_TRANSFORM_OPS = _compile_patterns(TRANSFORM_OPERATION_PATTERNS, re.IGNORECASE)
_COMPILED_VALIDATION_OPS = _compile_patterns(VALIDATION_OPERATION_PATTERNS, re.IGNORECASE)
_COMPILED_DOMAIN = _compile_patterns(DOMAIN_PATTERNS, re.IGNORECASE)
_COMPILED_CODE_PATTERNS = _compile_patterns(CODE_PATTERN_PATTERNS, re.IGNORECASE)
_COMPILED_DATA_TYPES = _compile_patterns(DATA_TYPE_PATTERNS)

# Combined operation patterns for _extract_operations
_COMPILED_ALL_OPERATIONS = (
    _COMPILED_ARRAY_OPS
    + _COMPILED_CRUD_OPS
    + _COMPILED_TRANSFORM_OPS
    + _COMPILED_VALIDATION_OPS
)


class SemanticAnnotator:
    """Stage 4: Full semantic annotation of code blocks.

    Analyzes code blocks and extracts rich semantic metadata for use in
    Layer 3 (semantic similarity) grouping.

    Usage:
        annotator = SemanticAnnotator()
        annotation = annotator.extract_annotation(code_block)

        # Access semantic tags
        print(annotation.operations)  # {'filter', 'map'}
        print(annotation.domains)     # {'user'}
        print(annotation.intent)      # 'filter+map|on:user'
    """

    def extract_annotation(self, block: CodeBlock) -> SemanticAnnotation:
        """Analyze code block and extract semantic metadata.

        Uses pattern matching to identify:
        - Operations (filter, map, validate, etc.)
        - Domain concepts (user, auth, payment, etc.)
        - Code patterns (guard clause, error handling, etc.)
        - Data types being processed

        Args:
            block: CodeBlock to annotate

        Returns:
            SemanticAnnotation with extracted metadata
        """
        code = block.source_code
        tags = block.tags if hasattr(block, 'tags') else []
        category = block.category if hasattr(block, 'category') else 'unknown'

        # Handle enum values
        if hasattr(category, 'value'):
            category = category.value

        operations = self._extract_operations(code)
        domains = self._extract_domains(code, tags)
        patterns = self._extract_patterns(code)
        data_types = self._extract_data_types(code)
        intent = self._infer_intent(operations, domains, patterns)

        return SemanticAnnotation(
            category=category,
            operations=operations,
            domains=domains,
            patterns=patterns,
            data_types=data_types,
            intent=intent,
        )

    def _extract_operations(self, code: str) -> set[str]:
        """Extract operation types from code.

        Detects array operations, CRUD operations, transformations,
        and validation operations.
        """
        operations: set[str] = set()

        for compiled_pattern, op in _COMPILED_ALL_OPERATIONS:
            if compiled_pattern.search(code):
                operations.add(op)

        return operations

    def _extract_domains(self, code: str, tags: list[str]) -> set[str]:
        """Extract domain concepts from code and tags.

        Analyzes both source code and existing tags for domain indicators.
        """
        domains: set[str] = set()

        # Combine code and tags for analysis
        text = code + ' ' + ' '.join(tags)

        for compiled_pattern, domain in _COMPILED_DOMAIN:
            if compiled_pattern.search(text):
                domains.add(domain)

        return domains

    def _extract_patterns(self, code: str) -> set[str]:
        """Identify code patterns.

        Detects common patterns like guard clauses, error handling,
        null checks, async patterns, etc.
        """
        patterns: set[str] = set()

        for compiled_pattern, name in _COMPILED_CODE_PATTERNS:
            if compiled_pattern.search(code):
                patterns.add(name)

        return patterns

    def _extract_data_types(self, code: str) -> set[str]:
        """Identify data types being processed.

        Detects arrays, objects, strings, numbers, promises, etc.
        """
        data_types: set[str] = set()

        for compiled_pattern, dtype in _COMPILED_DATA_TYPES:
            if compiled_pattern.search(code):
                data_types.add(dtype)

        return data_types

    def _infer_intent(
        self,
        operations: set[str],
        domains: set[str],
        patterns: set[str],
    ) -> str:
        """Generate high-level intent description.

        Creates a structured intent string that summarizes what the code does.
        Format: operations|on:domains|with:patterns

        Examples:
            - "filter+map|on:user"
            - "validate|on:auth|with:guard_clause"
            - "fetch+parse|on:api"
        """
        parts: list[str] = []

        if operations:
            parts.append('+'.join(sorted(operations)))

        if domains:
            parts.append('on:' + '+'.join(sorted(domains)))

        if patterns:
            parts.append('with:' + '+'.join(sorted(patterns)))

        return '|'.join(parts) if parts else 'unknown'
