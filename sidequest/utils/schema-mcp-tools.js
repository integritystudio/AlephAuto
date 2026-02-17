import { config } from '../core/config.ts';

/**
 * Schema.org MCP Tools Integration
 * Provides wrapper methods for Schema.org MCP server tools
 */

export class SchemaMCPTools {
  constructor(options = {}) {
    this.mcpServerUrl = options.mcpServerUrl || config.schemaMcpUrl;
    this.useRealMCP = options.useRealMCP || false;
  }

  /**
   * Get appropriate schema type for content
   * Maps to MCP tool: get_schema_type
   */
  async getSchemaType(readmePath, content, context) {
    // In real implementation, this would call the MCP server
    // For now, we'll use heuristics like the Python version

    const pathLower = readmePath.toLowerCase();
    const contentLower = content.toLowerCase();

    // Test documentation
    if (pathLower.includes('test') || contentLower.includes('testing guide')) {
      return 'HowTo';
    }

    // API documentation
    if (pathLower.includes('api') ||
        contentLower.includes('api reference') ||
        contentLower.includes('endpoints')) {
      return 'APIReference';
    }

    // Software application
    if (context.hasPackageJson || context.hasPyproject) {
      return 'SoftwareApplication';
    }

    // Tutorial/Guide
    if (contentLower.includes('tutorial') ||
        contentLower.includes('getting started') ||
        contentLower.includes('guide')) {
      return 'HowTo';
    }

    // Code repository/technical documentation
    if (context.gitRemote) {
      return 'SoftwareSourceCode';
    }

    // Default to TechArticle
    return 'TechArticle';
  }

  /**
   * Generate JSON-LD schema markup
   * Maps to MCP tool: generate_example
   */
  async generateSchema(readmePath, content, context, schemaType) {
    const schema = {
      '@context': 'https://schema.org',
      '@type': schemaType,
    };

    // Extract title from first heading
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      schema.name = titleMatch[1].trim();
    } else {
      // Fallback to directory name
      const dirName = readmePath.split('/').slice(-2, -1)[0];
      schema.name = dirName || 'Documentation';
    }

    // Extract description from content
    const description = this.extractDescription(content);
    if (description) {
      schema.description = description;
    }

    // Add common properties based on schema type
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
  extractDescription(content) {
    // Try to get the first paragraph after the title
    const lines = content.split('\n');
    let foundTitle = false;
    let description = '';

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip title
      if (trimmed.startsWith('#')) {
        foundTitle = true;
        continue;
      }

      // Skip empty lines and code blocks
      if (!trimmed || trimmed.startsWith('```') || trimmed.startsWith('<')) {
        if (description) break; // Stop at first empty line after description
        continue;
      }

      // Found description
      if (foundTitle && trimmed.length > 10) {
        description = trimmed;
        break;
      }
    }

    // Limit description length
    if (description.length > 200) {
      description = description.substring(0, 197) + '...';
    }

    return description || 'Technical documentation and guides';
  }

  /**
   * Validate schema markup
   * Maps to Schema.org validation tools
   */
  async validateSchema(schema) {
    // Basic validation
    const errors = [];
    const warnings = [];

    // Check required fields
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

    // Validate JSON-LD format
    try {
      JSON.stringify(schema);
    } catch (e) {
      errors.push(`Invalid JSON: ${e.message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Analyze schema impact on SEO/performance
   * Maps to MCP tool: analyze_schema_impact
   */
  async analyzeSchemaImpact(originalContent, enhancedContent, schema) {
    const impact = {
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

    // Analyze SEO improvements
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

    // Check Rich Results eligibility
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

    // Calculate impact score (0-100)
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
  getRating(score) {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Needs Improvement';
  }

  /**
   * Create JSON-LD script tag
   */
  createJSONLDScript(schema) {
    const jsonStr = JSON.stringify(schema, null, 2);
    return `<script type="application/ld+json">\n${jsonStr}\n</script>`;
  }

  /**
   * Inject schema into README content
   */
  injectSchema(content, schema) {
    const jsonldScript = this.createJSONLDScript(schema);
    const lines = content.split('\n');

    // Find first heading
    let insertIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('#')) {
        insertIndex = i + 1;
        break;
      }
    }

    // Insert schema after first heading with blank lines
    lines.splice(insertIndex, 0, '', jsonldScript, '');

    return lines.join('\n');
  }
}
