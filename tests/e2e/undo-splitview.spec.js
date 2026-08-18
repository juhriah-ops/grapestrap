/**
 * GrapeStrap — E2E: undo/redo in Split view
 *
 * PATH: tests/e2e/undo-splitview.spec.js
 * ROLE: Regression cover for the 2026-08-17 split-view undo repair (nola1
 *       report: "we need to improve on the undo function, most issues are on
 *       the splitview screen"). Each spec here is one scenario from the
 *       characterization pass, pinned at its FIXED behaviour:
 *
 *         - a no-op focus/blur of the code pane must not destroy canvas
 *           undo history (it used to take the stack from 2 entries to 0)
 *         - Ctrl+Z with the caret in the code pane must still reach the
 *           canvas stack when that is where the user's last edit was
 *         - a canvas edit must not wipe the code pane's undo stack or throw
 *           the caret back to line 1
 *         - a canvas undo must repaint the code pane
 *         - redo must mirror the undo it reverses, across panes
 *         - a code-pane undo must revert the USER's typing, never one of the
 *           sync's own generated rewrites
 *         - undo must not leak content across page tabs (the shared Monaco
 *           pair no longer clears its history on every sync, so the tab swap
 *           now has to ask for that explicitly)
 *         - every undo entry point stays equivalent, one step per invocation
 *         - pure Code view keeps FOCUS routing (the hard-won v0.1.1 fix)
 *
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-08-17
 *
 * Typing note: markers typed into the code pane are PLAIN TEXT (no angle
 * brackets) on purpose. `trigger('keyboard','type')` of a markup string trips
 * the tag auto-close hook, which splits one burst into several undo stops and
 * makes "one Ctrl+Z" non-deterministic — the existing undo-redo.spec.js works
 * around that with a bounded retry loop. Plain text is a single edit, hence a
 * single undo stop, which is what these specs need to assert exact counts.
 */
import { test, expect } from '@playwright/test'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { launch, openSeedProject } from './helpers.js'

// ---- shared drivers -----------------------------------------------------

const probe = appWindow => appWindow.evaluate(() => {
  const g = window.__gstrap
  const ed = g?.pluginRegistry?.bound?.editor
  const html = g?.getMonacoPair?.()?.htmlEditor
  const model = html?.getModel?.()
  return {
    canvas: ed?.getHtml?.() || '',
    code: html?.getValue?.() || '',
    monacoCanUndo: model?.canUndo?.() ?? null,
    gjsHasUndo: ed?.UndoManager?.hasUndo?.() ?? null,
    gjsHasRedo: ed?.UndoManager?.hasRedo?.() ?? null,
    gjsStackLen: ed?.UndoManager?.getStack?.()?.length ?? null,
    cursorLine: html?.getPosition?.()?.lineNumber ?? null
  }
})

// Arm a counter on the design→code sync so waits are on a real event rather
// than a sleep. Wired once per window; resets the count each call.
async function armSync(appWindow) {
  await appWindow.evaluate(() => {
    window.__syncCount = 0
    if (!window.__syncArmed) {
      window.__syncArmed = true
      window.__gstrap.eventBus.on('sync:canvas-to-code', () => { window.__syncCount++ })
    }
  })
}

const waitForSync = (appWindow, atLeast = 1) =>
  appWindow.waitForFunction(n => (window.__syncCount ?? 0) >= n, atLeast, { timeout: 10_000 })

/**
 * Open a project, settle the initial load sync, and switch the tab to Split.
 * Settling matters: the tab-open swap asks for a one-shot code-history reset
 * (so the incoming tab can't inherit the outgoing tab's undo entries) and that
 * lands on the next sync — a spec that starts typing before it arrives is
 * racing the reset, not testing undo.
 */
async function bootSplit(slug) {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), `gstrap-undosplit-${slug}-`))
  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, join(projectDir, `${slug}.gstrap`))
  await armSync(appWindow)
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    ed.getWrapper().append('<p class="settle-probe">settle</p>')
  })
  await waitForSync(appWindow)
  const pageName = await appWindow.evaluate(() => window.__gstrap.pageState.active()?.pageName)
  await appWindow.evaluate(n => window.__gstrap.pageState.setViewMode(n, 'split'), pageName)
  await appWindow.waitForFunction(
    () => window.__gstrap.pageState.active()?.viewMode === 'split', null, { timeout: 5_000 })
  return { app, appWindow, projectDir, pageName }
}

async function canvasAppend(appWindow, className) {
  await armSync(appWindow)
  await appWindow.evaluate(c => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    ed.getWrapper().append(`<p class="${c}">canvas</p>`)
  }, className)
  await waitForSync(appWindow)
}

/** Type plain text into the code pane at the caret (one edit = one undo stop). */
const typeInCodePane = (appWindow, text) => appWindow.evaluate(t => {
  const ed = window.__gstrap.getMonacoPair().htmlEditor
  const model = ed.getModel()
  ed.focus()
  const match = model.findMatches('</body>', false, false, true, null, false)[0]
  ed.setPosition(match
    ? { lineNumber: match.range.startLineNumber, column: 1 }
    : { lineNumber: model.getLineCount(), column: 1 })
  ed.trigger('keyboard', 'type', { text: t })
}, text)

const focusCodePane = appWindow =>
  appWindow.evaluate(() => window.__gstrap.getMonacoPair().htmlEditor.focus())

const blurAll = appWindow => appWindow.evaluate(() => {
  const active = document.activeElement
  if (active && typeof active.blur === 'function') active.blur()
})

const undo = appWindow =>
  appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'edit:undo'))
const redo = appWindow =>
  appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'edit:redo'))

const teardown = async (app, projectDir) => {
  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
}

// ---- specs --------------------------------------------------------------

test('split: reading the code pane does not destroy canvas undo history', async () => {
  // THE headline bug. rebuildCanvasFromCode ends in UndoManager.clear(), and
  // the split-view blur hook used to call it on EVERY blur — so clicking into
  // the code pane to read the markup and clicking back out threw away every
  // canvas undo step. Measured before the fix: stack 2 -> 0, and Ctrl+Z
  // afterwards did nothing at all.
  const { app, appWindow, projectDir } = await bootSplit('noop-blur')

  await canvasAppend(appWindow, 'mark-one')
  await canvasAppend(appWindow, 'mark-two')
  const before = await probe(appWindow)
  expect(before.gjsHasUndo).toBe(true)
  expect(before.gjsStackLen).toBeGreaterThanOrEqual(2)

  // Click in, type nothing, click out.
  await focusCodePane(appWindow)
  await blurAll(appWindow)
  await appWindow.waitForTimeout(400)

  const afterTouch = await probe(appWindow)
  expect(afterTouch.gjsHasUndo).toBe(true)
  expect(afterTouch.gjsStackLen).toBe(before.gjsStackLen)

  // And undo still walks the canvas one step at a time.
  await undo(appWindow)
  await appWindow.waitForTimeout(600)
  const afterUndo = await probe(appWindow)
  expect(afterUndo.canvas).not.toContain('mark-two')
  expect(afterUndo.canvas).toContain('mark-one')

  await teardown(app, projectDir)
})

test('split: undo reaches the canvas stack while the caret sits in the code pane', async () => {
  // Focus routing dead-ended here: focus says "code", the code pane has no
  // history of its own, the canvas does — and Ctrl+Z did nothing. Split view
  // now routes by the most recent USER edit instead of by focus.
  const { app, appWindow, projectDir } = await bootSplit('caret-in-code')

  await canvasAppend(appWindow, 'only-canvas')
  await focusCodePane(appWindow)          // caret in code, NO typing
  await appWindow.waitForTimeout(200)

  const before = await probe(appWindow)
  expect(before.canvas).toContain('only-canvas')
  expect(before.gjsHasUndo).toBe(true)

  await undo(appWindow)
  await appWindow.waitForTimeout(700)

  const after = await probe(appWindow)
  expect(after.canvas).not.toContain('only-canvas')
  // The code pane must follow the canvas back — both panes are live in split.
  expect(after.code).not.toContain('only-canvas')

  await teardown(app, projectDir)
})

test('split: a canvas edit preserves the code pane undo stack and the caret', async () => {
  // The design→code sync used to call Monaco's setValue, which runs
  // _commandManager.clear() — every canvas edit wiped the code pane's undo
  // history and reset the caret to line 1. It now applies a prefix/suffix
  // trimmed pushEditOperations instead.
  const { app, appWindow, projectDir } = await bootSplit('preserve-stack')

  await typeInCodePane(appWindow, 'CODEMARK')
  const afterType = await probe(appWindow)
  expect(afterType.monacoCanUndo).toBe(true)
  expect(afterType.code).toContain('CODEMARK')
  const typedLine = afterType.cursorLine

  // A canvas edit fires the design→code sync across the code pane.
  await blurAll(appWindow)
  await appWindow.waitForTimeout(400)
  await canvasAppend(appWindow, 'sync-trigger')
  await appWindow.waitForTimeout(400)

  const afterSync = await probe(appWindow)
  expect(afterSync.code).toContain('sync-trigger')
  // The stack survived...
  expect(afterSync.monacoCanUndo).toBe(true)
  // ...and the caret is still down in the document, not yanked to line 1. It
  // may shift by the lines the sync inserted above it, which is correct.
  expect(afterSync.cursorLine).not.toBe(1)
  expect(Math.abs(afterSync.cursorLine - typedLine)).toBeLessThanOrEqual(5)

  await teardown(app, projectDir)
})

test('split: a canvas undo repaints the code pane to the reverted state', async () => {
  const { app, appWindow, projectDir } = await bootSplit('repaint')

  await canvasAppend(appWindow, 'repaint-me')
  const afterEdit = await probe(appWindow)
  expect(afterEdit.canvas).toContain('repaint-me')
  expect(afterEdit.code).toContain('repaint-me')

  await blurAll(appWindow)
  await undo(appWindow)
  await appWindow.waitForTimeout(800)

  const afterUndo = await probe(appWindow)
  expect(afterUndo.canvas).not.toContain('repaint-me')
  expect(afterUndo.code).not.toContain('repaint-me')

  await teardown(app, projectDir)
})

test('split: redo mirrors the undo it reverses, across both panes', async () => {
  const { app, appWindow, projectDir } = await bootSplit('redo-mirror')

  await canvasAppend(appWindow, 'redo-me')
  await blurAll(appWindow)
  await undo(appWindow)
  await appWindow.waitForTimeout(800)
  const afterUndo = await probe(appWindow)
  expect(afterUndo.canvas).not.toContain('redo-me')
  expect(afterUndo.code).not.toContain('redo-me')

  await redo(appWindow)
  await appWindow.waitForTimeout(800)
  const afterRedo = await probe(appWindow)
  expect(afterRedo.canvas).toContain('redo-me')
  expect(afterRedo.code).toContain('redo-me')

  await teardown(app, projectDir)
})

test('split: a code-pane undo reverts the user typing, not a generated rewrite', async () => {
  // The floor contract (editor/edit-origin.js). Generated design→code rewrites
  // sit on Monaco's undo stack because they have to — an untracked applyEdits
  // would leave older entries' offsets stale — but the user must never land on
  // one. Undoing a generated rewrite would revert the code pane's text while
  // the canvas kept the change, and there is no way back from that.
  const { app, appWindow, projectDir } = await bootSplit('floor')

  // A canvas edit first, so the buffer definitely carries a generated rewrite.
  await canvasAppend(appWindow, 'generated-rewrite')
  await appWindow.waitForTimeout(300)

  await typeInCodePane(appWindow, 'USERTYPED')
  await appWindow.waitForTimeout(200)
  expect((await probe(appWindow)).code).toContain('USERTYPED')

  // First undo: the user's own typing goes.
  await undo(appWindow)
  await appWindow.waitForTimeout(500)
  const afterFirst = await probe(appWindow)
  expect(afterFirst.code).not.toContain('USERTYPED')
  // The generated rewrite is NOT collateral damage.
  expect(afterFirst.code).toContain('generated-rewrite')

  // Second undo: the code pane is back at the floor, so routing hands over to
  // the canvas stack rather than unwinding into the generated rewrite.
  await undo(appWindow)
  await appWindow.waitForTimeout(800)
  const afterSecond = await probe(appWindow)
  expect(afterSecond.canvas).not.toContain('generated-rewrite')
  expect(afterSecond.code).not.toContain('generated-rewrite')

  await teardown(app, projectDir)
})

test('split: undo does not leak content across page tabs', async () => {
  // The shared Monaco pair (one for the whole app — page-state.js documents a
  // per-tab monacoState that was never implemented) used to have its history
  // cleared as a side effect of setValue on every sync. Now that the sync
  // preserves history on purpose, swapToTab has to request the clear, or
  // Ctrl+Z on page B would splice page A's markup into it.
  const { app, appWindow, projectDir } = await bootSplit('cross-tab')

  await canvasAppend(appWindow, 'page-a-only')
  await typeInCodePane(appWindow, 'PAGEATEXT')
  await appWindow.waitForTimeout(300)

  await appWindow.evaluate(() => {
    const { projectState, pageState } = window.__gstrap
    projectState.current.pages.push({ name: 'about', html: '<main><h1>about</h1></main>', head: {} })
    projectState.markPageDirty('about')
    pageState.open('about')
  })
  await appWindow.waitForTimeout(800)
  await appWindow.evaluate(() => window.__gstrap.pageState.setViewMode('about', 'split'))
  await appWindow.waitForTimeout(600)

  const onB = await probe(appWindow)
  expect(onB.code).not.toContain('page-a-only')
  expect(onB.code).not.toContain('PAGEATEXT')

  // Hammer undo on page B — page A's content must never appear.
  await focusCodePane(appWindow)
  for (let i = 0; i < 4; i++) {
    await undo(appWindow)
    await appWindow.waitForTimeout(250)
  }
  const afterUndos = await probe(appWindow)
  expect(afterUndos.code).not.toContain('page-a-only')
  expect(afterUndos.code).not.toContain('PAGEATEXT')
  expect(afterUndos.canvas).not.toContain('page-a-only')

  await teardown(app, projectDir)
})

test('split: every undo entry point performs exactly one step', async () => {
  // eventBus command, toolbar button and the native Edit▸Undo menu item all
  // converge on cmdUndo, and the renderer keybinding mirrors the accelerator.
  // Pins that none of them double-fires (two undos per keypress would read as
  // "undo jumps too far" and was a live hypothesis for this report).
  const { app, appWindow, projectDir } = await bootSplit('entry-points')

  const oneStep = async fire => {
    await canvasAppend(appWindow, 'step-one')
    await canvasAppend(appWindow, 'step-two')
    await blurAll(appWindow)
    await fire()
    await appWindow.waitForTimeout(700)
    const after = await probe(appWindow)
    return { keptFirst: after.canvas.includes('step-one'), droppedSecond: !after.canvas.includes('step-two') }
  }

  expect(await oneStep(() => undo(appWindow))).toEqual({ keptFirst: true, droppedSecond: true })

  expect(await oneStep(() => appWindow.evaluate(
    () => document.querySelector('[data-cmd="edit:undo"]')?.click()
  ))).toEqual({ keptFirst: true, droppedSecond: true })

  expect(await oneStep(() => app.evaluate(({ Menu }) => {
    const edit = Menu.getApplicationMenu()?.items.find(i => i.label === '&Edit')
    const item = edit?.submenu?.items.find(i => (i.label || '').replace(/&/g, '') === 'Undo')
    if (item) item.click()
  }))).toEqual({ keptFirst: true, droppedSecond: true })

  await teardown(app, projectDir)
})

test('code-only view still routes undo by FOCUS, not by edit origin', async () => {
  // Guards the v0.1.1 fix (nola1: "Ctrl+Z doesn't work in code view"). The
  // origin routing added for Split view must not bleed into pure Code view:
  // there, the focused editor still wins.
  const { app, appWindow, projectDir } = await bootSplit('code-only')
  const pageName = await appWindow.evaluate(() => window.__gstrap.pageState.active()?.pageName)

  // A canvas edit gives the design stack something to lose if routing is wrong.
  await canvasAppend(appWindow, 'canvas-must-survive')
  await appWindow.evaluate(n => window.__gstrap.pageState.setViewMode(n, 'code'), pageName)
  await appWindow.waitForTimeout(400)

  await typeInCodePane(appWindow, 'CODEONLYMARK')
  await appWindow.waitForTimeout(200)
  expect((await probe(appWindow)).code).toContain('CODEONLYMARK')

  await focusCodePane(appWindow)
  await undo(appWindow)
  await appWindow.waitForTimeout(500)

  const after = await probe(appWindow)
  expect(after.code).not.toContain('CODEONLYMARK')
  // The canvas stack was NOT rewound by a code-view undo.
  expect(after.canvas).toContain('canvas-must-survive')

  await teardown(app, projectDir)
})
