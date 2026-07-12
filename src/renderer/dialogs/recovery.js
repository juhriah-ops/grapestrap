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
 * DEPENDS: none (DOM only; caller supplies the snapshot)
 * CREATED: 2026-07-12
 */

// ─── User-facing strings ─────────────────────────────────────────────────────
// i18n NOTE (Wave 1 rule): every user-visible string in this dialog lives in
// this block so the Wave 4 t() extraction sweep can convert it mechanically.
// The i18n runtime (src/renderer/i18n.js) is being built in parallel and may
// land after this file — do not scatter literals below this block.
const UI_STRINGS = {
  title: 'Recover unsaved changes?',
  intro: name => `GrapeStrap did not shut down cleanly. Unsaved changes for “${name}” were snapshotted before it closed.`,
  introNoName: 'GrapeStrap did not shut down cleanly. Unsaved changes were snapshotted before it closed.',
  snapshotTime: when => `Snapshot taken ${when}.`,
  itemsLabel: 'Unsaved at the time:',
  pagesItem: n => `${n} page${n === 1 ? '' : 's'}`,
  templatesItem: n => `${n} template${n === 1 ? '' : 's'}`,
  libraryItem: n => `${n} library item${n === 1 ? '' : 's'}`,
  snippetsItem: 'snippets',
  cssItem: 'project CSS',
  manifestItem: 'project settings',
  restoreHint: 'Restored changes stay in the editor until you save them.',
  restore: 'Restore changes',
  discard: 'Discard'
}

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
      <h2 id="recovery-title">${esc(UI_STRINGS.title)}</h2>
      <p>${name ? esc(UI_STRINGS.intro(name)) : esc(UI_STRINGS.introNoName)}</p>
      <p>${esc(UI_STRINGS.snapshotTime(when))}</p>
      ${items.length ? `
      <h3>${esc(UI_STRINGS.itemsLabel)}</h3>
      <ul>
        ${items.map(item => `<li>${esc(item)}</li>`).join('')}
      </ul>` : ''}
      <p>${esc(UI_STRINGS.restoreHint)}</p>

      <div class="gstrap-modal-actions">
        <button class="gstrap-btn" data-action="discard">${esc(UI_STRINGS.discard)}</button>
        <button class="gstrap-btn gstrap-btn-primary" data-action="restore">${esc(UI_STRINGS.restore)}</button>
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
  if (dirty.pages?.length) items.push(UI_STRINGS.pagesItem(dirty.pages.length))
  if (dirty.templates?.length) items.push(UI_STRINGS.templatesItem(dirty.templates.length))
  if (dirty.library?.length) items.push(UI_STRINGS.libraryItem(dirty.library.length))
  if (dirty.snippets?.length) items.push(UI_STRINGS.snippetsItem)
  if (dirty.globalCss) items.push(UI_STRINGS.cssItem)
  if (dirty.manifest) items.push(UI_STRINGS.manifestItem)
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
