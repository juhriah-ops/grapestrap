/**
 * GrapeStrap — File manager panel
 *
 * Three sections in v0.0.1: Pages, Assets, Styles. Templates and Library
 * sections appear in v0.0.2/v0.1.0 as those features ship.
 */

import { projectState } from '../../state/project-state.js'
import { pageState } from '../../state/page-state.js'
import { eventBus } from '../../state/event-bus.js'

export function renderFileManager(host) {
  host.classList.add('gstrap-fm-host')
  refresh(host)
  eventBus.on('project:opened', () => refresh(host))
  eventBus.on('project:closed', () => refresh(host))
  eventBus.on('project:dirty-changed', () => refresh(host))

  host.addEventListener('dblclick', evt => {
    const pageEl = evt.target.closest('[data-fm-page]')
    if (pageEl) {
      const name = pageEl.dataset.fmPage
      pageState.open(name)
    }
  })
}

function refresh(host) {
  const project = projectState.current
  if (!project) {
    host.innerHTML = `<div class="gstrap-empty">No project open.<br><br>
      <button class="gstrap-btn" data-cmd="file:new-project">New Project</button>
      <button class="gstrap-btn" data-cmd="file:open-project">Open Project</button>
    </div>`
    host.addEventListener('click', evt => {
      const btn = evt.target.closest('[data-cmd]')
      if (btn) eventBus.emit('command', btn.dataset.cmd)
    }, { once: true })
    return
  }

  const pages = project.pages.map(p => {
    const dirty = projectState.dirtyPages.has(p.name) ? ' is-dirty' : ''
    return `<li class="gstrap-fm-item${dirty}" data-fm-page="${escAttr(p.name)}">${escHtml(p.name)}.html</li>`
  }).join('')

  host.innerHTML = `
    <div class="gstrap-fm-section">
      <div class="gstrap-fm-section-title">Pages</div>
      <ul class="gstrap-fm-list">${pages}</ul>
    </div>
    <div class="gstrap-fm-section">
      <div class="gstrap-fm-section-title">Styles</div>
      <ul class="gstrap-fm-list">
        <li class="gstrap-fm-item${projectState.globalCssDirty ? ' is-dirty' : ''}">style.css</li>
      </ul>
    </div>
    <div class="gstrap-fm-section">
      <div class="gstrap-fm-section-title">Assets</div>
      <ul class="gstrap-fm-list">
        <li class="gstrap-fm-item">images/</li>
        <li class="gstrap-fm-item">fonts/</li>
        <li class="gstrap-fm-item">videos/</li>
      </ul>
    </div>
  `
}

function escHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]) }
function escAttr(s) { return escHtml(s) }
