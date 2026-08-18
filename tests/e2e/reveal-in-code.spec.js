/**
 * GrapeStrap — E2E: "Reveal in Code View" context-menu item
 *
 * PATH: tests/e2e/reveal-in-code.spec.js
 * ROLE: Workstream B WP-B2 specs (F3b) — the "Reveal in Code View"
 *       context-menu item (editor/code-select-highlight.js's
 *       revealComponentInCode(), wired via shortcuts/component-actions.js's
 *       ctx.reveal-code item). Covers the design→split view-mode flip, that
 *       the resulting Monaco selection covers the component's serialized
 *       block, nth-twin disambiguation on a repeated section, and the item
 *       being disabled while a file tab is active.
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-08-18
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, selectFirstByTag } from './helpers.js'

const REVEAL_LABEL = 'Reveal in Code View'

// Same open-menu / read-labels / click-by-label idiom reorder.spec.js and
// select-hierarchy.spec.js use: emit the same event the canvas iframe and DOM
// tree emit (single open path, main.js) for whatever's currently selected.
async function openMenuForSelection(appWindow) {
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const comp = ed.getSelected()
    window.__gstrap.eventBus.emit('canvas:context-menu', { x: 200, y: 200, component: comp })
  })
}

// [{ label, disabled }] for every non-separator item in the open menu.
async function menuItemStates(appWindow) {
  return appWindow.evaluate(() =>
    [...document.querySelectorAll('.gstrap-ctxmenu-item')].map(li => ({
      label: li.querySelector('.gstrap-ctxmenu-label')?.textContent.trim(),
      disabled: li.classList.contains('is-disabled')
    }))
  )
}

async function clickMenuItem(appWindow, label) {
  const labels = await appWindow.evaluate(() =>
    [...document.querySelectorAll('.gstrap-ctxmenu-item')].map(
      li => li.querySelector('.gstrap-ctxmenu-label')?.textContent.trim()))
  const idx = labels.indexOf(label)
  if (idx === -1) throw new Error(`menu item not found: "${label}" (have: ${labels.join(', ')})`)
  await appWindow.evaluate(i => {
    document.querySelectorAll('.gstrap-ctxmenu-item')[i].click()
  }, idx)
}

/** The html Monaco editor's current selection text, or '' once one exists. */
async function waitForNonEmptySelection(appWindow) {
  await appWindow.waitForFunction(() => {
    const ed = window.__gstrap.getMonacoPair()?.htmlEditor
    const sel = ed?.getSelection?.()
    const model = ed?.getModel?.()
    if (!ed || !sel || !model || sel.isEmpty()) return false
    return model.getValueInRange(sel).length > 0
  }, null, { timeout: 5_000 })
  return appWindow.evaluate(() => {
    const ed = window.__gstrap.getMonacoPair().htmlEditor
    return ed.getModel().getValueInRange(ed.getSelection())
  })
}

test('Reveal in Code View flips a design-view tab to Split and selects the component\'s block', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-reveal-'))
  const projectPath = join(projectDir, 'flip.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  expect(await appWindow.evaluate(() => window.__gstrap.pageState.active()?.viewMode)).toBe('design')

  await selectFirstByTag(appWindow, 'h1')
  await openMenuForSelection(appWindow)

  const states = await menuItemStates(appWindow)
  const item = states.find(s => s.label === REVEAL_LABEL)
  expect(item, `menu item missing: ${REVEAL_LABEL} (have: ${states.map(s => s.label).join(', ')})`).toBeTruthy()
  expect(item.disabled).toBeFalsy()

  await clickMenuItem(appWindow, REVEAL_LABEL)

  await appWindow.waitForFunction(
    () => window.__gstrap.pageState.active()?.viewMode === 'split', null, { timeout: 5_000 })

  const selected = await waitForNonEmptySelection(appWindow)
  // Real Monaco selection covering the whole <h1>…</h1> block — same anchor
  // contract code-view-assist.spec.js pins for the passive decoration-only
  // follow, but via ed.getSelection() rather than a decoration range.
  expect(selected.startsWith('<h1')).toBe(true)
  expect(selected.endsWith('</h1>')).toBe(true)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('nth-twin disambiguation: reveal on the second identical section selects the second block', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-reveal-'))
  const projectPath = join(projectDir, 'twin.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // Two byte-identical <div class="col"> blocks; select the SECOND, then
  // reveal it. Already in Split so the action takes the "compute immediately"
  // branch — isolates twin resolution from the design→split flip (covered by
  // the spec above).
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const added = ed.getWrapper().append(
      '<div class="col">twin</div><div class="col">twin</div>'
    )
    ed.select(added[1])
  })
  await appWindow.evaluate(() => {
    const { pageState } = window.__gstrap
    pageState.setViewMode(pageState.active().pageName, 'split')
  })
  await appWindow.waitForFunction(
    () => window.__gstrap.pageState.active()?.viewMode === 'split', null, { timeout: 5_000 })

  await openMenuForSelection(appWindow)
  await clickMenuItem(appWindow, REVEAL_LABEL)

  await waitForNonEmptySelection(appWindow)

  const check = await appWindow.evaluate(() => {
    const ed = window.__gstrap.getMonacoPair().htmlEditor
    const model = ed.getModel()
    const sel = ed.getSelection()
    const text = model.getValue()
    const startOffset = model.getOffsetAt({ lineNumber: sel.startLineNumber, column: sel.startColumn })
    const firstTwin = text.indexOf('<div class="col">')
    return {
      selected: model.getValueInRange(sel),
      firstTwin,
      isSecond: startOffset > firstTwin
    }
  })
  expect(check.firstTwin).toBeGreaterThan(-1)
  expect(check.selected.startsWith('<div class="col">')).toBe(true)
  expect(check.isSecond).toBe(true)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Reveal in Code View is disabled while a file tab is active', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-reveal-'))
  const projectPath = join(projectDir, 'filetab.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await selectFirstByTag(appWindow, 'h1')

  // Same opts shape panels/file-manager/index.js uses to open a real file
  // tab — a fabricated path is fine here: the guard under test reads
  // pageState.active()?.kind, not the file's actual content, and a failed
  // file:read degrades to a toast (file-tabs.js) rather than throwing.
  await appWindow.evaluate(() => {
    window.__gstrap.pageState.open('scratch.php', { kind: 'file', label: 'scratch.php', viewMode: 'code' })
  })
  expect(await appWindow.evaluate(() => window.__gstrap.pageState.active()?.kind)).toBe('file')

  // GrapesJS selection is a separate system from pageState — the canvas
  // still reports the h1 selected even though a file tab is now active,
  // which is what isolates this assertion to the kind==='file' guard rather
  // than the sibling `!component` guard the same disabled expression checks.
  await openMenuForSelection(appWindow)
  const states = await menuItemStates(appWindow)
  const item = states.find(s => s.label === REVEAL_LABEL)
  expect(item, `menu item missing: ${REVEAL_LABEL} (have: ${states.map(s => s.label).join(', ')})`).toBeTruthy()
  expect(item.disabled).toBe(true)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
