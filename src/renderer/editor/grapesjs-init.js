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
import { formatHtml } from './format-html.js'
import { log } from '../log.js'

// Canvas iframe asset paths. Resolved relative to the renderer index.html
// (file:///.../dist/renderer/index.html). Vite's `publicDir: 'assets'` copies
// the *contents* of <repo>/assets/ to dist/renderer/ (NOT into a /assets/
// subdir — that prefix is reserved for Vite's own bundled output like monaco
// workers). So source path `assets/bootstrap/...` is served from
// `dist/renderer/bootstrap/...`. Inter / JetBrains Mono webfonts deferred to
// v0.0.2; canvas iframe falls back to system font stack until then.
const BOOTSTRAP_CSS = './bootstrap/css/bootstrap.min.css'
const BOOTSTRAP_JS  = './bootstrap/js/bootstrap.bundle.min.js'
const ICONS_CSS     = './canvas-icons/css/bootstrap-icons.min.css'

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
      styles:  [BOOTSTRAP_CSS, ICONS_CSS],
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

  // Right-click on the canvas iframe → emit `canvas:context-menu` with the
  // viewport-relative coords + the component the user clicked. Listening on
  // the iframe contentDocument (rather than the frame element) is the only
  // way to catch events inside the canvas — clicks inside an iframe are
  // scoped to its own document.
  //
  // To resolve which component was clicked: dispatch a synthetic mousedown so
  // GrapesJS's own handlers run their selection logic (which knows GrapesJS-
  // internal targeting rules better than we do — e.g. clicking a child text
  // node should select its parent block, not the text). After the synthetic
  // event runs we read editor.getSelected().
  editor.on('canvas:frame:load', () => {
    const frameEl = editor.Canvas.getFrameEl()
    const doc = frameEl?.contentDocument
    if (!doc) return
    doc.addEventListener('contextmenu', evt => {
      evt.preventDefault()
      // Synthesise a click on the same target so GrapesJS selects what the
      // user pointed at. Using mousedown (which is what GrapesJS listens on
      // for selection) at the same coords + target.
      const target = evt.target
      target?.dispatchEvent?.(new MouseEvent('mousedown', {
        bubbles: true, cancelable: true, view: doc.defaultView,
        clientX: evt.clientX, clientY: evt.clientY, button: 0
      }))
      // Wait one tick for GrapesJS to commit the selection, then emit.
      const rect = frameEl.getBoundingClientRect()
      const x = evt.clientX + rect.left
      const y = evt.clientY + rect.top
      queueMicrotask(() => {
        eventBus.emit('canvas:context-menu', {
          x, y, component: editor.getSelected()
        })
      })
    })
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

  // Class additions/removals fire `component:update:classes`. We re-broadcast
  // as a dedicated event so the Style Manager can refresh its "Active" state
  // when classes change from somewhere other than the panel itself
  // (chip-list edits, plugin commands, undo/redo).
  editor.on('component:update:classes', component => {
    eventBus.emit('canvas:component-class-changed', component)
    eventBus.emit('canvas:content-changed')
  })

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
  // Pretty-print here so every consumer (project save, tab swap capture,
  // code-view sync, export) gets the same readable output. GrapesJS's
  // getHtml() returns a single line; we format once at the boundary.
  return formatHtml(editor.getHtml() || '')
}

// getCanvasHtmlRaw — the un-formatted single-line output. Reserved for paths
// that genuinely need the parser-friendly form (currently none, but kept as
// an explicit escape hatch).
export function getCanvasHtmlRaw() {
  if (!editor) return ''
  return editor.getHtml() || ''
}
