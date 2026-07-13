/**
 * GrapeStrap — Welcome dialog (first-launch onboarding)
 *
 * Shown once after fresh install. Explains:
 *   - Class-first philosophy (Bootstrap classes over inline styles)
 *   - Code-authoritative-when-active sync policy (the gotcha)
 *   - Where settings/plugins/logs live (XDG paths)
 *   - Link to docs
 *
 * Re-shown when prefs.general.welcomeShown is false. Closing the dialog with
 * "Don't show again" sets it to true.
 */

import { t } from '../i18n.js'
import { codeMarkup } from '../i18n-html.js'

export async function showWelcomeIfFirstRun() {
  const shown = await window.grapestrap.prefs.get('general.welcomeShown')
  if (shown) return

  const dlg = document.createElement('div')
  dlg.className = 'gstrap-modal-overlay'
  dlg.innerHTML = `
    <div class="gstrap-modal" role="dialog" aria-labelledby="welcome-title">
      <h2 id="welcome-title">${codeMarkup(t('welcome.title'))}</h2>
      <p>${codeMarkup(t('welcome.tagline'))}</p>

      <h3>${codeMarkup(t('welcome.things-to-know'))}</h3>
      <ul>
        <li><strong>${codeMarkup(t('welcome.point-classes-title'))}</strong> ${codeMarkup(t('welcome.point-classes-body'))}</li>
        <li><strong>${codeMarkup(t('welcome.point-sync-title'))}</strong> ${codeMarkup(t('welcome.point-sync-body'))}</li>
        <li><strong>${codeMarkup(t('welcome.point-telemetry-title'))}</strong> ${codeMarkup(t('welcome.point-telemetry-body'))}</li>
      </ul>

      <h3>${codeMarkup(t('welcome.where-things-live'))}</h3>
      <ul>
        <li>${codeMarkup(t('welcome.paths-prefs'))} <code>$XDG_CONFIG_HOME/GrapeStrap/preferences.json</code></li>
        <li>${codeMarkup(t('welcome.paths-plugins'))} <code>$XDG_CONFIG_HOME/GrapeStrap/plugins/</code></li>
        <li>${codeMarkup(t('welcome.paths-logs'))} <code>$XDG_DATA_HOME/GrapeStrap/logs/</code></li>
      </ul>

      <div class="gstrap-modal-actions">
        <button class="gstrap-btn" data-action="docs">${codeMarkup(t('welcome.docs'))}</button>
        <button class="gstrap-btn gstrap-btn-primary" data-action="dismiss">${codeMarkup(t('welcome.dismiss'))}</button>
      </div>
    </div>
  `
  document.getElementById('gstrap-modals').appendChild(dlg)

  return new Promise(resolve => {
    dlg.addEventListener('click', async evt => {
      const a = evt.target.closest('[data-action]')
      if (!a) return
      if (a.dataset.action === 'docs') {
        window.grapestrap.shell.openExternal('https://github.com/juhriah-ops/grapestrap/tree/main/docs')
      }
      await window.grapestrap.prefs.set('general.welcomeShown', true)
      dlg.remove()
      resolve()
    })
  })
}
