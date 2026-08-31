/**
 * GrapeStrap — AI per-turn context builder
 *
 * PATH: src/renderer/panels/ai/context.js
 * ROLE: Snapshot the volatile facts the model needs about the open project —
 *       name, pages, active page, current selection — for the context block
 *       agent-session.js prepends to each user message
 * DEPENDS: state/project-state.js, state/page-state.js, editor/grapesjs-init.js,
 *          dialogs/quick-tag.js, log.js
 * CREATED: 2026-08-30
 *
 * Why this is a per-turn payload and not part of the tool descriptions:
 * src/main/ai/tools.js keeps its prose frozen because the tools block sits
 * first in the cached prompt prefix, so anything that varies between users or
 * between runs — a project name, a page count, the selection — would
 * invalidate every conversation's cache. Volatile facts ride here instead.
 *
 * Every field is best-effort. A renderer that has no project open, no canvas
 * yet, or no selection still returns a well-formed object; the model reads
 * "no project is open" from empty fields rather than from a thrown error.
 */

import { projectState } from '../../state/project-state.js'
import { pageState } from '../../state/page-state.js'
import { getEditor } from '../../editor/grapesjs-init.js'
import { formatComponentAsQuickTag } from '../../dialogs/quick-tag.js'
import { log } from '../../log.js'

// Mirrors CONTEXT_HTML_CAP in src/main/ai/contract.js. Deliberately a separate
// constant rather than an import: renderer code must not reach into the main
// process tree. main re-applies its own cap on arrival — a cap only one side
// honors is not a cap — so drift here costs truncation, never correctness.
const SELECTED_HTML_CAP = 4000

/**
 * Read the active tab's page name, ignoring library and template tabs.
 *
 * pageState.active() can return a 'library' or 'template' tab, which is not a
 * page and would send the model hunting for a page name that is not in the
 * project. Same guard manage.js#detachActivePage uses.
 *
 * @returns {string|null} the active page name, or null when none applies
 */
function readActivePageName() {
  const tab = pageState.active()
  if (!tab) return null
  if ((tab.kind || 'page') !== 'page') return null
  return tab.pageName || null
}

/**
 * Describe the current canvas selection.
 *
 * @returns {{quickTag: string, html: string}|null} null when the canvas is not
 *          ready or nothing is selected
 */
function readSelection() {
  const editor = getEditor()
  if (!editor) return null

  let selected = null
  try {
    selected = editor.getSelected()
  } catch (error) {
    // getSelected touches the selection model, which is mid-teardown during a
    // project switch. No selection is a valid answer; a thrown one is not.
    log.warn(`ai context: could not read the selection — ${error?.message || error}`)
    return null
  }
  if (!selected) return null

  try {
    const html = selected.toHTML?.() || ''
    return {
      quickTag: formatComponentAsQuickTag(selected),
      html: html.length > SELECTED_HTML_CAP ? html.slice(0, SELECTED_HTML_CAP) : html
    }
  } catch (error) {
    log.warn(`ai context: could not serialize the selection — ${error?.message || error}`)
    return null
  }
}

/**
 * Build the context block for one turn.
 *
 * Called by the panel immediately before grapestrap.ai.send(), so the snapshot
 * is of the moment the user pressed Send rather than of whenever the turn
 * happens to reach the provider.
 *
 * @returns {{projectName: string, pagesList: Array<string>, activePage: string|null,
 *            selected: {quickTag: string, html: string}|null}}
 */
export function buildTurnContext() {
  const project = projectState.current

  return {
    projectName: project?.name || '',
    pagesList: (project?.pages || []).map(page => page?.name).filter(Boolean),
    activePage: readActivePageName(),
    selected: readSelection()
  }
}
