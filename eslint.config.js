import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import sonarjs from "eslint-plugin-sonarjs";

export default tseslint.config(
  {
    ignores: [
      'node_modules/',
      'frontend/',
      'cloudflare-workers/',
      'mcp-servers/',
      'docs/',
      'scripts/',
      'data/',
      'logs/',
      'config/',
      'setup-files/',
      '**/*.example.js',
      'tests/accuracy/fixtures/',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      sonarjs
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      "sonarjs/no-duplicate-string": ["warn", { "threshold": 3 }],
      "no-magic-numbers": ["warn", {
        ignore: [0, 1],
        ignoreArrayIndexes: true
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/ban-ts-comment': ['error', {
        'ts-nocheck': 'allow-with-description',
        'ts-ignore': 'allow-with-description',
        'ts-expect-error': 'allow-with-description',
      }],
      'preserve-caught-error': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      'no-undef': 'off',
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  {
    files: ['sidequest/core/constants.ts', 'sidequest/core/units.ts'],
    rules: {
      'no-magic-numbers': 'off',
    },
  },
);
