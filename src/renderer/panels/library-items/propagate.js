/**
 * GrapeStrap — Library Items: propagation helpers
 *
 * When a library item's content changes (the user edited the library tab
 * and switched away or saved), every page in the project gets its
 * `[data-grpstr-library="<id>"]` wrappers' inner HTML replaced with the new
 * content. This is the "linked" half of the Dreamweaver-Library promise:
 * one edit fans out to every instance.
 *
 * If the currently-displayed canvas page has any matching wrappers, the
 * caller should reload the canvas afterwards (we just mutate
 * projectState.current.pages; we don't talk to GrapesJS directly).
 *
 * Implementation: DOMParser parse + querySelectorAll + innerHTML write.
 * Robust against attribute-order changes and self-closing tag oddities,
 * unlike a regex over the html string.
 */

import { projectState } from '../../state/project-state.js'

/**
 * Replace the inner HTML of every `[data-grpstr-library="<id>"]` wrapper in
 * every page with `newInnerHtml`. Returns the list of page names that were
 * actually mutated, so the caller can mark them dirty + reload the active
 * canvas if it was one of them.
 */
export function propagateLibraryItem(id, newInnerHtml) {
  if (!projectState.current) return []
  const touched = []
  for (const page of projectState.current.pages || []) {
    const updated = updateHtml(page.html || '', id, newInnerHtml)
    if (updated !== page.html) {
      page.html = updated
      touched.push(page.name)
      projectState.markPageDirty(page.name)
    }
  }
  return touched
}

/**
 * Pure helper: returns the new html string with library-id wrappers updated.
 * Doesn't mutate. Exported for testing.
 */
export function updateHtml(pageHtml, id, newInnerHtml) {
  const parser = new DOMParser()
  // Wrap in <body> so DOMParser doesn't try to be clever with html/head.
  const doc = parser.parseFromString(`<body>${pageHtml}</body>`, 'text/html')
  const wrappers = doc.body.querySelectorAll(`[data-grpstr-library="${cssEscape(id)}"]`)
  if (!wrappers.length) return pageHtml
  wrappers.forEach(w => { w.innerHTML = newInnerHtml })
  return doc.body.innerHTML
}

function cssEscape(s) {
  // Minimal CSS escape for the attribute selector — enough for UUIDs and
  // typical user-supplied ids. CSS.escape exists in browsers but using it
  // pulls a polyfill in older environments; this covers our id surface.
  return String(s).replace(/["\\]/g, '\\$&')
}
