/**
 * GrapeStrap — Insert panel (tabbed) + canvas iframe drag-and-drop
 *
 * PATH: src/renderer/panels/insert/index.js
 * ROLE: Tabbed block palette (Common / Layout / Forms / Text / Media /
 *       Sections / Snippets) + the canvas iframe drag-and-drop target.
 *       Owns all three insert surfaces' worth of UI (click, drag, Alt+Click)
 *       but delegates the actual "where does this go" decision to
 *       editor/placement.js (single canonical implementation, chunk A1).
 * DEPENDS: plugin-host/registry.js, state/event-bus.js,
 *          editor/grapesjs-init.js, editor/placement.js, panels/snippets,
 *          i18n.js
 * CREATED: 2026-04-26
 * UPDATED: 2026-08-11 — placement logic extracted to editor/placement.js;
 *          drag now splits containers/wrapper into before/inside/after
 *          zones with a live insertion line (was: dashed outline only, no
 *          feedback over the empty wrapper); Alt+Click inserts before the
 *          anchor instead of the default after/inside position.
 *
 * Three insertion paths share the same placement logic (resolvePlacement in
 * editor/placement.js):
 *
 *   1. CLICK-TO-INSERT — the tile click handler dispatches insertBlockById
 *      with the editor's current selection as the anchor. Originally the
 *      only path; still important because nothing on the canvas needs to
 *      be hovered over. Alt+Click passes `before: true` — see (3).
 *
 *   2. DRAG-AND-DROP (added v0.0.2 2026-05-03; zones/line added chunk A2) —
 *      the tile is draggable=true and dragstart wires the block id onto the
 *      `application/x-grapestrap-block` MIME type. wireCanvasDropTarget
 *      attaches dragover / drop listeners to the GrapesJS canvas iframe
 *      contentDocument; on drop, the component under the cursor becomes
 *      the anchor, and the pointer's Y coordinate splits the anchor into
 *      before/inside/after zones (see decideDropPlacement in placement.js).
 *
 *   3. ALT+CLICK (chunk A3) — same as (1) but passes `before: true` instead
 *      of a coordinate, so the block lands just above the current
 *      selection (or at the very top of the page when nothing is
 *      selected) with no pointer position involved.
 *
 * Visual feedback:
 *   - Click insert: 700ms green outline flash on the destination
 *     (the receiving container, OR — when the destination is the page
 *     wrapper — the newly-inserted component itself, since flashing the
 *     whole page body would be noisy and unhelpful).
 *   - DnD hover: EITHER a dashed green outline on the container being
 *     dropped INTO (anchor is a container and the pointer is in its
 *     "inside" zone), OR a solid green insertion line at the before/after
 *     boundary (leaf anchors, container edge zones, and the wrapper/no-
 *     anchor case — hovering empty page space now shows the line instead
 *     of no feedback at all). Cleared on dragleave/dragend/drop, then the
 *     same green flash plays on successful drop.
 */

import { pluginRegistry } from '../../plugin-host/registry.js'
import { eventBus } from '../../state/event-bus.js'
import { getEditor } from '../../editor/grapesjs-init.js'
import { resolvePlacement, insertAtPlacement } from '../../editor/placement.js'
import {
  getSnippetTiles, getSnippetContent,
  addProjectSnippetFromSelection, deleteProjectSnippet
} from '../snippets/index.js'
import { t } from '../../i18n.js'

// Tab labels reuse the menu.insert.* keys — the native Insert menu mirrors
// these categories one-to-one (menus.js), so they must translate as one unit.
const TABS = [
  { id: 'common',   labelKey: 'menu.insert.common'   },
  { id: 'layout',   labelKey: 'menu.insert.layout'   },
  { id: 'forms',    labelKey: 'menu.insert.forms'    },
  { id: 'text',     labelKey: 'menu.insert.text'     },
  { id: 'media',    labelKey: 'menu.insert.media'    },
  { id: 'sections', labelKey: 'menu.insert.sections' },
  { id: 'snippets', labelKey: 'menu.insert.snippets' }
  // Library still pending — opens via the dedicated panel for v0.0.2
]

let activeTab = 'common'

export function renderInsertPanel(host) {
  host.innerHTML = `
    <div class="gstrap-insert-tabs">
      ${TABS.map(tab => `<button class="gstrap-insert-tab ${tab.id === activeTab ? 'is-active' : ''}" data-tab="${tab.id}">${escHtml(t(tab.labelKey))}</button>`).join('')}
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
    const captureBtn = evt.target.closest('[data-snippet-capture]')
    if (captureBtn) {
      addProjectSnippetFromSelection()
      return
    }
    const deleteBtn = evt.target.closest('[data-snippet-delete]')
    if (deleteBtn) {
      // Stop the click from also firing the surrounding tile's insert handler.
      evt.stopPropagation()
      deleteProjectSnippet(deleteBtn.dataset.snippetDelete)
      return
    }
    const tile = evt.target.closest('[data-block-id]')
    if (tile) {
      // Alt+Click inserts before the anchor (or at the very top of the page
      // when nothing is selected) instead of the default after/inside
      // position — see resolvePlacement's `before` option. Default click
      // behavior (evt.altKey false) is byte-identical to before chunk A3.
      insertBlockById(tile.dataset.blockId, { before: evt.altKey })
    }
  })

  // Drag-from-tile: stash the block id on a window-global AND on the
  // dataTransfer custom MIME. Custom MIME types (`application/x-*`) don't
  // reliably survive the parent-doc → iframe boundary in Electron — only
  // text/plain and Files do — so without the global the iframe drop handler
  // would see no usable dataTransfer and fall through to the browser default,
  // which (if dropped on a contentEditable area) pastes the block id as
  // literal text. NEVER set text/plain: that's what gets pasted on default
  // drop behavior. Reported by user 2026-05-04.
  host.addEventListener('dragstart', evt => {
    const tile = evt.target.closest('[data-block-id]')
    if (!tile) return
    window.__gstrapDragBlockId = tile.dataset.blockId
    evt.dataTransfer?.setData(DROP_MIME, tile.dataset.blockId)
    if (evt.dataTransfer) evt.dataTransfer.effectAllowed = 'copy'
  })
  host.addEventListener('dragend', () => {
    window.__gstrapDragBlockId = null
    // dragend fires on the drag SOURCE (this tile) even when the drag was
    // cancelled or dropped outside the iframe, where the canvas doc's own
    // dragleave/drop never fire — clear any stale preview left over.
    hideInsertLine()
    setDropPreview(null)
  })

  refreshContent(host)
  eventBus.on('plugin:block-registered',   () => refreshContent(host))
  eventBus.on('plugin:snippet-registered', () => { if (activeTab === 'snippets') refreshContent(host) })
  eventBus.on('snippets:changed',          () => { if (activeTab === 'snippets') refreshContent(host) })
  eventBus.on('project:opened',            () => { if (activeTab === 'snippets') refreshContent(host) })
  eventBus.on('project:closed',            () => { if (activeTab === 'snippets') refreshContent(host) })

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

  // Insert menu (menu-router) lands here. Mirror the click path in full —
  // repaint the tab buttons and announce the change — or the content swaps
  // while the old tab button stays highlighted.
  eventBus.on('insert:focus-tab', tab => {
    activeTab = tab
    host.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('is-active', b.dataset.tab === activeTab))
    refreshContent(host)
    eventBus.emit('insert:tab-changed', activeTab)
  })
}

function refreshContent(host) {
  const content = host.querySelector('[data-region="insert-content"]')
  if (!content) return

  if (activeTab === 'snippets') {
    renderSnippetsTab(content)
    return
  }

  const blocks = pluginRegistry.blocks.filter(b => matchesCategory(b, activeTab))
  if (blocks.length === 0) {
    content.innerHTML = `<div class="gstrap-empty">${escHtml(t('insert.no-blocks'))}</div>`
    return
  }
  content.innerHTML = blocks.map(b => `
    <div class="gstrap-block-tile" data-block-id="${b.id}" draggable="true" title="${b.label} — ${escAttr(t('insert.alt-hint'))}">
      <div class="gstrap-block-tile-media">${b.media || ''}</div>
      <div class="gstrap-block-tile-label">${b.label}</div>
    </div>
  `).join('')
}

function renderSnippetsTab(content) {
  const tiles = getSnippetTiles()
  const captureTile = `
    <div class="gstrap-block-tile gstrap-snippet-capture" data-snippet-capture
         title="${escAttr(t('insert.capture-title'))}">
      <div class="gstrap-block-tile-media">＋</div>
      <div class="gstrap-block-tile-label">${escHtml(t('insert.from-selection'))}</div>
    </div>
  `
  if (tiles.length === 0) {
    content.innerHTML = captureTile +
      `<div class="gstrap-empty">${escHtml(t('insert.no-snippets'))}</div>`
    return
  }
  content.innerHTML = captureTile + tiles.map(tile => `
    <div class="gstrap-block-tile gstrap-snippet-tile" data-block-id="${escAttr(tile.id)}"
         data-snippet-source="${tile.source}" draggable="true" title="${escAttr(tile.label)} — ${escAttr(t('insert.alt-hint'))}">
      <div class="gstrap-block-tile-media">${tile.media}</div>
      <div class="gstrap-block-tile-label">${escHtml(tile.label)}</div>
      ${tile.deletable ? `<button class="gstrap-snippet-x" data-snippet-delete="${escAttr(tile.rawId)}" title="${escAttr(t('action.delete'))}">×</button>` : ''}
    </div>
  `).join('')
}

function escAttr(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;') }
function escHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c]) }

function blockContent(editor, blockId) {
  // Snippet tiles use a 'snippet:source:rawId' id scheme so they don't
  // collide with plugin block ids. Resolve through the snippets module.
  if (typeof blockId === 'string' && blockId.startsWith('snippet:')) {
    return getSnippetContent(blockId)
  }
  const fromRegistry = pluginRegistry.blocks.find(b => b.id === blockId)
  return fromRegistry?.content
         ?? editor.BlockManager?.get?.(blockId)?.get?.('content')
}

// Resolve placement (editor/placement.js) + insert + drive selection/flash.
// `placementOpts` is passed straight through to resolvePlacement — either
// `{ clientY }` (drag-and-drop; see handleDrop) or `{ before }` (Alt+Click;
// see insertBlockById) or neither (default click / the old anchor-only rule).
function performInsert(editor, blockId, anchor, placementOpts = {}) {
  const content = blockContent(editor, blockId)
  if (!content) {
    eventBus.emit('toast', { type: 'warning', message: t('insert.toast.no-content', { id: blockId }) })
    return null
  }
  const placement = resolvePlacement(editor, anchor, placementOpts)
  const { target, added } = insertAtPlacement(editor, placement, content)
  const first = Array.isArray(added) ? added[0] : added
  if (first) editor.select(first)
  const wrapper = editor.getWrapper()
  // Flashing the whole page wrapper is noisy and unhelpful (it IS the page
  // body) — when the insert landed directly on the wrapper, flash the
  // newly-inserted component itself instead of skipping the feedback
  // entirely (chunk A3 — previously this case had no flash at all).
  flashDestination(editor, target === wrapper ? first : target)
  eventBus.emit('canvas:content-changed')
  return first
}

function insertBlockById(blockId, { before = false } = {}) {
  const editor = getEditor()
  if (!editor) {
    eventBus.emit('toast', { type: 'warning', message: t('toast.canvas-not-ready') })
    return
  }
  performInsert(editor, blockId, editor.getSelected?.(), { before })
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
    .${INSERT_LINE_CLASS} {
      position: fixed;
      height: 2px;
      background-color: #3fb950;
      pointer-events: none;
      z-index: 9999;
      display: none;
      /* top/left/width are runtime-computed per drag position — see
         positionInsertLine, which sets them via setProperty on these three
         custom properties. This is the ONE sanctioned inline-style path in
         this module: geometry that changes every pointermove can't live in
         a static class, but it's still routed through CSS custom properties
         rather than a direct style.top/.left/.width assignment. */
      top: var(--gstrap-line-top, 0px);
      left: var(--gstrap-line-left, 0px);
      width: var(--gstrap-line-width, 0px);
    }
    .${INSERT_LINE_CLASS}.${INSERT_LINE_VISIBLE_CLASS} {
      display: block;
    }
  `
  doc.head.appendChild(style)
}

// ─── Drop insertion line ─────────────────────────────────────────────────────
//
// Shown instead of the dashed container outline whenever the drop would NOT
// land "inside" a container: before/after a container's edge zone, before/
// after a leaf, or anywhere over the wrapper (chunk A2 — previously hovering
// empty page space gave no feedback at all). One reused element, repositioned
// via CSS custom properties on every dragover (see the sanctioned-exception
// note in ensureCanvasFlashStyles above); shown/hidden via the is-visible
// class rather than adding/removing the element from the DOM each time.

const INSERT_LINE_CLASS = 'gstrap-insert-line'
const INSERT_LINE_VISIBLE_CLASS = 'is-visible'
let insertLineEl = null

// Idempotent per-doc, like ensureCanvasFlashStyles — a canvas iframe reload
// (project/page swap) detaches the old element, so re-create if it's no
// longer attached to the CURRENT document.
function ensureInsertLine(doc) {
  if (insertLineEl && insertLineEl.ownerDocument === doc && doc.body.contains(insertLineEl)) {
    return insertLineEl
  }
  insertLineEl = doc.createElement('div')
  insertLineEl.className = INSERT_LINE_CLASS
  doc.body.appendChild(insertLineEl)
  return insertLineEl
}

// Position the line at the boundary described by a placement result: above
// the child currently at `at`, or below the last child (or at the parent's
// own top, if it has none) when appending at the end (at === -1 or
// at === child count). Returns false when the parent has no measurable
// element, so the caller can hide the line instead of drawing it at (0,0).
function positionInsertLine(lineEl, parentComponent, at) {
  const parentEl = parentComponent?.getEl?.()
  if (!parentEl) return false
  const parentRect = parentEl.getBoundingClientRect()
  const childEls = childElsOf(parentComponent)
  const boundaryEl = (at != null && at >= 0 && at < childEls.length) ? childEls[at] : null
  const top = boundaryEl
    ? boundaryEl.getBoundingClientRect().top
    : (childEls.length > 0
        ? childEls[childEls.length - 1].getBoundingClientRect().bottom
        : parentRect.top)
  lineEl.style.setProperty('--gstrap-line-top', `${top}px`)
  lineEl.style.setProperty('--gstrap-line-left', `${parentRect.left}px`)
  lineEl.style.setProperty('--gstrap-line-width', `${parentRect.width}px`)
  return true
}

function childElsOf(component) {
  const kids = component?.components?.()
  const arr = kids?.models || (Array.isArray(kids) ? kids : [])
  return arr.map(c => c.getEl?.()).filter(Boolean)
}

function showInsertLineAt(editor, placement) {
  const doc = canvasDoc(editor)
  if (!doc) return
  const line = ensureInsertLine(doc)
  if (!positionInsertLine(line, placement.parent, placement.at)) {
    hideInsertLine()
    return
  }
  line.classList.add(INSERT_LINE_VISIBLE_CLASS)
}

function hideInsertLine() {
  insertLineEl?.classList.remove(INSERT_LINE_VISIBLE_CLASS)
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
  //
  // The window-global fallback covers the Electron parent-doc → iframe case
  // where the custom MIME is stripped at the boundary. Same window object is
  // visible from the canvas iframe via window.parent (same-origin file://).
  const dt = evt.dataTransfer
  if (dt && Array.from(dt.types || []).includes(DROP_MIME)) return true
  return Boolean(activeWindowDragBlockId())
}

function activeWindowDragBlockId() {
  // The iframe inherits same-origin from its parent renderer; reach across
  // for the global the Insert panel sets on dragstart.
  try {
    return window.parent?.__gstrapDragBlockId
        || window.top?.__gstrapDragBlockId
        || window.__gstrapDragBlockId
        || null
  } catch {
    return null
  }
}

function handleDragEnter(evt) {
  if (!hasGstrapBlockData(evt)) return
  evt.preventDefault()
}

function handleDragOver(editor, evt) {
  if (!hasGstrapBlockData(evt)) return
  evt.preventDefault()
  if (evt.dataTransfer) evt.dataTransfer.dropEffect = 'copy'
  const wrapper = editor.getWrapper()
  const anchor = componentForElement(editor, evt.target)
  const placement = resolvePlacement(editor, anchor, { clientY: evt.clientY })
  // resolvePlacement only returns { parent: anchor, ... } when the pointer
  // landed in a container's "inside" zone (see placement.js) — every other
  // case (leaf before/after, container edge zones, and the wrapper/no-anchor
  // case) gets the insertion line instead of the dashed outline.
  const isInsideContainer = Boolean(anchor) && anchor !== wrapper && placement.parent === anchor
  if (isInsideContainer) {
    hideInsertLine()
    setDropPreview(anchor.getEl?.() || null)
  } else {
    setDropPreview(null)
    showInsertLineAt(editor, placement)
  }
}

function handleDragLeave(doc, evt) {
  // dragleave fires whenever the cursor crosses any element boundary inside
  // the iframe — only clear when we've genuinely left the iframe. The most
  // reliable signal: relatedTarget is null (cursor exited the document).
  if (evt.relatedTarget) return
  setDropPreview(null)
  hideInsertLine()
}

function handleDrop(editor, evt) {
  if (!hasGstrapBlockData(evt)) return
  evt.preventDefault()
  // Also stop propagation so a contentEditable element under the cursor
  // doesn't get a chance to act on the drop after we've claimed it.
  evt.stopPropagation()
  setDropPreview(null)
  hideInsertLine()
  const blockId = evt.dataTransfer?.getData(DROP_MIME) || activeWindowDragBlockId()
  if (window.parent) window.parent.__gstrapDragBlockId = null
  if (!blockId) return
  const anchor = componentForElement(editor, evt.target)
  performInsert(editor, blockId, anchor, { clientY: evt.clientY })
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
