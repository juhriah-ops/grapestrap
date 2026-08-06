/**
 * GrapeStrap — Find in Project dialog
 *
 * Modal triggered by Edit → Find in Project (Ctrl+Shift+F). Searches the
 * in-memory project buffers — page, template, and library-item markup plus
 * the global custom CSS — and lists every matching line with its source and
 * line number. Clicking a markup hit opens that page/template/library tab in
 * Code view; a CSS hit is shown for reference only (the Custom CSS panel is
 * its one editing surface — see the globalCSS dual-writer guard).
 *
 * Search is live (debounced per keystroke), plain-text, with a match-case
 * toggle. Results cap at MAX_RESULTS so a one-letter query over a 100-page
 * project can't build a 10k-row DOM; the cap is announced, never silent.
 *
 * Deliberately NOT searched: site files on disk (js/css/php opened as file
 * tabs) — their buffers live in Monaco models only while open, and scanning
 * the disk tree belongs to a main-process helper. Deferred until wanted.
 */

import { eventBus } from '../state/event-bus.js'
import { projectState } from '../state/project-state.js'
import { pageState } from '../state/page-state.js'
import { t } from '../i18n.js'

const MAX_RESULTS = 200
const DEBOUNCE_MS = 150

let overlay = null
let query = ''
let matchCase = false
let debounceTimer = null

export function openFindInProjectDialog() {
  if (overlay) return
  if (!projectState.current) {
    eventBus.emit('toast', { type: 'warning', message: t('toast.open-project-first') })
    return
  }
  const host = document.getElementById('gstrap-modals')
  if (!host) return
  overlay = document.createElement('div')
  overlay.className = 'gstrap-prefs-overlay'
  host.appendChild(overlay)
  paint()
  overlay.querySelector('[data-fip-field="query"]')?.focus()

  overlay.addEventListener('click', evt => {
    if (evt.target === overlay) close()
    const closeBtn = evt.target.closest('[data-fip-action="close"]')
    if (closeBtn) { close(); return }
    const hit = evt.target.closest('[data-fip-kind]')
    if (hit) openHit(hit.dataset.fipKind, hit.dataset.fipName)
  })
  overlay.addEventListener('input', evt => {
    const field = evt.target.closest('[data-fip-field]')
    if (!field) return
    if (field.dataset.fipField === 'query') query = field.value
    if (field.dataset.fipField === 'case')  matchCase = field.checked
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(repaintResults, DEBOUNCE_MS)
  })
  document.addEventListener('keydown', onKeyDown, true)
}

function close() {
  if (!overlay) return
  document.removeEventListener('keydown', onKeyDown, true)
  clearTimeout(debounceTimer)
  overlay.parentNode?.removeChild(overlay)
  overlay = null
  query = ''
}

function onKeyDown(evt) {
  if (!overlay) return
  if (evt.key === 'Escape') {
    evt.preventDefault(); evt.stopImmediatePropagation()
    close()
  }
}

function paint() {
  if (!overlay) return
  overlay.innerHTML = `
    <div class="gstrap-prefs-card gstrap-fip-card" role="dialog" aria-modal="true">
      <div class="gstrap-prefs-header">
        <span class="gstrap-prefs-title">${escHtml(t('fip.title'))}</span>
        <button class="gstrap-prefs-close" data-fip-action="close" title="${escAttr(t('action.close'))}">✕</button>
      </div>
      <div class="gstrap-prefs-body gstrap-fip-body">
        <div class="gstrap-fip-controls">
          <input type="text" class="gstrap-pp-input" data-fip-field="query"
                 value="${escAttr(query)}" placeholder="${escAttr(t('fip.placeholder'))}">
          <label class="gstrap-fip-case">
            <input type="checkbox" data-fip-field="case" ${matchCase ? 'checked' : ''}>
            ${escHtml(t('fip.match-case'))}
          </label>
        </div>
        <div class="gstrap-fip-results" data-region="fip-results"></div>
        <span class="gstrap-pp-hint">${escHtml(t('fip.hint'))}</span>
      </div>
    </div>
  `
  repaintResults()
}

function repaintResults() {
  const region = overlay?.querySelector('[data-region="fip-results"]')
  if (!region) return
  const q = query.trim()
  if (!q) { region.innerHTML = '' ; return }

  const { hits, capped } = search(q)
  if (hits.length === 0) {
    region.innerHTML = `<div class="gstrap-pp-fav-empty">${escHtml(t('fip.no-results'))}</div>`
    return
  }
  region.innerHTML = `
    ${hits.map(h => `
      <button class="gstrap-fip-hit" ${h.kind === 'css' ? 'disabled' : `data-fip-kind="${h.kind}" data-fip-name="${escAttr(h.name)}"`}>
        <span class="gstrap-fip-source">${escHtml(sourceLabel(h))}<span class="gstrap-fip-line">:${h.line}</span></span>
        <span class="gstrap-fip-text">${escHtml(h.text)}</span>
      </button>
    `).join('')}
    ${capped ? `<div class="gstrap-pp-fav-empty">${escHtml(t('fip.capped', { max: MAX_RESULTS }))}</div>` : ''}
  `
}

function search(q) {
  const p = projectState.current
  const needle = matchCase ? q : q.toLowerCase()
  const hits = []
  let capped = false

  const scan = (kind, name, label, content) => {
    if (capped || !content) return
    const lines = String(content).split('\n')
    for (let i = 0; i < lines.length; i++) {
      const hay = matchCase ? lines[i] : lines[i].toLowerCase()
      if (!hay.includes(needle)) continue
      hits.push({ kind, name, label, line: i + 1, text: lines[i].trim().slice(0, 160) })
      if (hits.length >= MAX_RESULTS) { capped = true; return }
    }
  }

  for (const page of p.pages || [])         scan('page', page.name, page.name, page.html)
  for (const tpl of p.templates || [])      scan('template', tpl.name, tpl.name, tpl.html)
  for (const item of p.libraryItems || [])  scan('library', item.id, item.name || item.id, item.html)
  scan('css', 'globalCSS', p.manifest?.globalCSS || 'style.css', p.globalCSS)

  return { hits, capped }
}

function sourceLabel(hit) {
  const kindLabel = t(`fip.kind.${hit.kind}`)
  return `${kindLabel} · ${hit.label}`
}

function openHit(kind, name) {
  close()
  if (kind === 'page')     pageState.open(name)
  if (kind === 'template') pageState.open(name, { kind: 'template', label: name })
  if (kind === 'library') {
    const item = projectState.getLibraryItem(name)
    pageState.open(name, { kind: 'library', label: item?.name || name })
  }
  pageState.setViewMode(name, 'code')
}

function escAttr(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;') }
function escHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c]) }
