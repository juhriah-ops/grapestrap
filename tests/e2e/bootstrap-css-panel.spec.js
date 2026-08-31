/**
 * GrapeStrap — E2E: Bootstrap CSS panel
 *
 * PATH: tests/e2e/bootstrap-css-panel.spec.js
 * ROLE: The Dreamweaver-model framework sheet: the right stack's 4th tab, the
 *       edit → live canvas → save → disk → export chain for the project's own
 *       site/assets/css/bootstrap.css, its exclusion from the Site Files lane
 *       (dual-writer guard), the View toggle, and the unavailable-state hint a
 *       vendored-framework project gets instead of an editor.
 * DEPENDS: @playwright/test, ./helpers.js,
 *          src/renderer/panels/bootstrap-css/index.js,
 *          src/renderer/editor/grapesjs-init.js, src/main/project-manager.js
 * CREATED: 2026-08-18
 * UPDATED: 2026-08-30 — right-stack tab-title assertion extended for the
 *          5th tab (AI)
 */
import { test, expect } from '@playwright/test'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, createBundledStarterProject } from './helpers.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// A rule no Bootstrap build contains, with a property Reboot leaves at
// `normal` on a heading — so a non-empty computed value can only come from
// the edited sheet.
const PROBE_CLASS = 'gstrap-e2e-probe'
const PROBE_RULE = `\n.${PROBE_CLASS} { letter-spacing: 7px; }\n`

/** Append text at the end of the Bootstrap panel's Monaco buffer. */
async function appendToBootstrapBuffer(appWindow, text) {
  await appWindow.evaluate(chunk => {
    const ed = window.__gstrap.getBootstrapCssEditor()
    const end = ed.getModel().getFullModelRange().getEndPosition()
    ed.executeEdits('spec', [{
      range: {
        startLineNumber: end.lineNumber, startColumn: end.column,
        endLineNumber: end.lineNumber, endColumn: end.column
      },
      text: chunk
    }])
  }, text)
}

test('Bootstrap panel: edit previews live, saves to disk, and wins at export', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-bscss-'))
  const projectPath = join(projectDir, 'bscss.gstrap')
  const outDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-bscss-out-'))

  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, projectPath)

  // ── The 4th right-stack tab (5th as of the 2026-08-30 AI panel) ────────────
  const rightTabTitles = await appWindow.evaluate(() =>
    [...document.querySelectorAll('.lm_item.lm_stack:has(.gstrap-dom-host) .lm_tab')]
      .map(tab => tab.getAttribute('title')))
  expect(rightTabTitles).toEqual(['DOM', 'Properties', 'Custom CSS', 'Bootstrap', 'AI'])

  // A blank project has an editable sheet, so the panel shows its editor.
  const initial = await appWindow.evaluate(() => ({
    hasBuffer: typeof window.__gstrap.projectState.current.bootstrapCSS === 'string',
    unavailable: !!document.querySelector('.gstrap-bscss-root.is-unavailable')
  }))
  expect(initial.hasBuffer).toBe(true)
  expect(initial.unavailable).toBe(false)

  // ── Edit → the buffer is the state, and the project goes dirty ─────────────
  await appendToBootstrapBuffer(appWindow, PROBE_RULE)
  await appWindow.waitForFunction(cls => {
    const { projectState } = window.__gstrap
    return projectState.current.bootstrapCSS.includes(cls) && projectState.bootstrapCssDirty
  }, PROBE_CLASS, { timeout: 5_000 })

  // ── Live preview: canvas swaps the framework link for a blob of the buffer ──
  await appWindow.waitForFunction(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const doc = ed.Canvas.getFrameEl()?.contentDocument
    const link = doc?.head?.querySelector('link[data-grapestrap-bootstrap]')
    return !!link?.getAttribute('href')?.startsWith('blob:')
  }, null, { timeout: 5_000 })

  // Put the probe class on a real canvas element and read the computed value
  // from inside the frame. Nothing has been saved at this point — the styling
  // can only be coming from the in-memory sheet.
  await appWindow.evaluate(cls => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const find = component => {
      if ((component.get('tagName') || '').toLowerCase() === 'h1') return component
      for (const child of component.components()) {
        const hit = find(child)
        if (hit) return hit
      }
      return null
    }
    find(ed.getWrapper())?.addClass(cls)
  }, PROBE_CLASS)

  await appWindow.waitForFunction(cls => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const doc = ed.Canvas.getFrameEl()?.contentDocument
    const el = doc?.querySelector('.' + cls)
    return !!el && doc.defaultView.getComputedStyle(el).letterSpacing === '7px'
  }, PROBE_CLASS, { timeout: 5_000 })

  const savedBeforeSave = await appWindow.evaluate(() => window.__gstrap.projectState.bootstrapCssDirty)
  expect(savedBeforeSave, 'still dirty until Ctrl+S — nothing written on debounce').toBe(true)

  // ── Save → the project's own bootstrap.css on disk carries the edit ────────
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'file:save'))
  await appWindow.waitForFunction(
    () => window.__gstrap.projectState.bootstrapCssDirty === false, null, { timeout: 10_000 })

  const onDisk = await fsp.readFile(join(projectDir, 'site', 'assets', 'css', 'bootstrap.css'), 'utf8')
  expect(onDisk).toContain(PROBE_CLASS)

  // ── Site Files never offers the same file to the generic code lane ─────────
  const siteFileRows = await appWindow.evaluate(() =>
    [...document.querySelectorAll('[data-fm-file]')].map(el => el.dataset.fmFile))
  expect(siteFileRows.some(path => path.endsWith('bootstrap.css'))).toBe(false)

  // ── Export ships the buffer, not a pristine vendor copy ───────────────────
  await appWindow.evaluate(async out => {
    await window.grapestrap.project.export(window.__gstrap.projectState.current, out)
  }, outDir)

  const exported = await fsp.readFile(join(outDir, 'assets', 'css', 'bootstrap.css'), 'utf8')
  expect(exported).toContain(PROBE_CLASS)
  const pristine = await fsp.readFile(
    join(repoRoot, 'node_modules', 'bootstrap', 'dist', 'css', 'bootstrap.css'), 'utf8')
  expect(exported).not.toBe(pristine)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
  await fsp.rm(outDir, { recursive: true, force: true })
})

test('Bootstrap panel: View toggle hides and restores the tab', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-bscss-toggle-'))
  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, join(projectDir, 'toggle.gstrap'))

  // Assertions below read computed display on the tab, so give the right stack
  // room for all four tab strips: GL parks overflowing tabs in a display:none
  // dropdown container, which would read as "hidden" for the wrong reason.
  await appWindow.setViewportSize({ width: 1600, height: 900 })
  await appWindow.waitForTimeout(250)

  const tabHidden = () => appWindow.evaluate(() => {
    const tab = document.querySelector('.lm_tab[title="Bootstrap"]')
    return tab ? getComputedStyle(tab).display === 'none' : null
  })

  expect(await tabHidden()).toBe(false)

  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('view:toggle-bootstrap-css'))
  await appWindow.waitForFunction(
    () => document.body.classList.contains('is-hide-bootstrap-css'), null, { timeout: 3_000 })
  expect(await tabHidden()).toBe(true)

  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('view:toggle-bootstrap-css'))
  await appWindow.waitForFunction(
    () => !document.body.classList.contains('is-hide-bootstrap-css'), null, { timeout: 3_000 })
  expect(await tabHidden()).toBe(false)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('Bootstrap panel: a vendored-framework project gets the hint, not an editor', async () => {
  // Graphite ships its own Bootstrap under site/assets/vendor/, so the app
  // never copies its bundled one in and there is no sheet for this panel to
  // own. The panel must say so rather than showing an empty editor that a save
  // could turn into a real (and unreferenced) assets/css/bootstrap.css.
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-bscss-vendored-'))
  const { app, appWindow } = await launch()
  await createBundledStarterProject(appWindow, join(projectDir, 'vendored.gstrap'), { starterId: 'graphite' })

  await appWindow.waitForFunction(
    () => !!document.querySelector('.gstrap-bscss-root.is-unavailable'), null, { timeout: 5_000 })

  const state = await appWindow.evaluate(() => ({
    buffer: window.__gstrap.projectState.current.bootstrapCSS,
    hint: document.querySelector('.gstrap-bscss-unavailable-text')?.textContent || '',
    readOnly: window.__gstrap.getBootstrapCssEditor().getRawOptions().readOnly
  }))
  expect(state.buffer).toBeUndefined()
  expect(state.hint).toContain('vendors its own framework')
  expect(state.readOnly).toBe(true)

  // No editable sheet on disk either — the panel is telling the truth.
  await expect(
    fsp.access(join(projectDir, 'site', 'assets', 'css', 'bootstrap.css'))
  ).rejects.toThrow()

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
