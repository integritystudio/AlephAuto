/**
 * Test Refactoring Worker
 *
 * Extends SidequestServer to handle test suite refactoring jobs
 * within the AlephAuto framework.
 *
 * Features:
 * - Analyzes test files for duplication patterns
 * - Generates modular utility files (assertions, validators, helpers)
 * - Extracts hardcoded strings to constants
 * - Creates E2E fixtures for Playwright
 * - Optional PR creation for refactoring suggestions
 * - Comprehensive metrics tracking
 */

import { SidequestServer, Job as BaseJob } from '../core/server.js';
import { createComponentLogger } from '../utils/logger.js';
import { glob } from 'glob';
import path from 'path';
import fs from 'fs/promises';
import * as Sentry from '@sentry/node';

const logger = createComponentLogger('TestRefactorWorker');

// Type definitions
interface TestRefactorWorkerOptions {
  maxConcurrent?: number;
  logDir?: string;
  gitWorkflowEnabled?: boolean;
  gitBranchPrefix?: string;
  testsDir?: string;
  utilsDir?: string;
  e2eDir?: string;
  framework?: 'vitest' | 'jest' | 'playwright';
  dryRun?: boolean;
  sentryDsn?: string;
}

interface JobData {
  repositoryPath: string;
  repository: string;
  testsDir: string;
  utilsDir: string;
  e2eDir: string;
  framework: string;
  dryRun: boolean;
}

interface RefactorJob {
  id: string;
  data: JobData;
  result?: JobResult;
}

interface AnalysisPatterns {
  renderWaitFor: number;
  linkValidation: number;
  semanticChecks: number;
  formInteractions: number;
  hardcodedStrings: string[];
  duplicateAssertions: string[];
}

interface Analysis {
  testFiles: string[];
  patterns: AnalysisPatterns;
  recommendations: string[];
}

interface JobResult {
  status: string;
  reason?: string;
  analysis?: Analysis;
  testFiles?: number;
  generatedFiles?: string[];
  recommendations?: string[];
}

interface Metrics {
  totalProjects: number;
  successfulRefactors: number;
  failedRefactors: number;
  filesGenerated: number;
  patternsDetected: number;
  stringsExtracted: number;
  recommendationsGenerated: number;
}

interface Stats {
  total: number;
  queued: number;
  active: number;
  completed: number;
  failed: number;
}

/**
 * TestRefactorWorker
 *
 * Handles test suite refactoring jobs with pattern detection,
 * utility generation, and comprehensive reporting.
 */
export class TestRefactorWorker extends SidequestServer {
  testsDir: string;
  utilsDir: string;
  e2eDir: string;
  framework: string;
  dryRun: boolean;
  metrics: Metrics;
  declare queue: string[];

  constructor(options: TestRefactorWorkerOptions = {}) {
    super({
      maxConcurrent: options.maxConcurrent || 3,
      logDir: path.join(process.cwd(), 'logs', 'test-refactor'),
      gitWorkflowEnabled: options.gitWorkflowEnabled ?? false,
      gitBranchPrefix: options.gitBranchPrefix || 'test-refactor',
      jobType: 'test-refactor',
      ...options
    });

    this.testsDir = options.testsDir || 'tests';
    this.utilsDir = options.utilsDir || 'tests/utils';
    this.e2eDir = options.e2eDir || 'tests/e2e';
    this.framework = options.framework || 'vitest';
    this.dryRun = options.dryRun ?? false;
    this.queue = [];

    this.metrics = {
      totalProjects: 0,
      successfulRefactors: 0,
      failedRefactors: 0,
      filesGenerated: 0,
      patternsDetected: 0,
      stringsExtracted: 0,
      recommendationsGenerated: 0
    };
  }

  /**
   * Queue a project for test refactoring
   */
  queueProject(projectPath: string, options: Partial<JobData> = {}): BaseJob {
    const jobId = `refactor-${path.basename(projectPath)}-${Date.now()}`;

    return this.createJob(jobId, {
      repositoryPath: projectPath,
      repository: path.basename(projectPath),
      testsDir: options.testsDir || this.testsDir,
      utilsDir: options.utilsDir || this.utilsDir,
      e2eDir: options.e2eDir || this.e2eDir,
      framework: options.framework || this.detectFramework(projectPath),
      dryRun: options.dryRun ?? this.dryRun
    });
  }

  /**
   * Detect test framework from package.json
   */
  detectFramework(projectPath: string): string {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const packageJson = JSON.parse(require('fs').readFileSync(packageJsonPath, 'utf-8'));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      if (deps['vitest']) return 'vitest';
      if (deps['@playwright/test']) return 'playwright';
      return 'jest';
    } catch {
      return this.framework;
    }
  }

  /**
   * Execute the refactoring job
   */
  async runJobHandler(job: RefactorJob): Promise<JobResult> {
    const { repositoryPath, testsDir, utilsDir, e2eDir, framework, dryRun } = job.data;
    this.metrics.totalProjects++;

    logger.info({
      jobId: job.id,
      project: job.data.repository,
      framework
    }, 'Starting test refactoring');

    try {
      // Find test files
      const testFiles = await this.findTestFiles(repositoryPath, testsDir);

      if (testFiles.length === 0) {
        logger.warn({ jobId: job.id }, 'No test files found');
        return { status: 'skipped', reason: 'No test files found' };
      }

      // Analyze test files
      const analysis = await this.analyzeTestFiles(repositoryPath, testFiles);
      this.metrics.patternsDetected += Object.values(analysis.patterns).reduce(
        (a: number, b) => typeof b === 'number' ? a + b : a, 0);
      this.metrics.stringsExtracted += analysis.patterns.hardcodedStrings.length;
      this.metrics.recommendationsGenerated += analysis.recommendations.length;

      if (dryRun) {
        logger.info({ jobId: job.id, analysis }, 'Dry run - analysis complete');
        return { status: 'dry-run', analysis };
      }

      // Generate utility files
      const generatedFiles = await this.generateUtilityFiles(
        repositoryPath,
        utilsDir,
        e2eDir,
        framework,
        analysis
      );

      this.metrics.filesGenerated += generatedFiles.length;
      this.metrics.successfulRefactors++;

      logger.info({
        jobId: job.id,
        filesGenerated: generatedFiles.length,
        recommendations: analysis.recommendations.length
      }, 'Test refactoring completed');

      return {
        status: 'completed',
        testFiles: testFiles.length,
        analysis,
        generatedFiles,
        recommendations: analysis.recommendations
      };

    } catch (error) {
      this.metrics.failedRefactors++;
      throw error;
    }
  }

  /**
   * Find all test files in the project
   */
  async findTestFiles(projectPath: string, testsDir: string): Promise<string[]> {
    const patterns = [
      `${testsDir}/**/*.test.{ts,tsx,js,jsx}`,
      `${testsDir}/**/*.spec.{ts,tsx,js,jsx}`,
      `src/**/*.test.{ts,tsx,js,jsx}`,
      `src/**/*.spec.{ts,tsx,js,jsx}`
    ];

    const files: string[] = [];

    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: projectPath,
        ignore: ['**/node_modules/**']
      });
      files.push(...matches);
    }

    return [...new Set(files)];
  }

  /**
   * Analyze test files for refactoring opportunities
   */
  async analyzeTestFiles(projectPath: string, testFiles: string[]): Promise<Analysis> {
    const result: Analysis = {
      testFiles,
      patterns: {
        renderWaitFor: 0,
        linkValidation: 0,
        semanticChecks: 0,
        formInteractions: 0,
        hardcodedStrings: [],
        duplicateAssertions: []
      },
      recommendations: []
    };

    const stringCounts = new Map<string, number>();
    const assertionCounts = new Map<string, number>();

    for (const file of testFiles) {
      const filePath = path.join(projectPath, file);
      const content = await fs.readFile(filePath, 'utf-8');

      // Count patterns
      const renderWaitMatches = content.match(/render\s*\([^)]+\);\s*await\s+waitFor/g);
      result.patterns.renderWaitFor += renderWaitMatches?.length || 0;

      const linkMatches = content.match(/toHaveAttribute\s*\(\s*['"]href['"]/g);
      result.patterns.linkValidation += linkMatches?.length || 0;

      const semanticMatches = content.match(/getByRole\s*\(\s*['"]heading['"]|querySelector\s*\(\s*['"]section#/g);
      result.patterns.semanticChecks += semanticMatches?.length || 0;

      const formMatches = content.match(/userEvent\.type|fireEvent\.click|getByRole\s*\(\s*['"]form['"]/g);
      result.patterns.formInteractions += formMatches?.length || 0;

      // Extract hardcoded strings
      const stringMatches = content.matchAll(/getByText\s*\(\s*['"]([^'"]+)['"]\)/g);
      for (const match of stringMatches) {
        if (match[1]) {
          const count = stringCounts.get(match[1]) || 0;
          stringCounts.set(match[1], count + 1);
        }
      }

      // Extract assertion patterns
      const assertionMatches = content.matchAll(/(expect\([^)]+\)\.[^;]+);/g);
      for (const match of assertionMatches) {
        const assertion = match[1].replace(/['"][^'"]+['"]/g, '""');
        const count = assertionCounts.get(assertion) || 0;
        assertionCounts.set(assertion, count + 1);
      }
    }

    // Find duplicated strings (3+ occurrences)
    for (const [str, count] of stringCounts) {
      if (count >= 3 && str.length > 5) {
        result.patterns.hardcodedStrings.push(str);
      }
    }

    // Find duplicated assertions (3+ occurrences)
    for (const [assertion, count] of assertionCounts) {
      if (count >= 3) {
        result.patterns.duplicateAssertions.push(assertion);
      }
    }

    // Generate recommendations
    if (result.patterns.renderWaitFor > 5) {
      result.recommendations.push('Create renderAndWait helper to reduce render + waitFor boilerplate');
    }
    if (result.patterns.linkValidation > 5) {
      result.recommendations.push('Create link assertion helpers (expectExternalLink, expectInternalLink, etc.)');
    }
    if (result.patterns.semanticChecks > 5) {
      result.recommendations.push('Create semantic validators (expectSectionWithId, expectHeadingLevel, etc.)');
    }
    if (result.patterns.formInteractions > 5) {
      result.recommendations.push('Create form helpers (fillContactForm, expectFormAccessibility, etc.)');
    }
    if (result.patterns.hardcodedStrings.length > 10) {
      result.recommendations.push('Extract hardcoded strings to test-constants.ts');
    }

    return result;
  }

  /**
   * Generate utility files based on analysis
   */
  async generateUtilityFiles(
    projectPath: string,
    utilsDir: string,
    e2eDir: string,
    framework: string,
    analysis: Analysis
  ): Promise<string[]> {
    const utilsPath = path.join(projectPath, utilsDir);
    const generatedFiles: string[] = [];

    // Ensure utils directory exists
    await fs.mkdir(utilsPath, { recursive: true });

    // Generate assertions.ts
    if (analysis.patterns.linkValidation > 0) {
      const assertionsPath = path.join(utilsPath, 'assertions.ts');
      if (!await this.fileExists(assertionsPath)) {
        await fs.writeFile(assertionsPath, this.generateAssertionsContent(framework));
        generatedFiles.push('assertions.ts');
      }
    }

    // Generate semantic-validators.ts
    if (analysis.patterns.semanticChecks > 0) {
      const validatorsPath = path.join(utilsPath, 'semantic-validators.ts');
      if (!await this.fileExists(validatorsPath)) {
        await fs.writeFile(validatorsPath, this.generateSemanticValidatorsContent(framework));
        generatedFiles.push('semantic-validators.ts');
      }
    }

    // Generate form-helpers.ts
    if (analysis.patterns.formInteractions > 0) {
      const formHelpersPath = path.join(utilsPath, 'form-helpers.ts');
      if (!await this.fileExists(formHelpersPath)) {
        await fs.writeFile(formHelpersPath, this.generateFormHelpersContent());
        generatedFiles.push('form-helpers.ts');
      }
    }

    // Generate test-constants.ts
    if (analysis.patterns.hardcodedStrings.length > 0) {
      const constantsPath = path.join(utilsPath, 'test-constants.ts');
      if (!await this.fileExists(constantsPath)) {
        await fs.writeFile(constantsPath, this.generateConstantsContent(analysis.patterns.hardcodedStrings));
        generatedFiles.push('test-constants.ts');
      }
    }

    // Generate index.ts
    const indexPath = path.join(utilsPath, 'index.ts');
    if (!await this.fileExists(indexPath) && generatedFiles.length > 0) {
      await fs.writeFile(indexPath, this.generateIndexContent(generatedFiles));
      generatedFiles.push('index.ts');
    }

    // Generate E2E fixtures if e2e directory exists
    const e2ePath = path.join(projectPath, e2eDir);
    if (await this.fileExists(e2ePath)) {
      const fixturesPath = path.join(e2ePath, 'fixtures');
      await fs.mkdir(fixturesPath, { recursive: true });

      const navFixturesPath = path.join(fixturesPath, 'navigation.ts');
      if (!await this.fileExists(navFixturesPath)) {
        await fs.writeFile(navFixturesPath, this.generateE2EFixturesContent());
        generatedFiles.push('e2e/fixtures/navigation.ts');
      }
    }

    return generatedFiles;
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate assertions.ts content
   */
  generateAssertionsContent(framework: string): string {
    const importStatement = framework === 'vitest'
      ? "import { expect } from 'vitest';"
      : "import { expect } from '@jest/globals';";

    return `/**
 * Test Assertions Utilities
 * Generated by AlephAuto TestRefactorWorker
 */

${importStatement}

export function expectExternalLink(element: HTMLElement, href: string) {
  const link = element.closest('a');
  expect(link).toHaveAttribute('href', href);
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
}

export function expectInternalLink(element: HTMLElement, href: string) {
  const link = element.closest('a');
  expect(link).toHaveAttribute('href', href);
}

export function expectMailtoLink(element: HTMLElement, email: string) {
  const link = element.closest('a');
  expect(link).toHaveAttribute('href', \`mailto:\${email}\`);
}

export function expectSectionLink(element: HTMLElement, sectionId: string) {
  expectInternalLink(element, \`#\${sectionId}\`);
}

export function expectAriaLabel(element: HTMLElement, label: string) {
  expect(element).toHaveAttribute('aria-label', label);
}
`;
  }

  /**
   * Generate semantic-validators.ts content
   */
  generateSemanticValidatorsContent(framework: string): string {
    const importStatement = framework === 'vitest'
      ? "import { expect } from 'vitest';"
      : "import { expect } from '@jest/globals';";

    return `/**
 * Semantic Validation Utilities
 * Generated by AlephAuto TestRefactorWorker
 */

import { screen } from '@testing-library/react';
${importStatement}

export function expectSectionWithId(id: string) {
  const section = document.querySelector(\`section#\${id}\`);
  expect(section).toBeInTheDocument();
  return section;
}

export function expectHeadingLevel(level: 1 | 2 | 3 | 4 | 5 | 6, name: string) {
  const heading = screen.getByRole('heading', { level, name });
  expect(heading).toBeInTheDocument();
  return heading;
}

export function expectArticleCount(count: number) {
  const articles = screen.getAllByRole('article');
  expect(articles).toHaveLength(count);
  return articles;
}

export function expectContentInfo() {
  const footer = screen.getByRole('contentinfo');
  expect(footer).toBeInTheDocument();
  return footer;
}

export function expectHeadingCount(level: 1 | 2 | 3 | 4 | 5 | 6, count: number) {
  const headings = screen.getAllByRole('heading', { level });
  expect(headings).toHaveLength(count);
  return headings;
}

export function expectListCount(minCount: number) {
  const lists = screen.getAllByRole('list');
  expect(lists.length).toBeGreaterThanOrEqual(minCount);
  return lists;
}

export function expectImageWithAlt(altText: string) {
  const img = screen.getByAltText(altText);
  expect(img).toBeInTheDocument();
  return img;
}
`;
  }

  /**
   * Generate form-helpers.ts content
   */
  generateFormHelpersContent(): string {
    return `/**
 * Form Testing Utilities
 * Generated by AlephAuto TestRefactorWorker
 */

import { screen, within, waitFor } from '@testing-library/react';
import { expect } from 'vitest';
import type { UserEvent } from '@testing-library/user-event';

export function getForm() {
  return screen.getByRole('form');
}

export function getFormInputs(form: HTMLElement) {
  return within(form).getAllByRole('textbox');
}

export function getSubmitButton(form: HTMLElement) {
  return within(form).getByRole('button', { name: /send|submit/i });
}

export async function fillContactForm(
  user: UserEvent,
  data: { name: string; email: string; organization?: string; message?: string }
) {
  const form = getForm();
  const inputs = getFormInputs(form);

  await user.type(inputs[0], data.name);
  await user.type(inputs[1], data.email);

  if (data.organization && inputs[2]) {
    await user.type(inputs[2], data.organization);
  }

  return { form, inputs };
}

export function expectFormAccessibility(form: HTMLElement) {
  expect(form).toHaveAttribute('noValidate');
  expect(form).toHaveAttribute('aria-describedby');
}

export async function waitForForm() {
  await waitFor(() => {
    expect(screen.getByRole('form')).toBeInTheDocument();
  });
  return getForm();
}
`;
  }

  /**
   * Generate test-constants.ts content
   */
  generateConstantsContent(hardcodedStrings: string[]): string {
    const uniqueStrings = [...new Set(hardcodedStrings)].slice(0, 20);

    return `/**
 * Test Constants
 * Generated by AlephAuto TestRefactorWorker
 *
 * TODO: Organize these strings into meaningful groups
 */

export const EXTRACTED_STRINGS = [
${uniqueStrings.map(s => `  '${s.replace(/'/g, "\\'")}',`).join('\n')}
] as const;

// Example constant groups - customize for your project:

export const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '#about' },
] as const;

export const APP_INFO = {
  name: 'Your App Name',
  email: 'contact@example.com',
} as const;

export const A11Y_LABELS = {
  openMenu: 'Open menu',
  closeMenu: 'Close menu',
} as const;
`;
  }

  /**
   * Generate index.ts content
   */
  generateIndexContent(generatedFiles: string[]): string {
    const exports = generatedFiles
      .filter(f => f !== 'index.ts' && !f.includes('/'))
      .map(f => `export * from './${f.replace('.ts', '')}';`)
      .join('\n');

    return `/**
 * Test Utilities Index
 * Generated by AlephAuto TestRefactorWorker
 */

${exports}
`;
  }

  /**
   * Generate E2E fixtures content
   */
  generateE2EFixturesContent(): string {
    return `/**
 * E2E Navigation Fixtures
 * Generated by AlephAuto TestRefactorWorker
 */

import { Page, expect } from '@playwright/test';

export async function navigateToSection(page: Page, section: string) {
  await page.click(\`text=\${section}\`);
  await expect(page.url()).toContain(\`#\${section.toLowerCase()}\`);
}

export async function goToHomepage(page: Page) {
  await page.goto('/');
}

export async function setMobileViewport(page: Page) {
  await page.setViewportSize({ width: 375, height: 667 });
}

export async function setTabletViewport(page: Page) {
  await page.setViewportSize({ width: 768, height: 1024 });
}

export async function setDesktopViewport(page: Page) {
  await page.setViewportSize({ width: 1280, height: 720 });
}

export async function openMobileMenu(page: Page) {
  await page.click('[aria-label="Open menu"]');
  await expect(page.locator('[aria-label="Close menu"]')).toBeVisible();
}

export async function expectTextVisible(page: Page, text: string) {
  await expect(page.locator(\`text=\${text}\`)).toBeVisible();
}

export async function expectAllTextVisible(page: Page, texts: string[]) {
  for (const text of texts) {
    await expect(page.locator(\`text=\${text}\`)).toBeVisible();
  }
}

export async function clickExternalLink(page: Page, linkText: string) {
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.click(\`text=\${linkText}\`)
  ]);
  return popup;
}
`;
  }

  /**
   * Override commit message generation
   */
  async _generateCommitMessage(job: RefactorJob): Promise<{ title: string; body: string }> {
    const result = job.result;
    return {
      title: `refactor(tests): add modular test utilities`,
      body: `Automated test refactoring to reduce duplication and improve maintainability.

## Changes
- Generated ${result?.generatedFiles?.length || 0} utility files
- Analyzed ${result?.testFiles || 0} test files
- Detected ${this.metrics.patternsDetected} refactoring opportunities

## Recommendations
${result?.recommendations?.map(r => `- ${r}`).join('\n') || 'None'}

Files generated: ${result?.generatedFiles?.join(', ') || 'None'}`
    };
  }

  /**
   * Get metrics
   */
  getMetrics(): Metrics {
    return { ...this.metrics };
  }

  /**
   * Get stats - inherited from SidequestServer
   */
  getStats(): Stats {
    return super.getStats();
  }
}

export default TestRefactorWorker;
