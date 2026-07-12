/**
 * GrapeStrap — File manager panel
 *
 * Three sections in v0.0.1: Pages, Assets, Styles. Templates and Library
 * sections appear in v0.0.2/v0.1.0 as those features ship.
 */

import { projectState } from '../../state/project-state.js'
import { pageState } from '../../state/page-state.js'
import { eventBus } from '../../state/event-bus.js'
import { showTextPrompt } from '../../dialogs/text-prompt.js'
import { showContextMenu } from '../../dialogs/context-menu.js'
import { createTemplate, deleteTemplate } from '../templates/manage.js'

// UI_STRINGS — Wave 4 t() sweep target (this file doesn't import t() yet).
const UI_STRINGS = {
  templatesTitle: 'Templates',
  newTemplate: 'New template…',
  newTemplatePrompt: { title: 'New template', label: 'Template name', initialValue: 'master', okLabel: 'Create' },
  deleteTemplate: 'Delete Template'
}

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
    const tplEl = evt.target.closest('[data-fm-template]')
    if (tplEl) {
      const name = tplEl.dataset.fmTemplate
      pageState.open(name, { kind: 'template', label: name })
    }
  })

  host.addEventListener('click', async evt => {
    if (!evt.target.closest('[data-fm-new-template]')) return
    const name = await showTextPrompt(UI_STRINGS.newTemplatePrompt)
    if (name) createTemplate(name)     // validates + toasts + opens the tab
  })

  host.addEventListener('contextmenu', evt => {
    const tplEl = evt.target.closest('[data-fm-template]')
    if (!tplEl) return
    evt.preventDefault()
    const name = tplEl.dataset.fmTemplate
    showContextMenu(evt.clientX, evt.clientY, [
      { label: UI_STRINGS.deleteTemplate, danger: true, action: () => deleteTemplate(name) }
    ])
  })

  eventBus.on('templates:changed', () => refresh(host))
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

  const templates = (project.templates || []).map(t => {
    const dirty = projectState.dirtyTemplates.has(t.name) ? ' is-dirty' : ''
    return `<li class="gstrap-fm-item${dirty}" data-fm-template="${escAttr(t.name)}">${escHtml(t.name)}.gstrap-tpl</li>`
  }).join('')

  host.innerHTML = `
    <div class="gstrap-fm-section">
      <div class="gstrap-fm-section-title">Pages</div>
      <ul class="gstrap-fm-list">${pages}</ul>
    </div>
    <div class="gstrap-fm-section">
      <div class="gstrap-fm-section-title">${UI_STRINGS.templatesTitle}
        <button class="gstrap-fm-section-action" data-fm-new-template title="${escAttr(UI_STRINGS.newTemplate)}">+</button>
      </div>
      <ul class="gstrap-fm-list">${templates}</ul>
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
