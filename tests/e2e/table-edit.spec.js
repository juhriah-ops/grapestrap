/**
 * GrapeStrap — E2E: table surgery + the magic-fusion undo pins
 *
 * PATH: tests/e2e/table-edit.spec.js
 * ROLE: WP-B3 (F5) specs for shortcuts/table-actions.js driven the way a user
 *       reaches it — the element right-click menu — plus the three UNDO PINS
 *       that guard the whole work package against a GrapesJS upgrade:
 *
 *         Adding a column to a 2-column table with a header row and two body
 *         rows is THREE separate inserts. Adding a row is one. Applying the
 *         link dialog is three attribute writes. In every case exactly ONE
 *         undo must restore the original getHtml().
 *
 *       That only holds because Backbone.Undo fuses every action created in
 *       one synchronous call stack under a single magicFusionIndex, and
 *       UndoManager.undo() defaults to undoing the whole fused set. GrapesJS
 *       0.21.13 has no group/transaction API to fall back on, so if a future
 *       version changes fusion these pins are the early warning — a red here
 *       means half-applied undo states are shipping, not a flaky test.
 *       (Full contract: the header of src/renderer/shortcuts/table-actions.js.)
 *
 *       Each pin compares against the html captured immediately BEFORE its
 *       gesture — after the selection, not after the seed. Selecting a
 *       component makes GrapesJS open a CssComposer rule for it, and for a
 *       component with no classes (every <td> here) that rule is id-based, so
 *       GrapesJS stamps an `id` onto the cell and getHtml() changes before any
 *       table operation runs. Anchoring on the pre-seed html would fail the
 *       pins on that stamp — a selection side effect, not an undo defect.
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-08-18
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, selectFirstByTag } from './helpers.js'

const TABLE_HTML = [
  '<table id="te-tbl" class="table">',
  '<thead><tr><th>A</th><th>B</th></tr></thead>',
  '<tbody><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></tbody>',
  '</table>'
].join('')

const canvasHtml = appWindow => appWindow.evaluate(
  () => window.__gstrap.pluginRegistry.bound?.editor?.getHtml() || '')

// Open the context menu for whatever's currently selected — the same event
// the canvas iframe and DOM tree emit (single open path, main.js), per
// tests/e2e/reorder.spec.js:20.
async function openMenuForSelection(appWindow) {
  await appWindow.evaluate(() => {
    const editor = window.__gstrap.pluginRegistry.bound.editor
    window.__gstrap.eventBus.emit('canvas:context-menu', {
      x: 200, y: 200, component: editor.getSelected()
    })
  })
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

/** Seed the table, save so the dirty flag is meaningful again, and return the
 *  saved html. The link test compares its undo pin against this directly (its
 *  <a> is seeded WITH an id, so selecting it changes nothing); the table tests
 *  re-read the html after selecting a cell instead — see the file header. */
async function seedTable(appWindow, html = TABLE_HTML) {
  await appWindow.evaluate(markup => {
    window.__gstrap.pluginRegistry.bound.editor.getWrapper().append(markup)
  }, html)
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'file:save'))
  await appWindow.waitForFunction(
    () => window.__gstrap.projectState.snapshot().any === false, null, { timeout: 5_000 })
  return canvasHtml(appWindow)
}

const isDirty = appWindow => appWindow.evaluate(
  () => [...window.__gstrap.projectState.dirtyPages])

// The return value is deliberately dropped: UndoManager.undo() hands back the
// undone action set, and Playwright cannot serialize a Backbone model graph
// ("object reference chain is too long") — the assertion that matters is the
// getHtml() comparison that follows, not what undo() returned.
const undoOnce = appWindow => appWindow.evaluate(() => {
  window.__gstrap.pluginRegistry.bound.editor.UndoManager.undo()
})

const countTags = (html, tag) => (html.match(new RegExp(`<${tag}\\b`, 'g')) || []).length

test('Table: Add Column from a cell inserts into every row — and ONE undo takes the whole column back out', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-tbl-col-'))
  const projectPath = join(projectDir, 'tbl.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  const seeded = await seedTable(appWindow)
  expect(countTags(seeded, 'th')).toBe(2)
  expect(countTags(seeded, 'td')).toBe(4)

  await selectFirstByTag(appWindow, 'td')
  const beforeGesture = await canvasHtml(appWindow)
  await openMenuForSelection(appWindow)
  await clickMenuItem(appWindow, 'Table: Add Column')

  const widened = await canvasHtml(appWindow)
  expect(countTags(widened, 'th')).toBe(3)   // header row grew too…
  expect(countTags(widened, 'td')).toBe(6)   // …and both body rows
  expect(await isDirty(appWindow)).toContain('index')

  // ── UNDO PIN ── three synchronous inserts, one undo entry.
  await undoOnce(appWindow)
  await appWindow.waitForFunction(
    expected => (window.__gstrap.pluginRegistry.bound.editor.getHtml() || '') === expected,
    beforeGesture, { timeout: 3_000 })
  expect(await canvasHtml(appWindow)).toBe(beforeGesture)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Table: Add Row inserts next to the clicked row — and ONE undo removes it', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-tbl-row-'))
  const projectPath = join(projectDir, 'tbl.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  const seeded = await seedTable(appWindow)
  expect(countTags(seeded, 'tr')).toBe(3)

  await selectFirstByTag(appWindow, 'td')
  const beforeGesture = await canvasHtml(appWindow)
  await openMenuForSelection(appWindow)
  await clickMenuItem(appWindow, 'Table: Add Row')

  const grown = await canvasHtml(appWindow)
  expect(countTags(grown, 'tr')).toBe(4)
  expect(countTags(grown, 'td')).toBe(6)     // the new row matches the column count
  // Inserted after the clicked (first) body row, not appended at the end.
  expect(grown.indexOf('>1<')).toBeLessThan(grown.indexOf('>3<'))
  expect(await isDirty(appWindow)).toContain('index')

  // ── UNDO PIN ── one .add() of a whole row, one undo entry.
  await undoOnce(appWindow)
  await appWindow.waitForFunction(
    expected => (window.__gstrap.pluginRegistry.bound.editor.getHtml() || '') === expected,
    beforeGesture, { timeout: 3_000 })
  expect(await canvasHtml(appWindow)).toBe(beforeGesture)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Table: Remove Column strips the clicked column, and refuses at the last one', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-tbl-rm-'))
  const projectPath = join(projectDir, 'tbl.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await seedTable(appWindow)

  await selectFirstByTag(appWindow, 'td')
  await openMenuForSelection(appWindow)
  await clickMenuItem(appWindow, 'Table: Remove Column')

  const narrowed = await canvasHtml(appWindow)
  expect(countTags(narrowed, 'th')).toBe(1)
  expect(countTags(narrowed, 'td')).toBe(2)
  expect(narrowed).not.toContain('>1<')      // the FIRST column went
  expect(narrowed).toContain('>2<')
  expect(await isDirty(appWindow)).toContain('index')

  // One column left → the item disables itself rather than emptying the table.
  await selectFirstByTag(appWindow, 'td')
  await openMenuForSelection(appWindow)
  const removeColDisabled = await appWindow.evaluate(() =>
    [...document.querySelectorAll('.gstrap-ctxmenu-item')]
      .filter(li => li.querySelector('.gstrap-ctxmenu-label')?.textContent.trim() === 'Table: Remove Column')
      .map(li => li.classList.contains('is-disabled')))
  expect(removeColDisabled).toEqual([true])

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Table menu items are absent outside a table', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-tbl-off-'))
  const projectPath = join(projectDir, 'tbl.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  await selectFirstByTag(appWindow, 'h1')
  await openMenuForSelection(appWindow)

  const labels = await appWindow.evaluate(() =>
    [...document.querySelectorAll('.gstrap-ctxmenu-item')].map(
      li => li.querySelector('.gstrap-ctxmenu-label')?.textContent.trim()))
  expect(labels.some(label => label?.startsWith('Table:'))).toBe(false)
  expect(labels).not.toContain('Edit Link…')

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Edit Link…: three attribute writes commit as ONE undo entry', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-link-'))
  const projectPath = join(projectDir, 'link.gstrap')

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)
  const baseline = await seedTable(appWindow, '<p><a id="te-link" href="/old">Docs</a></p>')
  expect(baseline).toContain('href="/old"')

  await selectFirstByTag(appWindow, 'a')
  await openMenuForSelection(appWindow)
  await clickMenuItem(appWindow, 'Edit Link…')

  // The dialog gathers ALL THREE values BEFORE anything touches the model —
  // that ordering is what keeps the writes inside one synchronous stack.
  await appWindow.waitForSelector('.gstrap-prompt-overlay [data-link-href]', { timeout: 5_000 })
  await appWindow.evaluate(() => {
    const overlay = document.querySelector('.gstrap-prompt-overlay')
    overlay.querySelector('[data-link-href]').value = '/new'
    overlay.querySelector('[data-link-target]').value = '_blank'
    overlay.querySelector('[data-link-rel]').value = 'noopener'
    overlay.querySelector('[data-link-ok]').click()
  })
  await appWindow.waitForFunction(
    () => (window.__gstrap.pluginRegistry.bound.editor.getHtml() || '').includes('href="/new"'),
    null, { timeout: 3_000 })

  const applied = await canvasHtml(appWindow)
  expect(applied).toContain('target="_blank"')
  expect(applied).toContain('rel="noopener"')
  expect(await isDirty(appWindow)).toContain('index')

  // ── UNDO PIN ── three setAttr writes, one undo entry: href, target and rel
  // all revert together. A partial revert here means the user can land in a
  // state they never authored.
  await undoOnce(appWindow)
  await appWindow.waitForFunction(
    expected => (window.__gstrap.pluginRegistry.bound.editor.getHtml() || '') === expected,
    baseline, { timeout: 3_000 })
  expect(await canvasHtml(appWindow)).toBe(baseline)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
