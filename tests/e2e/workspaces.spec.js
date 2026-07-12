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
import { launch, openSeedProject } from './helpers.js'

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
