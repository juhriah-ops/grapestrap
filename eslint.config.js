/**
 * GrapeStrap — ESLint 9 flat config
 *
 * Replaces the never-worked eslintrc setup (ESLint 9 was installed with no
 * flat config, so `npm run lint` errored since day one). Philosophy: catch
 * real bugs, don't fight the house style — starts from eslint:recommended
 * with the handful of relaxations the existing code depends on (empty
 * catch with a comment, `_`-prefixed intentionally-unused bindings).
 *
 * Contexts:
 *   - src/main, src/preload      → Node (Electron main process)
 *   - src/renderer, plugins      → browser (Chromium renderer)
 *   - tests/e2e                  → Node runner, but evaluate() callbacks run
 *                                  in the page, so browser globals too
 *   - vite.config.js etc.        → Node
 */

import js from '@eslint/js'
import globals from 'globals'

const relaxations = {
  'no-unused-vars': ['error', {
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
    caughtErrors: 'none',
    // `({ html, ...p })` rest-exclusion (project-manager manifest writes)
    ignoreRestSiblings: true
  }],
  'no-empty': ['error', { allowEmptyCatch: true }]
}

export default [
  { ignores: ['dist/**', 'node_modules/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  {
    files: ['src/main/**/*.js', 'src/preload/**/*.js', 'vite.config.js', 'playwright.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node }
    },
    rules: relaxations
  },
  {
    files: ['src/renderer/**/*.js', 'plugins/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser }
    },
    rules: relaxations
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      // evaluate() callbacks execute in the renderer page — window/document
      // references inside them are real, not undefined.
      globals: { ...globals.node, ...globals.browser }
    },
    rules: relaxations
  }
]
