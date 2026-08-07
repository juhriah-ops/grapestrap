/**
 * GrapeStrap — E2E: right-click Cut/Copy/Paste in code editors
 *
 * PATH: tests/e2e/code-context-menu.spec.js
 * ROLE: Monaco's context-menu + clipboard contributions (editor.api.js ships
 *       neither) give every code editor — page pair in Split, Custom CSS
 *       panel — a right-click menu listing Cut/Copy/Paste, and the clipboard
 *       commands actually round-trip text. NB: Monaco renders the menu in a
 *       SHADOW ROOT (.shadow-root-host) — plain querySelector can't see it.
 * DEPENDS: @playwright/test, ./helpers.js, src/renderer/editor/monaco-init.js
 * CREATED: 2026-08-07
 */
import { test, expect } from '@playwright/test'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, dismissWelcome } from './helpers.js'

async function seededSplit() {
  const { app, appWindow } = await launch()
  await dismissWelcome(appWindow)
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-ctx-'))
  await openSeedProject(appWindow, join(projectDir, 'ctx.gstrap'))
  await appWindow.evaluate(() => {
    const { pageState } = window.__gstrap
    pageState.setViewMode(pageState.active().pageName, 'split')
  })
  return { app, appWindow }
}

// The context menu lives inside the .shadow-root-host shadow root.
const menuLabels = () => {
  const host = document.querySelector('.shadow-root-host')
  const menu = host?.shadowRoot?.querySelector('.monaco-menu')
  if (!menu) return null
  return [...menu.querySelectorAll('.action-label')].map(el => el.textContent.trim())
}

async function expectMenuWithClipboard(appWindow) {
  await appWindow.waitForFunction(`(${menuLabels})() !== null`, null, { timeout: 5_000 })
  const labels = await appWindow.evaluate(menuLabels)
  for (const want of ['Cut', 'Copy', 'Paste']) expect(labels).toContain(want)
  await appWindow.keyboard.press('Escape')
  await appWindow.waitForFunction(`(${menuLabels})() === null`, null, { timeout: 3_000 })
}

test('right-click in the Split html editor and the Custom CSS editor shows Cut/Copy/Paste', async () => {
  const { app, appWindow } = await seededSplit()

  await appWindow.click('[data-region="monaco-html"] .view-lines', { button: 'right' })
  await expectMenuWithClipboard(appWindow)

  await appWindow.evaluate(() => document.querySelector('.lm_tab[title="Custom CSS"]')?.click())
  await appWindow.click('.gstrap-cssp-host .view-lines', { button: 'right' })
  await expectMenuWithClipboard(appWindow)

  await app.close()
})

test('clipboard copy/paste commands round-trip text in the Custom CSS editor', async () => {
  const { app, appWindow } = await seededSplit()

  await appWindow.evaluate(() => document.querySelector('.lm_tab[title="Custom CSS"]')?.click())
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.getCssEditor()
    ed.setValue('.copy-me { color: red; }\n')
    ed.focus()
    ed.setSelection({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 25 })
    ed.trigger('e2e', 'editor.action.clipboardCopyAction', {})
  })
  const clip = await appWindow.evaluate(() => navigator.clipboard.readText())
  expect(clip).toBe('.copy-me { color: red; }')

  await appWindow.evaluate(() => {
    const ed = window.__gstrap.getCssEditor()
    ed.setPosition({ lineNumber: 2, column: 1 })
    ed.trigger('e2e', 'editor.action.clipboardPasteAction', {})
  })
  await appWindow.waitForFunction(() => {
    const v = window.__gstrap.getCssEditor().getValue()
    return (v.match(/\.copy-me \{ color: red; \}/g) || []).length === 2
  }, null, { timeout: 5_000 })

  await app.close()
})
