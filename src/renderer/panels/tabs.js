/**
 * GrapeStrap — Page tabs
 *
 * Browser-style tabs above the canvas. Click to focus, middle-click or X to
 * close, + button for new page. Drag-to-reorder is v0.0.2.
 */

import { pageState } from '../state/page-state.js'
import { eventBus } from '../state/event-bus.js'

export function renderTabs(host) {
  host.innerHTML = `<div class="gstrap-tabs-row" data-region="tab-row"></div>
                    <button class="gstrap-tab-new" data-cmd="file:new-page" title="New Page">+</button>`
  refresh(host)
  eventBus.on('tab:opened',  () => refresh(host))
  eventBus.on('tab:closed',  () => refresh(host))
  eventBus.on('tab:focused', () => refresh(host))
  eventBus.on('project:dirty-changed', () => refresh(host))

  host.addEventListener('click', evt => {
    const newBtn = evt.target.closest('[data-cmd="file:new-page"]')
    if (newBtn) { eventBus.emit('command', 'file:new-page'); return }

    const closeBtn = evt.target.closest('[data-tab-close]')
    if (closeBtn) {
      const name = closeBtn.dataset.tabClose
      pageState.close(name)
      return
    }

    const tab = evt.target.closest('[data-tab]')
    if (tab) pageState.focus(tab.dataset.tab)
  })

  host.addEventListener('mousedown', evt => {
    if (evt.button !== 1) return  // middle-click
    const tab = evt.target.closest('[data-tab]')
    if (tab) pageState.close(tab.dataset.tab)
  })
}

function refresh(host) {
  const row = host.querySelector('[data-region="tab-row"]')
  if (!row) return
  row.innerHTML = pageState.tabs.map((t, i) => {
    const active = i === pageState.activeIndex ? 'is-active' : ''
    const dirty = t.dirty ? ' is-dirty' : ''
    const kind = t.kind === 'library' ? ' is-library' : ''
    const badge = t.kind === 'library' ? `<span class="gstrap-tab-badge" title="Library item">lib</span>` : ''
    const label = t.label || t.pageName
    return `<div class="gstrap-tab ${active}${dirty}${kind}" data-tab="${escAttr(t.pageName)}">
              ${badge}
              <span class="gstrap-tab-label">${escHtml(label)}</span>
              <button class="gstrap-tab-x" data-tab-close="${escAttr(t.pageName)}" title="Close">×</button>
            </div>`
  }).join('')
}

function escHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]) }
function escAttr(s) { return escHtml(s) }
