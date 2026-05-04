/**
 * GrapeStrap — Linked Files bar
 *
 * Strip above the canvas, below page tabs. Shows the CSS/JS files referenced
 * by the active page's HTML — `<link rel="stylesheet" href="...">` and
 * `<script src="...">` — as click-to-jump chips.
 *
 * Click semantics:
 *   - href === project's globalCSS file (e.g. "style.css") →
 *     emits `linked-files:open-globalcss` so the Custom CSS panel can focus
 *     itself. (The Custom CSS panel is a GL component; we don't directly
 *     drive its visibility from here.)
 *   - any other path → toast "External resource: <href>" — for v0.0.2 we
 *     don't open arbitrary asset files in tabs.
 *
 * Visibility:
 *   - Hidden when there's no active page (no project / no tab open).
 *   - Hidden when the active tab is a library item (libraries are bare HTML
 *     fragments without their own head links).
 *   - Toggleable via `view:toggle-linked-files` event (added below).
 */

import { eventBus } from '../../state/event-bus.js'
import { projectState } from '../../state/project-state.js'
import { pageState } from '../../state/page-state.js'

let host = null
let userHidden = false

export function renderLinkedFilesBar(target) {
  host = target
  paint()
  eventBus.on('tab:focused',          () => paint())
  eventBus.on('tab:closed',           () => paint())
  eventBus.on('project:opened',       () => paint())
  eventBus.on('project:closed',       () => paint())
  eventBus.on('canvas:content-changed', () => debouncedPaint())
  eventBus.on('view:toggle-linked-files', () => {
    userHidden = !userHidden
    paint()
  })
  host.addEventListener('click', evt => {
    const chip = evt.target.closest('[data-lf-href]')
    if (!chip) return
    const href = chip.dataset.lfHref
    onChipClick(href)
  })
}

let paintScheduled = false
function debouncedPaint() {
  if (paintScheduled) return
  paintScheduled = true
  // Coalesce burst-of-component-changed events into one repaint per frame.
  requestAnimationFrame(() => { paintScheduled = false; paint() })
}

function paint() {
  if (!host) return
  const tab = pageState.active()
  if (userHidden || !tab || tab.kind === 'library' || !projectState.current) {
    host.hidden = true
    host.innerHTML = ''
    return
  }
  const page = projectState.getPage(tab.pageName)
  if (!page) {
    host.hidden = true
    return
  }
  const refs = parseLinks(page.html || '')
  host.hidden = false
  host.innerHTML = `
    <span class="gstrap-lf-label">Linked:</span>
    ${refs.length === 0
      ? '<span class="gstrap-lf-empty">No external CSS/JS referenced by this page</span>'
      : refs.map(r => `
          <button class="gstrap-lf-chip gstrap-lf-${r.kind}" data-lf-href="${escAttr(r.href)}"
                  title="${escAttr(r.kind.toUpperCase())} — ${escAttr(r.href)}">
            <span class="gstrap-lf-chip-kind">${r.kind}</span>
            <span class="gstrap-lf-chip-name">${escHtml(basename(r.href))}</span>
          </button>
        `).join('')
    }
  `
}

function onChipClick(href) {
  const projectCss = projectState.current?.manifest?.globalCSS || 'style.css'
  if (matchesPath(href, projectCss)) {
    eventBus.emit('linked-files:open-globalcss')
    eventBus.emit('toast', { type: 'info', message: 'Project style.css is open in the Custom CSS panel.' })
    return
  }
  eventBus.emit('toast', {
    type: 'info',
    message: `External resource: ${href}`
  })
}

function parseLinks(html) {
  const out = []
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html')
  doc.querySelectorAll('link[rel="stylesheet"][href]').forEach(el => {
    out.push({ kind: 'css', href: el.getAttribute('href') })
  })
  doc.querySelectorAll('script[src]').forEach(el => {
    out.push({ kind: 'js', href: el.getAttribute('src') })
  })
  return out
}

function basename(href) {
  try { return href.split('?')[0].split('#')[0].split('/').filter(Boolean).pop() || href }
  catch { return href }
}
function matchesPath(href, target) {
  // "style.css" matches "./style.css", "/style.css", "css/style.css" gets a soft match.
  const a = String(href).replace(/^\.?\/?/, '').replace(/^css\//, '')
  const b = String(target).replace(/^\.?\/?/, '').replace(/^css\//, '')
  return a === b
}

function escAttr(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;') }
function escHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c]) }
