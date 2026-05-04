/**
 * GrapeStrap — View toggle wiring
 *
 * Centralises the `view:toggle-*` event handlers that the menu router emits
 * (Ctrl+B file manager, Ctrl+J properties, etc.). Two flavours of region:
 *
 *   - **Fixed shell strips** (insert / inspector strip / status / linked
 *     files / breakpoints / tabs) — toggle the `hidden` attribute on the
 *     host element. The shell's grid-template-areas already collapses an
 *     `auto` row when the element has `display: none` (per shell.css), so
 *     the layout closes cleanly.
 *
 *   - **GL-managed panels** (file manager / dom tree / properties /
 *     custom CSS / library / asset manager) — toggle a body class that a
 *     CSS rule uses to `display: none` the matching `.lm_content` host.
 *     Golden Layout doesn't re-layout the rest of its tree on a CSS hide,
 *     so the splitter slot stays visible (a small blank gap). True
 *     "remove from layout" via GL v2's API is fiddly enough that we defer
 *     it to v0.0.3 — the body-class hide is the v0.0.2 ship.
 *
 * Persistence: every toggle writes the visible-set into prefs.view (matches
 * the schema in src/main/prefs.js), so panel visibility survives a relaunch.
 */

import { eventBus } from '../state/event-bus.js'
import { log } from '../log.js'

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

// GL-managed panels. Each maps to a `body` class; CSS in shell.css hides
// the matching .lm_content host when the class is set.
const GL_PANELS = {
  'view:toggle-file-manager': { bodyClass: 'is-hide-file-manager', prefKey: 'fileManagerVisible',     defaultVisible: true  },
  'view:toggle-properties':   { bodyClass: 'is-hide-properties',   prefKey: 'propertiesPanelVisible', defaultVisible: true  },
  'view:toggle-dom-tree':     { bodyClass: 'is-hide-dom-tree',     prefKey: 'domTreeVisible',         defaultVisible: false },
  'view:toggle-custom-css':   { bodyClass: 'is-hide-custom-css',   prefKey: 'customCssVisible',       defaultVisible: true  }
}

export async function wireViewToggles() {
  const stored = (await window.grapestrap?.prefs?.get?.('view')) || {}

  // Apply persisted visibility to each region on boot.
  for (const [event, def] of Object.entries(FIXED_REGIONS)) {
    const visible = stored[def.prefKey] ?? def.defaultVisible
    setFixedVisible(def.id, visible)
    eventBus.on(event, () => toggleFixed(def))
  }
  for (const [event, def] of Object.entries(GL_PANELS)) {
    const visible = stored[def.prefKey] ?? def.defaultVisible
    setGlPanelVisible(def.bodyClass, visible)
    eventBus.on(event, () => toggleGlPanel(def))
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

function setGlPanelVisible(bodyClass, visible) {
  document.body.classList.toggle(bodyClass, !visible)
}

function toggleGlPanel(def) {
  document.body.classList.toggle(def.bodyClass)
  const visible = !document.body.classList.contains(def.bodyClass)
  persist(def.prefKey, visible)
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
