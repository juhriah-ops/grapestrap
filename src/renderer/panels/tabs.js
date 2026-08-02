/**
 * GrapeStrap — Page tabs
 *
 * Browser-style tabs above the canvas. Click to focus, middle-click or X to
 * close, + button for new page. Drag-to-reorder is v0.0.2.
 *
 * kind: 'file' tabs (Site Files, opened from file-manager/index.js) get an
 * extension badge (js/css/php/…) instead of the lib/tpl glyph, reusing the
 * same .gstrap-tab-badge styling — see getFileExtension below.
 */

import { pageState } from '../state/page-state.js'
import { eventBus } from '../state/event-bus.js'
import { t } from '../i18n.js'

export function renderTabs(host) {
  host.innerHTML = `<div class="gstrap-tabs-row" data-region="tab-row"></div>
                    <button class="gstrap-tab-new" data-cmd="file:new-page" title="${escAttr(t('tabs.new-page-title'))}">+</button>`
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
  row.innerHTML = pageState.tabs.map((tab, i) => {
    const active = i === pageState.activeIndex ? 'is-active' : ''
    const dirty = tab.dirty ? ' is-dirty' : ''
    // Badge tooltips go through t(); the 3-letter lib/tpl/ext badge glyphs are
    // iconography (like the toolbar's D/T/M buttons), not prose.
    const kind = tab.kind === 'library' ? ' is-library' : tab.kind === 'template' ? ' is-template' : ''
    const badge = tab.kind === 'library'
      ? `<span class="gstrap-tab-badge" title="${escAttr(t('tabs.badge-library-title'))}">lib</span>`
      : tab.kind === 'template'
        ? `<span class="gstrap-tab-badge" title="${escAttr(t('tabs.badge-template-title'))}">tpl</span>`
        : tab.kind === 'file'
          // pageName is the full site-relative path for file tabs (see
          // file-manager/index.js dblclick handler), so its own extension is
          // always present — no fallback needed the way label/pageName have
          // elsewhere in this file.
          ? `<span class="gstrap-tab-badge" title="${escAttr(t('tabs.badge-file-title'))}">${escHtml(getFileExtension(tab.pageName))}</span>`
          : ''
    const label = tab.label || tab.pageName
    return `<div class="gstrap-tab ${active}${dirty}${kind}" data-tab="${escAttr(tab.pageName)}">
              ${badge}
              <span class="gstrap-tab-label">${escHtml(label)}</span>
              <button class="gstrap-tab-x" data-tab-close="${escAttr(tab.pageName)}" title="${escAttr(t('action.close'))}">×</button>
            </div>`
  }).join('')
}

// Lowercase extension (no dot) from a file-tab's site-relative path, e.g.
// 'assets/js/main.js' -> 'js'. Falls back to 'file' for the (currently
// impossible for kind: 'file') case of an extensionless path, so the badge
// never renders empty.
function getFileExtension(relPath) {
  const base = String(relPath).split('/').pop() || ''
  const dotIndex = base.lastIndexOf('.')
  return dotIndex > 0 ? base.slice(dotIndex + 1).toLowerCase() : 'file'
}

function escHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]) }
function escAttr(s) { return escHtml(s) }
