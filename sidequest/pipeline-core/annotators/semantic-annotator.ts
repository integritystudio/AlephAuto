/**
 * Semantic Annotator - Fourth stage of the Duplicate Detection Pipeline
 *
 * Extracts rich semantic metadata from code blocks to enable
 * semantic similarity layer grouping.
 *
 * Ports Python semantic_annotator.py.
 */

import type { CodeBlock, SemanticAnnotation } from '../models/types.ts';

// ---------------------------------------------------------------------------
// Pattern Libraries
// ---------------------------------------------------------------------------
// All regex patterns use bounded quantifiers (\s{0,20} instead of \s*)
// to prevent ReDoS attacks.

const ARRAY_OPERATION_PATTERNS: Array<[RegExp, string]> = [
  [/\.filter\s{0,20}\(/i, 'filter'],
  [/\.map\s{0,20}\(/i, 'map'],
  [/\.reduce\s{0,20}\(/i, 'reduce'],
  [/\.find\s{0,20}\(/i, 'find'],
  [/\.findIndex\s{0,20}\(/i, 'find'],
  [/\.some\s{0,20}\(/i, 'some'],
  [/\.every\s{0,20}\(/i, 'every'],
  [/\.sort\s{0,20}\(/i, 'sort'],
  [/\.includes\s{0,20}\(/i, 'includes'],
  [/\.indexOf\s{0,20}\(/i, 'find'],
  [/\.forEach\s{0,20}\(/i, 'iterate'],
  [/for\s{0,20}\(\s{0,20}(?:const|let|var)\s{1,20}\w+\s{1,20}(?:of|in)/i, 'iterate'],
  [/for\s{0,20}\(\s{0,20}(?:let|var)\s{1,20}\w+\s{0,20}=/i, 'iterate'],
  [/while\s{0,20}\(/i, 'iterate'],
  [/\.flat\s{0,20}\(/i, 'flatten'],
  [/\.flatMap\s{0,20}\(/i, 'flatten'],
  [/\.concat\s{0,20}\(/i, 'concat'],
  [/\.slice\s{0,20}\(/i, 'slice'],
  [/\.splice\s{0,20}\(/i, 'splice'],
  [/\.push\s{0,20}\(/i, 'append'],
  [/\.pop\s{0,20}\(/i, 'remove'],
  [/\.shift\s{0,20}\(/i, 'remove'],
  [/\.unshift\s{0,20}\(/i, 'prepend'],
];

const CRUD_OPERATION_PATTERNS: Array<[RegExp, string]> = [
  [/\.(get|fetch|read|load|retrieve)\s{0,20}\(/i, 'read'],
  [/\.(post|create|insert|add|save|write)\s{0,20}\(/i, 'create'],
  [/\.(put|update|patch|modify|set)\s{0,20}\(/i, 'update'],
  [/\.(delete|remove|destroy|clear)\s{0,20}\(/i, 'delete'],
  [/fetch\s{0,20}\(/i, 'fetch'],
  [/axios\.(get|post|put|patch|delete)\s{0,20}\(/i, 'fetch'],
  [/http\.(get|post|put|patch|delete)\s{0,20}\(/i, 'fetch'],
];

const TRANSFORM_OPERATION_PATTERNS: Array<[RegExp, string]> = [
  [/JSON\.parse\s{0,20}\(/i, 'parse'],
  [/JSON\.stringify\s{0,20}\(/i, 'serialize'],
  [/\.toString\s{0,20}\(/i, 'transform'],
  [/\.toUpperCase\s{0,20}\(/i, 'transform'],
  [/\.toLowerCase\s{0,20}\(/i, 'transform'],
  [/\.trim\s{0,20}\(/i, 'transform'],
  [/\.split\s{0,20}\(/i, 'split'],
  [/\.join\s{0,20}\(/i, 'join'],
  [/\.replace\s{0,20}\(/i, 'replace'],
  [/parseInt\s{0,20}\(/i, 'parse'],
  [/parseFloat\s{0,20}\(/i, 'parse'],
  [/Number\s{0,20}\(/i, 'transform'],
  [/String\s{0,20}\(/i, 'transform'],
  [/Boolean\s{0,20}\(/i, 'transform'],
  [/Object\.keys\s{0,20}\(/i, 'extract'],
  [/Object\.values\s{0,20}\(/i, 'extract'],
  [/Object\.entries\s{0,20}\(/i, 'extract'],
  [/Object\.assign\s{0,20}\(/i, 'merge'],
  [/\.\.\.\w+/, 'spread'],
];

const VALIDATION_OPERATION_PATTERNS: Array<[RegExp, string]> = [
  [/(validate|isValid|check|verify|assert)\s{0,20}\(/i, 'validate'],
  [/\.test\s{0,20}\(/i, 'validate'],
  [/\.match\s{0,20}\(/i, 'validate'],
  [/schema\.(validate|parse|safeParse)\s{0,20}\(/i, 'validate'],
  [/z\.\w+\s{0,20}\(/i, 'validate'],
  [/joi\.\w+/i, 'validate'],
  [/yup\.\w+/i, 'validate'],
];

const DOMAIN_PATTERNS: Array<[RegExp, string]> = [
  [/\b(user|users|account|accounts|profile|profiles|member)\b/i, 'user'],
  [/\b(auth|authentication|login|logout|signin|signout|token|session|jwt|oauth|password|credential|secret|apikey|api_key)\b/i, 'auth'],
  [/\b(payment|charge|invoice|billing|subscription|stripe|paypal)\b/i, 'payment'],
  [/\b(order|orders|cart|checkout|purchase)\b/i, 'commerce'],
  [/\b(email|mail|notification|alert|notify|message|sms)\b/i, 'notification'],
  [/\b(file|files|upload|download|attachment|blob|storage)\b/i, 'file'],
  [/\b(database|db|query|record|table|collection|document)\b/i, 'database'],
  [/\b(prisma|mongoose|sequelize|typeorm|knex)\b/i, 'database'],
  [/\b(cache|redis|memcached|cached)\b/i, 'cache'],
  [/\b(queue|job|jobs|worker|task|tasks|bull|rabbitmq)\b/i, 'queue'],
  [/\b(api|endpoint|route|routes|request|response|req|res)\b/i, 'api'],
  [/\b(webhook|webhooks|callback|hook)\b/i, 'webhook'],
  [/\b(event|events|emit|publish|subscribe|listener)\b/i, 'event'],
  [/\b(log|logs|logger|logging|trace|debug|info|warn|error)\b/i, 'logging'],
  [/\b(config|configuration|settings|options|env|environment)\b/i, 'config'],
  [/\b(test|tests|spec|describe|it\s{0,20}\(|expect\s{0,20}\()\b/i, 'test'],
];

const CODE_PATTERN_PATTERNS: Array<[RegExp, string]> = [
  [/if\s{0,20}\([^)]+\)\s{0,20}(?:return|throw)/i, 'guard_clause'],
  [/if\s{0,20}\(\s{0,20}!\s{0,20}\w+\s{0,20}\)\s{0,20}(?:return|throw)/i, 'guard_clause'],
  [/===?\s{0,20}null\b/i, 'null_check'],
  [/!==?\s{0,20}null\b/i, 'null_check'],
  [/===?\s{0,20}undefined\b/i, 'null_check'],
  [/!==?\s{0,20}undefined\b/i, 'null_check'],
  [/\?\?/i, 'null_check'],
  [/\?\s{0,20}\./i, 'null_check'],
  [/typeof\s{1,20}\w+\s{0,20}[!=]==?\s{0,20}["']undefined["']/i, 'null_check'],
  [/try\s{0,20}\{/i, 'error_handling'],
  [/catch\s{0,20}\(/i, 'error_handling'],
  [/\.catch\s{0,20}\(/i, 'error_handling'],
  [/finally\s{0,20}\{/i, 'error_handling'],
  [/throw\s{1,20}new\s{1,20}\w*Error/i, 'error_handling'],
  [/retry|retries|attempts|maxAttempts|backoff/i, 'retry_logic'],
  [/timeout|setTimeout|setInterval|clearTimeout|clearInterval/i, 'timeout'],
  [/async\s{1,20}/i, 'async_await'],
  [/await\s{1,20}/i, 'async_await'],
  [/\.then\s{0,20}\(/i, 'promise_chain'],
  [/Promise\.(all|race|allSettled|any)\s{0,20}\(/i, 'promise_composition'],
  [/new\s{1,20}Promise\s{0,20}\(/i, 'promise_creation'],
  [/cache\.(get|set|has|delete)/i, 'caching'],
  [/memoize|memo|cached/i, 'caching'],
  [/\b(page|pages|offset|limit|cursor|skip|take)\b/i, 'pagination'],
  [/\b(batch|batches|chunk|chunks)\b/i, 'batching'],
  [/\b(stream|streams|pipe|readable|writable)\b/i, 'streaming'],
  [/\b(lock|unlock|mutex|semaphore)\b/i, 'locking'],
  [/\b(rateLimit|throttle|debounce)\b/i, 'rate_limiting'],
];

const DATA_TYPE_PATTERNS: Array<[RegExp, string]> = [
  [/\[\s{0,20}\]/, 'array'],
  [/\bArray\b/, 'array'],
  [/\.length\b/, 'array'],
  [/Array\.isArray\s{0,20}\(/, 'array'],
  [/\.push\s{0,20}\(/, 'array'],
  [/\{\s{0,20}\}/, 'object'],
  [/\bObject\b/, 'object'],
  [/\.keys\s{0,20}\(/, 'object'],
  [/\.values\s{0,20}\(/, 'object'],
  [/\.entries\s{0,20}\(/, 'object'],
  [/\.hasOwnProperty\s{0,20}\(/, 'object'],
  [/['"][^'"]*['"]/, 'string'],
  [/`[^`]*`/, 'string'],
  [/\.toString\s{0,20}\(/, 'string'],
  [/\.trim\s{0,20}\(/, 'string'],
  [/\.substring\s{0,20}\(/, 'string'],
  [/\.substr\s{0,20}\(/, 'string'],
  [/\b\d+\.?\d*\b/, 'number'],
  [/Number\s{0,20}\(/, 'number'],
  [/parseInt\s{0,20}\(/, 'number'],
  [/parseFloat\s{0,20}\(/, 'number'],
  [/Math\.\w+/, 'number'],
  [/\b(true|false)\b/, 'boolean'],
  [/Boolean\s{0,20}\(/, 'boolean'],
  [/new\s{1,20}Date\s{0,20}\(/, 'date'],
  [/Date\.(now|parse)\s{0,20}\(/, 'date'],
  [/\.toISOString\s{0,20}\(/, 'date'],
  [/moment\s{0,20}\(/, 'date'],
  [/dayjs\s{0,20}\(/, 'date'],
  [/\bPromise\b/, 'promise'],
  [/\.then\s{0,20}\(/, 'promise'],
  [/async\s{1,20}/, 'promise'],
  [/await\s{1,20}/, 'promise'],
  [/\bnull\b/, 'null'],
  [/\bundefined\b/, 'undefined'],
  [/new\s{1,20}Map\s{0,20}\(/, 'map'],
  [/new\s{1,20}Set\s{0,20}\(/, 'set'],
  [/\.has\s{0,20}\(/, 'collection'],
  [/\bBuffer\b/, 'buffer'],
  [/ArrayBuffer/, 'buffer'],
  [/Uint8Array/, 'buffer'],
  [/\/[^/]+\/[gim]*/, 'regex'],
  [/new\s{1,20}RegExp\s{0,20}\(/, 'regex'],
];

// Combined operation patterns
const ALL_OPERATION_PATTERNS: Array<[RegExp, string]> = [
  ...ARRAY_OPERATION_PATTERNS,
  ...CRUD_OPERATION_PATTERNS,
  ...TRANSFORM_OPERATION_PATTERNS,
  ...VALIDATION_OPERATION_PATTERNS,
];

// ---------------------------------------------------------------------------
// SemanticAnnotator class
// ---------------------------------------------------------------------------

export class SemanticAnnotator {
  private readonly collectTiming: boolean;
  constructor(collectTiming = false) {
    this.collectTiming = collectTiming;
  }

  extractAnnotation(block: CodeBlock): SemanticAnnotation {
    const code = block.sourceCode;
    const tags = block.tags ?? [];
    let category = block.category ?? 'unknown';

    // Handle enum values (if category has a .value property)
    if (typeof category === 'object' && category !== null && 'value' in category) {
      category = (category as { value: string }).value;
    }

    const operations = this._extractOperations(code);
    const domains = this._extractDomains(code, tags);
    const patterns = this._extractPatterns(code);
    const dataTypes = this._extractDataTypes(code);
    const intent = this._inferIntent(operations, domains, patterns);

    return {
      category,
      operations,
      domains,
      patterns,
      dataTypes,
      intent,
    };
  }

  private _extractOperations(code: string): Set<string> {
    const operations = new Set<string>();
    for (const [pattern, op] of ALL_OPERATION_PATTERNS) {
      if (pattern.test(code)) operations.add(op);
    }
    return operations;
  }

  private _extractDomains(code: string, tags: string[]): Set<string> {
    const domains = new Set<string>();
    const text = code + ' ' + tags.join(' ');
    for (const [pattern, domain] of DOMAIN_PATTERNS) {
      if (pattern.test(text)) domains.add(domain);
    }
    return domains;
  }

  private _extractPatterns(code: string): Set<string> {
    const patterns = new Set<string>();
    for (const [pattern, name] of CODE_PATTERN_PATTERNS) {
      if (pattern.test(code)) patterns.add(name);
    }
    return patterns;
  }

  private _extractDataTypes(code: string): Set<string> {
    const dataTypes = new Set<string>();
    for (const [pattern, dtype] of DATA_TYPE_PATTERNS) {
      if (pattern.test(code)) dataTypes.add(dtype);
    }
    return dataTypes;
  }

  private _inferIntent(
    operations: Set<string>,
    domains: Set<string>,
    patterns: Set<string>
  ): string {
    const parts: string[] = [];

    if (operations.size > 0) {
      parts.push([...operations].sort().join('+'));
    }
    if (domains.size > 0) {
      parts.push('on:' + [...domains].sort().join('+'));
    }
    if (patterns.size > 0) {
      parts.push('with:' + [...patterns].sort().join('+'));
    }

    return parts.length > 0 ? parts.join('|') : 'unknown';
  }
}

/** Convenience: create annotation for a single block */
export function extractAnnotation(block: CodeBlock): SemanticAnnotation {
  return new SemanticAnnotator().extractAnnotation(block);
}

/** Convert SemanticAnnotation sets to sorted arrays for JSON serialization */
export function annotationToDict(ann: SemanticAnnotation): Record<string, unknown> {
  return {
    category: ann.category,
    operations: [...ann.operations].sort(),
    domains: [...ann.domains].sort(),
    patterns: [...ann.patterns].sort(),
    data_types: [...ann.dataTypes].sort(),
    intent: ann.intent,
  };
}
