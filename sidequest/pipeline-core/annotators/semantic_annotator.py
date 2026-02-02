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

# Array/collection operations
ARRAY_OPERATION_PATTERNS: dict[str, str] = {
    r'\.filter\s*\(': 'filter',
    r'\.map\s*\(': 'map',
    r'\.reduce\s*\(': 'reduce',
    r'\.find\s*\(': 'find',
    r'\.findIndex\s*\(': 'find',
    r'\.some\s*\(': 'some',
    r'\.every\s*\(': 'every',
    r'\.sort\s*\(': 'sort',
    r'\.includes\s*\(': 'includes',
    r'\.indexOf\s*\(': 'find',
    r'\.forEach\s*\(': 'iterate',
    r'for\s*\(\s*(?:const|let|var)\s+\w+\s+(?:of|in)': 'iterate',
    r'for\s*\(\s*(?:let|var)\s+\w+\s*=': 'iterate',
    r'while\s*\(': 'iterate',
    r'\.flat\s*\(': 'flatten',
    r'\.flatMap\s*\(': 'flatten',
    r'\.concat\s*\(': 'concat',
    r'\.slice\s*\(': 'slice',
    r'\.splice\s*\(': 'splice',
    r'\.push\s*\(': 'append',
    r'\.pop\s*\(': 'remove',
    r'\.shift\s*\(': 'remove',
    r'\.unshift\s*\(': 'prepend',
}

# CRUD/data operations
CRUD_OPERATION_PATTERNS: dict[str, str] = {
    r'\.(get|fetch|read|load|retrieve)\s*\(': 'read',
    r'\.(post|create|insert|add|save|write)\s*\(': 'create',
    r'\.(put|update|patch|modify|set)\s*\(': 'update',
    r'\.(delete|remove|destroy|clear)\s*\(': 'delete',
    r'fetch\s*\(': 'fetch',
    r'axios\.(get|post|put|patch|delete)\s*\(': 'fetch',
    r'http\.(get|post|put|patch|delete)\s*\(': 'fetch',
}

# Transformation operations
TRANSFORM_OPERATION_PATTERNS: dict[str, str] = {
    r'JSON\.parse\s*\(': 'parse',
    r'JSON\.stringify\s*\(': 'serialize',
    r'\.toString\s*\(': 'transform',
    r'\.toUpperCase\s*\(': 'transform',
    r'\.toLowerCase\s*\(': 'transform',
    r'\.trim\s*\(': 'transform',
    r'\.split\s*\(': 'split',
    r'\.join\s*\(': 'join',
    r'\.replace\s*\(': 'replace',
    r'parseInt\s*\(': 'parse',
    r'parseFloat\s*\(': 'parse',
    r'Number\s*\(': 'transform',
    r'String\s*\(': 'transform',
    r'Boolean\s*\(': 'transform',
    r'Object\.keys\s*\(': 'extract',
    r'Object\.values\s*\(': 'extract',
    r'Object\.entries\s*\(': 'extract',
    r'Object\.assign\s*\(': 'merge',
    r'\.\.\.\w+': 'spread',
}

# Validation operations
VALIDATION_OPERATION_PATTERNS: dict[str, str] = {
    r'(validate|isValid|check|verify|assert)\s*\(': 'validate',
    r'\.test\s*\(': 'validate',
    r'\.match\s*\(': 'validate',
    r'schema\.(validate|parse|safeParse)\s*\(': 'validate',
    r'z\.\w+\s*\(': 'validate',
    r'joi\.\w+': 'validate',
    r'yup\.\w+': 'validate',
}

# Domain patterns
DOMAIN_PATTERNS: dict[str, str] = {
    r'\b(user|users|account|accounts|profile|profiles|member)\b': 'user',
    r'\b(auth|authentication|login|logout|signin|signout|token|session|jwt|oauth)\b': 'auth',
    r'\b(password|credential|secret|apikey|api_key)\b': 'auth',
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
    r'\b(test|tests|spec|describe|it\s*\(|expect\s*\()\b': 'test',
}

# Code patterns
CODE_PATTERN_PATTERNS: dict[str, str] = {
    # Guard clause / early return
    r'if\s*\([^)]+\)\s*(?:return|throw)': 'guard_clause',
    r'if\s*\(\s*!\s*\w+\s*\)\s*(?:return|throw)': 'guard_clause',

    # Null/undefined checks
    r'===?\s*null\b': 'null_check',
    r'!==?\s*null\b': 'null_check',
    r'===?\s*undefined\b': 'null_check',
    r'!==?\s*undefined\b': 'null_check',
    r'\?\?': 'null_check',
    r'\?\s*\.': 'null_check',
    r'typeof\s+\w+\s*[!=]==?\s*["\']undefined["\']': 'null_check',

    # Error handling
    r'try\s*\{': 'error_handling',
    r'catch\s*\(': 'error_handling',
    r'\.catch\s*\(': 'error_handling',
    r'finally\s*\{': 'error_handling',
    r'throw\s+new\s+\w*Error': 'error_handling',

    # Retry logic
    r'retry|retries|attempts|maxAttempts|backoff': 'retry_logic',

    # Timeout handling
    r'timeout|setTimeout|setInterval|clearTimeout|clearInterval': 'timeout',

    # Async patterns
    r'async\s+': 'async_await',
    r'await\s+': 'async_await',
    r'\.then\s*\(': 'promise_chain',
    r'Promise\.(all|race|allSettled|any)\s*\(': 'promise_composition',
    r'new\s+Promise\s*\(': 'promise_creation',

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
    r'\[\s*\]': 'array',
    r'\bArray\b': 'array',
    r'\.length\b': 'array',
    r'Array\.isArray\s*\(': 'array',
    r'\.push\s*\(': 'array',

    # Object
    r'\{\s*\}': 'object',
    r'\bObject\b': 'object',
    r'\.keys\s*\(': 'object',
    r'\.values\s*\(': 'object',
    r'\.entries\s*\(': 'object',
    r'\.hasOwnProperty\s*\(': 'object',

    # String
    r'["\'][^"\']*["\']': 'string',
    r'`[^`]*`': 'string',
    r'\.toString\s*\(': 'string',
    r'\.trim\s*\(': 'string',
    r'\.substring\s*\(': 'string',
    r'\.substr\s*\(': 'string',

    # Number
    r'\b\d+\.?\d*\b': 'number',
    r'Number\s*\(': 'number',
    r'parseInt\s*\(': 'number',
    r'parseFloat\s*\(': 'number',
    r'Math\.\w+': 'number',

    # Boolean
    r'\b(true|false)\b': 'boolean',
    r'Boolean\s*\(': 'boolean',

    # Date
    r'new\s+Date\s*\(': 'date',
    r'Date\.(now|parse)\s*\(': 'date',
    r'\.toISOString\s*\(': 'date',
    r'moment\s*\(': 'date',
    r'dayjs\s*\(': 'date',

    # Promise/async
    r'\bPromise\b': 'promise',
    r'\.then\s*\(': 'promise',
    r'async\s+': 'promise',
    r'await\s+': 'promise',

    # Null/undefined
    r'\bnull\b': 'null',
    r'\bundefined\b': 'undefined',

    # Map/Set
    r'new\s+Map\s*\(': 'map',
    r'new\s+Set\s*\(': 'set',
    r'\.has\s*\(': 'collection',

    # Buffer/Binary
    r'\bBuffer\b': 'buffer',
    r'ArrayBuffer': 'buffer',
    r'Uint8Array': 'buffer',

    # Regex
    r'/[^/]+/[gim]*': 'regex',
    r'new\s+RegExp\s*\(': 'regex',
}


class SemanticAnnotator:
    """Stage 4: Full semantic annotation of code blocks.

    Analyzes code blocks and extracts rich semantic metadata for use in
    Layer 3 (semantic similarity) grouping.

    Usage:
        annotator = SemanticAnnotator()
        annotation = annotator.annotate(code_block)

        # Access semantic tags
        print(annotation.operations)  # {'filter', 'map'}
        print(annotation.domains)     # {'user'}
        print(annotation.intent)      # 'filter+map|on:user'
    """

    def annotate(self, block: CodeBlock) -> SemanticAnnotation:
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

        all_patterns = {
            **ARRAY_OPERATION_PATTERNS,
            **CRUD_OPERATION_PATTERNS,
            **TRANSFORM_OPERATION_PATTERNS,
            **VALIDATION_OPERATION_PATTERNS,
        }

        for pattern, op in all_patterns.items():
            if re.search(pattern, code, re.IGNORECASE):
                operations.add(op)

        return operations

    def _extract_domains(self, code: str, tags: list[str]) -> set[str]:
        """Extract domain concepts from code and tags.

        Analyzes both source code and existing tags for domain indicators.
        """
        domains: set[str] = set()

        # Combine code and tags for analysis
        text = code + ' ' + ' '.join(tags)

        for pattern, domain in DOMAIN_PATTERNS.items():
            if re.search(pattern, text, re.IGNORECASE):
                domains.add(domain)

        return domains

    def _extract_patterns(self, code: str) -> set[str]:
        """Identify code patterns.

        Detects common patterns like guard clauses, error handling,
        null checks, async patterns, etc.
        """
        patterns: set[str] = set()

        for pattern, name in CODE_PATTERN_PATTERNS.items():
            if re.search(pattern, code, re.IGNORECASE):
                patterns.add(name)

        return patterns

    def _extract_data_types(self, code: str) -> set[str]:
        """Identify data types being processed.

        Detects arrays, objects, strings, numbers, promises, etc.
        """
        data_types: set[str] = set()

        for pattern, dtype in DATA_TYPE_PATTERNS.items():
            if re.search(pattern, code):
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
