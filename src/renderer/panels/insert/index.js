/**
 * GrapeStrap — Insert panel (tabbed)
 *
 * Six tabs in v0.0.1: Common / Layout / Forms / Text / Media / Sections.
 * Library and Snippets tabs are added in v0.0.2.
 *
 * Each tab pulls its blocks from the plugin registry (filtered by category).
 *
 * Insertion in v0.0.1: click-to-insert. The tile is `draggable="true"` so a
 * future v0.0.2 drop-target on the canvas iframe can offer drag-and-drop
 * placement, but the click path is the working insertion mechanism today —
 * it gets new users productive without needing them to coordinate a drop
 * onto the iframe (which is fragile across compositors).
 *
 * Click insertion target rule:
 *   - If a component is selected:    insert AFTER it inside its parent
 *     (so clicking Hero with Section selected puts Hero next to Section).
 *   - Otherwise:                     append to the wrapper (page root).
 *   - The new component is selected so the user sees feedback + can keep
 *     editing.
 */

import { pluginRegistry } from '../../plugin-host/registry.js'
import { eventBus } from '../../state/event-bus.js'
import { getEditor } from '../../editor/grapesjs-init.js'

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
      return
    }
    const tile = evt.target.closest('[data-block-id]')
    if (tile) {
      insertBlockById(tile.dataset.blockId)
    }
  })

  // Set drag data so a v0.0.2 iframe drop handler can identify the block.
  // No-op today; cheap to wire now so the contract is in place.
  host.addEventListener('dragstart', evt => {
    const tile = evt.target.closest('[data-block-id]')
    if (!tile) return
    evt.dataTransfer?.setData('application/x-grapestrap-block', tile.dataset.blockId)
    evt.dataTransfer?.setData('text/plain', tile.dataset.blockId)
    if (evt.dataTransfer) evt.dataTransfer.effectAllowed = 'copy'
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

function insertBlockById(blockId) {
  const editor = getEditor()
  if (!editor) {
    eventBus.emit('toast', { type: 'warning', message: 'Canvas not ready.' })
    return
  }
  // Look up the block in the registry (where plugins put them) — fall back to
  // GrapesJS BlockManager in case a plugin registered directly via that path.
  const fromRegistry = pluginRegistry.blocks.find(b => b.id === blockId)
  const content = fromRegistry?.content
                  ?? editor.BlockManager?.get?.(blockId)?.get?.('content')
  if (!content) {
    eventBus.emit('toast', { type: 'warning', message: `Block "${blockId}" has no content.` })
    return
  }

  const sel = editor.getSelected?.()
  const parent = sel?.parent?.()
  let added
  if (sel && parent) {
    const idx = parent.components().indexOf(sel)
    added = parent.append(content, { at: idx + 1 })
  } else {
    added = editor.getWrapper().append(content)
  }
  // .append returns an array of newly-created components. Select the first.
  const first = Array.isArray(added) ? added[0] : added
  if (first) editor.select(first)
  eventBus.emit('canvas:content-changed')
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
