/**
 * GrapeStrap — Golden Layout configuration
 *
 * Default arrangement:
 *
 *   ┌──────────┬───────────┬─────────────────┬───────────┐
 *   │ FILE MGR │ DOM TREE  │ CANVAS / CODE   │ PROPS     │
 *   └──────────┴───────────┴─────────────────┴───────────┘
 *
 * Each pane registers with Golden Layout under a unique component name. Plugins
 * can register additional panels via `api.registerPanel({ id, ... })` which adds
 * them to the available pane menu.
 *
 * Saved layouts (v0.1.0): Golden Layout's toConfig()/loadConfig() round-trip is
 * persisted under $XDG_STATE_HOME/GrapeStrap/workspaces/.
 */

import { GoldenLayout } from 'golden-layout'

import { renderFileManager } from '../panels/file-manager/index.js'
import { renderDomTree }     from '../panels/dom-tree/index.js'
import { renderCanvas }      from '../panels/canvas/index.js'
import { renderProperties }  from '../panels/properties-side/index.js'
import { renderCustomCss }   from '../panels/custom-css/index.js'
import { relayoutAllMonaco } from '../editor/monaco-init.js'
import { getEditor }         from '../editor/grapesjs-init.js'

let layout = null

// minWidth/minHeight floors stop GL from collapsing a panel to nothing when
// the host resizes (e.g. windowed → fullscreen on an ultrawide). Without them
// GL treats panels as fully fluid and the proportions can flip on resize.
const PANEL_MIN_W = 180
const PANEL_MIN_H = 120

const DEFAULT_CONFIG = {
  root: {
    type: 'row',
    content: [
      {
        type: 'column',
        width: 16,
        content: [
          { type: 'component', componentType: 'file-manager', title: 'Project',
            isClosable: false, minWidth: PANEL_MIN_W, minHeight: PANEL_MIN_H }
        ]
      },
      {
        type: 'column',
        width: 16,
        content: [
          { type: 'component', componentType: 'dom-tree', title: 'DOM',
            isClosable: false, minWidth: PANEL_MIN_W, minHeight: PANEL_MIN_H }
        ]
      },
      {
        type: 'stack',
        width: 46,
        content: [
          { type: 'component', componentType: 'canvas', title: 'Canvas',
            isClosable: false, minWidth: 320, minHeight: 240 }
        ]
      },
      {
        type: 'column',
        width: 22,
        content: [
          { type: 'component', componentType: 'properties',  title: 'Properties',
            isClosable: false, minWidth: PANEL_MIN_W, minHeight: PANEL_MIN_H, height: 60 },
          { type: 'component', componentType: 'custom-css',  title: 'Custom CSS',
            isClosable: false, minWidth: PANEL_MIN_W, minHeight: PANEL_MIN_H, height: 40 }
        ]
      }
    ]
  }
}

export function initGoldenLayout(host) {
  layout = new GoldenLayout(host)

  layout.registerComponentFactoryFunction('file-manager', container => renderFileManager(container.element))
  layout.registerComponentFactoryFunction('dom-tree',     container => renderDomTree(container.element))
  layout.registerComponentFactoryFunction('canvas',       container => renderCanvas(container.element))
  layout.registerComponentFactoryFunction('properties',   container => renderProperties(container.element))
  layout.registerComponentFactoryFunction('custom-css',   container => renderCustomCss(container.element))

  layout.loadLayout(DEFAULT_CONFIG)

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

export function getLayout() {
  return layout
}

export function resetLayout() {
  if (!layout) return
  layout.loadLayout(DEFAULT_CONFIG)
}
