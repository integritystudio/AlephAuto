import { config } from '../core/config.ts';
import { FORMATTING, MAX_SCORE, SCHEMA_SCORING } from '../core/constants.ts';
import { SCHEMA_RATING_THRESHOLDS } from '../core/score-thresholds.ts';

interface SchemaContext {
  hasPackageJson?: boolean;
  hasPyproject?: boolean;
  gitRemote?: string;
  languages?: string[];
}

export interface SchemaObject {
  '@context': string;
  '@type': string;
  name?: string;
  description?: string;
  codeRepository?: string;
  programmingLanguage?: Array<{ '@type': string; name: string }>;
  applicationCategory?: string;
  operatingSystem?: string;
  dateModified?: string;
  inLanguage?: string;
  additionalType?: string;
  url?: string;
  [key: string]: unknown;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface SchemaImpact {
  timestamp: string;
  schemaType: string;
  metrics: {
    contentSize: {
      original: number;
      enhanced: number;
      increase: number;
    };
    schemaProperties: number;
    structuredDataAdded: boolean;
  };
  seoImprovements: string[];
  richResultsEligibility: string[];
  impactScore?: number;
  rating?: string;
}

const SCHEMA_CONTEXT_URL = 'https://schema.org';
const DEFAULT_SCHEMA_NAME = 'Documentation';
const DEFAULT_DESCRIPTION = 'Technical documentation and guides';
const DESCRIPTION_MAX_LENGTH = 200;
const DESCRIPTION_TRUNCATED_LENGTH = DESCRIPTION_MAX_LENGTH - '...'.length;
const DESCRIPTION_MIN_TEXT_LENGTH = 10;
const HOWTO_TYPE = 'HowTo';
const API_REFERENCE_TYPE = 'APIReference';
const SOFTWARE_APP_TYPE = 'SoftwareApplication';
const SOFTWARE_SOURCE_TYPE = 'SoftwareSourceCode';
const TECH_ARTICLE_TYPE = 'TechArticle';

/**
 * inferSchemaType.
 */
function inferSchemaType(readmePath: string, content: string, context: SchemaContext): string {
  const pathLower = readmePath.toLowerCase();
  const contentLower = content.toLowerCase();

  if (pathLower.includes('test') || contentLower.includes('testing guide')) {
    return HOWTO_TYPE;
  }

  if (pathLower.includes('api') || contentLower.includes('api reference') || contentLower.includes('endpoints')) {
    return API_REFERENCE_TYPE;
  }

  if (context.hasPackageJson || context.hasPyproject) {
    return SOFTWARE_APP_TYPE;
  }

  if (contentLower.includes('tutorial') || contentLower.includes('getting started') || contentLower.includes('guide')) {
    return HOWTO_TYPE;
  }

  if (context.gitRemote) {
    return SOFTWARE_SOURCE_TYPE;
  }

  return TECH_ARTICLE_TYPE;
}

/**
 * getSchemaName.
 */
function getSchemaName(readmePath: string, content: string): string {
  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    return titleMatch[1].trim();
  }

  const dirName = readmePath.split('/').slice(-2, -1)[0];
  return dirName || DEFAULT_SCHEMA_NAME;
}

/**
 * isDescriptionLineSkippable.
 */
function isDescriptionLineSkippable(trimmedLine: string, hasDescription: boolean): boolean {
  if (!trimmedLine || trimmedLine.startsWith('```') || trimmedLine.startsWith('<')) {
    return true;
  }

  if (hasDescription) {
    return true;
  }

  return false;
}

/**
 * truncateDescription.
 */
function truncateDescription(description: string): string {
  if (description.length <= DESCRIPTION_MAX_LENGTH) {
    return description;
  }

  return description.substring(0, DESCRIPTION_TRUNCATED_LENGTH) + '...';
}

/**
 * extractDescriptionFromContent.
 */
function extractDescriptionFromContent(content: string): string {
  const lines = content.split('\n');
  let foundTitle = false;
  let description = '';

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('#')) {
      foundTitle = true;
      continue;
    }

    if (isDescriptionLineSkippable(trimmed, Boolean(description))) {
      if (description) {
        break;
      }
      continue;
    }

    if (foundTitle && trimmed.length > DESCRIPTION_MIN_TEXT_LENGTH) {
      description = trimmed;
      break;
    }
  }

  return description ? truncateDescription(description) : DEFAULT_DESCRIPTION;
}

/**
 * addSoftwareSchemaFields.
 */
function addSoftwareSchemaFields(schema: SchemaObject, schemaType: string, context: SchemaContext): void {
  if (schemaType !== SOFTWARE_APP_TYPE && schemaType !== SOFTWARE_SOURCE_TYPE) {
    return;
  }

  if (context.gitRemote) {
    schema.codeRepository = context.gitRemote;
  }

  if (context.languages && context.languages.length > 0) {
    schema.programmingLanguage = context.languages.map(language => ({
      '@type': 'ComputerLanguage',
      name: language
    }));
  }

  if (schemaType === SOFTWARE_APP_TYPE) {
    schema.applicationCategory = 'DeveloperApplication';
    schema.operatingSystem = 'Cross-platform';
  }
}

/**
 * addArticleSchemaFields.
 */
function addArticleSchemaFields(schema: SchemaObject, schemaType: string): void {
  if (schemaType !== TECH_ARTICLE_TYPE && schemaType !== HOWTO_TYPE) {
    return;
  }

  schema.dateModified = new Date().toISOString();
  schema.inLanguage = 'en-US';
}

/**
 * addApiReferenceFields.
 */
function addApiReferenceFields(schema: SchemaObject, schemaType: string, context: SchemaContext): void {
  if (schemaType !== API_REFERENCE_TYPE) {
    return;
  }

  schema.additionalType = 'https://schema.org/TechArticle';
  if (context.gitRemote) {
    schema.url = context.gitRemote;
  }
}

/**
 * buildSchemaObject.
 */
function buildSchemaObject(readmePath: string, content: string, context: SchemaContext, schemaType: string): SchemaObject {
  const schema: SchemaObject = {
    '@context': SCHEMA_CONTEXT_URL,
    '@type': schemaType,
    name: getSchemaName(readmePath, content),
    description: extractDescriptionFromContent(content)
  };

  addSoftwareSchemaFields(schema, schemaType, context);
  addArticleSchemaFields(schema, schemaType);
  addApiReferenceFields(schema, schemaType, context);

  return schema;
}

/**
 * validateSchemaObject.
 */
function validateSchemaObject(schema: SchemaObject): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!schema['@context']) {
    errors.push('Missing @context');
  }

  if (!schema['@type']) {
    errors.push('Missing @type');
  }

  if (!schema.name) {
    warnings.push('Missing name property');
  }

  if (!schema.description) {
    warnings.push('Missing description property');
  }

  try {
    JSON.stringify(schema);
  } catch (error) {
    errors.push(`Invalid JSON: ${(error as Error).message}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * collectSeoImprovements.
 */
function collectSeoImprovements(schema: SchemaObject): string[] {
  const improvements: string[] = [];

  if (schema.name) {
    improvements.push('Added structured name/title');
  }
  if (schema.description) {
    improvements.push('Added structured description');
  }
  if (schema.codeRepository) {
    improvements.push('Linked to code repository');
  }
  if (schema.programmingLanguage) {
    improvements.push('Specified programming languages');
  }

  return improvements;
}

/**
 * collectRichResultsEligibility.
 */
function collectRichResultsEligibility(schemaType: string): string[] {
  const richResults: string[] = [];

  if (schemaType === HOWTO_TYPE) {
    richResults.push('How-to rich results');
  }
  if (schemaType === SOFTWARE_APP_TYPE) {
    richResults.push('Software app rich results');
  }
  if (schemaType === TECH_ARTICLE_TYPE) {
    richResults.push('Article rich results');
  }

  return richResults;
}

/**
 * computeImpactScore.
 */
function computeImpactScore(impact: SchemaImpact, schema: SchemaObject): number {
  let score = 0;
  score += impact.seoImprovements.length * SCHEMA_SCORING.SEO_IMPROVEMENTS_WEIGHT;
  score += impact.richResultsEligibility.length * SCHEMA_SCORING.RICH_RESULTS_WEIGHT;
  score += schema.description ? SCHEMA_SCORING.DESCRIPTION_BONUS : 0;
  score += schema.codeRepository ? SCHEMA_SCORING.CODE_REPO_BONUS : 0;
  return Math.min(MAX_SCORE, score);
}

/**
 * getRatingForScore.
 */
function getRatingForScore(score: number): string {
  if (score >= SCHEMA_RATING_THRESHOLDS.EXCELLENT_MIN_SCORE) {
    return 'Excellent';
  }
  if (score >= SCHEMA_RATING_THRESHOLDS.GOOD_MIN_SCORE) {
    return 'Good';
  }
  if (score >= SCHEMA_RATING_THRESHOLDS.FAIR_MIN_SCORE) {
    return 'Fair';
  }
  return 'Needs Improvement';
}

/**
 * analyzeSchemaImpactData.
 */
function analyzeSchemaImpactData(originalContent: string, enhancedContent: string, schema: SchemaObject): SchemaImpact {
  const schemaType = schema['@type'];
  const impact: SchemaImpact = {
    timestamp: new Date().toISOString(),
    schemaType,
    metrics: {
      contentSize: {
        original: originalContent.length,
        enhanced: enhancedContent.length,
        increase: enhancedContent.length - originalContent.length
      },
      schemaProperties: Object.keys(schema).length,
      structuredDataAdded: true
    },
    seoImprovements: collectSeoImprovements(schema),
    richResultsEligibility: collectRichResultsEligibility(schemaType)
  };

  const impactScore = computeImpactScore(impact, schema);
  impact.impactScore = impactScore;
  impact.rating = getRatingForScore(impactScore);

  return impact;
}

/**
 * createJsonLdScriptTag.
 */
function createJsonLdScriptTag(schema: SchemaObject): string {
  const jsonString = JSON.stringify(schema, null, FORMATTING.JSON_INDENT);
  return `<script type="application/ld+json">\n${jsonString}\n</script>`;
}

/**
 * findSchemaInsertIndex.
 */
function findSchemaInsertIndex(lines: string[]): number {
  let insertIndex = 0;
  for (let index = 0; index < lines.length; index++) {
    if (lines[index].trim().startsWith('#')) {
      insertIndex = index + 1;
      break;
    }
  }

  return insertIndex;
}

/**
 * injectSchemaIntoContent.
 */
function injectSchemaIntoContent(content: string, schema: SchemaObject): string {
  const jsonLdScript = createJsonLdScriptTag(schema);
  const lines = content.split('\n');
  const insertIndex = findSchemaInsertIndex(lines);

  lines.splice(insertIndex, 0, '', jsonLdScript, '');
  return lines.join('\n');
}

/**
 * Schema.org MCP Tools Integration
 * Provides wrapper methods for Schema.org MCP server tools
 */
export class SchemaMCPTools {
  mcpServerUrl: string;
  useRealMCP: boolean;

  /**
   * constructor.
   */
  constructor(options: { mcpServerUrl?: string; useRealMCP?: boolean } = {}) {
    this.mcpServerUrl = options.mcpServerUrl ?? config.schemaMcpUrl ?? '';
    this.useRealMCP = options.useRealMCP ?? false;
  }

  /**
   * Get appropriate schema type for content
   */
  async getSchemaType(readmePath: string, content: string, context: SchemaContext): Promise<string> {
    return inferSchemaType(readmePath, content, context);
  }

  /**
   * Generate JSON-LD schema markup
   */
  async generateSchema(readmePath: string, content: string, context: SchemaContext, schemaType: string): Promise<SchemaObject> {
    return buildSchemaObject(readmePath, content, context, schemaType);
  }

  /**
   * Extract description from README content
   */
  extractDescription(content: string): string {
    return extractDescriptionFromContent(content);
  }

  /**
   * Validate schema markup
   */
  async validateSchema(schema: SchemaObject): Promise<ValidationResult> {
    return validateSchemaObject(schema);
  }

  /**
   * Analyze schema impact on SEO/performance
   */
  async analyzeSchemaImpact(originalContent: string, enhancedContent: string, schema: SchemaObject): Promise<SchemaImpact> {
    return analyzeSchemaImpactData(originalContent, enhancedContent, schema);
  }

  /**
   * Get rating based on impact score
   */
  getRating(score: number): string {
    return getRatingForScore(score);
  }

  /**
   * Create JSON-LD script tag
   */
  createJSONLDScript(schema: SchemaObject): string {
    return createJsonLdScriptTag(schema);
  }

  /**
   * Inject schema into README content
   */
  injectSchema(content: string, schema: SchemaObject): string {
    return injectSchemaIntoContent(content, schema);
  }
}
