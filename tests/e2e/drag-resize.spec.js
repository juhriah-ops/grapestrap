// =============================================================
// PATH: tests/e2e/drag-resize.spec.js
// ROLE: Wave 2 drag-to-resize specs — REAL mouse drags into the canvas
//       iframe. Covers: column drag snaps to col-N at desktop fill; the
//       same drag at a slider-narrowed breakpoint writes col-md-N (base
//       class retained); ONE undo restores the pre-drag class set; image
//       width snap w-50→w-100; margin edge drag → mt-3; ghost + badge
//       visible mid-drag and gone after release.
//       Coordinate bridge: Playwright's mouse works in host-window coords —
//       windowXY = Canvas.getFrameEl().getBoundingClientRect() + the
//       iframe-internal client coords (frame is CSS-width sized, never
//       transformed, so scale factor is 1; see drag-resize.js header).
//       If real-mouse routing into the iframe proves flaky under xvfb, the
//       fallback is dispatching PointerEvents into the iframe document via
//       evaluate — flag to the integrator before rewriting.
// DEPENDS: ./helpers.js (launch, openSeedProject, selectFirstByTag,
//          dismissWelcome), @playwright/test
// CREATED: 2026-07-12
// UPDATED: 2026-08-18 — added the two attach-gate specs at the bottom: a
//          CONTAINER (a div with element children) must get handles, and a
//          locked component must not. The gate used to read
//          `editable === false`, which GrapesJS reports on every structural
//          component, so containers — sections, rows, cards, plain divs —
//          silently never got a resize surface and only text-ish leaves did.
//          Every drag spec above this line drags a text-only element, which is
//          exactly why none of them caught it.
// =============================================================
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, selectFirstByTag, dismissWelcome } from './helpers.js'

// 1x1-viewBox SVG data URI — a real image box (200x100 intrinsic) without a
// file fixture; broken-image boxes have no reliable layout to drag against.
const SVG_SRC = 'data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%27200%27%20height=%27100%27%3E%3C/svg%3E'

const selectedClasses = appWindow => appWindow.evaluate(
  () => window.__gstrap?.pluginRegistry?.bound?.editor?.getSelected?.()?.getClasses?.() || null)

/** Seed a two-column row into the canvas and select the first column. */
async function seedRowSelectFirstCol(appWindow) {
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const added = ed.getWrapper().append(
      '<div class="row"><div class="col-6">left col</div><div class="col-6">right col</div></div>')
    const row = Array.isArray(added) ? added[0] : added
    ed.select(row.components().at(0))
  })
  await waitForHandle(appWindow, 'col')
}

/** Wait until a drag handle of the given kind exists in the iframe. */
function waitForHandle(appWindow, kind) {
  return appWindow.waitForFunction(k => {
    const doc = window.__gstrap?.pluginRegistry?.bound?.editor
      ?.Canvas?.getFrameEl?.()?.contentDocument
    return !!doc?.querySelector(`[data-dragr-kind="${k}"]`)
  }, kind, { timeout: 5_000 })
}

/** Host-window coords of a drag handle's center (frame rect + iframe rect). */
function handlePoint(appWindow, kind) {
  return appWindow.evaluate(k => {
    const ed = window.__gstrap?.pluginRegistry?.bound?.editor
    const frame = ed?.Canvas?.getFrameEl?.()
    const h = frame?.contentDocument?.querySelector(`[data-dragr-kind="${k}"]`)
    if (!frame || !h) return null
    const fr = frame.getBoundingClientRect()
    const r = h.getBoundingClientRect()
    return { x: fr.left + r.left + r.width / 2, y: fr.top + r.top + r.height / 2 }
  }, kind)
}

/** Host-window point at the selected column's left edge + n grid units. */
function colTargetPoint(appWindow, n) {
  return appWindow.evaluate(units => {
    const ed = window.__gstrap?.pluginRegistry?.bound?.editor
    const frame = ed?.Canvas?.getFrameEl?.()
    const el = ed?.getSelected?.()?.getEl?.()
    if (!frame || !el || !el.parentElement) return null
    const fr = frame.getBoundingClientRect()
    const rect = el.getBoundingClientRect()
    const unit = el.parentElement.getBoundingClientRect().width / 12
    return { x: fr.left + rect.left + unit * units, y: fr.top + rect.top + rect.height / 2 }
  }, n)
}

/** Real-mouse drag with intermediate moves (splitter-spec pattern — the
 *  handler needs to see genuine movement, not a teleport). */
async function dragMouse(appWindow, from, to) {
  await appWindow.mouse.move(from.x, from.y)
  await appWindow.mouse.down()
  await appWindow.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2)
  await appWindow.mouse.move(to.x, to.y)
  await appWindow.mouse.up()
  await appWindow.waitForTimeout(150) // class write is sync; settle repaints
}

/** Narrow the canvas via the real breakpoint slider (fires its input path). */
async function setCanvasWidth(appWindow, px) {
  const ok = await appWindow.evaluate(w => {
    const s = document.querySelector('[data-bp-slider]')
    if (!s) return false
    s.value = String(w)
    s.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  }, px)
  expect(ok).toBe(true)
  await appWindow.waitForTimeout(250) // frame restyle + RO relayout settle
}

test('drag-resize: column drag at desktop fill snaps to base col-9', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-dragr-'))
  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, join(projectDir, 'dragr.gstrap'))
  await dismissWelcome(appWindow)
  await seedRowSelectFirstCol(appWindow)

  const from = await handlePoint(appWindow, 'col')
  const to = await colTargetPoint(appWindow, 9)
  expect(from).not.toBeNull()
  expect(to).not.toBeNull()
  await dragMouse(appWindow, from, to)

  const classes = await selectedClasses(appWindow)
  expect(classes).not.toBeNull()
  expect(classes).toContain('col-9')       // base class at fill width — NOT col-xl-9
  expect(classes).not.toContain('col-6')

  // Sibling column untouched.
  const sibling = await appWindow.evaluate(() => {
    const ed = window.__gstrap?.pluginRegistry?.bound?.editor
    const row = ed?.getSelected?.()?.parent?.()
    return row?.components?.()?.at?.(1)?.getClasses?.() || null
  })
  expect(sibling).toContain('col-6')
  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('drag-resize: same drag at a narrowed breakpoint writes col-md-9 and keeps base col-6', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-dragr-'))
  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, join(projectDir, 'dragr-bp.gstrap'))
  await dismissWelcome(appWindow)
  await seedRowSelectFirstCol(appWindow)

  await setCanvasWidth(appWindow, 768) // md per the breakpoint bar thresholds

  // Re-derive points AFTER the narrow — the frame is now letterboxed/centered.
  const from = await handlePoint(appWindow, 'col')
  const to = await colTargetPoint(appWindow, 9)
  expect(from).not.toBeNull()
  expect(to).not.toBeNull()
  await dragMouse(appWindow, from, to)

  const classes = await selectedClasses(appWindow)
  expect(classes).not.toBeNull()
  expect(classes).toContain('col-md-9')
  expect(classes).toContain('col-6') // base breakpoint class must survive
  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('drag-resize: ONE undo restores the exact pre-drag class set', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-dragr-'))
  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, join(projectDir, 'dragr-undo.gstrap'))
  await dismissWelcome(appWindow)
  await seedRowSelectFirstCol(appWindow)

  const before = await selectedClasses(appWindow)
  expect(before).toContain('col-6')

  const from = await handlePoint(appWindow, 'col')
  const to = await colTargetPoint(appWindow, 9)
  expect(from).not.toBeNull()
  expect(to).not.toBeNull()
  await dragMouse(appWindow, from, to)
  expect(await selectedClasses(appWindow)).toContain('col-9')

  // ONE undo — no stripped intermediate state (applyGroup single-write contract).
  await appWindow.evaluate(() => window.__gstrap.pluginRegistry.bound.editor.UndoManager.undo())
  expect([...((await selectedClasses(appWindow)) || [])].sort()).toEqual([...before].sort())

  // ONE redo brings the drag result back.
  await appWindow.evaluate(() => window.__gstrap.pluginRegistry.bound.editor.UndoManager.redo())
  expect(await selectedClasses(appWindow)).toContain('col-9')
  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('drag-resize: image right-edge drag snaps w-50 to w-100', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-dragr-'))
  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, join(projectDir, 'dragr-img.gstrap'))
  await dismissWelcome(appWindow)

  await appWindow.evaluate(src => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    ed.getWrapper().append(`<div class="container"><img class="w-50" alt="drag target" src="${src}"></div>`)
  }, SVG_SRC)
  await selectFirstByTag(appWindow, 'img')
  await waitForHandle(appWindow, 'img')

  const from = await handlePoint(appWindow, 'img')
  const to = await appWindow.evaluate(() => {
    const ed = window.__gstrap?.pluginRegistry?.bound?.editor
    const frame = ed?.Canvas?.getFrameEl?.()
    const el = ed?.getSelected?.()?.getEl?.()
    if (!frame || !el || !el.parentElement) return null
    const fr = frame.getBoundingClientRect()
    const rect = el.getBoundingClientRect()
    const parentRect = el.parentElement.getBoundingClientRect()
    return { x: fr.left + rect.left + parentRect.width * 0.97, y: fr.top + rect.top + rect.height / 2 }
  })
  expect(from).not.toBeNull()
  expect(to).not.toBeNull()
  await dragMouse(appWindow, from, to)

  const classes = await selectedClasses(appWindow)
  expect(classes).not.toBeNull()
  expect(classes).toContain('w-100')
  expect(classes).not.toContain('w-50')
  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('drag-resize: top margin strip drag writes mt-3', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-dragr-'))
  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, join(projectDir, 'dragr-m.gstrap'))
  await dismissWelcome(appWindow)

  // Seed h1 (class="display-5 fw-bold") — strip grabbed at horizontal CENTER,
  // clear of the GrapesJS toolbar that hovers over the top-LEFT corner.
  await selectFirstByTag(appWindow, 'h1')
  await waitForHandle(appWindow, 'margin-t')

  const from = await handlePoint(appWindow, 'margin-t')
  expect(from).not.toBeNull()
  // 16px outward (up) → nearest $spacers step is 1rem = scale 3 → mt-3.
  await dragMouse(appWindow, from, { x: from.x, y: from.y - 16 })

  const classes = await selectedClasses(appWindow)
  expect(classes).not.toBeNull()
  expect(classes).toContain('mt-3')
  expect(classes).toEqual(expect.arrayContaining(['display-5', 'fw-bold'])) // untouched
  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('drag-resize: ghost outline and class badge visible mid-drag, gone after release', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-dragr-'))
  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, join(projectDir, 'dragr-ghost.gstrap'))
  await dismissWelcome(appWindow)
  await seedRowSelectFirstCol(appWindow)

  const from = await handlePoint(appWindow, 'col')
  const to = await colTargetPoint(appWindow, 8)
  expect(from).not.toBeNull()
  expect(to).not.toBeNull()

  await appWindow.mouse.move(from.x, from.y)
  await appWindow.mouse.down()
  await appWindow.mouse.move((from.x + to.x) / 2, from.y)
  await appWindow.mouse.move(to.x, to.y)

  // Mid-drag: ghost present, badge shows the live snap-target class.
  const mid = await appWindow.evaluate(() => {
    const doc = window.__gstrap?.pluginRegistry?.bound?.editor
      ?.Canvas?.getFrameEl?.()?.contentDocument
    return {
      ghost: !!doc?.querySelector('.gstrap-dragr-ghost'),
      badge: doc?.querySelector('.gstrap-dragr-badge')?.textContent || null
    }
  })
  expect(mid.ghost).toBe(true)
  expect(mid.badge).toMatch(/^col(-(?:sm|md|lg|xl|xxl))?-\d+$/)

  await appWindow.mouse.up()
  await appWindow.waitForTimeout(150)

  const after = await appWindow.evaluate(() => {
    const doc = window.__gstrap?.pluginRegistry?.bound?.editor
      ?.Canvas?.getFrameEl?.()?.contentDocument
    return {
      ghost: !!doc?.querySelector('.gstrap-dragr-ghost'),
      badge: !!doc?.querySelector('.gstrap-dragr-badge')
    }
  })
  expect(after.ghost).toBe(false)
  expect(after.badge).toBe(false)
  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

// ── Attach gate: which components get a resize surface at all ────────────────

/** Whether the resize overlay is up, and which handles are currently shown. */
function overlayState(appWindow) {
  return appWindow.evaluate(() => {
    const doc = window.__gstrap?.pluginRegistry?.bound?.editor
      ?.Canvas?.getFrameEl?.()?.contentDocument
    const overlay = doc?.querySelector('[data-gstrap-drag-overlay]')
    if (!overlay) return { present: false, kinds: [], visibleKinds: [] }
    const handles = [...overlay.querySelectorAll('[data-dragr-kind]')]
    return {
      present: true,
      kinds: handles.map(handle => handle.getAttribute('data-dragr-kind')),
      visibleKinds: handles
        .filter(handle => !handle.hidden)
        .map(handle => handle.getAttribute('data-dragr-kind'))
    }
  })
}

/** Wait for the overlay to be present (or gone, with present=false). */
function waitForOverlay(appWindow, present) {
  return appWindow.waitForFunction(want => {
    const doc = window.__gstrap?.pluginRegistry?.bound?.editor
      ?.Canvas?.getFrameEl?.()?.contentDocument
    return !!doc?.querySelector('[data-gstrap-drag-overlay]') === want
  }, present, { timeout: 5_000 })
}

test('drag-resize: a container div with element children gets resize handles', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-dragr-'))
  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, join(projectDir, 'dragr-container.gstrap'))
  await dismissWelcome(appWindow)

  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const added = ed.getWrapper().append(
      '<div class="feature-band"><div class="feature-inner"><p>Container copy</p></div></div>')
    ed.select(Array.isArray(added) ? added[0] : added)
  })
  await waitForOverlay(appWindow, true)

  const state = await overlayState(appWindow)
  expect(state.present).toBe(true)
  // All eight edge strips are built for the container…
  expect(state.kinds).toEqual(expect.arrayContaining([
    'margin-t', 'margin-e', 'margin-b', 'margin-s',
    'pad-t', 'pad-e', 'pad-b', 'pad-s'
  ]))
  // …and the horizontal pair is live: a full-width band clears MIN_EDGE_LEN
  // along the top and bottom. The left/right strips stay hidden here because a
  // one-line band is shorter than MIN_EDGE_LEN — that's layoutHandles() doing
  // its job, not the attach gate, which is what this spec is about.
  expect(state.visibleKinds).toEqual(expect.arrayContaining([
    'margin-t', 'margin-b', 'pad-t', 'pad-b'
  ]))

  // The misread this spec pins: the selected container reports editable:false
  // straight out of GrapesJS, with nothing locked. Reading that flag as a lock
  // is what kept the overlay above off every container in the app.
  const editableFlag = await appWindow.evaluate(
    () => window.__gstrap.pluginRegistry.bound.editor.getSelected().get('editable'))
  expect(editableFlag).toBe(false)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

test('drag-resize: a template-locked component gets no resize handles', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-dragr-'))
  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, join(projectDir, 'dragr-locked.gstrap'))
  await dismissWelcome(appWindow)

  // Two identical bands, one locked the way panels/templates/lock.js locks
  // chrome (removable:false is the flag both lock modules set — see
  // editor/component-lock.js). Selecting the unlocked one first proves the
  // overlay CAN mount here, so the locked assertion below can't pass by
  // asserting too early.
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const added = ed.getWrapper().append(
      '<div class="open-band"><p>Editable band</p></div>'
      + '<div class="locked-band"><p>Locked band</p></div>')
    added[1].set('removable', false)
    ed.select(added[0])
  })
  await waitForOverlay(appWindow, true)

  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    const locked = ed.getWrapper().components().models.find(
      component => (component.getClasses?.() || []).includes('locked-band'))
    ed.select(locked)
  })
  await waitForOverlay(appWindow, false)

  expect((await overlayState(appWindow)).present).toBe(false)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})
