/**
 * GrapeStrap — Master Templates: propagation helpers
 *
 * PATH: src/renderer/panels/templates/propagate.js
 * ROLE: Pure region extract/compose over data-grpstr-region + template→pages
 *       propagation (the inverse of library-items/propagate.js: library swaps
 *       content INSIDE a marked wrapper; templates swap the chrome AROUND
 *       marked regions, preserving each page's own region content)
 * DEPENDS: state/project-state.js, state/event-bus.js, i18n.js
 * CREATED: 2026-07-12
 *
 * Semantics (v4 §14, PLAN.md §3):
 *   - page.html is the single source of truth: the FULLY COMPOSED body
 *     (template chrome + this page's region content inline).
 *   - pages[].regions{} in the manifest is a derived snapshot refreshed here
 *     and at save-flush; it additionally preserves ORPHANED region content
 *     (region removed/renamed in the template) so propagation never silently
 *     destroys page content — see F2 in the plan.
 *   - Nested regions are invalid by policy: only OUTERMOST region elements
 *     participate (inner ones travel as part of the outer's content).
 *   - Duplicate region ids: first-in-document wins, deterministically.
 *
 * Implementation mirrors library-items/propagate.js: DOMParser parse +
 * attribute-scoped querySelectorAll + innerHTML writes. Robust against
 * attribute-order changes, unlike a regex over the html string.
 */

import { projectState } from '../../state/project-state.js'
import { eventBus } from '../../state/event-bus.js'
import { t } from '../../i18n.js'

export const REGION_ATTR = 'data-grpstr-region'
export const REGION_LABEL_ATTR = 'data-grpstr-region-label'

function parseBody(html) {
  const parser = new DOMParser()
  // Wrap in <body> so DOMParser doesn't try to be clever with html/head.
  return parser.parseFromString(`<body>${html || ''}</body>`, 'text/html').body
}

/**
 * Outermost region elements only, in document order. An element inside
 * another region is page/template CONTENT, not a region boundary (F4).
 */
function regionElements(root) {
  return [...root.querySelectorAll(`[${REGION_ATTR}]`)]
    .filter(el => !el.parentElement?.closest?.(`[${REGION_ATTR}]`))
}

/**
 * Pure: extract `{ regionId → innerHTML }` from a body fragment.
 * Duplicate ids: first wins; the duplicates are reported so callers can warn.
 * Returns { regions, duplicateIds }. Exported for the e2e spec.
 */
export function extractRegions(html) {
  const regions = {}
  const duplicateIds = []
  for (const el of regionElements(parseBody(html))) {
    const id = el.getAttribute(REGION_ATTR)
    if (!id) continue
    if (Object.prototype.hasOwnProperty.call(regions, id)) {
      duplicateIds.push(id)
      continue
    }
    regions[id] = el.innerHTML
  }
  return { regions, duplicateIds }
}

/**
 * Pure: compose a page body from template chrome + a page's region map.
 * Regions present in the map get the page's content; regions absent from the
 * map keep the template's default innerHTML (that's how a NEWLY added region
 * flows its default into existing pages — F3). Duplicate ids in the template:
 * only the first instance is filled (F5). Doesn't mutate. Exported for the spec.
 */
export function composeFromTemplate(templateHtml, regionMap = {}) {
  const body = parseBody(templateHtml)
  const seen = new Set()
  for (const el of regionElements(body)) {
    const id = el.getAttribute(REGION_ATTR)
    if (!id || seen.has(id)) continue
    seen.add(id)
    if (Object.prototype.hasOwnProperty.call(regionMap, id)) {
      el.innerHTML = regionMap[id]
    }
  }
  return body.innerHTML
}

/**
 * Pure: derive the manifest `templates[].regions` metadata from template
 * html — `[{ id, label }]`, label from data-grpstr-region-label else the id.
 */
export function templateRegionsMeta(templateHtml) {
  const seen = new Set()
  const out = []
  for (const el of regionElements(parseBody(templateHtml))) {
    const id = el.getAttribute(REGION_ATTR)
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({ id, label: el.getAttribute(REGION_LABEL_ATTR) || id })
  }
  return out
}

/**
 * Fan a template edit out to every page whose templateName matches. For each
 * page: extract its current region content from page.html, recompose around
 * the new chrome, refresh the regions{} snapshot, preserve orphans.
 *
 * Returns { touched: [pageName], orphaned: { pageName: [regionId] } } so the
 * caller can mark-dirty-driven UI refresh and toast an orphan warning. Pages
 * are mutated in place via projectState (same contract as
 * propagateLibraryItem); if the currently-displayed canvas page is in
 * `touched`, the caller reloads the canvas.
 */
export function propagateTemplate(templateName, newTemplateHtml) {
  if (!projectState.current) return { touched: [], orphaned: {} }
  const tplIds = new Set(templateRegionsMeta(newTemplateHtml).map(r => r.id))
  const touched = []
  const orphaned = {}

  for (const page of projectState.current.pages || []) {
    if (page.templateName !== templateName) continue

    const { regions: pageRegions } = extractRegions(page.html || '')
    const next = composeFromTemplate(newTemplateHtml, pageRegions)

    // Snapshot refresh + orphan preservation (F2): content keyed to a region
    // id the template no longer defines is kept in the manifest snapshot —
    // recoverable from the .gstrap by hand, never silently destroyed.
    const snapshot = { ...(page.regions || {}) }
    const orphanIds = []
    for (const [id, html] of Object.entries(pageRegions)) {
      snapshot[id] = html
      if (!tplIds.has(id)) orphanIds.push(id)
    }
    page.regions = snapshot
    if (orphanIds.length) orphaned[page.name] = orphanIds

    if (next !== page.html) {
      page.html = next
      touched.push(page.name)
      projectState.markPageDirty(page.name)
    }
  }

  // Orphan warning is emitted HERE so every propagation moment (tab swap,
  // save flush) reports identically without each caller re-implementing it.
  const orphanEntries = Object.entries(orphaned)
  if (orphanEntries.length) {
    const details = orphanEntries
      .map(([pageName, ids]) => `${pageName}: ${ids.join(', ')}`)
      .join(' · ')
    eventBus.emit('toast', { type: 'warning', message: t('tpl.toast.orphaned-regions', { details }) })
  }
  return { touched, orphaned }
}

/**
 * Save-flush helper: refresh one page's regions{} snapshot from its current
 * html (live ids only — orphans already in the snapshot are preserved).
 * Called from menu-router's flushActiveTabIntoProject for templated pages.
 */
export function refreshPageRegionsSnapshot(page) {
  if (!page?.templateName) return
  const { regions } = extractRegions(page.html || '')
  page.regions = { ...(page.regions || {}), ...regions }
}
