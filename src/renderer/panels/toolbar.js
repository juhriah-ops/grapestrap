/**
 * GrapeStrap — Toolbar
 *
 * Top fixed strip. Buttons: New, Open, Save, Undo, Redo, view-mode triplet,
 * device triplet, Insert dropdown, Preview. v0.0.1 ships the buttons; richer
 * states (e.g., dirty indicator on save, active view mode) layer on in v0.0.2.
 *
 * Labels/tooltips resolve through t() (Wave 4 sweep) — renderToolbar runs
 * after initI18n() in boot(), so the catalog is live by the first paint.
 * Device-button tooltips reuse the device.* keys; the single-letter button
 * glyphs (D/T/M/↻) are iconography, not prose.
 */

import { eventBus } from '../state/event-bus.js'
import { pluginRegistry } from '../plugin-host/registry.js'
import { t } from '../i18n.js'

export function renderToolbar(host) {
  host.innerHTML = `
    <div class="gstrap-tb-group">
      <button class="gstrap-tb-btn" data-cmd="file:new-project">${escHtml(t('toolbar.new'))}</button>
      <button class="gstrap-tb-btn" data-cmd="file:open-project">${escHtml(t('toolbar.open'))}</button>
      <button class="gstrap-tb-btn" data-cmd="file:save">${escHtml(t('toolbar.save'))}</button>
      <button class="gstrap-tb-btn" data-cmd="file:refresh"
              title="${escAttr(t('toolbar.refresh-title'))}">↻</button>
    </div>
    <div class="gstrap-tb-sep"></div>
    <div class="gstrap-tb-group">
      <button class="gstrap-tb-btn" data-cmd="edit:undo">${escHtml(t('toolbar.undo'))}</button>
      <button class="gstrap-tb-btn" data-cmd="edit:redo">${escHtml(t('toolbar.redo'))}</button>
    </div>
    <div class="gstrap-tb-sep"></div>
    <div class="gstrap-tb-group" data-group="view-mode">
      <button class="gstrap-tb-btn is-active" data-cmd="view:mode-design">${escHtml(t('toolbar.design'))}</button>
      <button class="gstrap-tb-btn"          data-cmd="view:mode-code">${escHtml(t('toolbar.code'))}</button>
      <button class="gstrap-tb-btn"          data-cmd="view:mode-split">${escHtml(t('toolbar.split'))}</button>
    </div>
    <div class="gstrap-tb-sep"></div>
    <div class="gstrap-tb-group" data-group="device">
      <button class="gstrap-tb-btn is-active" data-cmd="view:device-desktop" title="${escAttr(t('device.desktop'))}">D</button>
      <button class="gstrap-tb-btn"          data-cmd="view:device-tablet"  title="${escAttr(t('device.tablet'))}">T</button>
      <button class="gstrap-tb-btn"          data-cmd="view:device-mobile"  title="${escAttr(t('device.mobile'))}">M</button>
    </div>
    <div class="gstrap-tb-spacer"></div>
    <div class="gstrap-tb-group">
      <button class="gstrap-tb-btn" data-cmd="view:preview-browser" title="${escAttr(t('toolbar.preview-title'))}">${escHtml(t('toolbar.preview'))}</button>
    </div>
  `
  host.addEventListener('click', evt => {
    const btn = evt.target.closest('[data-cmd]')
    if (!btn) return
    const cmd = btn.dataset.cmd
    eventBus.emit('command', cmd)
    // Plugin-registered command? dispatch handler
    const command = pluginRegistry.commands.get(cmd)
    if (command) command.handler()
  })
}

function escHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]) }
function escAttr(s) { return escHtml(s) }
