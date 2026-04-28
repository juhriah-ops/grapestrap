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
  requestAnimationFrame(() => layout?.updateSize())

  // GL only listens for window resize. That misses host-driven resizes —
  // e.g. windowed→fullscreen on ultrawide, where GL's cached proportions get
  // applied to a much-larger viewport and panels collapse asymmetrically.
  // ResizeObserver catches every host size change and gets GL to redistribute.
  //
  // Two guards against feedback loops: coalesce multiple fires per frame via
  // requestAnimationFrame, and skip updateSize() if the size hasn't actually
  // changed by ≥ 1 px. Without these the chain "RO fires → updateSize sets
  // explicit pixel sizes → iframe internal reflow → host bbox shifts by a
  // sub-pixel → RO fires again" makes the canvas drift downward on every
  // resize-direction change.
  if (typeof ResizeObserver === 'function') {
    let pending = false
    let lastW = 0
    let lastH = 0
    const ro = new ResizeObserver(() => {
      if (pending) return
      pending = true
      requestAnimationFrame(() => {
        pending = false
        const r = host.getBoundingClientRect()
        if (Math.abs(r.width - lastW) < 1 && Math.abs(r.height - lastH) < 1) return
        lastW = r.width
        lastH = r.height
        layout?.updateSize()
      })
    })
    ro.observe(host)
  }

  window.addEventListener('resize', () => {
    if (layout) layout.updateSize()
  })

  return layout
}

export function getLayout() {
  return layout
}

export function resetLayout() {
  if (!layout) return
  layout.loadLayout(DEFAULT_CONFIG)
}
