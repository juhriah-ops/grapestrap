/**
 * GrapeStrap — Insert panel (tabbed)
 *
 * Six tabs in v0.0.1: Common / Layout / Forms / Text / Media / Sections.
 * Library and Snippets tabs are added in v0.0.2.
 *
 * Each tab pulls its blocks from the plugin registry (filtered by category).
 * Drag-to-canvas handled by GrapesJS's BlockManager — we just render thumbnails
 * and dispatch drag events through to the GJS BlockManager DOM.
 */

import { pluginRegistry } from '../../plugin-host/registry.js'
import { eventBus } from '../../state/event-bus.js'

const TABS = [
  { id: 'common',   label: 'Common'   },
  { id: 'layout',   label: 'Layout'   },
  { id: 'forms',    label: 'Forms'    },
  { id: 'text',     label: 'Text'     },
  { id: 'media',    label: 'Media'    },
  { id: 'sections', label: 'Sections' }
  // Library + Snippets in v0.0.2
]

let activeTab = 'common'

export function renderInsertPanel(host) {
  host.innerHTML = `
    <div class="gstrap-insert-tabs">
      ${TABS.map(t => `<button class="gstrap-insert-tab ${t.id === activeTab ? 'is-active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
    </div>
    <div class="gstrap-insert-content" data-region="insert-content"></div>
  `

  host.addEventListener('click', evt => {
    const tab = evt.target.closest('[data-tab]')
    if (tab) {
      activeTab = tab.dataset.tab
      host.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('is-active', b.dataset.tab === activeTab))
      refreshContent(host)
      eventBus.emit('insert:tab-changed', activeTab)
    }
  })

  refreshContent(host)
  eventBus.on('plugin:block-registered', () => refreshContent(host))
  eventBus.on('insert:focus-tab', tab => {
    activeTab = tab
    refreshContent(host)
  })
}

function refreshContent(host) {
  const content = host.querySelector('[data-region="insert-content"]')
  if (!content) return

  const blocks = pluginRegistry.blocks.filter(b => matchesCategory(b, activeTab))
  if (blocks.length === 0) {
    content.innerHTML = `<div class="gstrap-empty">No blocks in this category yet.</div>`
    return
  }
  content.innerHTML = blocks.map(b => `
    <div class="gstrap-block-tile" data-block-id="${b.id}" draggable="true" title="${b.label}">
      <div class="gstrap-block-tile-media">${b.media || ''}</div>
      <div class="gstrap-block-tile-label">${b.label}</div>
    </div>
  `).join('')
}

function matchesCategory(block, tab) {
  const cat = (block.category || 'Common').toLowerCase()
  if (tab === 'common'   && cat === 'common') return true
  if (tab === 'layout'   && cat === 'layout') return true
  if (tab === 'forms'    && cat === 'forms')  return true
  if (tab === 'text'     && cat === 'text')   return true
  if (tab === 'media'    && cat === 'media')  return true
  if (tab === 'sections' && cat === 'sections') return true
  return false
}
