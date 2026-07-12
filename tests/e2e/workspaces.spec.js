/**
 * GrapeStrap — E2E: workspace layouts
 *
 * PATH: tests/e2e/workspaces.spec.js
 * ROLE: Wave 3 workspace-layouts specs — listener-leak fire-once (failing-first
 *       against da11442), editor-identity survival, geometry round-trip,
 *       relaunch persistence, presets, splitter floor after apply, collapsed
 *       right-stack round-trip, corrupt-layout fail-open, delete/rename
 * DEPENDS: @playwright/test, ./helpers.js
 * CREATED: 2026-07-12
 */
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { launch, openSeedProject, dismissWelcome } from './helpers.js'

// Left / center / right stack pixel widths, document order (same indexing as
// panels-layout.spec.js).
function stackWidths(appWindow) {
  return appWindow.evaluate(() =>
    [...document.querySelectorAll('#gstrap-main .lm_stack')]
      .map(s => Math.round(s.getBoundingClientRect().width)))
}

function resetLayoutCmd(appWindow) {
  return appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'view:reset-layout'))
}

// Events with at least one panel-factory subscription each (PLAN.md §1 table).
// Threaded as a waitForFunction/evaluate arg — never referenced inside browser
// closures directly (browser closures can't see Node consts).
const PROBE_EVENTS = [
  'project:opened',          // file-manager + library-items + asset-manager + custom-css
  'canvas:content-changed',  // canvas + dom-tree
  'library:changed',         // library-items
  'assets:changed',          // asset-manager
  'canvas:selected'          // dom-tree + properties-side
]

// ─── Spec 1 — listener-leak fire-once (MUST run RED against da11442) ─────────
//
// Reset Layout today (`view:reset-layout` → resetLayout() → GL loadLayout)
// re-invokes all 7 registered panel factories. On the pre-fix build every
// re-run stacks another eventBus.on() per panel (and rebuilds GrapesJS +
// Monaco wholesale), so every probe count grows per reset. Green requires the
// Stage-2 idempotency pass.
test('reset-layout 3x: panel factories do not duplicate subscriptions or hosts', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-ws-leak-'))
  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, join(projectDir, 'leak.gstrap'))

  const counts = (events) => appWindow.evaluate(
    evs => evs.map(e => window.__gstrap?.eventBus?.listenerCount?.(e) ?? -1),
    events
  )

  const baseline = await counts(PROBE_EVENTS)
  expect(baseline.every(n => n > 0)).toBe(true)   // probes actually wired

  for (let i = 0; i < 3; i++) {
    await appWindow.evaluate(() => window.__gstrap.eventBus.emit('command', 'view:reset-layout'))
    await appWindow.waitForTimeout(250)            // stateChanged rAF settle
  }

  // RED on da11442: every factory re-run stacks another eventBus.on()
  expect(await counts(PROBE_EVENTS)).toEqual(baseline)

  // Exactly one live host per panel — no zombie/duplicate panels.
  const hostCounts = await appWindow.evaluate(() => ({
    fm:     document.querySelectorAll('.gstrap-fm-host').length,
    dom:    document.querySelectorAll('.gstrap-dom-host').length,
    canvas: document.querySelectorAll('.gstrap-canvas-host').length,
    css:    document.querySelectorAll('.gstrap-cssp-host').length
  }))
  expect(hostCounts).toEqual({ fm: 1, dom: 1, canvas: 1, css: 1 })

  // Stale-host regression pin: the CURRENT file-manager host must repaint on
  // a dirty-flag event. A stale-host closure repaints the detached pre-reset
  // host instead, so the live host never shows the is-dirty row.
  await appWindow.evaluate(() => {
    const ps = window.__gstrap.projectState
    ps.markPageDirty(ps.current.pages[0].name)
  })
  const fmAlive = await appWindow.waitForFunction(
    () => document.querySelector('.gstrap-fm-host')?.querySelector('.gstrap-fm-item.is-dirty') != null,
    null, { timeout: 3_000 }
  )
  expect(fmAlive).toBeTruthy()

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

// ─── Spec 2 — canvas content + editor identity survive applies (F3) ─────────
test('canvas content + editor identity survive workspace applies', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-ws-canvas-'))
  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, join(projectDir, 'canvas.gstrap'))

  // Add an element and tag the live editor instance with a marker property —
  // a rebuilt editor (the pre-fix behavior) would not carry the marker.
  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    ed.__wsIdentityMarker = 'original-editor'
    ed.getWrapper().append('<p data-testid="ws-marker">ws-marker-text</p>')
  })
  await appWindow.waitForTimeout(100)

  // The append dirty-flagged the page; the flag must survive the applies.
  expect(await appWindow.evaluate(() => window.__gstrap.projectState.dirtyPages.size))
    .toBeGreaterThan(0)

  for (let i = 0; i < 3; i++) {
    await resetLayoutCmd(appWindow)
    await appWindow.waitForTimeout(250)
  }

  const after = await appWindow.evaluate(() => {
    const ed = window.__gstrap?.pluginRegistry?.bound?.editor
    return {
      marker: ed?.__wsIdentityMarker ?? null,
      html: ed?.getHtml?.() || '',
      dirty: window.__gstrap?.projectState?.dirtyPages?.size ?? -1
    }
  })
  expect(after.marker).toBe('original-editor')     // same editor instance
  expect(after.html).toContain('ws-marker-text')   // component still on canvas
  expect(after.dirty).toBeGreaterThan(0)           // dirty flag intact

  // Subsequent edits still dirty-flag through the surviving editor + sync chain.
  await appWindow.evaluate(() => {
    window.__gstrap.projectState.markAllClean()
    const ed = window.__gstrap.pluginRegistry.bound.editor
    ed.getWrapper().append('<p data-testid="ws-marker-2">second-edit</p>')
  })
  await appWindow.waitForFunction(
    () => window.__gstrap?.projectState?.dirtyPages?.size > 0, null, { timeout: 3_000 })

  // Stale-host regression pin: the live file-manager host shows the dirty row.
  const fmDirty = await appWindow.waitForFunction(
    () => document.querySelector('.gstrap-fm-host')?.querySelector('.gstrap-fm-item.is-dirty') != null,
    null, { timeout: 3_000 })
  expect(fmDirty).toBeTruthy()

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

// ─── Spec 3 — geometry round-trip through save → reset → apply ──────────────
test('workspace geometry round-trips through save, reset, apply', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-ws-geo-'))
  const { app, appWindow, xdgRoot } = await launch()
  await openSeedProject(appWindow, join(projectDir, 'geo.gstrap'))

  // Show the DOM tab (hidden by default prefs) so the activeItemIndex
  // round-trip below is meaningful.
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('view:toggle-dom-tree'))
  await appWindow.waitForTimeout(150)

  // Mutate geometry programmatically (spec 6 owns real-mouse behavior).
  await appWindow.evaluate(() => {
    const root = window.__gstrap.workspaces._layoutRootForTest()
    root.contentItems[0].size = 25    // left stack 18 → 25
    root.contentItems[2].size = 20    // right stack 26 → 20
    window.__gstrap.workspaces.requestRelayout()
  })
  await appWindow.waitForTimeout(200)
  await appWindow.evaluate(() => document.querySelector('.lm_tab[title="DOM"]')?.click())
  await appWindow.waitForTimeout(150)

  const widthsBefore = await stackWidths(appWindow)
  expect(widthsBefore.length).toBe(3)

  const saved = await appWindow.evaluate(() => window.__gstrap.workspaces.save('test-a'))
  expect(saved?.ok).toBe(true)

  // File landed under the per-launch XDG state root, normalized shape.
  const file = join(xdgRoot, 'state', 'GrapeStrap', 'workspaces', 'test-a.json')
  const record = JSON.parse(await fsp.readFile(file, 'utf8'))
  expect(record.formatVersion).toBe(1)
  expect(record.name).toBe('test-a')
  expect(record.visibility?.domTreeVisible).toBe(true)

  await resetLayoutCmd(appWindow)
  await appWindow.waitForTimeout(250)

  // Reset restored the default 18/56/26 — left stack must differ from saved.
  const widthsReset = await stackWidths(appWindow)
  expect(Math.abs(widthsReset[0] - widthsBefore[0])).toBeGreaterThan(15)

  const applied = await appWindow.evaluate(() => window.__gstrap.workspaces.apply('test-a'))
  expect(applied?.ok).toBe(true)
  await appWindow.waitForTimeout(250)

  const widthsAfter = await stackWidths(appWindow)
  widthsBefore.forEach((w, i) =>
    expect(Math.abs(widthsAfter[i] - w), `stack ${i} width`).toBeLessThanOrEqual(10))

  // Active tab restored (DOM active on the right stack).
  expect(await appWindow.evaluate(() =>
    document.querySelector('.lm_tab.lm_active[title="DOM"]') != null)).toBe(true)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

// ─── Spec 4 — relaunch persistence (pinned XDG_STATE_HOME) ───────────────────
test('saved workspaces persist across app relaunch', async () => {
  const first = await launch()
  const savedState = join(first.xdgRoot, 'state')
  // launch() only waits for the event bus — capture needs GL initialised.
  await first.appWindow.waitForFunction(
    () => document.querySelectorAll('#gstrap-main .lm_stack').length === 3,
    null, { timeout: 10_000 })
  const saved = await first.appWindow.evaluate(() => window.__gstrap.workspaces.save('test-b'))
  expect(saved?.ok).toBe(true)
  await first.app.close()

  // Relaunch pinning the SAME state root (helpers.js spreads extraEnv after
  // the per-launch isolation defaults, so one var override works).
  const second = await launch({ XDG_STATE_HOME: savedState })
  await second.appWindow.waitForFunction(
    () => document.querySelectorAll('#gstrap-main .lm_stack').length === 3,
    null, { timeout: 10_000 })
  const names = await second.appWindow.evaluate(() => window.__gstrap.workspaces.list())
  expect(names).toContain('test-b')
  const applied = await second.appWindow.evaluate(() => window.__gstrap.workspaces.apply('test-b'))
  expect(applied?.ok).toBe(true)
  await second.app.close()
})

// ─── Spec 5 — presets (Compact hides chrome + widens canvas; Designer restores) ─
test('Compact and Designer presets reshape geometry and visibility', async () => {
  const { app, appWindow } = await launch()
  await appWindow.waitForFunction(
    () => document.querySelectorAll('#gstrap-main .lm_stack').length === 3,
    null, { timeout: 10_000 })

  const before = await stackWidths(appWindow)
  const insertHiddenBefore = await appWindow.evaluate(
    () => document.getElementById('gstrap-insert')?.hidden ?? null)
  expect(insertHiddenBefore).toBe(false)

  const compact = await appWindow.evaluate(() => window.__gstrap.workspaces.apply('Compact'))
  expect(compact?.ok).toBe(true)
  await appWindow.waitForTimeout(250)

  const compactWidths = await stackWidths(appWindow)
  // Center share grows past the default 56% → 76% recipe.
  expect(compactWidths[1]).toBeGreaterThan(before[1] + 100)
  const compactChrome = await appWindow.evaluate(() => ({
    insert: document.getElementById('gstrap-insert')?.hidden ?? null,
    strip:  document.getElementById('gstrap-strip')?.hidden ?? null,
    status: document.getElementById('gstrap-status')?.hidden ?? null
  }))
  expect(compactChrome).toEqual({ insert: true, strip: true, status: true })

  const designer = await appWindow.evaluate(() => window.__gstrap.workspaces.apply('Designer'))
  expect(designer?.ok).toBe(true)
  await appWindow.waitForTimeout(250)

  const designerWidths = await stackWidths(appWindow)
  before.forEach((w, i) =>
    expect(Math.abs(designerWidths[i] - w), `stack ${i} width`).toBeLessThanOrEqual(10))
  const designerChrome = await appWindow.evaluate(() => ({
    insert: document.getElementById('gstrap-insert')?.hidden ?? null,
    strip:  document.getElementById('gstrap-strip')?.hidden ?? null,
    status: document.getElementById('gstrap-status')?.hidden ?? null,
    domTabHidden: document.body.classList.contains('is-hide-dom-tree')
  }))
  // Designer re-asserts ALL panels visible (incl. the default-hidden DOM tab).
  expect(designerChrome).toEqual({ insert: false, strip: false, status: false, domTabHidden: false })

  await app.close()
})

// ─── Spec 6 — real-mouse splitter floor survives apply (pins normalizeFloors) ─
test('splitter drag after workspace apply: shrink works, clamps at stack floor', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-ws-floor-'))
  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, join(projectDir, 'floor.gstrap'))
  await dismissWelcome(appWindow)

  await appWindow.setViewportSize({ width: 1200, height: 800 })
  await appWindow.waitForTimeout(400)

  // Round-trip the current layout through save → apply so the drag below
  // exercises the RE-STAMPED floors (normalizeFloors), not the boot config.
  const saved = await appWindow.evaluate(() => window.__gstrap.workspaces.save('test-f'))
  expect(saved?.ok).toBe(true)
  const applied = await appWindow.evaluate(() => window.__gstrap.workspaces.apply('test-f'))
  expect(applied?.ok).toBe(true)
  await appWindow.waitForTimeout(400)

  const stackWidth = i => appWindow.evaluate(idx => {
    const stacks = document.querySelectorAll('#gstrap-main .lm_stack')
    return stacks[idx]?.getBoundingClientRect().width ?? -1
  }, i)

  const dragSplitter = async (idx, dx) => {
    const box = await appWindow.evaluate(i => {
      const s = document.querySelectorAll('#gstrap-main .lm_splitter')[i]
      const r = s.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    }, idx)
    await appWindow.mouse.move(box.x, box.y)
    await appWindow.mouse.down()
    await appWindow.mouse.move(box.x + dx / 2, box.y)
    await appWindow.mouse.move(box.x + dx, box.y)
    await appWindow.mouse.up()
    await appWindow.waitForTimeout(300) // dragStop applies sizes on rAF
  }

  // Shrink works — no forced jump out to a summed floor.
  const leftBefore = await stackWidth(0)
  await dragSplitter(0, -30)
  const leftAfter = await stackWidth(0)
  expect(leftAfter).toBeLessThan(leftBefore)
  expect(Math.abs(leftBefore - 30 - leftAfter)).toBeLessThan(15)

  // The per-stack floor still holds after apply: a huge shrink clamps at
  // ~180px (3 tabs × 60px re-stamped per-tab minSize), not 0, not 540.
  await dragSplitter(0, -100)
  const leftFloor = await stackWidth(0)
  expect(Math.abs(leftFloor - 180)).toBeLessThan(15)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

// ─── Spec 7 — collapsed-right-stack round-trip (F6) ──────────────────────────
test('workspace saved with all right tabs hidden round-trips the collapse', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-ws-collapse-'))
  const { app, appWindow } = await launch()
  await openSeedProject(appWindow, join(projectDir, 'collapse.gstrap'))

  const rightStackWidth = () => appWindow.evaluate(() => {
    const stack = document.querySelector('.lm_item.lm_stack:has(.gstrap-dom-host)')
    return stack ? Math.round(stack.getBoundingClientRect().width) : -1
  })
  const canvasStackWidth = () => appWindow.evaluate(() => {
    const stack = document.querySelector('.lm_item.lm_stack:has(.gstrap-canvas-host)')
    return stack ? Math.round(stack.getBoundingClientRect().width) : -1
  })

  const rightBaseline = await rightStackWidth()
  const canvasBaseline = await canvasStackWidth()
  expect(rightBaseline).toBeGreaterThan(100)

  // Hide all three right tabs → stack collapses. DOM is already hidden by
  // default prefs; hide the other two.
  await appWindow.evaluate(() => {
    window.__gstrap.eventBus.emit('view:toggle-properties')
    window.__gstrap.eventBus.emit('view:toggle-custom-css')
  })
  await appWindow.waitForTimeout(250)
  expect(await rightStackWidth()).toBeLessThan(10)

  const saved = await appWindow.evaluate(() => window.__gstrap.workspaces.save('test-c'))
  expect(saved?.ok).toBe(true)

  // Reset Layout keeps its contract: geometry only — stack back at 26%,
  // visibility (body classes) untouched.
  await resetLayoutCmd(appWindow)
  await appWindow.waitForTimeout(250)
  expect(await rightStackWidth()).toBeGreaterThan(100)

  // Apply the saved workspace → visibility re-collapses the stack, canvas wide.
  const applied = await appWindow.evaluate(() => window.__gstrap.workspaces.apply('test-c'))
  expect(applied?.ok).toBe(true)
  await appWindow.waitForTimeout(250)
  expect(await rightStackWidth()).toBeLessThan(10)
  expect(await canvasStackWidth()).toBeGreaterThan(canvasBaseline + 100)

  // Toggle DOM back on: the NEW items got a fresh collapse snapshot at apply
  // time (F6), so the stack restores at its pre-collapse (expanded) share —
  // not stranded at size 0.
  await appWindow.evaluate(() => window.__gstrap.eventBus.emit('view:toggle-dom-tree'))
  await appWindow.waitForTimeout(250)
  const rightRestored = await rightStackWidth()
  expect(Math.abs(rightRestored - rightBaseline)).toBeLessThan(15)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

// ─── Spec 8 — corrupt/unknown layouts fail open (F1/F2) ──────────────────────
test('corrupt workspace files are skipped by list and fail open on apply', async () => {
  const projectDir = await fsp.mkdtemp(join(tmpdir(), 'gstrap-ws-corrupt-'))
  const { app, appWindow, xdgRoot } = await launch()
  await openSeedProject(appWindow, join(projectDir, 'corrupt.gstrap'))

  await appWindow.evaluate(() => {
    const ed = window.__gstrap.pluginRegistry.bound.editor
    ed.getWrapper().append('<p data-testid="ws-survivor">survivor-text</p>')
  })

  // Plant three bad files: unparseable JSON, wrong shape, and a shape-valid
  // layout referencing an unregistered componentType (disabled-plugin case).
  const wsDir = join(xdgRoot, 'state', 'GrapeStrap', 'workspaces')
  await fsp.mkdir(wsDir, { recursive: true })
  await fsp.writeFile(join(wsDir, 'bad1.json'), 'not json {{{', 'utf8')
  await fsp.writeFile(join(wsDir, 'bad2.json'), '{"hello":"world"}', 'utf8')
  await fsp.writeFile(join(wsDir, 'ghost.json'), JSON.stringify({
    formatVersion: 1,
    name: 'Ghost',
    visibility: {},
    gl: { root: { type: 'row', content: [
      { type: 'stack', content: [
        { type: 'component', componentType: 'ghost-panel', title: 'Ghost' }
      ] }
    ] } }
  }), 'utf8')

  // list: shape-valid Ghost is listed; the two corrupt files are skipped.
  const names = await appWindow.evaluate(() => window.__gstrap.workspaces.list())
  expect(names).toContain('Ghost')
  expect(names.some(n => n.includes('bad'))).toBe(false)

  const widthsBefore = await stackWidths(appWindow)

  // Unknown componentType → pre-validation rejects before teardown.
  const ghost = await appWindow.evaluate(() => window.__gstrap.workspaces.apply('Ghost'))
  expect(ghost?.ok).toBe(false)

  // Unparseable file → read fails soft, apply refuses.
  const bad = await appWindow.evaluate(() => window.__gstrap.workspaces.apply('bad1'))
  expect(bad?.ok).toBe(false)

  // Current layout + canvas content untouched; app still functional.
  const widthsAfter = await stackWidths(appWindow)
  expect(widthsAfter).toEqual(widthsBefore)
  const state = await appWindow.evaluate(() => ({
    html: window.__gstrap?.pluginRegistry?.bound?.editor?.getHtml?.() || '',
    canvasHosts: document.querySelectorAll('.gstrap-canvas-host').length
  }))
  expect(state.html).toContain('survivor-text')
  expect(state.canvasHosts).toBe(1)

  // Still functional: a preset apply works after the failures.
  const recover = await appWindow.evaluate(() => window.__gstrap.workspaces.apply('Designer'))
  expect(recover?.ok).toBe(true)

  await app.close()
  await fsp.rm(projectDir, { recursive: true, force: true })
})

// ─── Spec 9 — delete + rename + name validation (F4/F5) ──────────────────────
test('workspace delete, rename, and name validation', async () => {
  const { app, appWindow, xdgRoot } = await launch()
  await appWindow.waitForFunction(
    () => document.querySelectorAll('#gstrap-main .lm_stack').length === 3,
    null, { timeout: 10_000 })
  const wsDir = join(xdgRoot, 'state', 'GrapeStrap', 'workspaces')

  const call = (fn, ...fnArgs) => appWindow.evaluate(
    ([f, a]) => window.__gstrap.workspaces[f](...a), [fn, fnArgs])

  // Save + duplicate/preset/charset rejections (inline refusal, no overwrite).
  expect((await call('save', 'test-d'))?.ok).toBe(true)
  expect((await call('save', 'test-d'))?.ok).toBe(false)          // duplicate
  expect((await call('save', 'Test D'))?.ok).toBe(false)          // slug collision
  expect((await call('save', 'Designer'))?.ok).toBe(false)        // preset shadow
  expect((await call('save', 'designer'))?.ok).toBe(false)        // preset, case
  expect((await call('save', '../evil'))?.ok).toBe(false)         // charset/traversal
  expect((await call('save', 'x'.repeat(42)))?.ok).toBe(false)    // 41-char cap
  await fsp.access(join(wsDir, 'test-d.json'))                    // file exists

  // Rename: old file gone, new one applies.
  expect((await call('rename', 'test-d', 'test-e'))?.ok).toBe(true)
  await fsp.access(join(wsDir, 'test-e.json'))
  await expect(fsp.access(join(wsDir, 'test-d.json'))).rejects.toThrow()
  let names = await call('list')
  expect(names).toContain('test-e')
  expect(names).not.toContain('test-d')
  expect((await call('apply', 'test-e'))?.ok).toBe(true)
  expect((await call('rename', 'test-e', 'bad/name'))?.ok).toBe(false)

  // Delete: file unlinked, list updated; second delete reports not-found.
  expect((await call('delete', 'test-e'))?.ok).toBe(true)
  await expect(fsp.access(join(wsDir, 'test-e.json'))).rejects.toThrow()
  names = await call('list')
  expect(names).not.toContain('test-e')
  expect((await call('delete', 'test-e'))?.ok).toBe(false)

  await app.close()
})
