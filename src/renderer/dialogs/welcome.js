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

export async function showWelcomeIfFirstRun() {
  const shown = await window.grapestrap.prefs.get('general.welcomeShown')
  if (shown) return

  const dlg = document.createElement('div')
  dlg.className = 'gstrap-modal-overlay'
  dlg.innerHTML = `
    <div class="gstrap-modal" role="dialog" aria-labelledby="welcome-title">
      <h2 id="welcome-title">Welcome to GrapeStrap</h2>
      <p>The Dreamweaver-style visual editor for Bootstrap 5 on Linux.</p>

      <h3>A few things to know</h3>
      <ul>
        <li><strong>Class-first styling.</strong> GrapeStrap edits Bootstrap classes, not inline styles. Reach for spacing/text/background panels instead of custom CSS for most things.</li>
        <li><strong>Design ↔ Code sync is one-way-live.</strong> Edits in Design view flow to Code view continuously. Edits in Code view rebuild the canvas only when you switch back to Design — and selection resets. This is intentional.</li>
        <li><strong>No telemetry.</strong> GrapeStrap never phones home.</li>
      </ul>

      <h3>Where things live</h3>
      <ul>
        <li>Preferences: <code>$XDG_CONFIG_HOME/GrapeStrap/preferences.json</code></li>
        <li>Plugins: <code>$XDG_CONFIG_HOME/GrapeStrap/plugins/</code></li>
        <li>Logs: <code>$XDG_DATA_HOME/GrapeStrap/logs/</code></li>
      </ul>

      <div class="gstrap-modal-actions">
        <button class="gstrap-btn" data-action="docs">Open Docs</button>
        <button class="gstrap-btn gstrap-btn-primary" data-action="dismiss">Don't show again</button>
      </div>
    </div>
  `
  document.getElementById('gstrap-modals').appendChild(dlg)

  return new Promise(resolve => {
    dlg.addEventListener('click', async evt => {
      const a = evt.target.closest('[data-action]')
      if (!a) return
      if (a.dataset.action === 'docs') {
        window.grapestrap.shell.openExternal('https://grapestrap.org/docs')
      }
      await window.grapestrap.prefs.set('general.welcomeShown', true)
      dlg.remove()
      resolve()
    })
  })
}
