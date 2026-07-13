/**
 * GrapeStrap — E2E: PHP awareness (Wave 4)
 *
 * PATH: tests/e2e/php.spec.js
 * ROLE: Site Files section + file-tab lane for .php: Monaco php language,
 *       include/require decorations, edit + save round-trip, code-only
 *       view-mode coercion
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-07-12
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, dismissWelcome } from './helpers.js'

const PHP_SEED = [
  '<?php',
  "include 'includes/header.php';",
  'require_once("lib/db.php");',
  '$title = "Contact";',
  '?>',
  '<p>Contact page body</p>'
].join('\n')

// Seed a .php file into the open project's site/ AFTER project creation (the
// chokidar watcher → file-manager rescan is the product path for php files
// appearing), then open it through the Site Files row like a user would.
async function seedAndOpenPhp(appWindow, projectDir) {
  await fsp.writeFile(join(projectDir, 'site', 'contact.php'), PHP_SEED, 'utf8')
  // Watcher debounce (chokidar awaitWriteFinish 200ms) + panel rescan
  // debounce (300ms) both sit in front of the row appearing.
  await appWindow.waitForSelector('.gstrap-fm-item[data-fm-file="contact.php"]', { timeout: 15_000 })
  await appWindow.dblclick('.gstrap-fm-item[data-fm-file="contact.php"]')
  // Model creation is sync but content arrives via async file:read.
  await appWindow.waitForFunction(() => {
    const m = window.__gstrap?.pluginRegistry?.bound?.monaco
    const models = m?.editor?.getModels?.() || []
    return models.some(md =>
      md?.getLanguageId?.() === 'php' && (md?.getValue?.() || '').includes('header.php'))
  }, null, { timeout: 10_000 })
}

test('PHP file: Site Files row opens a php-language Monaco tab with include/require decorations', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-php-'))
  const projectPath = join(projectDir, 'php.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await dismissWelcome(appWindow) // real dblclick below needs the overlay gone
  await seedAndOpenPhp(appWindow, projectDir)

  // php must be a REGISTERED language (the contribution import in
  // monaco-init.js), not an inferred-then-downgraded plaintext model.
  const langState = await appWindow.evaluate(() => {
    const m = window.__gstrap?.pluginRegistry?.bound?.monaco
    const model = (m?.editor?.getModels?.() || [])
      .find(md => md?.getLanguageId?.() === 'php')
    return {
      registered: (m?.languages?.getLanguages?.() || []).map(l => l.id).includes('php'),
      modelLang: model?.getLanguageId?.() || null,
      tabKind: window.__gstrap?.pageState?.active?.()?.kind || null,
      viewMode: window.__gstrap?.pageState?.active?.()?.viewMode || null
    }
  })
  expect(langState.registered).toBe(true)
  expect(langState.modelLang).toBe('php')
  expect(langState.tabKind).toBe('file')
  expect(langState.viewMode).toBe('code')

  // Chrome: code-only — design hidden, file slot visible, html slot parked.
  const chrome = await appWindow.evaluate(() => ({
    designHidden: document.querySelector('[data-region="canvas-design"]')?.hidden ?? null,
    codeHidden:   document.querySelector('[data-region="canvas-code"]')?.hidden ?? null,
    htmlHidden:   document.querySelector('[data-region="monaco-html"]')?.hidden ?? null,
    fileHidden:   document.querySelector('[data-region="monaco-file"]')?.hidden ?? null
  }))
  expect(chrome.designHidden).toBe(true)
  expect(chrome.codeHidden).toBe(false)
  expect(chrome.htmlHidden).toBe(true)
  expect(chrome.fileHidden).toBe(false)

  // Two include-like statements in the seed → two decorations on the model
  // (poll — recompute is debounced behind the async content load), and at
  // least one decorated span actually painted in the file slot.
  await appWindow.waitForFunction(() => {
    const m = window.__gstrap?.pluginRegistry?.bound?.monaco
    const model = (m?.editor?.getModels?.() || [])
      .find(md => md?.getLanguageId?.() === 'php')
    const count = (model?.getAllDecorations?.() || [])
      .filter(d => d?.options?.inlineClassName === 'gstrap-php-include-target').length
    return count === 2
  }, null, { timeout: 5_000 })
  await appWindow.waitForSelector('[data-region="monaco-file"] .gstrap-php-include-target', { timeout: 5_000 })

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('PHP file: Monaco edits round-trip to disk on save, decorations recompute', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-phpsave-'))
  const projectPath = join(projectDir, 'phpsave.gstrap')
  const EDITED = [
    '<?php',
    "require 'lib/auth.php';",
    "echo 'php-save-sentinel';",
    '?>'
  ].join('\n')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await dismissWelcome(appWindow)
  await seedAndOpenPhp(appWindow, projectDir)

  await appWindow.evaluate(edited => {
    const m = window.__gstrap.pluginRegistry.bound.monaco
    const model = m.editor.getModels().find(md => md.getLanguageId() === 'php')
    model.setValue(edited)
  }, EDITED)

  // Decorations recompute (debounced) off the content change: 1 require now.
  await appWindow.waitForFunction(() => {
    const m = window.__gstrap?.pluginRegistry?.bound?.monaco
    const model = (m?.editor?.getModels?.() || [])
      .find(md => md?.getLanguageId?.() === 'php')
    const count = (model?.getAllDecorations?.() || [])
      .filter(d => d?.options?.inlineClassName === 'gstrap-php-include-target').length
    return count === 1
  }, null, { timeout: 5_000 })

  // Save through the same command path the toolbar/menu uses; the file-tab
  // flush rides project:saved and writes via file:write.
  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.emit('command', 'file:save')
  })
  const target = join(projectDir, 'site', 'contact.php')
  let onDisk = ''
  for (let i = 0; i < 40; i++) {
    onDisk = await fsp.readFile(target, 'utf8').catch(() => '')
    if (onDisk.includes('php-save-sentinel')) break
    await new Promise(r => setTimeout(r, 250))
  }
  expect(onDisk).toContain('php-save-sentinel')
  expect(onDisk).toContain("require 'lib/auth.php';")

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('PHP file tab is code-only: view-mode design attempts snap back to code', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-phpvm-'))
  const projectPath = join(projectDir, 'phpvm.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await dismissWelcome(appWindow)
  await seedAndOpenPhp(appWindow, projectDir)

  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.emit('command', 'view:mode-design')
  })
  // Coercion re-enters via pageState.setViewMode — poll for the settled state.
  await appWindow.waitForFunction(() => {
    const tab = window.__gstrap?.pageState?.active?.()
    const design = document.querySelector('[data-region="canvas-design"]')
    return tab?.viewMode === 'code' && design?.hidden === true
  }, null, { timeout: 5_000 })

  const chrome = await appWindow.evaluate(() => ({
    fileHidden: document.querySelector('[data-region="monaco-file"]')?.hidden ?? null,
    codeHidden: document.querySelector('[data-region="canvas-code"]')?.hidden ?? null
  }))
  expect(chrome.fileHidden).toBe(false)
  expect(chrome.codeHidden).toBe(false)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
