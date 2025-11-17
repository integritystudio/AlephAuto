import { test, describe } from 'node:test';
import assert from 'node:assert';
import { SchemaMCPTools } from '../../sidequest/doc-enhancement/schema-mcp-tools.js';

describe('SchemaMCPTools', () => {
  test('should initialize with default options', () => {
    const tools = new SchemaMCPTools();
    assert.strictEqual(tools.useRealMCP, false);
  });

  test('should detect HowTo schema for test documentation', async () => {
    const tools = new SchemaMCPTools();
    const readmePath = '/projects/myapp/tests/README.md';
    const content = '# Testing Guide\n\nHow to test this application.';
    const context = {};

    const schemaType = await tools.getSchemaType(readmePath, content, context);

    assert.strictEqual(schemaType, 'HowTo');
  });

  test('should detect APIReference schema for API docs', async () => {
    const tools = new SchemaMCPTools();
    const readmePath = '/projects/myapp/api/README.md';
    const content = '# API Reference\n\nEndpoints and usage.';
    const context = {};

    const schemaType = await tools.getSchemaType(readmePath, content, context);

    assert.strictEqual(schemaType, 'APIReference');
  });

  test('should detect SoftwareApplication for projects with package.json', async () => {
    const tools = new SchemaMCPTools();
    const readmePath = '/projects/myapp/README.md';
    const content = '# My App\n\nAn amazing application.';
    const context = { hasPackageJson: true };

    const schemaType = await tools.getSchemaType(readmePath, content, context);

    assert.strictEqual(schemaType, 'SoftwareApplication');
  });

  test('should detect SoftwareSourceCode for repos with git remote', async () => {
    const tools = new SchemaMCPTools();
    const readmePath = '/projects/myapp/README.md';
    const content = '# My Project';
    const context = { gitRemote: 'https://github.com/user/repo.git' };

    const schemaType = await tools.getSchemaType(readmePath, content, context);

    assert.strictEqual(schemaType, 'SoftwareSourceCode');
  });

  test('should detect HowTo for tutorial content', async () => {
    const tools = new SchemaMCPTools();
    const readmePath = '/projects/docs/README.md';
    const content = '# Getting Started Tutorial\n\nStep by step guide.';
    const context = {};

    const schemaType = await tools.getSchemaType(readmePath, content, context);

    assert.strictEqual(schemaType, 'HowTo');
  });

  test('should default to TechArticle for general docs', async () => {
    const tools = new SchemaMCPTools();
    const readmePath = '/projects/docs/README.md';
    const content = '# Documentation\n\nGeneral information.';
    const context = {};

    const schemaType = await tools.getSchemaType(readmePath, content, context);

    assert.strictEqual(schemaType, 'TechArticle');
  });

  test('should generate schema with extracted title', async () => {
    const tools = new SchemaMCPTools();
    const readmePath = '/projects/myapp/README.md';
    const content = '# My Awesome App\n\nThis is a great application.';
    const context = { languages: ['JavaScript'] };

    const schema = await tools.generateSchema(readmePath, content, context, 'SoftwareApplication');

    assert.strictEqual(schema['@context'], 'https://schema.org');
    assert.strictEqual(schema['@type'], 'SoftwareApplication');
    assert.strictEqual(schema.name, 'My Awesome App');
    assert.ok(schema.description);
  });

  test('should extract description from content', () => {
    const tools = new SchemaMCPTools();
    const content = '# Title\n\nThis is the description paragraph.\n\nMore content.';

    const description = tools.extractDescription(content);

    assert.strictEqual(description, 'This is the description paragraph.');
  });

  test('should limit description length', () => {
    const tools = new SchemaMCPTools();
    const longText = 'a'.repeat(250);
    const content = `# Title\n\n${longText}`;

    const description = tools.extractDescription(content);

    assert.ok(description.length <= 200);
    assert.ok(description.endsWith('...'));
  });

  test('should add programming languages to schema', async () => {
    const tools = new SchemaMCPTools();
    const readmePath = '/projects/myapp/README.md';
    const content = '# My App';
    const context = {
      languages: ['JavaScript', 'TypeScript'],
      gitRemote: 'https://github.com/user/repo.git'
    };

    const schema = await tools.generateSchema(readmePath, content, context, 'SoftwareSourceCode');

    assert.ok(Array.isArray(schema.programmingLanguage));
    assert.strictEqual(schema.programmingLanguage.length, 2);
    assert.strictEqual(schema.programmingLanguage[0]['@type'], 'ComputerLanguage');
    assert.strictEqual(schema.programmingLanguage[0].name, 'JavaScript');
  });

  test('should add code repository to schema', async () => {
    const tools = new SchemaMCPTools();
    const readmePath = '/projects/myapp/README.md';
    const content = '# My App';
    const context = { gitRemote: 'https://github.com/user/repo.git' };

    const schema = await tools.generateSchema(readmePath, content, context, 'SoftwareSourceCode');

    assert.strictEqual(schema.codeRepository, 'https://github.com/user/repo.git');
  });

  test('should validate valid schema', async () => {
    const tools = new SchemaMCPTools();
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      name: 'Test Article',
      description: 'Test description',
    };

    const validation = await tools.validateSchema(schema);

    assert.strictEqual(validation.valid, true);
    assert.strictEqual(validation.errors.length, 0);
  });

  test('should detect missing @context', async () => {
    const tools = new SchemaMCPTools();
    const schema = {
      '@type': 'TechArticle',
      name: 'Test',
    };

    const validation = await tools.validateSchema(schema);

    assert.strictEqual(validation.valid, false);
    assert.ok(validation.errors.some(e => e.includes('@context')));
  });

  test('should detect missing @type', async () => {
    const tools = new SchemaMCPTools();
    const schema = {
      '@context': 'https://schema.org',
      name: 'Test',
    };

    const validation = await tools.validateSchema(schema);

    assert.strictEqual(validation.valid, false);
    assert.ok(validation.errors.some(e => e.includes('@type')));
  });

  test('should warn about missing recommended properties', async () => {
    const tools = new SchemaMCPTools();
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
    };

    const validation = await tools.validateSchema(schema);

    assert.strictEqual(validation.valid, true);
    assert.ok(validation.warnings.length > 0);
    assert.ok(validation.warnings.some(w => w.includes('name')));
  });

  test('should analyze schema impact', async () => {
    const tools = new SchemaMCPTools();
    const originalContent = '# Test\n\nOriginal content';
    const enhancedContent = originalContent + '\n<script type="application/ld+json">\n{}\n</script>';
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Test App',
      description: 'Test description',
      programmingLanguage: [{ '@type': 'ComputerLanguage', name: 'JavaScript' }],
    };

    const impact = await tools.analyzeSchemaImpact(originalContent, enhancedContent, schema);

    assert.ok(impact.timestamp);
    assert.strictEqual(impact.schemaType, 'SoftwareApplication');
    assert.ok(impact.metrics.contentSize.original < impact.metrics.contentSize.enhanced);
    assert.ok(impact.seoImprovements.length > 0);
    assert.ok(impact.impactScore > 0);
    assert.ok(impact.rating);
  });

  test('should calculate high impact score for well-structured schema', async () => {
    const tools = new SchemaMCPTools();
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Test App',
      description: 'Test description',
      codeRepository: 'https://github.com/user/repo',
      programmingLanguage: [{ '@type': 'ComputerLanguage', name: 'JavaScript' }],
    };

    const impact = await tools.analyzeSchemaImpact('original', 'enhanced', schema);

    assert.ok(impact.impactScore >= 80);
    assert.strictEqual(impact.rating, 'Excellent');
  });

  test('should create JSON-LD script tag', () => {
    const tools = new SchemaMCPTools();
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      name: 'Test',
    };

    const script = tools.createJSONLDScript(schema);

    assert.ok(script.includes('<script type="application/ld+json">'));
    assert.ok(script.includes('"@context": "https://schema.org"'));
    assert.ok(script.includes('</script>'));
  });

  test('should inject schema into content', () => {
    const tools = new SchemaMCPTools();
    const content = '# My Title\n\nSome content here.';
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      name: 'Test',
    };

    const enhanced = tools.injectSchema(content, schema);

    assert.ok(enhanced.includes('# My Title'));
    assert.ok(enhanced.includes('<script type="application/ld+json">'));
    assert.ok(enhanced.includes('"@type": "TechArticle"'));

    // Schema should be after the title
    const titleIndex = enhanced.indexOf('# My Title');
    const schemaIndex = enhanced.indexOf('<script type="application/ld+json">');
    assert.ok(schemaIndex > titleIndex);
  });

  test('should handle content without heading', () => {
    const tools = new SchemaMCPTools();
    const content = 'Just some content without a heading.';
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      name: 'Test',
    };

    const enhanced = tools.injectSchema(content, schema);

    assert.ok(enhanced.includes('<script type="application/ld+json">'));
    assert.ok(enhanced.includes('Just some content'));
  });

  test('should provide correct rating for different scores', () => {
    const tools = new SchemaMCPTools();

    assert.strictEqual(tools.getRating(90), 'Excellent');
    assert.strictEqual(tools.getRating(70), 'Good');
    assert.strictEqual(tools.getRating(50), 'Fair');
    assert.strictEqual(tools.getRating(30), 'Needs Improvement');
  });
});
