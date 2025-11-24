#!/usr/bin/env npx ts-node
/**
 * Test Suite Refactoring Script
 *
 * Analyzes a test suite and generates modular utility files to reduce duplication.
 * Run with: npx ts-node refactor-test-suite.ts <project-path>
 *
 * This script:
 * 1. Scans test files for common patterns
 * 2. Generates utility modules for assertions, validators, constants, etc.
 * 3. Provides refactoring recommendations
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

interface RefactorConfig {
  projectPath: string;
  testsDir: string;
  utilsDir: string;
  e2eDir: string;
  framework: 'vitest' | 'jest' | 'playwright';
}

interface AnalysisResult {
  testFiles: string[];
  patterns: {
    renderWaitFor: number;
    linkValidation: number;
    semanticChecks: number;
    formInteractions: number;
    hardcodedStrings: string[];
    duplicateAssertions: string[];
  };
  recommendations: string[];
}

// Default configuration
const defaultConfig: Partial<RefactorConfig> = {
  testsDir: 'tests',
  utilsDir: 'tests/utils',
  e2eDir: 'tests/e2e',
  framework: 'vitest'
};

/**
 * Detect test framework from package.json
 */
function detectFramework(projectPath: string): 'vitest' | 'jest' | 'playwright' {
  const packageJsonPath = path.join(projectPath, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    return 'vitest';
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

  if (deps['vitest']) return 'vitest';
  if (deps['@playwright/test']) return 'playwright';
  return 'jest';
}

/**
 * Find all test files in the project
 */
async function findTestFiles(config: RefactorConfig): Promise<string[]> {
  const patterns = [
    `${config.testsDir}/**/*.test.{ts,tsx,js,jsx}`,
    `${config.testsDir}/**/*.spec.{ts,tsx,js,jsx}`,
    `src/**/*.test.{ts,tsx,js,jsx}`,
    `src/**/*.spec.{ts,tsx,js,jsx}`
  ];

  const files: string[] = [];

  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      cwd: config.projectPath,
      ignore: ['**/node_modules/**']
    });
    files.push(...matches);
  }

  return [...new Set(files)];
}

/**
 * Analyze test files for refactoring opportunities
 */
async function analyzeTestFiles(config: RefactorConfig, testFiles: string[]): Promise<AnalysisResult> {
  const result: AnalysisResult = {
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
    const filePath = path.join(config.projectPath, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Count render + waitFor patterns
    const renderWaitMatches = content.match(/render\s*\([^)]+\);\s*await\s+waitFor/g);
    result.patterns.renderWaitFor += renderWaitMatches?.length || 0;

    // Count link validation patterns
    const linkMatches = content.match(/toHaveAttribute\s*\(\s*['"]href['"]/g);
    result.patterns.linkValidation += linkMatches?.length || 0;

    // Count semantic checks
    const semanticMatches = content.match(/getByRole\s*\(\s*['"]heading['"]|querySelector\s*\(\s*['"]section#/g);
    result.patterns.semanticChecks += semanticMatches?.length || 0;

    // Count form interactions
    const formMatches = content.match(/userEvent\.type|fireEvent\.click|getByRole\s*\(\s*['"]form['"]/g);
    result.patterns.formInteractions += formMatches?.length || 0;

    // Extract hardcoded strings (quoted strings in expect statements)
    const stringMatches = content.matchAll(/expect\s*\([^)]+\)\.toBeInTheDocument\(\)|getByText\s*\(\s*['"]([^'"]+)['"]\)/g);
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

  // Find duplicated strings (appearing 3+ times)
  for (const [str, count] of stringCounts) {
    if (count >= 3 && str.length > 5) {
      result.patterns.hardcodedStrings.push(str);
    }
  }

  // Find duplicated assertions (appearing 3+ times)
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
  if (result.patterns.duplicateAssertions.length > 5) {
    result.recommendations.push('Extract duplicate assertions to custom assertion helpers');
  }

  return result;
}

/**
 * Generate the assertions utility file
 */
function generateAssertionsFile(framework: string): string {
  const importStatement = framework === 'vitest'
    ? "import { expect } from 'vitest';"
    : "import { expect } from '@jest/globals';";

  return `/**
 * Test Assertions Utilities
 *
 * Common assertion helpers for link validation and DOM element checks.
 * Reduces duplication across component tests.
 */

${importStatement}

/**
 * Asserts that an element is an external link with proper security attributes
 */
export function expectExternalLink(element: HTMLElement, href: string) {
  const link = element.closest('a');
  expect(link).toHaveAttribute('href', href);
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
}

/**
 * Asserts that an element is an internal link with correct href
 */
export function expectInternalLink(element: HTMLElement, href: string) {
  const link = element.closest('a');
  expect(link).toHaveAttribute('href', href);
}

/**
 * Asserts that an element is a mailto link with correct email
 */
export function expectMailtoLink(element: HTMLElement, email: string) {
  const link = element.closest('a');
  expect(link).toHaveAttribute('href', \`mailto:\${email}\`);
}

/**
 * Asserts that an element is a tel link with correct phone number
 */
export function expectTelLink(element: HTMLElement, phone: string) {
  const link = element.closest('a');
  expect(link).toHaveAttribute('href', \`tel:\${phone}\`);
}

/**
 * Asserts that all external links in a container have proper security attributes
 */
export function expectAllExternalLinksSecure(container: HTMLElement) {
  const links = container.querySelectorAll('a[target="_blank"]');
  links.forEach(link => {
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('href');
  });
  return links.length;
}

/**
 * Asserts that a link points to a specific section anchor
 */
export function expectSectionLink(element: HTMLElement, sectionId: string) {
  expectInternalLink(element, \`#\${sectionId}\`);
}

/**
 * Asserts that an element has specific aria-label attribute
 */
export function expectAriaLabel(element: HTMLElement, label: string) {
  expect(element).toHaveAttribute('aria-label', label);
}

/**
 * Asserts that an element has aria-describedby attribute
 */
export function expectAriaDescribedBy(element: HTMLElement) {
  expect(element).toHaveAttribute('aria-describedby');
}

/**
 * Asserts that a button has correct type attribute
 */
export function expectButtonType(element: HTMLElement, type: 'submit' | 'button' | 'reset') {
  expect(element).toHaveAttribute('type', type);
}

/**
 * Asserts that an element is not disabled
 */
export function expectEnabled(element: HTMLElement) {
  expect(element).not.toBeDisabled();
}

/**
 * Asserts that an element is disabled
 */
export function expectDisabled(element: HTMLElement) {
  expect(element).toBeDisabled();
}
`;
}

/**
 * Generate the semantic validators utility file
 */
function generateSemanticValidatorsFile(framework: string): string {
  const importStatement = framework === 'vitest'
    ? "import { expect } from 'vitest';"
    : "import { expect } from '@jest/globals';";

  return `/**
 * Semantic Validation Utilities
 *
 * Helpers for validating semantic HTML structure in component tests.
 * Ensures accessibility and proper document outline.
 */

import { screen } from '@testing-library/react';
${importStatement}

/**
 * Validates that a section exists with the specified ID
 */
export function expectSectionWithId(id: string) {
  const section = document.querySelector(\`section#\${id}\`);
  expect(section).toBeInTheDocument();
  return section;
}

/**
 * Validates that a heading exists at the specified level with given name
 */
export function expectHeadingLevel(level: 1 | 2 | 3 | 4 | 5 | 6, name: string) {
  const heading = screen.getByRole('heading', { level, name });
  expect(heading).toBeInTheDocument();
  return heading;
}

/**
 * Validates the count of articles in the document
 */
export function expectArticleCount(count: number) {
  const articles = screen.getAllByRole('article');
  expect(articles).toHaveLength(count);
  return articles;
}

/**
 * Validates the count of list items (at minimum)
 */
export function expectListItemCount(minCount: number) {
  const listItems = screen.getAllByRole('listitem');
  expect(listItems.length).toBeGreaterThanOrEqual(minCount);
  return listItems;
}

/**
 * Validates that a navigation landmark exists
 */
export function expectNavigation(name?: string) {
  const nav = name
    ? screen.getByRole('navigation', { name })
    : screen.getByRole('navigation');
  expect(nav).toBeInTheDocument();
  return nav;
}

/**
 * Validates that a contentinfo (footer) landmark exists
 */
export function expectContentInfo() {
  const footer = screen.getByRole('contentinfo');
  expect(footer).toBeInTheDocument();
  return footer;
}

/**
 * Validates that a form exists with proper accessibility
 */
export function expectAccessibleForm() {
  const form = screen.getByRole('form');
  expect(form).toBeInTheDocument();
  expect(form).toHaveAttribute('noValidate');
  expect(form).toHaveAttribute('aria-describedby');
  return form;
}

/**
 * Validates that a specific number of headings exist at a level
 */
export function expectHeadingCount(level: 1 | 2 | 3 | 4 | 5 | 6, count: number) {
  const headings = screen.getAllByRole('heading', { level });
  expect(headings).toHaveLength(count);
  return headings;
}

/**
 * Validates that lists exist in the document (at minimum)
 */
export function expectListCount(minCount: number) {
  const lists = screen.getAllByRole('list');
  expect(lists.length).toBeGreaterThanOrEqual(minCount);
  return lists;
}

/**
 * Validates that an image has proper alt text
 */
export function expectImageWithAlt(altText: string) {
  const img = screen.getByAltText(altText);
  expect(img).toBeInTheDocument();
  return img;
}

/**
 * Validates that a button exists with specific name
 */
export function expectButton(name: string | RegExp) {
  const button = screen.getByRole('button', { name });
  expect(button).toBeInTheDocument();
  return button;
}

/**
 * Validates that a link exists with specific name
 */
export function expectLink(name: string | RegExp) {
  const link = screen.getByRole('link', { name });
  expect(link).toBeInTheDocument();
  return link;
}
`;
}

/**
 * Generate the form helpers utility file
 */
function generateFormHelpersFile(): string {
  return `/**
 * Form Testing Utilities
 *
 * Helpers for testing form interactions, validation, and submission.
 * Reduces duplication in form-heavy component tests.
 */

import { screen, within, waitFor } from '@testing-library/react';
import { expect } from 'vitest';
import type { UserEvent } from '@testing-library/user-event';

/**
 * Gets the form element from the document
 */
export function getForm() {
  return screen.getByRole('form');
}

/**
 * Gets all text inputs within a form
 */
export function getFormInputs(form: HTMLElement) {
  return within(form).getAllByRole('textbox');
}

/**
 * Gets the submit button within a form
 */
export function getSubmitButton(form: HTMLElement) {
  return within(form).getByRole('button', { name: /send|submit/i });
}

/**
 * Fills a contact form with provided data
 */
export async function fillContactForm(
  user: UserEvent,
  data: {
    name: string;
    email: string;
    organization?: string;
    message?: string;
  }
) {
  const form = getForm();
  const inputs = getFormInputs(form);

  await user.type(inputs[0], data.name);
  await user.type(inputs[1], data.email);

  if (data.organization && inputs[2]) {
    await user.type(inputs[2], data.organization);
  }

  if (data.message) {
    const messageField = inputs.find(input =>
      input.tagName === 'TEXTAREA' || input.getAttribute('rows')
    );
    if (messageField) {
      await user.type(messageField, data.message);
    }
  }

  return { form, inputs };
}

/**
 * Validates that form has proper accessibility attributes
 */
export function expectFormAccessibility(form: HTMLElement) {
  expect(form).toHaveAttribute('noValidate');
  expect(form).toHaveAttribute('aria-describedby');
}

/**
 * Validates that email input has correct attributes
 */
export function expectEmailInput(inputs: HTMLElement[]) {
  const emailInput = inputs.find(input =>
    input.getAttribute('type') === 'email'
  );
  expect(emailInput).toBeInTheDocument();

  if (emailInput) {
    expect(emailInput).toHaveAttribute('type', 'email');
    expect(emailInput).toHaveAttribute('autocomplete', 'email');
  }

  return emailInput;
}

/**
 * Validates that inputs have aria-describedby attributes
 */
export function expectInputsHaveDescriptions(inputs: HTMLElement[]) {
  const inputsWithDescriptions = inputs.filter(input =>
    input.hasAttribute('aria-describedby')
  );
  expect(inputsWithDescriptions.length).toBeGreaterThan(0);
  return inputsWithDescriptions;
}

/**
 * Validates form field values match expected data
 */
export function expectFormValues(
  inputs: HTMLElement[],
  expected: { name?: string; email?: string; organization?: string }
) {
  if (expected.name) {
    expect(inputs[0]).toHaveValue(expected.name);
  }
  if (expected.email) {
    expect(inputs[1]).toHaveValue(expected.email);
  }
  if (expected.organization && inputs[2]) {
    expect(inputs[2]).toHaveValue(expected.organization);
  }
}

/**
 * Helper to wait for form to be ready
 */
export async function waitForForm() {
  await waitFor(() => {
    expect(screen.getByRole('form')).toBeInTheDocument();
  });
  return getForm();
}

/**
 * Gets the minimum required number of text inputs for a form
 */
export function expectMinimumInputs(form: HTMLElement, minCount: number) {
  const inputs = getFormInputs(form);
  expect(inputs.length).toBeGreaterThanOrEqual(minCount);
  return inputs;
}
`;
}

/**
 * Generate the test constants file template
 */
function generateConstantsTemplate(hardcodedStrings: string[]): string {
  const uniqueStrings = [...new Set(hardcodedStrings)].slice(0, 20);

  return `/**
 * Test Constants
 *
 * Centralized content strings and expected data for tests.
 * Makes tests more maintainable when content changes.
 */

// TODO: Organize these strings into meaningful groups
export const EXTRACTED_STRINGS = [
${uniqueStrings.map(s => `  '${s.replace(/'/g, "\\'")}',`).join('\n')}
] as const;

// Example constant groups - customize for your project:

// Navigation links
export const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '#about' },
  // Add more...
] as const;

// Company/App info
export const APP_INFO = {
  name: 'Your App Name',
  email: 'contact@example.com',
  // Add more...
} as const;

// Form field names
export const FORM_FIELDS = {
  name: 'name',
  email: 'email',
  message: 'message',
} as const;

// Accessibility labels
export const A11Y_LABELS = {
  openMenu: 'Open menu',
  closeMenu: 'Close menu',
  // Add more...
} as const;
`;
}

/**
 * Generate the render helpers to add to test-utils
 */
function generateRenderHelpers(): string {
  return `
// ============================================================================
// Render Helpers - Add these to your existing test-utils file
// ============================================================================

/**
 * Renders a component and waits for assertions to pass
 * Reduces boilerplate in tests that follow render + waitFor pattern
 */
export async function renderAndWait(
  ui: React.ReactElement,
  assertions: () => void
): Promise<void> {
  const { waitFor } = await import('@testing-library/react');
  render(ui);
  await waitFor(assertions);
}

/**
 * Renders a component and waits for it to be visible
 * Useful for components that have async loading states
 */
export async function renderAndWaitForElement(
  ui: React.ReactElement,
  elementQuery: () => HTMLElement
): Promise<HTMLElement> {
  const { waitFor } = await import('@testing-library/react');
  render(ui);
  let element: HTMLElement;
  await waitFor(() => {
    element = elementQuery();
    expect(element).toBeInTheDocument();
  });
  return element!;
}
`;
}

/**
 * Generate E2E navigation fixtures for Playwright
 */
function generateE2EFixtures(): string {
  return `/**
 * E2E Navigation Fixtures
 *
 * Playwright helpers for navigation, viewport management, and common page interactions.
 * Reduces duplication across E2E test files.
 */

import { Page, expect } from '@playwright/test';

// ============================================================================
// Navigation Helpers
// ============================================================================

/**
 * Navigates to a section by clicking a navigation link
 */
export async function navigateToSection(page: Page, section: string) {
  await page.click(\`text=\${section}\`);
  await expect(page.url()).toContain(\`#\${section.toLowerCase()}\`);
}

/**
 * Navigates to homepage
 */
export async function goToHomepage(page: Page) {
  await page.goto('/');
}

/**
 * Waits for page to fully load
 */
export async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('networkidle');
}

// ============================================================================
// Viewport Helpers
// ============================================================================

/**
 * Sets viewport to mobile dimensions
 */
export async function setMobileViewport(page: Page) {
  await page.setViewportSize({ width: 375, height: 667 });
}

/**
 * Sets viewport to tablet dimensions
 */
export async function setTabletViewport(page: Page) {
  await page.setViewportSize({ width: 768, height: 1024 });
}

/**
 * Sets viewport to desktop dimensions
 */
export async function setDesktopViewport(page: Page) {
  await page.setViewportSize({ width: 1280, height: 720 });
}

// ============================================================================
// Mobile Menu Helpers
// ============================================================================

/**
 * Opens the mobile navigation menu
 */
export async function openMobileMenu(page: Page) {
  await page.click('[aria-label="Open menu"]');
  await expect(page.locator('[aria-label="Close menu"]')).toBeVisible();
}

/**
 * Closes the mobile navigation menu
 */
export async function closeMobileMenu(page: Page) {
  await page.click('[aria-label="Close menu"]');
  await expect(page.locator('[aria-label="Open menu"]')).toBeVisible();
}

// ============================================================================
// Element Visibility Helpers
// ============================================================================

/**
 * Expects text to be visible on the page
 */
export async function expectTextVisible(page: Page, text: string) {
  await expect(page.locator(\`text=\${text}\`)).toBeVisible();
}

/**
 * Expects heading with specific text to be visible
 */
export async function expectHeadingVisible(page: Page, name: string) {
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

/**
 * Expects multiple text elements to be visible
 */
export async function expectAllTextVisible(page: Page, texts: string[]) {
  for (const text of texts) {
    await expect(page.locator(\`text=\${text}\`)).toBeVisible();
  }
}

// ============================================================================
// External Link Helpers
// ============================================================================

/**
 * Clicks an external link and returns the popup page
 */
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
 * Generate index file for clean imports
 */
function generateIndexFile(): string {
  return `/**
 * Test Utilities Index
 *
 * Central export for all test utilities.
 * Import from this file for cleaner imports.
 */

// Core test utilities and render functions
export * from './test-utils';

// Assertion helpers
export * from './assertions';

// Semantic validation helpers
export * from './semantic-validators';

// Form testing helpers
export * from './form-helpers';

// Test constants and expected data
export * from './test-constants';
`;
}

/**
 * Main execution
 */
async function main() {
  const projectPath = process.argv[2] || process.cwd();

  console.log('🔍 Test Suite Refactoring Script');
  console.log('================================\n');
  console.log(`Project: ${projectPath}\n`);

  // Build configuration
  const config: RefactorConfig = {
    ...defaultConfig as RefactorConfig,
    projectPath,
    framework: detectFramework(projectPath)
  };

  console.log(`Detected framework: ${config.framework}`);

  // Find test files
  const testFiles = await findTestFiles(config);
  console.log(`Found ${testFiles.length} test files\n`);

  if (testFiles.length === 0) {
    console.log('No test files found. Please check your project structure.');
    process.exit(1);
  }

  // Analyze test files
  console.log('Analyzing test files for patterns...\n');
  const analysis = await analyzeTestFiles(config, testFiles);

  // Print analysis results
  console.log('Analysis Results:');
  console.log('─────────────────');
  console.log(`  render + waitFor patterns: ${analysis.patterns.renderWaitFor}`);
  console.log(`  Link validation patterns: ${analysis.patterns.linkValidation}`);
  console.log(`  Semantic checks: ${analysis.patterns.semanticChecks}`);
  console.log(`  Form interactions: ${analysis.patterns.formInteractions}`);
  console.log(`  Hardcoded strings (3+ occurrences): ${analysis.patterns.hardcodedStrings.length}`);
  console.log(`  Duplicate assertions: ${analysis.patterns.duplicateAssertions.length}`);
  console.log();

  // Print recommendations
  if (analysis.recommendations.length > 0) {
    console.log('Recommendations:');
    console.log('────────────────');
    analysis.recommendations.forEach((rec, i) => {
      console.log(`  ${i + 1}. ${rec}`);
    });
    console.log();
  }

  // Create utils directory
  const utilsPath = path.join(projectPath, config.utilsDir);
  if (!fs.existsSync(utilsPath)) {
    fs.mkdirSync(utilsPath, { recursive: true });
    console.log(`Created directory: ${config.utilsDir}`);
  }

  // Generate utility files
  const filesToGenerate = [
    { name: 'assertions.ts', content: generateAssertionsFile(config.framework) },
    { name: 'semantic-validators.ts', content: generateSemanticValidatorsFile(config.framework) },
    { name: 'form-helpers.ts', content: generateFormHelpersFile() },
    { name: 'test-constants.ts', content: generateConstantsTemplate(analysis.patterns.hardcodedStrings) },
    { name: 'index.ts', content: generateIndexFile() },
  ];

  console.log('\nGenerating utility files:');
  console.log('─────────────────────────');

  for (const file of filesToGenerate) {
    const filePath = path.join(utilsPath, file.name);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, file.content);
      console.log(`  ✓ Created ${config.utilsDir}/${file.name}`);
    } else {
      console.log(`  ⊘ Skipped ${config.utilsDir}/${file.name} (already exists)`);
    }
  }

  // Generate render helpers (to be added to existing test-utils)
  const renderHelpersPath = path.join(utilsPath, 'render-helpers.ts');
  fs.writeFileSync(renderHelpersPath, generateRenderHelpers());
  console.log(`  ✓ Created ${config.utilsDir}/render-helpers.ts (add to test-utils.tsx)`);

  // Generate E2E fixtures if e2e directory exists
  const e2ePath = path.join(projectPath, config.e2eDir);
  if (fs.existsSync(e2ePath)) {
    const fixturesPath = path.join(e2ePath, 'fixtures');
    if (!fs.existsSync(fixturesPath)) {
      fs.mkdirSync(fixturesPath, { recursive: true });
    }
    const navFixturesPath = path.join(fixturesPath, 'navigation.ts');
    if (!fs.existsSync(navFixturesPath)) {
      fs.writeFileSync(navFixturesPath, generateE2EFixtures());
      console.log(`  ✓ Created ${config.e2eDir}/fixtures/navigation.ts`);
    }
  }

  console.log('\n✅ Refactoring complete!');
  console.log('\nNext steps:');
  console.log('  1. Review generated files and customize for your project');
  console.log('  2. Add render helpers to your existing test-utils.tsx');
  console.log('  3. Update your test files to import from the new utilities');
  console.log('  4. Run your test suite to verify everything works');
}

main().catch(console.error);
