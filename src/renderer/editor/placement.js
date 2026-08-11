/**
 * GrapeStrap — Canvas insertion placement (anchor + coordinate aware)
 *
 * PATH: src/renderer/editor/placement.js
 * ROLE: Single canonical implementation of "where does a new component go"
 *       for every insert surface (Insert panel click/drag, Asset Manager
 *       click-insert, Library Items insert). Previously each panel carried
 *       its own copy of CONTAINER_TAGS + an append-at-anchor branch (Insert
 *       panel, Asset Manager, Library Items) — this module replaces all
 *       three call sites (Workstream A, chunk A1).
 * DEPENDS: nothing at module scope (see note below) — callers pass a live
 *          GrapesJS `editor` + `anchor` component; this module only calls
 *          methods on the objects it's given.
 * CREATED: 2026-08-11
 *
 * Deliberately import-free at module scope so `node --test` can load it
 * directly with no bundler/resolver in front of it (same reasoning as
 * shared/page-html.js). That constraint is also why the coordinate-aware
 * functions (decideDropPlacement, wrapperIndexForY) take plain rect-shaped
 * objects ({top, bottom, height}) instead of calling getBoundingClientRect()
 * themselves — the DOM measurement happens in the caller (panels/insert),
 * keeping this module pure and unit-testable without an iframe.
 *
 * Two placement inputs, either or both may be supplied to resolvePlacement:
 *   - `clientY` — a live pointer Y coordinate (drag-over hover, or a drop).
 *     Splits the anchor into before/inside/after zones. Takes priority
 *     over `before` when both are given.
 *   - `before` — a boolean hint with no coordinate (Alt+Click insert has no
 *     pointer position to speak of; it means "top of page" / "just above
 *     the current selection").
 *   - Neither given — the original v0.0.1 anchor-only rule: containers get
 *     appended into, leaves get a sibling placed after them, wrapper/no
 *     anchor appends at the end of the page.
 *
 * Anchor-aware placement rule (unchanged from the pre-A1 behavior when no
 * clientY/before is given):
 *   - No anchor (or anchor is the wrapper): append to the page root.
 *   - Anchor is a known container (see CONTAINER_TAGS): append INSIDE the
 *     container as its last child.
 *   - Anchor is a known leaf, or anything else: insert as a sibling AFTER
 *     the anchor (predictable fallback for unrecognized tags).
 */

// `td`/`th`/`li` are NOT in the container set on purpose — they're typed by
// their parent and we don't want a paragraph landing inside a `<li>` from a
// Layout-tab click; a user who wants that can drill in by selecting the
// `<li>` first, which then hits the sibling-after fallback.
export const CONTAINER_TAGS = new Set([
  'div', 'section', 'main', 'article', 'aside',
  'header', 'footer', 'nav', 'form',
  'ul', 'ol'
])

// Drop-zone edge band, in pixels: how close to a container's top/bottom
// edge the pointer must be for a "before"/"after" (sibling) zone instead of
// "inside". Scales with the container's own height but is clamped so a tiny
// container isn't ALL edge and a huge one doesn't have an unreachably thin
// "inside" band.
const MIN_EDGE_PX = 8
const MAX_EDGE_PX = 24
const EDGE_RATIO = 0.25

/**
 * Is this tag name one of the known containers?
 * @param {string} tag - Lowercase (or any-case) HTML tag name
 * @returns {boolean}
 */
export function isContainerTag(tag) {
  return CONTAINER_TAGS.has(String(tag || '').toLowerCase())
}

/**
 * Read a GrapesJS component's tag name, lowercased.
 * @param {object} component - A GrapesJS component model (or nullish)
 * @returns {string} Lowercase tag name, or '' if unavailable
 */
export function tagOf(component) {
  return (component?.get?.('tagName') || '').toLowerCase()
}

/**
 * Decide which zone of an anchor element a pointer Y coordinate falls into.
 *
 * Containers get three zones (before / inside / after) split by a clamped
 * edge band; leaves (and unrecognized tags) get two zones (before / after)
 * split at the vertical midpoint — a leaf has no "inside" to speak of.
 *
 * @param {object} params
 * @param {string} params.tag - Lowercase tag name of the anchor
 * @param {{top: number, bottom: number, height: number}} params.rect -
 *        Anchor's bounding rect (caller-measured; not fetched here)
 * @param {number} params.clientY - Pointer Y, same coordinate space as rect
 * @returns {'before'|'inside'|'after'}
 */
export function decideDropPlacement({ tag, rect, clientY }) {
  if (isContainerTag(tag)) {
    const edge = Math.min(MAX_EDGE_PX, Math.max(MIN_EDGE_PX, rect.height * EDGE_RATIO))
    if (clientY < rect.top + edge) return 'before'
    if (clientY > rect.bottom - edge) return 'after'
    return 'inside'
  }
  // Leaf — midpoint split, never 'inside'.
  const midpoint = (rect.top + rect.bottom) / 2
  return clientY < midpoint ? 'before' : 'after'
}

/**
 * Find which top-level child index a pointer Y coordinate falls before, for
 * the "no anchor / anchor is the wrapper" case — used to place a drag-over
 * insertion line (or an Alt+Click insert) among the page's own root children.
 *
 * @param {Array<{top: number, bottom: number}>} childRects - Bounding rects
 *        of the wrapper's direct children, in DOM order
 * @param {number} clientY - Pointer Y, same coordinate space as childRects
 * @returns {number} Index of the first child whose vertical midpoint is
 *          below clientY; childRects.length if every child is above it (or
 *          the list is empty)
 */
export function wrapperIndexForY(childRects, clientY) {
  const rects = childRects || []
  for (let i = 0; i < rects.length; i++) {
    const midpoint = (rects[i].top + rects[i].bottom) / 2
    if (midpoint > clientY) return i
  }
  return rects.length
}

/**
 * Resolve where a new component should land, given an optional anchor and
 * an optional pointer position / before-hint. This is the single function
 * every insert surface (Insert panel click + drag, Asset Manager, Library
 * Items) should call before inserting content.
 *
 * @param {object} editor - Live GrapesJS editor instance
 * @param {object|null} anchor - The anchor component (current selection, or
 *        the component under the drop cursor); null/undefined/wrapper all
 *        mean "no specific anchor — target the page root"
 * @param {object} [opts]
 * @param {number|null} [opts.clientY=null] - Pointer Y in the anchor's own
 *        coordinate space (same document as anchor.getEl()). When given,
 *        this takes priority over `before`.
 * @param {boolean} [opts.before=false] - No-coordinate hint: place before
 *        the anchor (or at the top of the page, for no/wrapper anchor)
 *        rather than the default append/after position.
 * @returns {{parent: object, at: number}} `at === -1` means "plain append
 *          at the end" (parent.append(content) with no index option);
 *          any other value is passed as `{ at }`.
 */
export function resolvePlacement(editor, anchor, { clientY = null, before = false } = {}) {
  const wrapper = editor.getWrapper()

  if (!anchor || anchor === wrapper) {
    if (clientY != null) {
      return { parent: wrapper, at: wrapperIndexForY(wrapperChildRects(wrapper), clientY) }
    }
    if (before) return { parent: wrapper, at: 0 }
    return { parent: wrapper, at: -1 }
  }

  const tag = tagOf(anchor)

  if (clientY != null) {
    const rect = elRect(anchor)
    if (rect) {
      const zone = decideDropPlacement({ tag, rect, clientY })
      if (zone === 'inside') return { parent: anchor, at: -1 }
      return siblingPlacement(anchor, wrapper, zone === 'before')
    }
    // Anchor has no measurable DOM element (detached component, or a unit
    // test double) — fall through to the non-coordinate rule below.
  }

  if (isContainerTag(tag)) {
    if (before) return siblingPlacement(anchor, wrapper, true)
    return { parent: anchor, at: -1 }
  }
  // Leaf or unrecognized tag — sibling placement (predictable for unknown).
  return siblingPlacement(anchor, wrapper, before)
}

/**
 * Insert content at a resolved placement.
 * @param {object} editor - Live GrapesJS editor instance
 * @param {{parent: object, at: number}} placement - Result of resolvePlacement
 * @param {string|object} content - HTML string or GrapesJS component definition
 * @returns {{target: object, added: object|object[]}} `target` is the parent
 *          that received the insert; `added` is whatever `.append()` returned
 *          (a single component or an array, depending on content shape)
 */
export function insertAtPlacement(editor, { parent, at }, content) {
  const target = parent || editor.getWrapper()
  const added = (at === -1 || at == null)
    ? target.append(content)
    : target.append(content, { at })
  return { target, added }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function siblingPlacement(anchor, wrapper, placeBefore) {
  const parent = anchor.parent?.() || wrapper
  const idx = parent.components().indexOf(anchor)
  return { parent, at: placeBefore ? idx : idx + 1 }
}

function elRect(component) {
  const el = component?.getEl?.()
  return el?.getBoundingClientRect ? el.getBoundingClientRect() : null
}

// GrapesJS components() returns a Backbone Collection — indexed access via
// `coll[i]` doesn't work, must use `.models` or `.at(i)`.
function wrapperChildRects(wrapper) {
  const kids = wrapper.components?.()
  const arr = kids?.models || (Array.isArray(kids) ? kids : [])
  return arr.map(elRect).filter(Boolean)
}
