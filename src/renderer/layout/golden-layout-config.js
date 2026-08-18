/**
 * GrapeStrap — Golden Layout configuration
 *
 * Default arrangement (consolidated 2026-05-05 per nola1 user request — "all
 * of these separate views should all be on the right as tabs in one panel
 * like the library and assets"):
 *
 *   ┌─────────────────┬──────────────────────────┬─────────────────────────┐
 *   │ Project │ Lib │ │  CANVAS / CODE / SPLIT   │ DOM │ Props │ CSS │ BS  │
 *   │ Asset           │                          │                         │
 *   └─────────────────┴──────────────────────────┴─────────────────────────┘
 *      LEFT STACK              CENTER                  RIGHT STACK
 *      (3 tabs)                                        (4 tabs)
 *
 * Each pane registers with Golden Layout under a unique component name. Plugins
 * can register additional panels via `api.registerPanel({ id, ... })` which adds
 * them to the available pane menu.
 *
 * Saved layouts (v0.1.0): captured via saveLayout() → LayoutConfig.fromResolved()
 * and re-applied via loadLayout() (GL 2.6 API — the older toConfig()/loadConfig()
 * names this header used to promise do not exist in 2.6), persisted as one JSON
 * per layout under $XDG_STATE_HOME/GrapeStrap/workspaces/ (see layout/workspaces.js).
 * This module is the single owner of GL API calls — workspaces.js goes through
 * getDefaultConfig()/captureLayoutConfig()/applyLayoutConfig(), never GL directly.
 */

import { GoldenLayout, LayoutConfig } from 'golden-layout'

import { eventBus } from '../state/event-bus.js'
import { t } from '../i18n.js'
import { renderFileManager } from '../panels/file-manager/index.js'
import { renderDomTree }     from '../panels/dom-tree/index.js'
import { renderCanvas }      from '../panels/canvas/index.js'
import { renderProperties }  from '../panels/properties-side/index.js'
import { renderCustomCss }   from '../panels/custom-css/index.js'
import { renderBootstrapCss } from '../panels/bootstrap-css/index.js'
import { renderLibraryItems } from '../panels/library-items/index.js'
import { renderAssetManager } from '../panels/asset-manager/index.js'
import { relayoutAllMonaco } from '../editor/monaco-init.js'
import { getEditor }         from '../editor/grapesjs-init.js'

let layout = null

// minWidth/minHeight floors stop GL from collapsing a panel to nothing when
// the host resizes (e.g. windowed → fullscreen on an ultrawide). Without them
// GL treats panels as fully fluid and the proportions can flip on resize.
//
// The values are PER TAB, and GL v2's splitter-drag bounds SUM them across a
// stack's tabs (onSplitterDragStart → calculateContentItemsTotalMinSize) even
// though tabs display one at a time. So a tab's floor must be its stack's
// intended floor ÷ that stack's tab count. The original 180/120 per tab gave
// the stacks a 540px effective floor: in any window where a sidebar sat below
// that, GL clamped EVERY splitter drag to a positive offset — the sidebar
// jumped out to 540px no matter which way you dragged, and dragStop persisted
// the bigger percentage ("snaps then sticks" on alpha.9, "only gets larger"
// windowed on 2026-07-06).
//
// The two side stacks stopped holding the same number of tabs on 2026-08-18
// (the Bootstrap panel made the right stack 4), hence separate counts: reusing
// the left stack's ÷3 on a 4-tab stack would put the right stack's effective
// floor back at 240px and reintroduce exactly that regression. If a stack
// gains or loses a tab, update its count here.
const STACK_MIN_W = 180
const STACK_MIN_H = 120
const LEFT_STACK_TAB_COUNT = 3    // Project / Library / Assets
const RIGHT_STACK_TAB_COUNT = 4   // DOM / Properties / Custom CSS / Bootstrap
const LEFT_PANEL_MIN_W = STACK_MIN_W / LEFT_STACK_TAB_COUNT
const LEFT_PANEL_MIN_H = STACK_MIN_H / LEFT_STACK_TAB_COUNT
const RIGHT_PANEL_MIN_W = STACK_MIN_W / RIGHT_STACK_TAB_COUNT
const RIGHT_PANEL_MIN_H = STACK_MIN_H / RIGHT_STACK_TAB_COUNT
const CANVAS_MIN_W = 320
const CANVAS_MIN_H = 240

// Wave 3: workspaces.js re-stamps floors from these at every apply
// (normalizeFloors — the ÷N above computed from each stack's actual tab count
// at apply time, exactly what the comment above asks for when a stack
// gains/loses tabs).
// Persisted minWidths in saved layouts are never trusted.
export const LAYOUT_FLOORS = {
  stackMinW: STACK_MIN_W,
  stackMinH: STACK_MIN_H,
  canvasMinW: CANVAS_MIN_W,
  canvasMinH: CANVAS_MIN_H
}

// GL tab titles resolve through t() (Wave 4 sweep) — but this module loads at
// import time, BEFORE initI18n() runs in boot(), so titles can't live in the
// const below (pre-init t() returns the raw key). stampPanelTitles() applies
// them on every clone handed to GL, which only ever happens post-init.
const PANEL_TITLE_KEYS = {
  'file-manager':  'panel.file-manager',
  'library-items': 'panel.library-items',
  'asset-manager': 'panel.asset-manager',
  'canvas':        'panel.canvas',
  'dom-tree':      'panel.dom-tree',
  'properties':    'panel.properties',
  'custom-css':    'panel.custom-css',
  'bootstrap-css': 'panel.bootstrap-css'
}

/**
 * The rendered tab title for a panel. Single source of truth so anything that
 * builds a GL node outside this module (workspaces.js ensureCorePanels) stamps
 * the same string stampPanelTitles would — the tab-hide CSS in
 * golden-layout-overrides.css matches on that title, so a mismatch silently
 * breaks the View toggle for that panel.
 * @param {string} componentType - Key of PANEL_FACTORIES
 * @returns {string} Localised title, or the componentType when unknown
 */
export function getPanelTitle(componentType) {
  const key = PANEL_TITLE_KEYS[componentType]
  return key ? t(key) : componentType
}

function stampPanelTitles(node) {
  if (!node || typeof node !== 'object') return node
  if (node.type === 'component' && PANEL_TITLE_KEYS[node.componentType]) {
    node.title = t(PANEL_TITLE_KEYS[node.componentType])
  }
  if (node.root) stampPanelTitles(node.root)   // top-level LayoutConfig wrapper
  for (const child of node.content || []) stampPanelTitles(child)
  return node
}

const DEFAULT_CONFIG = {
  root: {
    type: 'row',
    content: [
      // LEFT STACK — Project / Library / Assets. Titles come from
      // stampPanelTitles() (PANEL_TITLE_KEYS above), not literals here.
      {
        type: 'stack',
        width: 18,
        content: [
          { type: 'component', componentType: 'file-manager',
            isClosable: false, minWidth: LEFT_PANEL_MIN_W, minHeight: LEFT_PANEL_MIN_H },
          { type: 'component', componentType: 'library-items',
            isClosable: false, minWidth: LEFT_PANEL_MIN_W, minHeight: LEFT_PANEL_MIN_H },
          { type: 'component', componentType: 'asset-manager',
            isClosable: false, minWidth: LEFT_PANEL_MIN_W, minHeight: LEFT_PANEL_MIN_H }
        ]
      },
      // CENTER — Canvas / Code / Split (single component, but a stack so it
      // gets a header tab strip with title + maximize control like the others)
      {
        type: 'stack',
        width: 56,
        content: [
          { type: 'component', componentType: 'canvas',
            isClosable: false, minWidth: CANVAS_MIN_W, minHeight: CANVAS_MIN_H }
        ]
      },
      // RIGHT STACK — DOM / Properties / Custom CSS / Bootstrap as tabs
      // (consolidated per nola1 user 2026-05-05). Properties is the
      // default-active tab since it's the most common edit surface; DOM is the
      // secondary outline view; Custom CSS is the project-global stylesheet
      // editor; Bootstrap (2026-08-18) is the project's own copy of the
      // framework sheet.
      {
        type: 'stack',
        width: 26,
        activeItemIndex: 1,
        content: [
          { type: 'component', componentType: 'dom-tree',
            isClosable: false, minWidth: RIGHT_PANEL_MIN_W, minHeight: RIGHT_PANEL_MIN_H },
          { type: 'component', componentType: 'properties',
            isClosable: false, minWidth: RIGHT_PANEL_MIN_W, minHeight: RIGHT_PANEL_MIN_H },
          { type: 'component', componentType: 'custom-css',
            isClosable: false, minWidth: RIGHT_PANEL_MIN_W, minHeight: RIGHT_PANEL_MIN_H },
          { type: 'component', componentType: 'bootstrap-css',
            isClosable: false, minWidth: RIGHT_PANEL_MIN_W, minHeight: RIGHT_PANEL_MIN_H }
        ]
      }
    ]
  }
}

// componentType → factory. Single source of truth for what a saved workspace
// may reference — workspaces.js validates persisted configs against
// getRegisteredComponentTypes() before any loadLayout (fail-open on unknown
// types, e.g. a plugin panel from a since-disabled plugin).
const PANEL_FACTORIES = {
  'file-manager':  renderFileManager,
  'library-items': renderLibraryItems,
  'asset-manager': renderAssetManager,
  'dom-tree':      renderDomTree,
  'canvas':        renderCanvas,
  'properties':    renderProperties,
  'custom-css':    renderCustomCss,
  'bootstrap-css': renderBootstrapCss
}

export function initGoldenLayout(host) {
  layout = new GoldenLayout(host)

  for (const [componentType, render] of Object.entries(PANEL_FACTORIES)) {
    layout.registerComponentFactoryFunction(componentType, container => render(container.element))
  }

  layout.loadLayout(getDefaultConfig())

  // GL re-parents panel DOM on maximize/restore. For the canvas iframe that
  // means the document gets rebuilt — base href + globalCSS injection need
  // to fire again, otherwise relative `assets/...` images render broken.
  // Coalesce stateChanged signals (GL fires several per maximize) into one
  // rAF then ping the canvas iframe to resync. Reported as "images disappear
  // when you expand the canvas window to fullscreen."
  let pendingResync = false
  layout.on('stateChanged', () => {
    if (pendingResync) return
    pendingResync = true
    requestAnimationFrame(() => {
      pendingResync = false
      eventBus.emit('canvas:gl-state-changed')
    })
  })

  // Re-measure after the browser has laid out the CSS grid. Without this,
  // GoldenLayout reads 0×0 from the host on first paint (chrome regions
  // haven't sized yet) and panels collapse into the top-left corner.
  //
  // Single rAF was insufficient on nola1: rAF fires after the next style
  // recalc but BEFORE async font loading + Electron's first compositor frame
  // settle. The host can still report 0 height at the rAF tick, GL caches a
  // 0×0 layout, and the integer gate then treats every subsequent same-size
  // sample as "no change" so the catastrophic-collapse layout never recovers.
  // Solution:
  //   1. Try at next rAF (covers the fast-path).
  //   2. Try again at the rAF after that (covers font/compositor settle).
  //   3. The host RO will also catch any later transition into non-zero size
  //      because we seed lastW/lastH = 0 in installResizeDriver().
  requestAnimationFrame(() => {
    relayoutEverything()
    requestAnimationFrame(() => relayoutEverything())
  })

  installResizeDriver(host)

  return layout
}

/**
 * Single source of truth for "the layout might have changed, redistribute."
 *
 * Pre-fix we had THREE drivers: a ResizeObserver on the host, a window
 * resize listener that called updateSize() WITHOUT the ≥1px gate, and
 * Monaco's `automaticLayout: true` (an internal RO per Monaco instance,
 * ×3 instances). They raced. The ungated window-listener path drifted
 * the canvas pane downward by sub-pixel amounts each direction-flip,
 * because every window-resize event fired updateSize once unguarded
 * before the gated RO had a chance to skip it.
 *
 * Now: ONE ResizeObserver on the host. It calls updateSize, then re-lays-
 * out every Monaco editor explicitly, then refreshes GrapesJS. Monaco's
 * automaticLayout is OFF (see monaco-init.js) so it doesn't compete. The
 * window resize listener is gone — the RO catches window resize for free
 * because the host element resizes when the window does.
 *
 * Gate is on integer pixel dimensions (clientWidth/clientHeight) — fractional
 * bbox values walk under HiDPI / Wayland fractional scale and the old <1px
 * gate let them through.
 */
function installResizeDriver(host) {
  if (typeof ResizeObserver !== 'function') return
  let pending = false
  let lastW = 0
  let lastH = 0
  const ro = new ResizeObserver(() => {
    if (pending) return
    pending = true
    requestAnimationFrame(() => {
      pending = false
      const w = host.clientWidth
      const h = host.clientHeight
      if (w === lastW && h === lastH) return
      lastW = w
      lastH = h
      relayoutEverything()
    })
  })
  ro.observe(host)
}

function relayoutEverything() {
  if (!layout) return
  layout.updateSize()
  // Monaco's automaticLayout is disabled — drive layout() explicitly so the
  // editors track GL panel sizes without each instance running its own RO.
  relayoutAllMonaco()
  // Tell GrapesJS to re-measure its canvas frame. The iframe is height:100%
  // so CSS already gave it new geometry; refresh() commits internal offsets
  // (rulers, device frame computations) to the new size.
  try { getEditor()?.refresh?.() } catch (_) { /* GrapesJS not initialized yet */ }
}

// Public hook so other modules (panel-visibility) can drive the same
// relayout chain without duplicating the Monaco/GrapesJS pokes. The host RO
// already calls relayoutEverything when the window resizes — this lets a
// programmatic GL change (hide/show a panel via size redistribution) reach
// Monaco / GrapesJS the same way.
export function requestFullRelayout() {
  relayoutEverything()
}

export function getLayout() {
  return layout
}

export function resetLayout() {
  if (!layout) return
  layout.loadLayout(getDefaultConfig())
}

// ─── Workspace-layouts surface (Wave 3) ─────────────────────────────────────
// workspaces.js never imports golden-layout directly — these three wrappers
// plus getRegisteredComponentTypes() are its whole GL contract.

/** Deep clone of the LOCKED 4-column default config, panel titles stamped
 *  from the live t() catalog. Presets are built from this so they can never
 *  drift from the shell (PLAN.md §2.4). */
export function getDefaultConfig() {
  return stampPanelTitles(structuredClone(DEFAULT_CONFIG))
}

/** Current arrangement as a serialisable LayoutConfig (GL 2.6:
 *  saveLayout() → ResolvedLayoutConfig → LayoutConfig.fromResolved()). */
export function captureLayoutConfig() {
  if (!layout || !layout.isInitialised) return null
  return LayoutConfig.fromResolved(layout.saveLayout())
}

/** Load a (pre-validated, floor-normalised) LayoutConfig. Throws GL errors
 *  through to the caller — workspaces.js owns the fail-open catch. */
export function applyLayoutConfig(config) {
  if (!layout) throw new Error('applyLayoutConfig: layout not initialised')
  layout.loadLayout(config)
}

/** componentTypes a workspace config may reference (the 8 built-in panels). */
export function getRegisteredComponentTypes() {
  return Object.keys(PANEL_FACTORIES)
}
