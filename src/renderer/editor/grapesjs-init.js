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
import { projectState } from '../state/project-state.js'
import { formatHtml } from './format-html.js'
import { log } from '../log.js'

// Framework assets (Bootstrap, Bootstrap Icons, Font Awesome) are NOT loaded
// from the renderer's dist directory anymore. They live inside each project
// at `site/assets/{css,js,webfonts}/`, copied in at project creation time
// (project-manager.js#copyFrameworkAssets). The canvas iframe loads them via
// project-relative links resolved through `<base href="file://<projectDir>/
// site/">` — the SAME paths that work when the project is rsync'd to a
// server. So no renderer-base coupling, no breakage on device cycle / GL
// maximize, and `<base>` is the single source of truth.
//
// The link injection happens in syncFrameworksIntoCanvas (below), called
// AFTER syncBaseHrefIntoCanvas so the relative href resolves correctly the
// first time it's parsed.
const FRAMEWORK_CSS = [
  { href: 'assets/css/bootstrap.min.css',       attr: 'data-grapestrap-bs' },
  { href: 'assets/css/bootstrap-icons.min.css', attr: 'data-grapestrap-bsi' },
  { href: 'assets/css/all.min.css',             attr: 'data-grapestrap-fa' }
]
const FRAMEWORK_JS = [
  { src:  'assets/js/bootstrap.bundle.min.js',  attr: 'data-grapestrap-bsjs' }
]

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
      // Empty — framework loading is owned by syncFrameworksIntoCanvas so it
      // can resolve through the per-project <base href>. Letting GrapesJS
      // inject canvas.styles itself raced with our base injection (relative
      // paths resolved against the wrong root, BS 404'd on device cycle in
      // a maximized canvas). The new flow is: <base> first, then framework
      // links, then globalCSS — all firing on canvas:frame:load and on any
      // GL state-changed re-parent.
      styles:  [],
      scripts: []
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
    // Order matters: <base> first so subsequent relative links resolve
    // against the project; framework links second so their fetch races
    // ahead of body content; globalCSS last so it overrides framework CSS.
    syncBaseHrefIntoCanvas(doc)
    syncFrameworksIntoCanvas(doc)
    syncGlobalCssIntoCanvas(doc)
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

  // Project globalCSS lives in projectState; mirror it into the canvas iframe
  // as a <style> tag so live preview reflects pseudo-class rules typed in the
  // Style Manager AND so the Cascade view can read them via document.styleSheets.
  // canvas:frame:load sets the initial sync; project lifecycle keeps it fresh.
  eventBus.on('project:opened',     () => { syncBaseHrefIntoCanvas(); syncFrameworksIntoCanvas(); syncGlobalCssIntoCanvas() })
  eventBus.on('project:closed',     () => { syncBaseHrefIntoCanvas(); syncFrameworksIntoCanvas(); syncGlobalCssIntoCanvas() })
  eventBus.on('project:css-changed',() => syncGlobalCssIntoCanvas())

  // Defensive resync: GrapesJS sometimes rebuilds the iframe document on
  // content reload (page swap, layout refresh). The injected <base> +
  // <style data-grapestrap-globalcss> can get clobbered, which silently
  // breaks every relative `assets/...` image src + bg-image url. Reported
  // on nola1 as "images break on resize and are no longer visible."
  // rAF-coalesced so the per-component-add storm during setComponents
  // collapses into one sync per frame.
  let resyncPending = false
  const queueResync = () => {
    if (resyncPending) return
    resyncPending = true
    requestAnimationFrame(() => {
      resyncPending = false
      syncBaseHrefIntoCanvas()
      syncFrameworksIntoCanvas()
      syncGlobalCssIntoCanvas()
    })
  }
  eventBus.on('canvas:content-changed', queueResync)
  // GL maximize / restore re-parents the canvas DOM and rebuilds its iframe.
  // canvas:frame:load already covers the case where GrapesJS sees a fresh
  // iframe load, but in some Electron paths the re-parent doesn't trigger a
  // frame:load — so explicitly resync on the GL state-changed signal too.
  eventBus.on('canvas:gl-state-changed', queueResync)

  log.info('GrapesJS initialized')

  return editor
}

// Inject (or update) the project's globalCSS as a <style> tag inside the
// canvas iframe. Tag is identified by `data-grapestrap-globalcss`; the
// Cascade view sub-panel keys off the same attribute to label rules as
// "project" origin.
function syncGlobalCssIntoCanvas(docArg) {
  const doc = docArg || editor?.Canvas?.getFrameEl()?.contentDocument
  if (!doc) return
  let tag = doc.querySelector('style[data-grapestrap-globalcss]')
  if (!tag) {
    tag = doc.createElement('style')
    tag.setAttribute('data-grapestrap-globalcss', '')
    tag.id = 'gstrap-global-css'
    doc.head.appendChild(tag)
  }
  tag.textContent = projectState.current?.globalCSS || ''
}

// Inject (or update) a `<base href="file://<projectDir>/site/">` so relative
// asset paths in the canvas html (e.g. `assets/images/foo.png` written by
// the Asset Manager or imported pages) resolve to the project's deployable
// `site/` directory for live preview, without the renderer rewriting srcs.
// The base only lives inside the canvas iframe — saved html comes from
// editor.getHtml() which is body-only, so no `<base>` ever lands on disk.
// Tag is identified by `data-grapestrap-base`.
function syncBaseHrefIntoCanvas(docArg) {
  const doc = docArg || editor?.Canvas?.getFrameEl()?.contentDocument
  if (!doc) return
  const projectDir = projectState.current?.projectDir
  let tag = doc.querySelector('base[data-grapestrap-base]')
  if (!projectDir) {
    if (tag) tag.remove()
    return
  }
  const created = !tag
  if (created) {
    tag = doc.createElement('base')
    tag.setAttribute('data-grapestrap-base', '')
    // <base> must be the first head element to apply to subsequent resources;
    // the GrapesJS frame's bundled BS / FA links are created BEFORE this fires
    // so they're absolute already (./bootstrap/css/...) and unaffected.
    doc.head.insertBefore(tag, doc.head.firstChild)
  }
  // Trailing slash matters — without it, relative paths resolve as if from
  // the parent directory of site/.
  const siteDir = projectDir.replace(/\/?$/, '/') + 'site/'
  const nextHref = `file://${siteDir}`
  const prevHref = tag.getAttribute('href')
  tag.setAttribute('href', nextHref)
  // If the <base> was missing or its href changed, every relative-src image
  // in the doc was resolved against the WRONG base when the browser first
  // tried to load it. Reassigning src forces a refetch with the now-correct
  // base. Without this, GL maximize / re-parent on the canvas panel reloads
  // the iframe, base injects after body content, images stay broken.
  // Reported by user 2026-05-04: "images disappear when you expand the
  // canvas window to fullscreen."
  if (created || prevHref !== nextHref) {
    refetchRelativeImages(doc)
  }
}

function refetchRelativeImages(doc) {
  const ABS = /^(?:[a-z]+:|\/\/|data:|blob:)/i
  doc.querySelectorAll('img[src]').forEach(img => {
    const src = img.getAttribute('src')
    if (!src || ABS.test(src)) return
    img.setAttribute('src', src) // setAttribute alone re-runs the resource fetch
  })
}

// Inject Bootstrap / Bootstrap Icons / Font Awesome <link> + bundle <script>
// into the canvas iframe head using project-relative paths. Resolved through
// the project's <base href> so the SAME paths work in canvas preview AND
// after server transfer. Idempotent: re-running updates href/src in place
// instead of duplicating tags. No-op when no project is open.
function syncFrameworksIntoCanvas(docArg) {
  const doc = docArg || editor?.Canvas?.getFrameEl()?.contentDocument
  if (!doc) return
  if (!projectState.current?.projectDir) return
  for (const { href, attr } of FRAMEWORK_CSS) {
    let tag = doc.head.querySelector(`link[${attr}]`)
    if (!tag) {
      tag = doc.createElement('link')
      tag.setAttribute('rel', 'stylesheet')
      tag.setAttribute(attr, '')
      doc.head.appendChild(tag)
    }
    if (tag.getAttribute('href') !== href) tag.setAttribute('href', href)
  }
  for (const { src, attr } of FRAMEWORK_JS) {
    let tag = doc.head.querySelector(`script[${attr}]`)
    if (!tag) {
      tag = doc.createElement('script')
      tag.setAttribute(attr, '')
      tag.setAttribute('defer', '')
      doc.head.appendChild(tag)
    }
    if (tag.getAttribute('src') !== src) tag.setAttribute('src', src)
  }
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
