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
 * Click insertion target rule (refined 2026-05-03 from user feedback "not
 * consistent on what it attaches to"):
 *   - No selection (or wrapper selected): append to the page root.
 *   - Selection is a known container (div / section / main / article /
 *     aside / header / footer / nav / form / ul / ol): append INSIDE the
 *     container as its last child. Lets the user click a Card and then
 *     click Button to put a button INSIDE the card.
 *   - Selection is a known leaf (p / h1-h6 / span / img / a / button /
 *     input / label): insert as a sibling AFTER the leaf, inside its
 *     parent. Lets the user click a heading and then click Paragraph to
 *     get a paragraph next to the heading.
 *   - Selection is anything else: fall back to sibling-after — the
 *     historical behavior, predictable for unknown elements.
 *
 * The destination container gets a brief outline flash so the user sees
 * where the new block landed. The new component is also selected so its
 * normal GrapesJS handles appear and editing can continue without an
 * extra click.
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

// Tag classification for the placement rule. Lowercase. `td/th/li` are NOT
// in the container set on purpose — they're typed by their parent and we
// don't want a paragraph to land inside a <li> from a Layout tab click;
// users who want that can drill in by clicking the <li> first, at which
// point the "else" branch puts it as a sibling-after, which is what they
// almost certainly want.
const CONTAINER_TAGS = new Set([
  'div', 'section', 'main', 'article', 'aside',
  'header', 'footer', 'nav', 'form',
  'ul', 'ol'
])
const LEAF_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'span', 'img', 'a', 'button', 'input', 'label'
])

function tagOf(component) {
  return (component?.get?.('tagName') || '').toLowerCase()
}

function insertBlockById(blockId) {
  const editor = getEditor()
  if (!editor) {
    eventBus.emit('toast', { type: 'warning', message: 'Canvas not ready.' })
    return
  }
  const fromRegistry = pluginRegistry.blocks.find(b => b.id === blockId)
  const content = fromRegistry?.content
                  ?? editor.BlockManager?.get?.(blockId)?.get?.('content')
  if (!content) {
    eventBus.emit('toast', { type: 'warning', message: `Block "${blockId}" has no content.` })
    return
  }

  const wrapper = editor.getWrapper()
  const sel = editor.getSelected?.()
  let target = wrapper
  let added

  if (!sel || sel === wrapper) {
    added = wrapper.append(content)
  } else {
    const tag = tagOf(sel)
    if (CONTAINER_TAGS.has(tag)) {
      target = sel
      added = sel.append(content)
    } else {
      // Leaf or unknown — insert as a sibling after the selection.
      const parent = sel.parent?.() || wrapper
      const idx = parent.components().indexOf(sel)
      target = parent
      added = parent.append(content, { at: idx + 1 })
    }
  }

  // .append returns an array of newly-created components. Select the first.
  const first = Array.isArray(added) ? added[0] : added
  if (first) editor.select(first)
  flashDestination(editor, target)
  eventBus.emit('canvas:content-changed')
}

// ─── Destination flash ───────────────────────────────────────────────────────
//
// Brief outline animation on the container that received the insert so the
// user can see where the block landed. Skipped when the destination is the
// wrapper — the wrapper IS the page body, animating its whole outline is
// noisy and unhelpful. The new component is already selected, which gives
// it GrapesJS's standard selection outline; the flash is for the parent.

const FLASH_CLASS = 'gstrap-insert-flash'
const FLASH_STYLE_ATTR = 'data-gstrap-insert-flash'

function flashDestination(editor, container) {
  if (!container || container === editor.getWrapper()) return
  ensureCanvasFlashStyles(editor)
  const el = container.getEl?.()
  if (!el) return
  el.classList.remove(FLASH_CLASS) // restart the animation if a previous one is mid-flight
  // Force reflow so re-adding the class restarts the keyframes cleanly.
  void el.offsetWidth
  el.classList.add(FLASH_CLASS)
  setTimeout(() => el.classList.remove(FLASH_CLASS), 700)
}

// Idempotent — checks the iframe's own document each call, which keeps us
// correct across canvas iframe reloads (project switch / page reload).
function ensureCanvasFlashStyles(editor) {
  const doc = editor.Canvas?.getDocument?.()
  if (!doc || doc.querySelector(`style[${FLASH_STYLE_ATTR}]`)) return
  const style = doc.createElement('style')
  style.setAttribute(FLASH_STYLE_ATTR, '')
  // Color hardcoded — the iframe is a separate document and doesn't see the
  // shell's --accent custom property. Matches the editor accent (#3fb950).
  style.textContent = `
    @keyframes gstrap-insert-flash-anim {
      0%   { outline-color: #3fb950; }
      100% { outline-color: transparent; }
    }
    .${FLASH_CLASS} {
      outline: 2px solid #3fb950;
      outline-offset: 2px;
      animation: gstrap-insert-flash-anim 700ms ease-out forwards;
    }
  `
  doc.head.appendChild(style)
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
