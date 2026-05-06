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
 *   - **Stack tabs** (file manager) — body-class CSS hides just the matching
 *     tab + content inside its multi-tab stack. The stack itself stays for
 *     the remaining tabs (Library + Assets), so no gap. Body-class is the
 *     simplest correct mechanism here.
 *
 *   - **Whole columns / single-tab stacks** (DOM Tree, Properties, Custom
 *     CSS) — driven through `panel-visibility.js` which calls Golden Layout
 *     directly: zeroes the target's `size`, redistributes the freed share to
 *     visible siblings, hides the element, then `layout.updateSize()` to
 *     recompute pixels. Restores symmetrically on show. This is what
 *     replaced the v0.0.2-alpha.9 body-class hide that left a dead slot
 *     behind ("you can see how a gap is created when you close dom" — nola1
 *     2026-05-05).
 *
 * Persistence: every toggle writes the visible-set into prefs.view (matches
 * the schema in src/main/prefs.js), so panel visibility survives a relaunch.
 */

import { eventBus } from '../state/event-bus.js'
import { log } from '../log.js'
import { hidePanel, showPanel, isPanelHidden, applyInitialVisibility } from '../layout/panel-visibility.js'

// Fixed shell strips. Element id → toggle event suffix. Linked Files and
// Breakpoints panels do their own visibility (they hide based on tab kind /
// no-project state and need internal tracking), so they own their toggle
// events — see panels/linked-files/index.js and panels/breakpoints/index.js.
const FIXED_REGIONS = {
  'view:toggle-tabs':    { id: 'gstrap-tabs',   prefKey: 'tabsVisible',          defaultVisible: true },
  'view:toggle-insert':  { id: 'gstrap-insert', prefKey: 'insertPanelVisible',   defaultVisible: true },
  'view:toggle-strip':   { id: 'gstrap-strip',  prefKey: 'propertyStripVisible', defaultVisible: true },
  'view:toggle-status':  { id: 'gstrap-status', prefKey: 'statusBarVisible',     defaultVisible: true }
}

// Tab-in-stack panels: hide the .lm_content + .lm_tab via body class. The
// surrounding stack stays for the other tabs.
const STACK_TAB_PANELS = {
  'view:toggle-file-manager': { bodyClass: 'is-hide-file-manager', prefKey: 'fileManagerVisible', defaultVisible: true }
}

// Whole-column / single-tab stacks: hide via real GL layout redistribution.
// `panelKey` matches the GL componentType so panel-visibility.js can find
// the ContentItem.
const GL_LAYOUT_PANELS = {
  'view:toggle-dom-tree':    { panelKey: 'dom-tree',   prefKey: 'domTreeVisible',         defaultVisible: false },
  'view:toggle-properties':  { panelKey: 'properties', prefKey: 'propertiesPanelVisible', defaultVisible: true  },
  'view:toggle-custom-css':  { panelKey: 'custom-css', prefKey: 'customCssVisible',       defaultVisible: true  }
}

export async function wireViewToggles() {
  const stored = (await window.grapestrap?.prefs?.get?.('view')) || {}

  // Fixed strips: apply persisted visibility immediately, wire the toggle.
  for (const [event, def] of Object.entries(FIXED_REGIONS)) {
    const visible = stored[def.prefKey] ?? def.defaultVisible
    setFixedVisible(def.id, visible)
    eventBus.on(event, () => toggleFixed(def))
  }

  // Stack-tab panels (file manager): same body-class pattern as before.
  for (const [event, def] of Object.entries(STACK_TAB_PANELS)) {
    const visible = stored[def.prefKey] ?? def.defaultVisible
    document.body.classList.toggle(def.bodyClass, !visible)
    eventBus.on(event, () => {
      document.body.classList.toggle(def.bodyClass)
      const nowVisible = !document.body.classList.contains(def.bodyClass)
      persist(def.prefKey, nowVisible)
    })
  }

  // GL layout panels: apply initial state once layout is ready, then wire
  // the toggles to call hidePanel/showPanel directly.
  const initialVisibility = {}
  for (const def of Object.values(GL_LAYOUT_PANELS)) {
    initialVisibility[def.panelKey] = stored[def.prefKey] ?? def.defaultVisible
  }
  applyInitialVisibility(initialVisibility)

  for (const [event, def] of Object.entries(GL_LAYOUT_PANELS)) {
    eventBus.on(event, () => toggleGlLayoutPanel(def))
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

function toggleGlLayoutPanel(def) {
  const wasHidden = isPanelHidden(def.panelKey)
  const ok = wasHidden ? showPanel(def.panelKey) : hidePanel(def.panelKey)
  if (!ok) {
    log.warn(`view-toggle: GL panel "${def.panelKey}" not found in current layout — skipping`)
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
