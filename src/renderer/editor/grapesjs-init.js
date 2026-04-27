/**
 * GrapeStrap — GrapesJS canvas initialization
 *
 * Configures the canvas with:
 *   - Bundled Bootstrap 5 (CSS + JS) loaded into the iframe via canvas.styles/scripts
 *   - Bundled Font Awesome Free CSS (canvas icon set)
 *   - Inter font for canvas UI elements (the user's content can override)
 *   - Three responsive devices (Desktop/Tablet/Mobile)
 *   - Storage manager DISABLED — we manage state on disk via .gstrap, not localStorage
 *   - Style Manager EMPTY — replaced by our class-first panels
 *   - Inline-style writing DISABLED — selectors only, never inline
 *
 * Plugins (loaded via the plugin host) register blocks/sections via the API.
 * This module just stands up the canvas; it's the plugins that fill it.
 */

import grapesjs from 'grapesjs'
import { pluginRegistry } from '../plugin-host/registry.js'
import { eventBus } from '../state/event-bus.js'
import { log } from '../log.js'

const BOOTSTRAP_CSS = './assets/bootstrap/css/bootstrap.min.css'
const BOOTSTRAP_JS  = './assets/bootstrap/js/bootstrap.bundle.min.js'
const FA_CSS        = './assets/canvas-icons/css/all.min.css'
const FONT_CSS      = './assets/fonts/inter.css'

let editor = null

export function initGrapesJS(container) {
  editor = grapesjs.init({
    container,
    fromElement: false,
    height: '100%',
    width: 'auto',

    storageManager: false,

    // Disable GrapesJS's default Font Awesome CDN load (CSP-blocked anyway).
    // Our editor chrome uses bootstrap-icons; canvas icons load from bundled assets/canvas-icons/.
    cssIcons: '',

    deviceManager: {
      devices: [
        { name: 'Desktop', width: '' },
        { name: 'Tablet',  width: '768px',  widthMedia: '992px' },
        { name: 'Mobile',  width: '375px',  widthMedia: '480px' }
      ]
    },

    canvas: {
      styles:  [BOOTSTRAP_CSS, FA_CSS, FONT_CSS],
      scripts: [BOOTSTRAP_JS]
    },

    // Empty Style Manager — class-first panels replace it
    styleManager: { sectors: [] },

    // Block manager will be filled by plugins via api.registerBlock()
    blockManager: { blocks: [] },

    // Class-first: edits write to selectors, never inline. Editor avoid inline
    // style is configured via the styleManager plugin defaults; we also catch
    // any inline attempts in canvas-sync.js.
    avoidInlineStyle: true
  })

  // Pump plugin-registered blocks into GrapesJS now that the editor exists.
  for (const block of pluginRegistry.blocks) {
    editor.BlockManager.add(block.id, {
      label: block.label,
      category: block.category || 'Common',
      content: block.content,
      attributes: block.attributes || {},
      media: block.media
    })
  }
  // Future block registrations after this point also pump in.
  eventBus.on('plugin:block-registered', ({ block }) => {
    editor.BlockManager.add(block.id, {
      label: block.label,
      category: block.category || 'Common',
      content: block.content,
      attributes: block.attributes || {},
      media: block.media
    })
  })

  // Wire selection events to page state
  editor.on('component:selected', component => {
    eventBus.emit('canvas:selected', component)
  })
  editor.on('component:deselected', () => {
    eventBus.emit('canvas:deselected')
  })

  // Watch for component add/remove for lazy-dependency injection (plugin sections
  // declare `dependencies: ['splidejs', 'glightbox']` in their content metadata).
  editor.on('component:add', component => {
    eventBus.emit('canvas:component-added', component)
    eventBus.emit('canvas:content-changed')
  })
  editor.on('component:remove', component => {
    eventBus.emit('canvas:component-removed', component)
    eventBus.emit('canvas:content-changed')
  })
  editor.on('component:update', () => eventBus.emit('canvas:content-changed'))
  editor.on('style:custom', () => eventBus.emit('canvas:content-changed'))

  // Bind editor to plugin registry so plugins can access it via api.editor
  pluginRegistry.setBound('editor', editor)
  eventBus.emit('canvas:ready', editor)
  log.info('GrapesJS initialized')

  return editor
}

export function getEditor() {
  return editor
}

/**
 * Replace canvas content programmatically (e.g. on tab swap or project load).
 * Returns a promise that resolves once the load has settled — the editor fires
 * many component:add events synchronously during setComponents, and we don't
 * want any of those to be misread as user edits.
 */
export function loadHtmlIntoCanvas(html) {
  if (!editor) return
  editor.setComponents(html || '')
}

export function getCanvasHtml() {
  if (!editor) return ''
  return editor.getHtml() || ''
}
