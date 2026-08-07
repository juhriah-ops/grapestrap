/**
 * GrapeStrap — GrapesJS canvas initialization
 *
 * Configures the canvas with:
 *   - Bootstrap 5 (CSS + JS) + Font Awesome Free reconciled into the iframe
 *     head by syncFrameworksIntoCanvas — the project's own vendored framework
 *     (manifest.framework) when it declares one, else GrapeStrap's bundled set
 *   - Inter font for canvas UI elements (the user's content can override)
 *   - Three responsive devices (Desktop/Tablet/Mobile)
 *   - Storage manager DISABLED — we manage state on disk via .gstrap, not localStorage
 *   - Style Manager EMPTY — replaced by our class-first panels
 *   - Inline-style writing DISABLED — selectors only, never inline
 *   - Default views panel trimmed to the Layer Manager toggle only
 *
 * Plugins (loaded via the plugin host) register blocks/sections via the API.
 * This module just stands up the canvas; it's the plugins that fill it.
 */

import grapesjs from 'grapesjs'
import { pluginRegistry } from '../plugin-host/registry.js'
import { eventBus } from '../state/event-bus.js'
import { projectState } from '../state/project-state.js'
import { formatHtml } from './format-html.js'
import { initDragResize } from './drag-resize.js'
import { rewriteCssUrls, stylesheetDirOf } from '../../shared/css-urls.js'
import { stripBodyWrapper } from '../../shared/page-html.js'
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
//
// A project that vendors its OWN framework (manifest.framework — the Graphite
// starter ships its own Bootstrap + Font Awesome + webfonts) replaces this
// default set wholesale rather than adding to it.
const DEFAULT_FRAMEWORK_CSS = [
  'assets/css/bootstrap.css',
  'assets/css/bootstrap-icons.css',
  'assets/css/all.css'
]
const DEFAULT_FRAMEWORK_JS = [
  'assets/js/bootstrap.bundle.js'
]

// Every framework tag we inject carries this attribute, holding its own
// href/src. One marker for every entry (rather than the old per-constant
// data-grapestrap-bs / -bsi / -fa / -bsjs attributes) is what lets the
// reconciler enumerate the full injected set — including tags for a framework
// list it has never seen — and drop the ones no longer in play.
const CANVAS_FRAMEWORK_MARKER = 'data-grapestrap-fwx'

// Superseded per-constant markers. Kept only so a tag injected by an earlier
// build is found by URL and adopted under the common marker instead of being
// duplicated alongside it.
const LEGACY_CANVAS_FRAMEWORK_MARKERS = [
  'data-grapestrap-bs',
  'data-grapestrap-bsi',
  'data-grapestrap-fa',
  'data-grapestrap-bsjs'
]
const CANVAS_FRAMEWORK_SELECTOR = [CANVAS_FRAMEWORK_MARKER, ...LEGACY_CANVAS_FRAMEWORK_MARKERS]
  .map(attr => `[${attr}]`)
  .join(',')

let editor = null

export function initGrapesJS(container) {
  // Hard double-init guard (Wave 3). The canvas panel's persistent subtree
  // means this is only ever called once in practice, but a second GrapesJS
  // editor would silently swap pluginRegistry.bound.editor, duplicate the
  // plugin:block-registered sub below, and orphan the first editor's canvas
  // content — so no future caller may ever re-init.
  if (editor) {
    log.warn('initGrapesJS called twice — ignored, returning the existing editor')
    return editor
  }
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

  // Strip the default views-panel buttons that duplicate our own panels:
  // Style Manager and traits/settings are replaced by the class-first
  // side panels, blocks by the Insert panel. Only the Layer Manager
  // toggle stays — it has no GrapeStrap-native equivalent.
  //
  // MUST run after render (onReady), not right after init: mutating the
  // views panel before the deferred first render aborts EditorView.render
  // partway — the devices-c select and the views-container panel silently
  // never mount (reported on nola1 as "Desktop/Tablet/Mobile gone from the
  // canvas top bar").
  editor.onReady(() => {
    for (const id of ['open-sm', 'open-tm', 'open-blocks']) {
      // open-sm ships active:true, so its Classes/Style view is already
      // appended into the views-container at render — removing the button
      // alone strands that view there, permanently open with no way to
      // close it (and eating canvas width).
      editor.stopCommand(id)
      editor.Panels.removeButton('views', id)
    }
    // Vendor ships the layers button togglable:false (vanilla UX switches
    // between views, never closes). With it as the sole survivor it must
    // toggle off, or the overlay could never be dismissed.
    editor.Panels.getButton('views', 'open-layers')?.set('togglable', true)
  })

  // Vendor CSS reserves a permanent --gjs-left-width (15%) column for the
  // views-container, shrinking the canvas even when the Layer Manager is
  // closed — badly so in split view. gjs-chrome.css gives the canvas the
  // full pane and turns the container into a right-edge overlay gated by
  // this class.
  editor.on('run:open-layers',  () => container.classList.add('is-gjs-views-open'))
  editor.on('stop:open-layers', () => container.classList.remove('is-gjs-views-open'))

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
  // Drag-to-resize handles with Bootstrap class snapping (Wave 2). Single
  // hook point — all selection/drag wiring lives in drag-resize.js.
  initDragResize(editor)
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
//
// The authored CSS's relative url()s are FILE-RELATIVE to the stylesheet at
// assets/css/style.css (e.g. `../images/foo.png`) — correct for export, where
// pages link it via <link href="assets/css/style.css">. Inlined here they'd
// resolve against the canvas document base (`site/`) instead, so rewrite them
// to document-relative IN MEMORY at inject time. The user's CSS (projectState,
// Custom CSS panel, disk, export) is never touched.
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
  const stylesheetBase = stylesheetDirOf(projectState.current?.manifest?.globalCSS || 'assets/css/style.css')
  tag.textContent = rewriteCssUrls(projectState.current?.globalCSS || '', stylesheetBase)
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

/**
 * Reconcile the canvas iframe's framework <link>/<script> tags against the
 * open project's active set.
 *
 * Paths are project-relative and resolve through the project's <base href>,
 * so the SAME paths work in canvas preview AND after server transfer.
 *
 * Reconciling, not just additive: tags whose URL has dropped out of the active
 * set are REMOVED. Injecting-only could never shrink the set, so switching
 * from a project that vendors its own framework to one on the bundled set (or
 * back) left the previous project's Bootstrap loaded in the iframe on top of
 * the new one's — two Bootstraps fighting over the same canvas.
 *
 * No-op when no project is open, which leaves the previous project's tags in
 * the iframe until the next project opens and reconciles them away.
 *
 * @param {Document} [docArg] - Canvas document; defaults to the live frame's
 */
function syncFrameworksIntoCanvas(docArg) {
  const doc = docArg || editor?.Canvas?.getFrameEl()?.contentDocument
  if (!doc) return
  if (!projectState.current?.projectDir) return

  const active = getActiveFrameworkUrls()
  removeStaleFrameworkTags(doc, active)

  // The globalCSS <style> anchors the ordering contract: <base> → frameworks →
  // globalCSS, so project CSS always wins the cascade over framework CSS.
  // insertBefore(tag, null) appends, which is the pre-globalCSS-sync case.
  const globalCssTag = doc.head.querySelector('style[data-grapestrap-globalcss]')
  const orderedTags = [
    ...active.css.map(href => ensureFrameworkTag(doc, 'link', href)),
    ...active.js.map(src => ensureFrameworkTag(doc, 'script', src))
  ]
  if (!isFrameworkOrderCorrect(doc, orderedTags, globalCssTag)) {
    for (const tag of orderedTags) doc.head.insertBefore(tag, globalCssTag)
  }
}

/**
 * The framework URLs the open project should have loaded, in emit order.
 * A `manifest.framework` of any shape means the project vendors its own, so
 * the bundled set is suppressed entirely rather than merged with.
 * @returns {{css: string[], js: string[]}}
 */
function getActiveFrameworkUrls() {
  const vendored = projectState.current?.manifest?.framework
  if (!vendored || typeof vendored !== 'object') {
    return { css: [...DEFAULT_FRAMEWORK_CSS], js: [...DEFAULT_FRAMEWORK_JS] }
  }
  const isUsableUrl = value => typeof value === 'string' && value.trim() !== ''
  return {
    css: (Array.isArray(vendored.css) ? vendored.css : []).filter(isUsableUrl),
    js:  (Array.isArray(vendored.js)  ? vendored.js  : []).filter(isUsableUrl)
  }
}

/**
 * Drop every injected framework tag whose URL is no longer active. Matching on
 * URL (not on tag identity) is what lets a legacy per-constant-marked tag be
 * retired by the same pass.
 * @param {Document} doc - Canvas document
 * @param {{css: string[], js: string[]}} active - Current active URL set
 */
function removeStaleFrameworkTags(doc, active) {
  const activeCss = new Set(active.css)
  const activeJs = new Set(active.js)
  for (const tag of doc.head.querySelectorAll(CANVAS_FRAMEWORK_SELECTOR)) {
    const isScript = tag.tagName === 'SCRIPT'
    const url = tag.getAttribute(isScript ? 'src' : 'href') || ''
    const isStillActive = isScript ? activeJs.has(url) : activeCss.has(url)
    if (!isStillActive) tag.remove()
  }
}

/**
 * Find (or create) the tag for one framework URL, stamped with the common
 * marker. Detached when freshly created — the caller owns head placement.
 * @param {Document} doc - Canvas document
 * @param {'link'|'script'} tagName - Element to look for / create
 * @param {string} url - Project-relative href/src
 * @returns {Element} The tag carrying this URL
 */
function ensureFrameworkTag(doc, tagName, url) {
  const urlAttr = tagName === 'script' ? 'src' : 'href'
  for (const candidate of doc.head.querySelectorAll(CANVAS_FRAMEWORK_SELECTOR)) {
    if (candidate.tagName !== tagName.toUpperCase()) continue
    if (candidate.getAttribute(urlAttr) !== url) continue
    // Adopts a legacy per-constant-marked tag without refetching its resource.
    candidate.setAttribute(CANVAS_FRAMEWORK_MARKER, url)
    return candidate
  }
  const tag = doc.createElement(tagName)
  tag.setAttribute(CANVAS_FRAMEWORK_MARKER, url)
  if (tagName === 'link') tag.setAttribute('rel', 'stylesheet')
  // Scripts stay deferred so the bundle can't block the canvas parse.
  if (tagName === 'script') tag.setAttribute('defer', '')
  tag.setAttribute(urlAttr, url)
  return tag
}

/**
 * True when every framework tag is already attached, in order, ahead of the
 * globalCSS anchor. Resync runs on every canvas content change (rAF-coalesced),
 * and re-inserting correctly-placed <link> nodes churns style recalculation in
 * the iframe for nothing.
 * @param {Document} doc - Canvas document
 * @param {Element[]} orderedTags - Framework tags in intended order
 * @param {Element|null} globalCssTag - The globalCSS <style>, if injected yet
 * @returns {boolean}
 */
function isFrameworkOrderCorrect(doc, orderedTags, globalCssTag) {
  const headChildren = Array.from(doc.head.children)
  const anchorIndex = globalCssTag ? headChildren.indexOf(globalCssTag) : headChildren.length
  let previousIndex = -1
  for (const tag of orderedTags) {
    const index = headChildren.indexOf(tag)
    if (index === -1) return false          // freshly created, not attached yet
    if (index <= previousIndex) return false // out of order against the list
    if (index > anchorIndex) return false    // fell behind the globalCSS anchor
    previousIndex = index
  }
  return true
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
  // stripBodyWrapper: getHtml() wraps the serialization in a `<body>` tag,
  // but fragments are body-INNER by contract — leaving it in nested a second
  // <body> into every composed page (nola1 2026-08-07 "double body tags").
  return formatHtml(stripBodyWrapper(editor.getHtml() || ''))
}

// getCanvasHtmlRaw — the un-formatted single-line output. Reserved for paths
// that genuinely need the parser-friendly form (currently none, but kept as
// an explicit escape hatch).
export function getCanvasHtmlRaw() {
  if (!editor) return ''
  return stripBodyWrapper(editor.getHtml() || '')
}
