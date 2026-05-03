/**
 * GrapeStrap — Insert panel (tabbed) + canvas iframe drag-and-drop
 *
 * Six tabs in v0.0.1: Common / Layout / Forms / Text / Media / Sections.
 * Library and Snippets tabs are added in v0.0.2.
 *
 * Each tab pulls its blocks from the plugin registry (filtered by category).
 *
 * Two insertion paths share the same anchor-aware placement logic:
 *
 *   1. CLICK-TO-INSERT — the tile click handler dispatches insertBlockById
 *      with the editor's current selection as the anchor. Originally the
 *      only path; still important because nothing on the canvas needs to
 *      be hovered over.
 *
 *   2. DRAG-AND-DROP (added v0.0.2 2026-05-03) — the tile is
 *      draggable=true and dragstart wires the block id onto the
 *      `application/x-grapestrap-block` MIME type. wireCanvasDropTarget
 *      attaches dragover / drop listeners to the GrapesJS canvas iframe
 *      contentDocument; on drop, the component under the cursor becomes
 *      the anchor passed to the same placement logic.
 *
 * Anchor-aware placement rule (applies to BOTH paths):
 *   - No anchor (or anchor is the wrapper): append to the page root.
 *   - Anchor is a known container (div / section / main / article /
 *     aside / header / footer / nav / form / ul / ol): append INSIDE
 *     the container as its last child.
 *   - Anchor is a known leaf (p / h1-h6 / span / img / a / button /
 *     input / label): insert as a sibling AFTER the anchor.
 *   - Anything else: sibling-after fallback (predictable for unknown).
 *
 * Visual feedback:
 *   - Click insert: 700ms green outline flash on the destination
 *     container (skipped for wrapper).
 *   - DnD: dashed green outline on the prospective drop target
 *     during dragover (continuous), then the same green flash on
 *     successful drop.
 */

import { pluginRegistry } from '../../plugin-host/registry.js'
import { eventBus } from '../../state/event-bus.js'
import { getEditor } from '../../editor/grapesjs-init.js'

const TABS = [
  { id: 'common',   label: 'Common'   },
  { id: 'layout',   label: 'Layout'   },
  { id: 'forms',    label: 'Forms'    },
  { id: 'text',     label: 'Text'     },
  { id: 'media',    label: 'Media'    },
  { id: 'sections', label: 'Sections' }
  // Library + Snippets in v0.0.2
]

let activeTab = 'common'

export function renderInsertPanel(host) {
  host.innerHTML = `
    <div class="gstrap-insert-tabs">
      ${TABS.map(t => `<button class="gstrap-insert-tab ${t.id === activeTab ? 'is-active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
    </div>
    <div class="gstrap-insert-content" data-region="insert-content"></div>
  `

  host.addEventListener('click', evt => {
    const tab = evt.target.closest('[data-tab]')
    if (tab) {
      activeTab = tab.dataset.tab
      host.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('is-active', b.dataset.tab === activeTab))
      refreshContent(host)
      eventBus.emit('insert:tab-changed', activeTab)
      return
    }
    const tile = evt.target.closest('[data-block-id]')
    if (tile) {
      insertBlockById(tile.dataset.blockId)
    }
  })

  // Drag-from-tile: wire the block id onto the dataTransfer. The matching
  // drop-target on the canvas iframe is bound below via wireCanvasDropTarget.
  host.addEventListener('dragstart', evt => {
    const tile = evt.target.closest('[data-block-id]')
    if (!tile) return
    evt.dataTransfer?.setData(DROP_MIME, tile.dataset.blockId)
    evt.dataTransfer?.setData('text/plain', tile.dataset.blockId)
    if (evt.dataTransfer) evt.dataTransfer.effectAllowed = 'copy'
  })

  refreshContent(host)
  eventBus.on('plugin:block-registered', () => refreshContent(host))

  // Bind the canvas iframe drop target. The iframe contentDocument isn't
  // reliably populated by the time canvas:ready or canvas:frame:load fire
  // in this environment, so combine three attach strategies:
  //   - canvas:ready (sync attempt; usually no-op, doc not yet attached)
  //   - editor.on('canvas:frame:load') for project / page swap re-creates
  //   - 100 ms polling for up to 5 s as a fallback for the initial load
  // wireCanvasDropTarget is idempotent (per-doc flag) so retries are cheap.
  eventBus.on('canvas:ready', editor => {
    const attach = () => wireCanvasDropTarget(editor)
    attach()
    editor?.on?.('canvas:frame:load', attach)
    let elapsed = 0
    const tick = () => {
      attach()
      const doc = canvasDoc(editor)
      if (doc?.__gstrapDropWired) return
      if (elapsed > 5000) return
      elapsed += 100
      setTimeout(tick, 100)
    }
    setTimeout(tick, 100)
  })

  eventBus.on('insert:focus-tab', tab => {
    activeTab = tab
    refreshContent(host)
  })
}

function refreshContent(host) {
  const content = host.querySelector('[data-region="insert-content"]')
  if (!content) return

  const blocks = pluginRegistry.blocks.filter(b => matchesCategory(b, activeTab))
  if (blocks.length === 0) {
    content.innerHTML = `<div class="gstrap-empty">No blocks in this category yet.</div>`
    return
  }
  content.innerHTML = blocks.map(b => `
    <div class="gstrap-block-tile" data-block-id="${b.id}" draggable="true" title="${b.label}">
      <div class="gstrap-block-tile-media">${b.media || ''}</div>
      <div class="gstrap-block-tile-label">${b.label}</div>
    </div>
  `).join('')
}

// Tag classification for the placement rule. Lowercase. `td/th/li` are NOT
// in the container set on purpose — they're typed by their parent and we
// don't want a paragraph to land inside a <li> from a Layout tab click;
// users who want that can drill in by clicking the <li> first, at which
// point the "else" branch puts it as a sibling-after, which is what they
// almost certainly want.
const CONTAINER_TAGS = new Set([
  'div', 'section', 'main', 'article', 'aside',
  'header', 'footer', 'nav', 'form',
  'ul', 'ol'
])
const LEAF_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'span', 'img', 'a', 'button', 'input', 'label'
])

function tagOf(component) {
  return (component?.get?.('tagName') || '').toLowerCase()
}

function blockContent(editor, blockId) {
  const fromRegistry = pluginRegistry.blocks.find(b => b.id === blockId)
  return fromRegistry?.content
         ?? editor.BlockManager?.get?.(blockId)?.get?.('content')
}

// Apply the anchor-aware placement rule. Pure of UI side effects so it can
// be unit-reasoned about; returns { target, added } so the caller can
// drive the flash and selection.
function appendAtAnchor(editor, anchor, content) {
  const wrapper = editor.getWrapper()
  if (!anchor || anchor === wrapper) {
    return { target: wrapper, added: wrapper.append(content) }
  }
  const tag = tagOf(anchor)
  if (CONTAINER_TAGS.has(tag)) {
    return { target: anchor, added: anchor.append(content) }
  }
  // Leaf or unknown — sibling-after.
  const parent = anchor.parent?.() || wrapper
  const idx = parent.components().indexOf(anchor)
  return { target: parent, added: parent.append(content, { at: idx + 1 }) }
}

function performInsert(editor, blockId, anchor) {
  const content = blockContent(editor, blockId)
  if (!content) {
    eventBus.emit('toast', { type: 'warning', message: `Block "${blockId}" has no content.` })
    return null
  }
  const { target, added } = appendAtAnchor(editor, anchor, content)
  const first = Array.isArray(added) ? added[0] : added
  if (first) editor.select(first)
  flashDestination(editor, target)
  eventBus.emit('canvas:content-changed')
  return first
}

function insertBlockById(blockId) {
  const editor = getEditor()
  if (!editor) {
    eventBus.emit('toast', { type: 'warning', message: 'Canvas not ready.' })
    return
  }
  performInsert(editor, blockId, editor.getSelected?.())
}

// ─── Destination flash ───────────────────────────────────────────────────────
//
// Brief outline animation on the container that received the insert so the
// user can see where the block landed. Skipped when the destination is the
// wrapper — the wrapper IS the page body, animating its whole outline is
// noisy and unhelpful. The new component is already selected, which gives
// it GrapesJS's standard selection outline; the flash is for the parent.

const FLASH_CLASS = 'gstrap-insert-flash'
const FLASH_STYLE_ATTR = 'data-gstrap-insert-flash'

function flashDestination(editor, container) {
  if (!container || container === editor.getWrapper()) return
  ensureCanvasFlashStyles(editor)
  const el = container.getEl?.()
  if (!el) return
  el.classList.remove(FLASH_CLASS) // restart the animation if a previous one is mid-flight
  // Force reflow so re-adding the class restarts the keyframes cleanly.
  void el.offsetWidth
  el.classList.add(FLASH_CLASS)
  setTimeout(() => el.classList.remove(FLASH_CLASS), 700)
}

// Idempotent — checks the iframe's own document each call, which keeps us
// correct across canvas iframe reloads (project switch / page reload).
function ensureCanvasFlashStyles(editor) {
  const doc = editor.Canvas?.getDocument?.()
  if (!doc || doc.querySelector(`style[${FLASH_STYLE_ATTR}]`)) return
  const style = doc.createElement('style')
  style.setAttribute(FLASH_STYLE_ATTR, '')
  // Color hardcoded — the iframe is a separate document and doesn't see the
  // shell's --accent custom property. Matches the editor accent (#3fb950).
  style.textContent = `
    @keyframes gstrap-insert-flash-anim {
      0%   { outline-color: #3fb950; }
      100% { outline-color: transparent; }
    }
    .${FLASH_CLASS} {
      outline: 2px solid #3fb950;
      outline-offset: 2px;
      animation: gstrap-insert-flash-anim 700ms ease-out forwards;
    }
    .${DROP_CLASS} {
      outline: 2px dashed #3fb950;
      outline-offset: 2px;
    }
  `
  doc.head.appendChild(style)
}

// ─── Canvas iframe drop target ───────────────────────────────────────────────
//
// dragstart on a tile (above) sets MIME `application/x-grapestrap-block` on
// the dataTransfer. The drop target lives in the GrapesJS canvas iframe's
// own contentDocument because iframe dragover/drop events do NOT bubble to
// the parent document. Wired on `canvas:ready` from grapesjs-init.js.
//
// The drop event's target is the deepest DOM element under the cursor — we
// walk up from there until we hit an element that's owned by a GrapesJS
// component, then run the same anchor-aware placement rule the click path
// uses. componentForElement walks the wrapper's component tree because
// GrapesJS doesn't expose a public element-to-component map.
//
// During dragover the prospective drop target gets a dashed-green outline
// (.gstrap-drop-target) so the user can see what their release would
// affect. The outline tracks the same container/leaf classification — if
// the user is over a leaf, the highlighted target is the leaf's PARENT
// (which is what would actually receive the new sibling).

const DROP_MIME = 'application/x-grapestrap-block'
const DROP_CLASS = 'gstrap-drop-target'
let activeDropEl = null

export function wireCanvasDropTarget(editor) {
  // editor.Canvas.getDocument() can return null until well after canvas:ready
  // fires; the same getFrameEl().contentDocument path the contextmenu
  // handler uses (in grapesjs-init.js) is reliably populated.
  const doc = canvasDoc(editor)
  if (!doc) return
  if (doc.__gstrapDropWired) return
  doc.__gstrapDropWired = true
  ensureCanvasFlashStyles(editor) // also covers the DROP_CLASS rule
  const opts = { capture: false }
  doc.addEventListener('dragenter', handleDragEnter, opts)
  doc.addEventListener('dragover',  evt => handleDragOver(editor, evt), opts)
  doc.addEventListener('dragleave', evt => handleDragLeave(doc, evt), opts)
  doc.addEventListener('drop',      evt => handleDrop(editor, evt), opts)
}

function hasGstrapBlockData(evt) {
  // dataTransfer.getData() is empty during dragover for security reasons,
  // but .types is accessible. Spread to a real array — DataTransfer.types
  // is a FrozenArray<DOMString> in modern browsers (works) but historically
  // a DOMStringList (no array indexing).
  const dt = evt.dataTransfer
  if (!dt) return false
  return Array.from(dt.types || []).includes(DROP_MIME)
}

function handleDragEnter(evt) {
  if (!hasGstrapBlockData(evt)) return
  evt.preventDefault()
}

function handleDragOver(editor, evt) {
  if (!hasGstrapBlockData(evt)) return
  evt.preventDefault()
  if (evt.dataTransfer) evt.dataTransfer.dropEffect = 'copy'
  const anchor = componentForElement(editor, evt.target)
  const target = previewTargetFor(editor, anchor)
  setDropPreview(target?.getEl?.() || null)
}

function handleDragLeave(doc, evt) {
  // dragleave fires whenever the cursor crosses any element boundary inside
  // the iframe — only clear when we've genuinely left the iframe. The most
  // reliable signal: relatedTarget is null (cursor exited the document).
  if (evt.relatedTarget) return
  setDropPreview(null)
}

function handleDrop(editor, evt) {
  if (!hasGstrapBlockData(evt)) return
  evt.preventDefault()
  setDropPreview(null)
  const blockId = evt.dataTransfer.getData(DROP_MIME)
  if (!blockId) return
  const anchor = componentForElement(editor, evt.target)
  performInsert(editor, blockId, anchor)
}

// Mirror appendAtAnchor's classification: if the anchor is a container we'd
// preview the container itself; if it's a leaf, the parent (which is what
// would actually receive the new sibling). Wrapper drop = no preview (the
// whole page outlining is noisy, same reasoning as flashDestination).
function previewTargetFor(editor, anchor) {
  const wrapper = editor.getWrapper()
  if (!anchor || anchor === wrapper) return null
  const tag = tagOf(anchor)
  if (CONTAINER_TAGS.has(tag)) return anchor
  return anchor.parent?.() || null
}

function setDropPreview(el) {
  if (activeDropEl === el) return
  activeDropEl?.classList?.remove(DROP_CLASS)
  activeDropEl = el
  el?.classList?.add(DROP_CLASS)
}

function canvasDoc(editor) {
  // editor.Canvas.getDocument() exists but is null-valued until later than
  // canvas:frame:load. The frame element's contentDocument is populated as
  // soon as the iframe is in the DOM. Prefer that.
  return editor.Canvas?.getFrameEl?.()?.contentDocument
         || editor.Canvas?.getDocument?.()
         || null
}

// GrapesJS doesn't expose a public element-to-component lookup, so we walk
// the wrapper's component tree. Page sizes in v0 are small enough that a
// per-event walk is fine; if it ever shows up in a profile, memoize on
// last-seen el.
function componentForElement(editor, el) {
  if (!el) return editor.getWrapper()
  const doc = canvasDoc(editor)
  const body = doc?.body
  let cur = el
  const wrapper = editor.getWrapper()
  while (cur && cur !== body) {
    const found = findComponentByEl(wrapper, cur)
    if (found) return found
    cur = cur.parentElement
  }
  return wrapper
}

function findComponentByEl(component, el) {
  if (!component) return null
  if (component.getEl?.() === el) return component
  // GrapesJS components() returns a Backbone Collection — indexed access via
  // `coll[i]` doesn't work, must use `.at(i)` or `.models`. Spread the
  // models array for a plain iteration.
  const kids = component.components?.()
  const arr = kids?.models || (Array.isArray(kids) ? kids : [])
  for (let i = 0; i < arr.length; i++) {
    const f = findComponentByEl(arr[i], el)
    if (f) return f
  }
  return null
}

function matchesCategory(block, tab) {
  const cat = (block.category || 'Common').toLowerCase()
  if (tab === 'common'   && cat === 'common') return true
  if (tab === 'layout'   && cat === 'layout') return true
  if (tab === 'forms'    && cat === 'forms')  return true
  if (tab === 'text'     && cat === 'text')   return true
  if (tab === 'media'    && cat === 'media')  return true
  if (tab === 'sections' && cat === 'sections') return true
  return false
}
