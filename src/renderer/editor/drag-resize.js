/**
 * GrapeStrap — Drag-to-resize with Bootstrap class snapping
 *
 * PATH: src/renderer/editor/drag-resize.js
 * ROLE: Injects drag handles into the canvas iframe for the selected
 *       component. Column right-edge drags snap to col-{bp}-1..12 (bp from
 *       the breakpoint bar), image right-edge drags snap to w-25/50/75/100,
 *       margin/padding edge-strip drags snap to m*-0..5 / p*-0..5. A ghost
 *       outline + live class badge preview the snap target during the drag;
 *       release applies the class via applyGroup() = one setClass() = ONE
 *       undo entry (contract pinned by tests/e2e/undo-redo.spec.js).
 * DEPENDS: panels/style-manager/bs-classes.js (class vocab — single source
 *          of truth), panels/style-manager/class-utils.js (applyGroup),
 *          panels/breakpoints/index.js (activeBreakpointId), ./component-lock.js
 *          (isComponentLocked), state/event-bus, log,
 *          ./drag-resize-canvas.css (?raw, injected into the iframe)
 * CREATED: 2026-07-12
 * UPDATED: 2026-08-18 — the lock gate in attach() now calls isComponentLocked()
 *          instead of reading `editable === false` directly. That read declared
 *          every STRUCTURAL component locked (GrapesJS defaults editable:false
 *          on div/section/table/…), so containers never got resize handles at
 *          all — only text-ish leaves did. Same swap already made at four other
 *          call sites this round; see editor/component-lock.js for the full
 *          "why editable is not the lock flag" writeup.
 *
 * Coordinate space (RISK #2, resolved): the breakpoint slider narrows the
 * canvas via frame.style.width (panels/breakpoints/index.js applyCanvasWidth)
 * — pure CSS width, NO transform, and nothing in src calls Canvas.setZoom.
 * Handles and pointer listeners both live INSIDE the iframe document, so all
 * drag math is iframe-native CSS px: ev.clientX and getBoundingClientRect()
 * share one coordinate space at scale 1. getFrameEl().getBoundingClientRect()
 * is only needed when converting to host-window coords (the e2e spec does).
 *
 * GrapesJS coexistence: the stock image type ships resizable:{ratioDefault:1}
 * whose Resizer writes pixel width/height into project CSS — suppressed at
 * init via a type-default extension (class-first rule). Handle pointerdown
 * preventDefault+stopPropagation keeps GrapesJS's selection mousedown from
 * treating a handle grab as a canvas click. The parent-document toolbar
 * (move/clone/delete) and badge are untouched.
 */

import { eventBus } from '../state/event-bus.js'
import { log } from '../log.js'
import {
  colClass, colPattern, colAnyPattern,
  spacingClass, spacingPattern, widthPattern
} from '../panels/style-manager/bs-classes.js'
import { applyGroup, readGroup } from '../panels/style-manager/class-utils.js'
import { activeBreakpointId } from '../panels/breakpoints/index.js'
import { isComponentLocked } from './component-lock.js'
import canvasCss from './drag-resize-canvas.css?raw'
import { t } from '../i18n.js'


// BS5 sizing utilities have no responsive variants (verified against bundled
// bootstrap 5.3.8: .w-50 exists, .w-md-50 does not) — image snaps ignore bp.
const IMG_SNAP_PCTS = [25, 50, 75, 100]
// BS5 $spacers scale 0..5 in rem: 0, .25, .5, 1, 1.5, 3.
const SPACING_SCALE_REMS = [0, 0.25, 0.5, 1, 1.5, 3]
// BS5 logical side tokens (bundled BS 5.3.8 has .me-3, NOT .mr-3):
// t=top, e=end/right(LTR), b=bottom, s=start/left(LTR).
const EDGE_SIDES = ['t', 'e', 'b', 's']

const STRIP_THICKNESS = 6   // px — margin/padding grab strips
const GRIP_W = 10           // px — width-handle grip size
const GRIP_H = 28
const MIN_EDGE_LEN = 32     // skip strips on edges shorter than this
const MIN_GRIP_EDGE = 16    // skip the width grip on very short elements

// Module state. `wired` is init-scoped (lives for the editor's lifetime),
// `sel` is selection-scoped, `drag` is drag-session-scoped. eventBus wiring
// is guarded by busWired so a re-init (Wave 3 loadLayout re-runs panel
// factories) can't stack duplicate bus subscriptions.
const wired = { editor: null, busWired: false, frameRO: null }
let sel = null   // { comp, doc, overlay, handles }
let drag = null  // { kind, prop, side, bp, pattern, original, candidate, pointerId, ghost, badge, docListeners }
let layoutQueued = false

/**
 * Wire drag-to-resize onto a GrapesJS editor. Called once from initGrapesJS
 * (the single grapesjs-init.js integration point). Idempotent per editor;
 * invalid input is a silent no-op — this must never take the canvas down.
 */
export function initDragResize(editor) {
  if (!editor || wired.editor === editor) return
  wired.editor = editor
  suppressBuiltInImageResizer(editor)

  editor.on('component:selected', comp => attach(comp))
  editor.on('component:deselected', () => detach())
  editor.on('component:remove', comp => { if (sel && comp === sel.comp) detach() })
  editor.on('component:update:classes', () => queueLayout())
  // Iframe rebuild: injected nodes + their listeners died with the old
  // document. Reset refs and re-target the frame observer.
  editor.on('canvas:frame:load', () => { detach(); observeFrame() })
  observeFrame()

  if (!wired.busWired) {
    wired.busWired = true
    // Tab swap / project close clear the canvas (panels/canvas/index.js) —
    // cancel without writing; the swap path fences the UndoManager itself.
    eventBus.on('tab:focused', () => detach())
    eventBus.on('project:closed', () => detach())
    eventBus.on('canvas:content-changed', () => queueLayout())
  }
  log.info('drag-resize initialized')
}

// ── GrapesJS coexistence ─────────────────────────────────────────────────────

/**
 * Stock GrapesJS 0.21 images are resizable:{ratioDefault:1}; the built-in
 * Resizer writes PIXEL width/height through the CssComposer — that fights
 * class-first w-25..100 snapping and lands hard px sizes in project CSS.
 * addType() with an existing id EXTENDS the stock type, so this flips only
 * the one default. Non-image components aren't resizable by default in 0.21.
 */
function suppressBuiltInImageResizer(editor) {
  const dc = editor.DomComponents || editor.Components
  dc?.addType?.('image', { model: { defaults: { resizable: false } } })
}

// ── Canvas document access ───────────────────────────────────────────────────

/**
 * House lesson (project CLAUDE.md): never grab the iframe by selector — go
 * through the Canvas API. getFrameEl().contentDocument is the reliable form:
 * Canvas.getDocument() stays null until later than canvas:frame:load (see
 * panels/insert/index.js:439-442 for the original finding).
 */
function canvasDoc() {
  return wired.editor?.Canvas?.getFrameEl?.()?.contentDocument || null
}

/** Handle/ghost/badge CSS must live INSIDE the iframe — parent stylesheets
 *  can't reach iframe content. Same injection pattern as the globalCSS tag
 *  in grapesjs-init.js. Model-based getHtml() never serializes head tags,
 *  so this can't leak into saved pages. */
function ensureCanvasCss(doc) {
  if (doc.querySelector('style[data-grapestrap-dragresize]')) return
  const tag = doc.createElement('style')
  tag.setAttribute('data-grapestrap-dragresize', '')
  tag.textContent = canvasCss
  doc.head.appendChild(tag)
}

// ── Selection lifecycle ──────────────────────────────────────────────────────

function attach(comp) {
  detach()
  const editor = wired.editor
  if (!editor || !comp) return
  if (comp === editor.getWrapper?.()) return
  // Locked chrome (master-template regions, library items) gets no resize
  // surface. The predicate lives in editor/component-lock.js — reading
  // `editable === false` here instead was the bug: GrapesJS ships that flag
  // false on every structural component, so sections/rows/cards/divs were all
  // treated as locked and never got handles.
  if (isComponentLocked(comp)) return
  const doc = canvasDoc()
  const el = comp.getEl?.()
  if (!doc || !el || !el.isConnected) return

  ensureCanvasCss(doc)
  const overlay = doc.createElement('div')
  overlay.className = 'gstrap-dragr-overlay'
  overlay.setAttribute('data-gstrap-drag-overlay', '')
  // documentElement, NOT body: the iframe body IS the GrapesJS wrapper
  // component's element — parking the overlay outside <body> keeps it clear
  // of wrapper hit-testing and setComponents body re-renders.
  doc.documentElement.appendChild(overlay)
  sel = { comp, doc, overlay, handles: buildHandles(overlay, comp, doc) }
  layoutHandles()
}

function detach() {
  if (drag) finishDrag(false)
  if (sel?.overlay?.isConnected) sel.overlay.remove()
  sel = null
}

/** Create the handle nodes this component qualifies for. Geometry is applied
 *  separately in layoutHandles() so reposition never rebuilds nodes. */
function buildHandles(overlay, comp, doc) {
  const handles = []
  const make = (kind, className, title) => {
    const h = doc.createElement('div')
    h.className = `gstrap-dragr-handle ${className}`
    h.setAttribute('data-dragr-kind', kind)
    h.title = title
    h.addEventListener('pointerdown', ev => beginDrag(ev, kind))
    // Belt-and-braces: preventDefault on pointerdown already suppresses the
    // compat mousedown, but if it ever fires it must not reach GrapesJS's
    // selection listener (overlay nodes aren't component elements — a click
    // reaching the document would deselect).
    h.addEventListener('mousedown', ev => { ev.preventDefault(); ev.stopPropagation() })
    overlay.appendChild(h)
    handles.push(h)
    return h
  }

  if (isBootstrapColumn(comp)) {
    make('col', 'gstrap-dragr-grip', t('dr.col-handle-title'))
  } else if ((comp.get?.('tagName') || '').toLowerCase() === 'img') {
    make('img', 'gstrap-dragr-grip', t('dr.img-handle-title'))
  }
  for (const side of EDGE_SIDES) {
    make(`margin-${side}`, 'gstrap-dragr-strip gstrap-dragr-strip-margin', t('dr.margin-handle-title'))
    make(`pad-${side}`, 'gstrap-dragr-strip gstrap-dragr-strip-padding', t('dr.padding-handle-title'))
  }
  return handles
}

/** Direct child of a `.row` carrying any col* class — same eligibility the
 *  Columns sub-panel uses (columns.js row gate + child filter). */
function isBootstrapColumn(comp) {
  const parentClasses = comp.parent?.()?.getClasses?.() || []
  if (!parentClasses.includes('row')) return false
  const pattern = colAnyPattern()
  return (comp.getClasses?.() || []).some(c => pattern.test(c))
}

// ── Handle geometry ──────────────────────────────────────────────────────────

/** rAF-coalesced reposition — fed by class changes, content changes, and the
 *  frame ResizeObserver (breakpoint slider / GL pane resizes). */
function queueLayout() {
  if (layoutQueued) return
  layoutQueued = true
  requestAnimationFrame(() => {
    layoutQueued = false
    if (sel && !drag) layoutHandles()
  })
}

/** Position every handle from the element's live rect, in iframe DOCUMENT
 *  coords (viewport rect + scroll) so iframe scrolling needs no re-layout.
 *  Geometry via el.style is the house-sanctioned dynamic-positioning path
 *  (same as applyCanvasWidth in panels/breakpoints/index.js); appearance
 *  stays in drag-resize-canvas.css. */
function layoutHandles() {
  const el = sel?.comp?.getEl?.()
  if (!el || !el.isConnected) { detach(); return }
  const win = sel.doc.defaultView
  const rect = el.getBoundingClientRect()
  const x = rect.left + win.scrollX
  const y = rect.top + win.scrollY
  const t = STRIP_THICKNESS

  for (const h of sel.handles) {
    const kind = h.getAttribute('data-dragr-kind')
    if (kind === 'col' || kind === 'img') {
      const show = rect.height >= MIN_GRIP_EDGE
      h.hidden = !show
      if (show) place(h, x + rect.width - GRIP_W / 2, y + rect.height / 2 - GRIP_H / 2, GRIP_W, GRIP_H)
      continue
    }
    const [prop, side] = kind.split('-') // 'margin'|'pad', 't'|'e'|'b'|'s'
    const horizontal = side === 't' || side === 'b'
    const show = (horizontal ? rect.width : rect.height) >= MIN_EDGE_LEN
    h.hidden = !show
    if (!show) continue
    const out = prop === 'margin' // margin strip sits outside the edge, padding inside
    if (side === 't') place(h, x, out ? y - t : y, rect.width, t)
    if (side === 'b') place(h, x, out ? y + rect.height : y + rect.height - t, rect.width, t)
    if (side === 's') place(h, out ? x - t : x, y, t, rect.height)
    if (side === 'e') place(h, out ? x + rect.width : x + rect.width - t, y, t, rect.height)
    h.classList.toggle('gstrap-dragr-strip-x', !horizontal)
  }
}

function place(el, left, top, width, height) {
  el.style.left = `${left}px`
  el.style.top = `${top}px`
  el.style.width = `${width}px`
  el.style.height = `${height}px`
}

// ── Drag session ─────────────────────────────────────────────────────────────

function beginDrag(ev, kind) {
  if (!sel || drag) return
  ev.preventDefault()   // suppresses the compat mousedown GrapesJS selects on
  ev.stopPropagation()
  const ctx = makeDragContext(kind)
  if (!ctx) return
  drag = {
    ...ctx,
    pointerId: ev.pointerId,
    candidate: null,
    ghost: makeFloater('gstrap-dragr-ghost'),
    badge: makeFloater('gstrap-dragr-badge')
  }
  // Capture keeps moves flowing even when the pointer exits the iframe;
  // coords stay in the iframe's own client space (can go negative / past the
  // edge, which the clamps rely on). Stale-pointer failures are non-fatal —
  // the document-level listeners below still see uncaptured moves.
  try { ev.currentTarget.setPointerCapture(ev.pointerId) } catch { /* non-fatal */ }
  const doc = sel.doc
  doc.addEventListener('pointermove', onDragMove, true)
  doc.addEventListener('pointerup', onDragUp, true)
  doc.addEventListener('pointercancel', onDragCancel, true)
  doc.addEventListener('keydown', onDragKey, true)
  onDragMove(ev)
}

/** Resolve the class group this drag writes into. bp is sampled ONCE here —
 *  the drag session's contract (the slider can't move mid-drag anyway). */
function makeDragContext(kind) {
  const comp = sel.comp
  if (kind === 'col') {
    const bp = activeBreakpointId()
    const pattern = colPattern(bp)
    return { kind, bp, pattern, original: readGroup(comp, pattern) }
  }
  if (kind === 'img') {
    const pattern = widthPattern()
    return { kind, pattern, original: readGroup(comp, pattern) }
  }
  const [propWord, side] = kind.split('-')
  const prop = propWord === 'margin' ? 'm' : 'p'
  // Base-bp only, mirroring the Spacing panel's group semantics exactly
  // (spacing.js — per-bp variants deliberately not exposed there either).
  const pattern = spacingPattern(prop, side)
  return { kind, prop, side, pattern, original: readGroup(comp, pattern) }
}

function onDragMove(ev) {
  if (!drag || ev.pointerId !== drag.pointerId) return
  const el = sel?.comp?.getEl?.()
  if (!el || !el.isConnected) { finishDrag(false); return }
  const snap = computeSnap(ev, el)
  if (!snap) return
  drag.candidate = snap.cls
  paintGhost(snap, ev)
}

function onDragUp(ev) {
  if (!drag || ev.pointerId !== drag.pointerId) return
  finishDrag(true)
}

function onDragCancel(ev) {
  if (!drag || ev.pointerId !== drag.pointerId) return
  finishDrag(false)
}

function onDragKey(ev) {
  if (ev.key === 'Escape') finishDrag(false)
}

/**
 * End the drag session. commit=true applies the candidate class via
 * applyGroup — strip-group-then-add in a SINGLE setClass() = one Backbone
 * write = ONE undo entry. setClass fires component:update:classes, which
 * grapesjs-init.js already re-broadcasts as canvas:content-changed — the
 * dirty flag and panel refreshes come free (no manual emit, no double event).
 * A drag that lands on its starting class writes nothing at all.
 */
function finishDrag(commit) {
  if (!drag) return
  const { pattern, candidate, original, ghost, badge } = drag
  const doc = sel?.doc
  drag = null
  if (doc) {
    doc.removeEventListener('pointermove', onDragMove, true)
    doc.removeEventListener('pointerup', onDragUp, true)
    doc.removeEventListener('pointercancel', onDragCancel, true)
    doc.removeEventListener('keydown', onDragKey, true)
  }
  ghost?.remove()
  badge?.remove()
  const comp = sel?.comp
  if (commit && comp && candidate && candidate !== original && comp.getEl?.()?.isConnected) {
    applyGroup(comp, pattern, candidate)
  }
  queueLayout()
}

// ── Snap math (all iframe-native CSS px — see header) ────────────────────────

function computeSnap(ev, el) {
  if (drag.kind === 'col') return colSnap(ev, el)
  if (drag.kind === 'img') return imgSnap(ev, el)
  return spacingSnap(ev, el)
}

/** Quantize against the row's 12-col grid, anchored to the col's OWN left
 *  edge so 2nd/3rd columns behave identically. Live rects every move — the
 *  model never mutates mid-drag, and this absorbs mid-drag iframe scroll. */
function colSnap(ev, el) {
  const rowEl = el.parentElement
  if (!rowEl) return null
  const rowRect = rowEl.getBoundingClientRect()
  const rect = el.getBoundingClientRect()
  const unit = rowRect.width / 12
  if (unit <= 0) return null
  const n = clamp(Math.round((ev.clientX - rect.left) / unit), 1, 12)
  return {
    cls: colClass(String(n), drag.bp),
    ghost: { left: rect.left, top: rect.top, width: n * unit, height: rect.height }
  }
}

/** w-* is a percentage of the PARENT box; nearest-of-set can't go out of
 *  range, so past-the-container clamps to w-100 and near-zero to w-25. */
function imgSnap(ev, el) {
  const parent = el.parentElement
  if (!parent) return null
  const parentRect = parent.getBoundingClientRect()
  const rect = el.getBoundingClientRect()
  if (parentRect.width <= 0) return null
  const raw = (ev.clientX - rect.left) / parentRect.width * 100
  const pct = nearest(IMG_SNAP_PCTS, raw)
  return {
    cls: `w-${pct}`, // matches widthPattern() vocab; no bp variant exists in BS5
    ghost: { left: rect.left, top: rect.top, width: parentRect.width * pct / 100, height: rect.height }
  }
}

/** Outward drag = more margin; inward drag = more padding. Offset in px from
 *  the element edge, snapped to the BS5 $spacers scale at the iframe's real
 *  root font size. Negative margins are deliberately not drag-reachable. */
function spacingSnap(ev, el) {
  const rect = el.getBoundingClientRect()
  const rem = parseFloat(sel.doc.defaultView.getComputedStyle(sel.doc.documentElement).fontSize) || 16
  const steps = SPACING_SCALE_REMS.map(r => r * rem)
  const off = Math.max(0, edgeOffset(ev, rect, drag.side, drag.prop))
  const scale = nearestIndex(steps, off)
  const px = steps[scale]
  return {
    cls: spacingClass(drag.prop, drag.side, String(scale)),
    ghost: stripGhostRect(rect, drag.side, drag.prop, px)
  }
}

function edgeOffset(ev, rect, side, prop) {
  const out = prop === 'm'
  if (side === 't') return out ? rect.top - ev.clientY : ev.clientY - rect.top
  if (side === 'b') return out ? ev.clientY - rect.bottom : rect.bottom - ev.clientY
  if (side === 's') return out ? rect.left - ev.clientX : ev.clientX - rect.left
  return out ? ev.clientX - rect.right : rect.right - ev.clientX
}

/** Ghost strip along the dragged edge: margin grows outward, padding inward.
 *  Minimum 2px so scale 0 still paints a visible snap line. */
function stripGhostRect(rect, side, prop, px) {
  const th = Math.max(2, px)
  const out = prop === 'm'
  if (side === 't') return { left: rect.left, top: out ? rect.top - th : rect.top, width: rect.width, height: th }
  if (side === 'b') return { left: rect.left, top: out ? rect.bottom : rect.bottom - th, width: rect.width, height: th }
  if (side === 's') return { left: out ? rect.left - th : rect.left, top: rect.top, width: th, height: rect.height }
  return { left: out ? rect.right : rect.right - th, top: rect.top, width: th, height: rect.height }
}

// ── Ghost + badge painting ───────────────────────────────────────────────────

function makeFloater(className) {
  const el = sel.doc.createElement('div')
  el.className = className
  sel.overlay.appendChild(el)
  return el
}

function paintGhost(snap, ev) {
  const win = sel.doc.defaultView
  const g = snap.ghost
  place(drag.ghost, g.left + win.scrollX, g.top + win.scrollY, g.width, g.height)
  drag.badge.textContent = snap.cls // literal class name — not translatable
  drag.badge.style.left = `${ev.clientX + win.scrollX + 12}px`
  drag.badge.style.top = `${ev.clientY + win.scrollY + 14}px`
}

// ── Frame observer ───────────────────────────────────────────────────────────

/** One ResizeObserver total, re-targeted on canvas:frame:load — fires when
 *  the breakpoint slider or a GL pane resize changes the frame box. */
function observeFrame() {
  const frame = wired.editor?.Canvas?.getFrameEl?.()
  if (!frame || typeof ResizeObserver !== 'function') return
  wired.frameRO?.disconnect()
  wired.frameRO = new ResizeObserver(() => queueLayout())
  wired.frameRO.observe(frame)
}

// ── Tiny numeric helpers ─────────────────────────────────────────────────────

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n))
}

function nearest(values, raw) {
  return values[nearestIndex(values, raw)]
}

function nearestIndex(values, raw) {
  let best = 0
  for (let i = 1; i < values.length; i++) {
    if (Math.abs(values[i] - raw) < Math.abs(values[best] - raw)) best = i
  }
  return best
}
