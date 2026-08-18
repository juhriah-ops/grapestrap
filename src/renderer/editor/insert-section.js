/**
 * GrapeStrap — Bundled section insert (assets → CSS chunks → markup)
 *
 * PATH: src/renderer/editor/insert-section.js
 * ROLE: Inserts a section registered through the plugin API's registerSection
 *       socket (`plugins/blocks-sections/`) into the active page as a FREE,
 *       fully editable copy — the three-part payload (images, CSS chunks,
 *       markup) landed in one call, from the Library panel's bundled rows.
 * DEPENDS: state/project-state.js, state/event-bus.js, editor/grapesjs-init.js,
 *          editor/placement.js, editor/css-chunks.js, i18n.js, log.js,
 *          window.grapestrap.sections.copyAssets (preload → main)
 * CREATED: 2026-08-17
 *
 * Free copy, deliberately: unlike a Library ITEM insert (panels/library-items
 * cmdInsert), the markup goes in raw — no `data-grpstr-library` wrapper, so
 * lock.js never claims it, nothing propagates into it on save, and the user can
 * take the section apart on the page. Inserting the same section twice yields
 * two independent copies. That is the whole point of the bundled sections: they
 * are a starting shape, not a linked instance.
 *
 * Order is load-bearing: images and CSS must exist before the markup renders,
 * or the canvas paints one frame of broken image boxes and unstyled markup.
 *
 * ── Sections are siblings, never nests (2026-08-17) ─────────────────────────
 * The generic placement rule (editor/placement.js) appends INTO whatever
 * container is selected. Since every insert here selects the section it just
 * dropped, and a section IS a container, clicking Insert twice used to bury
 * the second section inside the first. A page band inside a page band is
 * never what the click meant, so this module re-points the anchor: if the
 * anchor is — or lives inside — a top-level page band, the new section lands
 * AFTER that band as its sibling. See resolveBandSiblingAnchor below for the
 * exact rule and why it only fires at the top level (a `<div>` column the
 * user deliberately selected still receives the section INSIDE it).
 *
 * ── Undo contract (documented because it is deliberately asymmetric) ────────
 * The component insert is ONE native GrapesJS UndoManager step: Ctrl+Z removes
 * the section from the page, exactly like any other insert.
 *
 * The CSS chunks and the copied images deliberately SURVIVE that undo:
 *   - globalCSS lives outside the canvas undo stack entirely (it is project
 *     state written by the Custom CSS panel, Style Manager and menu-router
 *     alike) — there is no correct way to unwind it from a canvas undo, and
 *     trying would let a canvas undo silently delete rules the user had since
 *     hand-edited under that marker.
 *   - An orphaned chunk is inert: every rule is namespaced under the section's
 *     own gs-* classes, so with the markup gone it matches nothing. The user
 *     can delete the marker block in the Custom CSS panel whenever they want.
 *   - Copied images are ordinary project assets, visible and deletable in the
 *     Asset Manager.
 *   - Re-inserting is idempotent on both: the marker check skips CSS that is
 *     already there (css-chunks.js) and the copy is skip-if-exists (main's
 *     sections:copy-assets), so undo-then-reinsert costs nothing and cannot
 *     duplicate or clobber.
 */

import { projectState } from '../state/project-state.js'
import { eventBus } from '../state/event-bus.js'
import { getEditor } from './grapesjs-init.js'
import { resolvePlacement, insertAtPlacement, tagOf } from './placement.js'
import { appendCssChunks } from './css-chunks.js'
import { t } from '../i18n.js'
import { log } from '../log.js'

// Top-level tags that read as a PAGE BAND rather than a content container:
// selecting one and inserting a section means "put another band next to this
// one", never "put a band inside it". `<div>` is deliberately absent — a div
// column the user picked on purpose keeps the normal append-inside behavior —
// and so is `<main>`, which is a legitimate "everything goes in here" wrapper.
const PAGE_BAND_TAGS = new Set(['section', 'header', 'footer'])

/**
 * Insert a bundled section definition into the active page.
 *
 * @param {object} sectionDef - A registerSection def: `{ id, label, content }`
 *        plus the optional bundled-section fields `css: [{marker, text}]` and
 *        `assets: [{from, to}]` (see plugin-host/api.js registerSection).
 * @param {object} [opts]
 * @param {object|null} [opts.anchor] - Component to place relative to.
 *        Defaults to the current canvas selection.
 * @param {boolean} [opts.before=false] - Place before the anchor / at the top
 *        of the page instead of the default append-after position.
 * @returns {Promise<{component: object|null, cssChanged: boolean}>} The
 *          inserted (and now selected) component, and whether the project
 *          stylesheet actually grew.
 * @throws {Error} If the def carries no content, no project is open, or the
 *         GrapesJS editor isn't up. Callers surface these as a toast.
 */
export async function insertBundledSection(sectionDef, { anchor = null, before = false } = {}) {
  if (!sectionDef?.content) {
    throw new Error(`insertBundledSection: section "${sectionDef?.id ?? '?'}" has no content`)
  }
  if (!projectState.current) throw new Error('insertBundledSection: no project open')

  const editor = getEditor()
  if (!editor) throw new Error('insertBundledSection: editor not ready')

  await copySectionAssets(sectionDef)
  const cssChanged = applyCssChunks(sectionDef)

  const target = resolveBandSiblingAnchor(editor, anchor || editor.getSelected?.(), before)
  const placement = resolvePlacement(editor, target.anchor, { before: target.before })
  const { added } = insertAtPlacement(editor, placement, sectionDef.content)
  const component = Array.isArray(added) ? added[0] : added
  if (component) editor.select(component)
  eventBus.emit('canvas:content-changed')

  return { component: component || null, cssChanged }
}

/**
 * Re-point the anchor so a section lands BESIDE a page band, not inside it.
 *
 * The band we care about is the top-level one: we walk from the anchor up to
 * the page wrapper and look at the last stop before it — the wrapper child the
 * anchor belongs to. If that child is a page band (PAGE_BAND_TAGS) the new
 * section becomes its sibling; anything else (a `<div>` layout wrapper, a
 * `<main>`) keeps placement.js's normal rules, so a user who selected a column
 * to drop a section into still gets exactly that.
 *
 * "After the band" is expressed as "before the band's next sibling" because
 * resolvePlacement reads a container anchor with no `before` hint as
 * append-inside — the one placement it cannot say directly. A band that is the
 * page's last child has no next sibling, so it falls back to the no-anchor
 * case, which appends at the end of the page: the same position.
 *
 * @param {object} editor - Live GrapesJS editor instance
 * @param {object|null} anchor - Caller's anchor (or the current selection)
 * @param {boolean} before - The caller's before-hint, passed through untouched
 *        for a band (placement.js already puts a `before` insert ahead of a
 *        container anchor rather than inside it)
 * @returns {{anchor: object|null, before: boolean}} Arguments for resolvePlacement
 */
function resolveBandSiblingAnchor(editor, anchor, before) {
  const wrapper = editor.getWrapper?.()
  const band = topLevelBandFor(anchor, wrapper)
  if (!band) return { anchor, before }
  if (before) return { anchor: band, before: true }
  const next = nextSiblingOf(band, wrapper)
  // No next sibling → drop the anchor entirely rather than passing `before`
  // with a null anchor, which resolvePlacement reads as "top of the page".
  return next ? { anchor: next, before: true } : { anchor: null, before: false }
}

/**
 * The top-level page band the anchor sits in, if any.
 * @param {object|null} anchor - Component to walk up from (may be the band)
 * @param {object|null} wrapper - The page wrapper component
 * @returns {object|null} The wrapper child containing `anchor` when it is a
 *          page band; null for no anchor, the wrapper itself, a detached
 *          component, or a non-band top-level child
 */
function topLevelBandFor(anchor, wrapper) {
  if (!anchor || !wrapper || anchor === wrapper) return null
  let node = anchor
  // Bounded by the wrapper, and by parent() running out on a detached
  // component — never trust the tree to be rooted where we expect.
  while (node && node !== wrapper) {
    const parent = node.parent?.()
    if (parent === wrapper) return PAGE_BAND_TAGS.has(tagOf(node)) ? node : null
    node = parent
  }
  return null
}

/**
 * The component that follows `band` among the wrapper's children.
 * @param {object} band - A direct child of the wrapper
 * @param {object} wrapper - The page wrapper component
 * @returns {object|null} The next sibling, or null when `band` is last
 */
function nextSiblingOf(band, wrapper) {
  const children = wrapper.components?.()
  if (!children?.at) return null
  return children.at(children.indexOf(band) + 1) || null
}

/**
 * Bring the section's images into the project (skip-if-exists, main-side).
 *
 * A copy problem is reported but never aborts the insert: the markup and CSS
 * are still worth having, and the user can drop a replacement image in via the
 * Asset Manager. Sections with no `assets` skip the IPC round trip entirely.
 *
 * @param {object} sectionDef - The section definition
 * @returns {Promise<void>}
 */
async function copySectionAssets(sectionDef) {
  const assets = sectionDef.assets
  if (!Array.isArray(assets) || assets.length === 0) return

  try {
    const result = await window.grapestrap.sections.copyAssets(assets)
    const issues = [...(result?.rejected || []), ...(result?.failures || [])]
    if (issues.length === 0) return
    log.warn(`section "${sectionDef.id}" asset copy:`, issues.join('; '))
    eventBus.emit('toast', {
      type: 'warning',
      message: t('lib.toast.section-assets-failed', { count: issues.length })
    })
  } catch (err) {
    // The bridge itself rejected — no project open on the main side, or the
    // channel is missing in an older build. Same treatment: warn, keep going.
    log.warn(`section "${sectionDef.id}" asset copy failed:`, err?.message || err)
    eventBus.emit('toast', {
      type: 'warning',
      message: t('lib.toast.section-assets-failed', { count: assets.length })
    })
  }
}

/**
 * Append the section's CSS chunks to the project stylesheet, if any are new.
 *
 * The emit carries `source` purely as a debugging breadcrumb — every listener
 * on 'project:css-changed' (custom-css panel buffer refresh, grapesjs-init
 * canvas re-injection, style-manager re-render) re-reads projectState and
 * ignores the payload, and the custom-css panel additionally no-ops when its
 * buffer already equals state, so this cannot echo back or clobber.
 *
 * @param {object} sectionDef - The section definition
 * @returns {boolean} true when globalCSS actually grew
 */
function applyCssChunks(sectionDef) {
  const chunks = sectionDef.css
  if (!Array.isArray(chunks) || chunks.length === 0) return false

  const { css, changed } = appendCssChunks(projectState.current.globalCSS || '', chunks)
  if (!changed) return false

  projectState.current.globalCSS = css
  projectState.markCssDirty()
  eventBus.emit('project:css-changed', { source: 'section-insert' })
  return true
}
