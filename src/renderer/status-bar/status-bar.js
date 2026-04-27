/**
 * GrapeStrap — Status bar
 *
 * Persistent bottom strip. Sections (left to right):
 *   project • path • cursor • selector • device • saved • errors
 *
 * v0.0.1 ships project + saved + selector. The rest layer in v0.0.2 (cursor)
 * and v0.1.0 (errors panel, git status).
 */

import { projectState } from '../state/project-state.js'
import { pageState } from '../state/page-state.js'
import { eventBus } from '../state/event-bus.js'

let host = null

export function renderStatusBar(target) {
  host = target
  refresh()
  eventBus.on('project:opened',         refresh)
  eventBus.on('project:closed',         refresh)
  eventBus.on('project:dirty-changed',  refresh)
  eventBus.on('tab:focused',            refresh)
  eventBus.on('viewmode:changed',       refresh)
  eventBus.on('device:changed',         refresh)
  eventBus.on('canvas:selected',        refresh)
  eventBus.on('canvas:deselected',      refresh)
}

function refresh() {
  if (!host) return
  const project = projectState.current
  const tab = pageState.active()

  const parts = []
  parts.push(`<span class="gstrap-sb-cell">${project ? escHtml(project.manifest.metadata.name) : 'No project'}</span>`)
  if (tab) {
    parts.push(`<span class="gstrap-sb-cell">${escHtml(tab.pageName)}.html</span>`)
    parts.push(`<span class="gstrap-sb-cell">${escHtml(tab.device)}</span>`)
  }
  if (project) {
    const dirty = projectState.isDirty()
    parts.push(`<span class="gstrap-sb-cell">${dirty ? '● Unsaved' : '✓ Saved'}</span>`)
  }

  host.innerHTML = parts.join('')
}

function escHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]) }
