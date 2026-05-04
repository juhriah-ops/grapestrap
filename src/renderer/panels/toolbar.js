/**
 * GrapeStrap — Toolbar
 *
 * Top fixed strip. Buttons: New, Open, Save, Undo, Redo, view-mode triplet,
 * device triplet, Insert dropdown, Preview. v0.0.1 ships the buttons; richer
 * states (e.g., dirty indicator on save, active view mode) layer on in v0.0.2.
 */

import { eventBus } from '../state/event-bus.js'
import { pluginRegistry } from '../plugin-host/registry.js'

export function renderToolbar(host) {
  host.innerHTML = `
    <div class="gstrap-tb-group">
      <button class="gstrap-tb-btn" data-cmd="file:new-project">New</button>
      <button class="gstrap-tb-btn" data-cmd="file:open-project">Open</button>
      <button class="gstrap-tb-btn" data-cmd="file:save">Save</button>
      <button class="gstrap-tb-btn" data-cmd="file:refresh"
              title="Save everything to disk + re-sync canvas with all assets">↻</button>
    </div>
    <div class="gstrap-tb-sep"></div>
    <div class="gstrap-tb-group">
      <button class="gstrap-tb-btn" data-cmd="edit:undo">Undo</button>
      <button class="gstrap-tb-btn" data-cmd="edit:redo">Redo</button>
    </div>
    <div class="gstrap-tb-sep"></div>
    <div class="gstrap-tb-group" data-group="view-mode">
      <button class="gstrap-tb-btn is-active" data-cmd="view:mode-design">Design</button>
      <button class="gstrap-tb-btn"          data-cmd="view:mode-code">Code</button>
      <button class="gstrap-tb-btn"          data-cmd="view:mode-split">Split</button>
    </div>
    <div class="gstrap-tb-sep"></div>
    <div class="gstrap-tb-group" data-group="device">
      <button class="gstrap-tb-btn is-active" data-cmd="view:device-desktop" title="Desktop">D</button>
      <button class="gstrap-tb-btn"          data-cmd="view:device-tablet"  title="Tablet">T</button>
      <button class="gstrap-tb-btn"          data-cmd="view:device-mobile"  title="Mobile">M</button>
    </div>
    <div class="gstrap-tb-spacer"></div>
    <div class="gstrap-tb-group">
      <button class="gstrap-tb-btn" data-cmd="view:preview-browser" title="Preview in Browser">Preview</button>
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
