// =============================================================
// PATH: src/renderer/dialogs/about.js
// ROLE: About modal (Help → About GrapeStrap) — app name, runtime
//       version (from main via app:info, never hardcoded), license,
//       repo link, and the no-telemetry pledge. Replaces the v0.0.2
//       toast that dialog:about used to emit (renderer/main.js).
//       House modal pattern per welcome.js: gstrap-modal-overlay +
//       gstrap-modal card in #gstrap-modals, data-action buttons,
//       every string through t().
// DEPENDS: i18n.js, styles/modals.css, window.grapestrap.shell
// CREATED: 2026-07-12 (Wave 5)
// =============================================================

import { t } from '../i18n.js'

// Source-repo link — packaging metadata, not a translatable string.
const REPO_URL = 'https://github.com/juhriah-ops/grapestrap'
const LICENSE = 'MIT'

let activeDialog = null

/**
 * showAboutDialog(info) — info is the app:info payload the renderer boot
 * already holds ({ version, ... }). Resolves when the dialog is dismissed
 * (close button, backdrop click, or Esc).
 */
export function showAboutDialog(info = {}) {
  if (activeDialog) activeDialog.dismiss()

  const host = document.getElementById('gstrap-modals')
  if (!host) return Promise.resolve()

  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.className = 'gstrap-modal-overlay'
    overlay.innerHTML = `
      <div class="gstrap-modal gstrap-about" role="dialog" aria-labelledby="about-title">
        <h2 id="about-title">${escHtml(t('dialog.about.title'))}</h2>
        <dl class="gstrap-about-meta">
          <dt>${escHtml(t('dialog.about.version-label'))}</dt>
          <dd data-about-version>${escHtml(info.version || '')}</dd>
          <dt>${escHtml(t('dialog.about.license-label'))}</dt>
          <dd>${escHtml(LICENSE)}</dd>
          <dt>${escHtml(t('dialog.about.repo-label'))}</dt>
          <dd><a href="#" data-action="repo">${escHtml(REPO_URL)}</a></dd>
        </dl>
        <p class="gstrap-about-pledge" data-about-pledge>${escHtml(t('dialog.about.pledge'))}</p>
        <div class="gstrap-modal-actions">
          <button class="gstrap-btn gstrap-btn-primary" data-action="dismiss">${escHtml(t('dialog.about.close'))}</button>
        </div>
      </div>
    `
    host.appendChild(overlay)

    function dismiss() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay)
      activeDialog = null
      resolve()
    }

    overlay.addEventListener('click', evt => {
      if (evt.target === overlay) return dismiss()
      const action = evt.target.closest('[data-action]')
      if (!action) return
      if (action.dataset.action === 'repo') {
        evt.preventDefault()
        window.grapestrap.shell.openExternal(REPO_URL)
        return
      }
      if (action.dataset.action === 'dismiss') dismiss()
    })
    overlay.addEventListener('keydown', evt => {
      if (evt.key === 'Escape') { evt.preventDefault(); dismiss() }
    })

    overlay.querySelector('[data-action="dismiss"]').focus()
    activeDialog = { dismiss }
  })
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}
