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

const DEFAULT_CONFIG = {
  root: {
    type: 'row',
    content: [
      {
        type: 'column',
        width: 16,
        content: [
          { type: 'component', componentType: 'file-manager', title: 'Project', isClosable: false }
        ]
      },
      {
        type: 'column',
        width: 16,
        content: [
          { type: 'component', componentType: 'dom-tree', title: 'DOM', isClosable: false }
        ]
      },
      {
        type: 'stack',
        width: 46,
        content: [
          { type: 'component', componentType: 'canvas', title: 'Canvas', isClosable: false }
        ]
      },
      {
        type: 'column',
        width: 22,
        content: [
          { type: 'component', componentType: 'properties',  title: 'Properties', isClosable: false },
          { type: 'component', componentType: 'custom-css',  title: 'Custom CSS', isClosable: false }
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
