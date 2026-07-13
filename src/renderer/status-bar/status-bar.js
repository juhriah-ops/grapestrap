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
import { gitState } from '../state/git-state.js'
import { eventBus } from '../state/event-bus.js'
import { findRegionId } from '../panels/templates/lock.js'
import { t } from '../i18n.js'

let host = null
let lastSelected = null   // component from canvas:selected; cleared on deselect / tab change

export function renderStatusBar(target) {
  host = target
  refresh()
  eventBus.on('project:opened',         refresh)
  eventBus.on('project:closed',         refresh)
  eventBus.on('project:dirty-changed',  refresh)
  eventBus.on('tab:focused',            () => { lastSelected = null; refresh() })
  eventBus.on('viewmode:changed',       refresh)
  eventBus.on('device:changed',         refresh)
  eventBus.on('canvas:selected',        component => { lastSelected = component; refresh() })
  eventBus.on('canvas:deselected',      () => { lastSelected = null; refresh() })
  eventBus.on('git:status-changed',     refresh)
}

function refresh() {
  if (!host) return
  const project = projectState.current
  const tab = pageState.active()

  const parts = []
  parts.push(`<span class="gstrap-sb-cell">${escHtml(project ? project.manifest.metadata.name : t('statusbar.no-project'))}</span>`)
  if (tab) {
    const ext = tab.kind === 'template' ? '.gstrap-tpl' : '.html'
    parts.push(`<span class="gstrap-sb-cell">${escHtml(tab.pageName)}${ext}</span>`)
    parts.push(`<span class="gstrap-sb-cell">${escHtml(tab.device)}</span>`)
  }

  // Git branch cell (Wave 3) — pushed into parts[] ONLY for a repo-rooted
  // project (never an empty cell; region-cell precedent). Arrows render only
  // with an upstream AND a non-zero count (V4); detached shows simple-git's
  // 'HEAD' plus a data-git-detached stamp (V5). Branch names + arrow glyphs
  // are data, not prose — no t() strings here.
  const git = gitState.latest
  if (project && git?.repo) {
    let text = escHtml(git.branch || 'HEAD')
    if (git.tracking) {
      if (git.ahead > 0) text += ` ↑${git.ahead}`
      if (git.behind > 0) text += ` ↓${git.behind}`
    }
    const detached = git.detached ? ' data-git-detached=""' : ''
    parts.push(`<span class="gstrap-sb-cell gstrap-sb-git" data-git-branch="${escHtml(git.branch || 'HEAD')}"${detached}>${text}</span>`)
  }

  // Region indicator — only on pages built from a master template (v4 §14
  // "Status bar: Editing region: content (from default-master)"). State
  // carried in data-region-state per house rules (no state in class names).
  if (project && tab && (tab.kind || 'page') === 'page') {
    const page = projectState.getPage(tab.pageName)
    if (page?.templateName) {
      let state = 'none'
      let text = t('statusbar.region-none', { tpl: page.templateName })
      if (lastSelected) {
        const regionId = findRegionId(lastSelected, { includeSelf: true })
        if (regionId) { state = 'inside';  text = t('statusbar.region-inside', { id: regionId, tpl: page.templateName }) }
        else          { state = 'outside'; text = t('statusbar.region-outside', { tpl: page.templateName }) }
      }
      parts.push(`<span class="gstrap-sb-cell gstrap-sb-region" data-region-state="${state}">${escHtml(text)}</span>`)
    }
  }
  if (project) {
    const dirty = projectState.isDirty()
    parts.push(`<span class="gstrap-sb-cell">${escHtml(dirty ? t('statusbar.unsaved') : t('statusbar.saved'))}</span>`)
  }

  host.innerHTML = parts.join('')
}

function escHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]) }
