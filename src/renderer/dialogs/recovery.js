/**
 * GrapeStrap — Crash-recovery dialog
 *
 * PATH: src/renderer/dialogs/recovery.js
 * ROLE: Restore/discard prompt shown when a .gstrap.recovery snapshot is
 *       found at boot or on project open. Pure UI — clones the welcome.js
 *       modal pattern (.gstrap-modal-overlay + [data-action] buttons,
 *       mounted in #gstrap-modals) and resolves with the user's choice;
 *       all restore/discard logic lives in state/recovery.js.
 *       Button actions are 'restore'/'discard' — deliberately NOT 'dismiss',
 *       so the e2e dismissWelcome helper's selector can never click here.
 * DEPENDS: i18n.js (DOM otherwise; caller supplies the snapshot)
 * CREATED: 2026-07-12
 */

import { t } from '../i18n.js'

/**
 * Show the recovery prompt for a validated snapshot envelope.
 *
 * Inputs:  snapshot — { projectName, savedAt, dirty: {pages[], templates[],
 *          library[], snippets[], globalCss, manifest}, ... } (already shape-
 *          validated by the caller; every field is still read defensively).
 * Output:  Promise<'restore'|'discard'> — resolves on button click only.
 *          There is no outside-click/Escape close (same as welcome.js): the
 *          user must make an explicit choice; closing the app instead leaves
 *          the snapshot on disk for next launch.
 * Side effects: appends to / removes from #gstrap-modals.
 * Failure modes: #gstrap-modals missing → logs nothing, resolves 'discard'?
 *          No — that would destroy data. It falls back to document.body so
 *          the prompt always renders.
 */
export function showRecoveryDialog(snapshot) {
  const name = snapshot?.projectName || ''
  const when = formatWhen(snapshot?.savedAt)
  const items = summarizeDirty(snapshot?.dirty)

  const dlg = document.createElement('div')
  dlg.className = 'gstrap-modal-overlay'
  dlg.innerHTML = `
    <div class="gstrap-modal" role="dialog" aria-labelledby="recovery-title">
      <h2 id="recovery-title">${esc(t('recovery.title'))}</h2>
      <p>${esc(name ? t('recovery.intro', { name }) : t('recovery.intro-no-name'))}</p>
      <p>${esc(t('recovery.snapshot-time', { when }))}</p>
      ${items.length ? `
      <h3>${esc(t('recovery.items-label'))}</h3>
      <ul>
        ${items.map(item => `<li>${esc(item)}</li>`).join('')}
      </ul>` : ''}
      <p>${esc(t('recovery.restore-hint'))}</p>

      <div class="gstrap-modal-actions">
        <button class="gstrap-btn" data-action="discard">${esc(t('recovery.discard'))}</button>
        <button class="gstrap-btn gstrap-btn-primary" data-action="restore">${esc(t('recovery.restore'))}</button>
      </div>
    </div>
  `
  const mount = document.getElementById('gstrap-modals') || document.body
  mount.appendChild(dlg)

  return new Promise(resolve => {
    dlg.addEventListener('click', evt => {
      const a = evt.target.closest('[data-action]')
      if (!a) return
      dlg.remove()
      resolve(a.dataset.action === 'restore' ? 'restore' : 'discard')
    })
  })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** One summary line per dirty category; empty array when the sets are absent. */
function summarizeDirty(dirty) {
  if (!dirty || typeof dirty !== 'object') return []
  const items = []
  if (dirty.pages?.length) items.push(t('recovery.pages-item', { count: dirty.pages.length }))
  if (dirty.templates?.length) items.push(t('recovery.templates-item', { count: dirty.templates.length }))
  if (dirty.library?.length) items.push(t('recovery.library-item', { count: dirty.library.length }))
  if (dirty.snippets?.length) items.push(t('recovery.snippets-item'))
  if (dirty.globalCss) items.push(t('recovery.css-item'))
  if (dirty.manifest) items.push(t('recovery.manifest-item'))
  return items
}

function formatWhen(iso) {
  const t = Date.parse(iso || '')
  return Number.isFinite(t) ? new Date(t).toLocaleString() : '—'
}

/**
 * HTML-escape for interpolated values. The project name comes from a file on
 * disk (manifest → snapshot) — an unescaped innerHTML write would let a
 * crafted project name inject markup into the app shell.
 */
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))
}
