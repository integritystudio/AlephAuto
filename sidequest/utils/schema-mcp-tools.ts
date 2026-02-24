import { config } from '../core/config.ts';

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

/**
 * Schema.org MCP Tools Integration
 * Provides wrapper methods for Schema.org MCP server tools
 */
export class SchemaMCPTools {
  mcpServerUrl: string;
  useRealMCP: boolean;

  constructor(options: { mcpServerUrl?: string; useRealMCP?: boolean } = {}) {
    this.mcpServerUrl = options.mcpServerUrl ?? config.schemaMcpUrl ?? '';
    this.useRealMCP = options.useRealMCP ?? false;
  }

  /**
   * Get appropriate schema type for content
   */
  async getSchemaType(readmePath: string, content: string, context: SchemaContext): Promise<string> {
    const pathLower = readmePath.toLowerCase();
    const contentLower = content.toLowerCase();

    if (pathLower.includes('test') || contentLower.includes('testing guide')) {
      return 'HowTo';
    }

    if (pathLower.includes('api') ||
        contentLower.includes('api reference') ||
        contentLower.includes('endpoints')) {
      return 'APIReference';
    }

    if (context.hasPackageJson || context.hasPyproject) {
      return 'SoftwareApplication';
    }

    if (contentLower.includes('tutorial') ||
        contentLower.includes('getting started') ||
        contentLower.includes('guide')) {
      return 'HowTo';
    }

    if (context.gitRemote) {
      return 'SoftwareSourceCode';
    }

    return 'TechArticle';
  }

  /**
   * Generate JSON-LD schema markup
   */
  async generateSchema(readmePath: string, content: string, context: SchemaContext, schemaType: string): Promise<SchemaObject> {
    const schema: SchemaObject = {
      '@context': 'https://schema.org',
      '@type': schemaType,
    };

    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      schema.name = titleMatch[1].trim();
    } else {
      const dirName = readmePath.split('/').slice(-2, -1)[0];
      schema.name = dirName || 'Documentation';
    }

    const description = this.extractDescription(content);
    if (description) {
      schema.description = description;
    }

    if (schemaType === 'SoftwareApplication' || schemaType === 'SoftwareSourceCode') {
      if (context.gitRemote) {
        schema.codeRepository = context.gitRemote;
      }

      if (context.languages && context.languages.length > 0) {
        schema.programmingLanguage = context.languages.map(lang => ({
          '@type': 'ComputerLanguage',
          name: lang,
        }));
      }

      if (schemaType === 'SoftwareApplication') {
        schema.applicationCategory = 'DeveloperApplication';
        schema.operatingSystem = 'Cross-platform';
      }
    }

    if (schemaType === 'TechArticle' || schemaType === 'HowTo') {
      schema.dateModified = new Date().toISOString();
      schema.inLanguage = 'en-US';
    }

    if (schemaType === 'APIReference') {
      schema.additionalType = 'https://schema.org/TechArticle';
      if (context.gitRemote) {
        schema.url = context.gitRemote;
      }
    }

    return schema;
  }

  /**
   * Extract description from README content
   */
  extractDescription(content: string): string {
    const lines = content.split('\n');
    let foundTitle = false;
    let description = '';

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('#')) {
        foundTitle = true;
        continue;
      }

      if (!trimmed || trimmed.startsWith('```') || trimmed.startsWith('<')) {
        if (description) break;
        continue;
      }

      if (foundTitle && trimmed.length > 10) {
        description = trimmed;
        break;
      }
    }

    if (description.length > 200) {
      description = description.substring(0, 197) + '...';
    }

    return description || 'Technical documentation and guides';
  }

  /**
   * Validate schema markup
   */
  async validateSchema(schema: SchemaObject): Promise<ValidationResult> {
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
    } catch (e) {
      errors.push(`Invalid JSON: ${(e as Error).message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Analyze schema impact on SEO/performance
   */
  async analyzeSchemaImpact(originalContent: string, enhancedContent: string, schema: SchemaObject): Promise<SchemaImpact> {
    const impact: SchemaImpact = {
      timestamp: new Date().toISOString(),
      schemaType: schema['@type'],
      metrics: {
        contentSize: {
          original: originalContent.length,
          enhanced: enhancedContent.length,
          increase: enhancedContent.length - originalContent.length,
        },
        schemaProperties: Object.keys(schema).length,
        structuredDataAdded: true,
      },
      seoImprovements: [],
      richResultsEligibility: [],
    };

    if (schema.name) {
      impact.seoImprovements.push('Added structured name/title');
    }
    if (schema.description) {
      impact.seoImprovements.push('Added structured description');
    }
    if (schema.codeRepository) {
      impact.seoImprovements.push('Linked to code repository');
    }
    if (schema.programmingLanguage) {
      impact.seoImprovements.push('Specified programming languages');
    }

    const schemaType = schema['@type'];
    if (schemaType === 'HowTo') {
      impact.richResultsEligibility.push('How-to rich results');
    }
    if (schemaType === 'SoftwareApplication') {
      impact.richResultsEligibility.push('Software app rich results');
    }
    if (schemaType === 'TechArticle') {
      impact.richResultsEligibility.push('Article rich results');
    }

    let score = 0;
    score += impact.seoImprovements.length * 15;
    score += impact.richResultsEligibility.length * 20;
    score += schema.description ? 20 : 0;
    score += schema.codeRepository ? 15 : 0;

    impact.impactScore = Math.min(100, score);
    impact.rating = this.getRating(impact.impactScore);

    return impact;
  }

  /**
   * Get rating based on impact score
   */
  getRating(score: number): string {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Needs Improvement';
  }

  /**
   * Create JSON-LD script tag
   */
  createJSONLDScript(schema: SchemaObject): string {
    const jsonStr = JSON.stringify(schema, null, 2);
    return `<script type="application/ld+json">\n${jsonStr}\n</script>`;
  }

  /**
   * Inject schema into README content
   */
  injectSchema(content: string, schema: SchemaObject): string {
    const jsonldScript = this.createJSONLDScript(schema);
    const lines = content.split('\n');

    let insertIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('#')) {
        insertIndex = i + 1;
        break;
      }
    }

    lines.splice(insertIndex, 0, '', jsonldScript, '');

    return lines.join('\n');
  }
}
