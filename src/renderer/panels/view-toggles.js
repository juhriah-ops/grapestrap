/**
 * GrapeStrap — View toggle wiring
 *
 * Centralises the `view:toggle-*` event handlers that the menu router emits
 * (Ctrl+B file manager, Ctrl+J properties, etc.). Three flavours of region:
 *
 *   - **Fixed shell strips** (insert / inspector strip / status / linked
 *     files / breakpoints / tabs) — toggle the `hidden` attribute on the
 *     host element. The shell's grid-template-areas already collapses an
 *     `auto` row when the element has `display: none` (per shell.css), so
 *     the layout closes cleanly.
 *
 *   - **Left-stack tab** (file manager) — body-class CSS hides just the
 *     matching tab + content inside the Project / Library / Assets stack.
 *     The stack itself stays for the remaining tabs. Same pattern that the
 *     right-stack tabs use, just on the left.
 *
 *   - **Right-stack tabs** (DOM Tree, Properties, Custom CSS) — driven
 *     through `panel-visibility.js`. Each toggle adds/removes a body class
 *     that hides its `.lm_tab` + `.lm_content` host (CSS in
 *     golden-layout-overrides.css). If ALL three tabs end up hidden, the
 *     entire right stack is collapsed via the size-redistribute trick so
 *     the canvas reclaims its 26%; restoring any of the three brings the
 *     stack back. Consolidated 2026-05-05 per nola1 user request — "all
 *     of these separate views should all be on the right as tabs in one
 *     panel like the library and assets."
 *
 * Persistence: every toggle writes the visible-set into prefs.view (matches
 * the schema in src/main/prefs.js), so panel visibility survives a relaunch.
 */

import { eventBus } from '../state/event-bus.js'
import { log } from '../log.js'
import {
  hideRightTab, showRightTab, isRightTabHidden, applyInitialRightTabVisibility
} from '../layout/panel-visibility.js'

// Fixed shell strips. Element id → toggle event suffix.
const FIXED_REGIONS = {
  'view:toggle-tabs':    { id: 'gstrap-tabs',   prefKey: 'tabsVisible',          defaultVisible: true },
  'view:toggle-insert':  { id: 'gstrap-insert', prefKey: 'insertPanelVisible',   defaultVisible: true },
  'view:toggle-strip':   { id: 'gstrap-strip',  prefKey: 'propertyStripVisible', defaultVisible: true },
  'view:toggle-status':  { id: 'gstrap-status', prefKey: 'statusBarVisible',     defaultVisible: true }
}

// Left-stack tab: body-class CSS hide.
const LEFT_STACK_TABS = {
  'view:toggle-file-manager': { bodyClass: 'is-hide-file-manager', prefKey: 'fileManagerVisible', defaultVisible: true }
}

// Right-stack tabs: routed through panel-visibility.js so the stack itself
// auto-collapses when all three are hidden. `panelKey` matches the GL
// componentType so panel-visibility.js can find the ContentItem.
const RIGHT_STACK_TABS = {
  'view:toggle-dom-tree':    { panelKey: 'dom-tree',   prefKey: 'domTreeVisible',         defaultVisible: true },
  'view:toggle-properties':  { panelKey: 'properties', prefKey: 'propertiesPanelVisible', defaultVisible: true },
  'view:toggle-custom-css':  { panelKey: 'custom-css', prefKey: 'customCssVisible',       defaultVisible: true }
}

export async function wireViewToggles() {
  const stored = (await window.grapestrap?.prefs?.get?.('view')) || {}

  for (const [event, def] of Object.entries(FIXED_REGIONS)) {
    const visible = stored[def.prefKey] ?? def.defaultVisible
    setFixedVisible(def.id, visible)
    eventBus.on(event, () => toggleFixed(def))
  }

  for (const [event, def] of Object.entries(LEFT_STACK_TABS)) {
    const visible = stored[def.prefKey] ?? def.defaultVisible
    document.body.classList.toggle(def.bodyClass, !visible)
    eventBus.on(event, () => {
      document.body.classList.toggle(def.bodyClass)
      const nowVisible = !document.body.classList.contains(def.bodyClass)
      persist(def.prefKey, nowVisible)
    })
  }

  // Right-stack: build initial visibility map, apply once, then wire toggles.
  const initialMap = {}
  for (const def of Object.values(RIGHT_STACK_TABS)) {
    initialMap[def.panelKey] = stored[def.prefKey] ?? def.defaultVisible
  }
  applyInitialRightTabVisibility(initialMap)

  for (const [event, def] of Object.entries(RIGHT_STACK_TABS)) {
    eventBus.on(event, () => toggleRightTab(def))
  }
}

function setFixedVisible(id, visible) {
  const el = document.getElementById(id)
  if (!el) return
  el.hidden = !visible
}

function toggleFixed(def) {
  const el = document.getElementById(def.id)
  if (!el) return
  el.hidden = !el.hidden
  persist(def.prefKey, !el.hidden)
}

function toggleRightTab(def) {
  const wasHidden = isRightTabHidden(def.panelKey)
  const ok = wasHidden ? showRightTab(def.panelKey) : hideRightTab(def.panelKey)
  if (!ok) {
    log.warn(`view-toggle: right-stack tab "${def.panelKey}" not in current layout — skipping`)
    return
  }
  persist(def.prefKey, wasHidden)  // now visible if it was hidden
}

// Serialize persists. Each toggle reads-modifies-writes the whole 'view'
// subtree of prefs, so concurrent toggles raced and overwrote each other —
// the first to finish stomped the in-flight reads of the others. A simple
// promise chain makes the read/modify/write atomic per toggle.
let persistChain = Promise.resolve()
function persist(key, value) {
  persistChain = persistChain.then(async () => {
    try {
      const cur = (await window.grapestrap?.prefs?.get?.('view')) || {}
      cur[key] = value
      await window.grapestrap?.prefs?.set?.('view', cur)
    } catch (err) {
      log.warn('view-toggle persist failed:', err)
    }
  })
  return persistChain
}
