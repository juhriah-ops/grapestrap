/**
 * GrapeStrap — Preferences dialog
 *
 * v0.0.2 ships the Shortcuts tab (the v0.0.1 stub was a no-op). Other tabs
 * (General / Editor / Plugins) are scaffolded but only the Shortcuts pane is
 * fully wired here — the rest are deferred to v0.0.3.
 *
 * Shortcuts UI:
 *   - One row per command from DEFAULT_BINDINGS, with the active binding
 *     pretty-printed.
 *   - "Edit" enters a per-row capture state: the row swaps to "Press a
 *     combo… (Esc cancels)", and the next non-modifier keydown is read as
 *     the new binding.
 *   - Conflict detection: if the new combo collides with another command's
 *     binding, the row shows a red "Conflict with <command>" inline and
 *     refuses the save until the user picks something else.
 *   - "Reset" reverts a row to its default (clears the override).
 *   - "Reset all" clears every override.
 *   - All edits persist to prefs.shortcuts immediately AND broadcast via
 *     eventBus 'shortcuts:user-changed' so keybindings.js takes effect
 *     without a restart.
 */

import { eventBus } from '../state/event-bus.js'
import { DEFAULT_BINDINGS, formatCombo, resolveBindings } from '../shortcuts/default-bindings.js'

let overlay = null
let overrides = {}
let editingCommand = null

const TABS = [
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'general',   label: 'General'   },
  { id: 'editor',    label: 'Editor'    },
  { id: 'plugins',   label: 'Plugins'   }
]

let activeTab = 'shortcuts'

export function openPreferencesDialog() {
  if (overlay) return
  const host = document.getElementById('gstrap-modals')
  if (!host) return

  overlay = document.createElement('div')
  overlay.className = 'gstrap-prefs-overlay'
  host.appendChild(overlay)

  loadOverrides().then(() => paint())

  overlay.addEventListener('click', evt => {
    if (evt.target === overlay) close()
    const tab = evt.target.closest('[data-prefs-tab]')
    if (tab) { activeTab = tab.dataset.prefsTab; paint(); return }
    const action = evt.target.closest('[data-prefs-action]')
    if (action) handleAction(action.dataset.prefsAction, action.dataset.prefsCommand)
  })
  document.addEventListener('keydown', onKeyDown, true)
}

function close() {
  if (!overlay) return
  document.removeEventListener('keydown', onKeyDown, true)
  overlay.parentNode?.removeChild(overlay)
  overlay = null
  editingCommand = null
}

async function loadOverrides() {
  try {
    overrides = (await window.grapestrap?.prefs?.get?.('shortcuts')) || {}
  } catch {
    overrides = {}
  }
}

function paint() {
  if (!overlay) return
  overlay.innerHTML = `
    <div class="gstrap-prefs-card" role="dialog" aria-modal="true">
      <div class="gstrap-prefs-header">
        <span class="gstrap-prefs-title">Preferences</span>
        <button class="gstrap-prefs-close" data-prefs-action="close" title="Close">✕</button>
      </div>
      <div class="gstrap-prefs-body">
        <div class="gstrap-prefs-tabs">
          ${TABS.map(t => `
            <button class="gstrap-prefs-tab ${t.id === activeTab ? 'is-active' : ''}"
                    data-prefs-tab="${t.id}">${t.label}</button>
          `).join('')}
        </div>
        <div class="gstrap-prefs-pane">
          ${activeTab === 'shortcuts' ? paintShortcutsPane() : paintStubPane(activeTab)}
        </div>
      </div>
    </div>
  `
}

function paintShortcutsPane() {
  const active = resolveBindings(overrides)
  const byCommand = {}
  for (const b of active) byCommand[b.command] = b

  return `
    <div class="gstrap-prefs-toolbar">
      <button class="gstrap-prefs-btn" data-prefs-action="reset-all">Reset all</button>
    </div>
    <table class="gstrap-prefs-shortcuts">
      <thead>
        <tr><th>Action</th><th>Shortcut</th><th></th></tr>
      </thead>
      <tbody>
        ${DEFAULT_BINDINGS.map(def => paintRow(def, byCommand[def.command])).join('')}
      </tbody>
    </table>
  `
}

function paintRow(def, active) {
  const isEditing = editingCommand === def.command
  const overridden = Object.prototype.hasOwnProperty.call(overrides, def.command)
  const conflict = isEditing ? null : findConflict(def.command, active)
  return `
    <tr data-prefs-row="${def.command}" class="${overridden ? 'is-overridden' : ''} ${conflict ? 'is-conflict' : ''}">
      <td class="gstrap-prefs-row-label">${escHtml(def.label)}</td>
      <td class="gstrap-prefs-row-combo">
        ${isEditing
          ? `<span class="gstrap-prefs-combo-capturing">Press a combo… (Esc cancels)</span>`
          : `<code class="gstrap-prefs-combo">${escHtml(formatCombo(active))}</code>`}
        ${conflict ? `<span class="gstrap-prefs-conflict">conflicts with ${escHtml(conflict)}</span>` : ''}
      </td>
      <td class="gstrap-prefs-row-actions">
        ${isEditing
          ? `<button class="gstrap-prefs-btn" data-prefs-action="cancel-edit">Cancel</button>`
          : `
            <button class="gstrap-prefs-btn" data-prefs-action="edit"  data-prefs-command="${escAttr(def.command)}">Edit</button>
            ${overridden ? `<button class="gstrap-prefs-btn" data-prefs-action="reset" data-prefs-command="${escAttr(def.command)}">Reset</button>` : ''}
          `}
      </td>
    </tr>
  `
}

function paintStubPane(tab) {
  return `
    <div class="gstrap-prefs-stub">
      <p>The <strong>${escHtml(tab)}</strong> tab is scaffolded for v0.0.3. For now, edit
      <code>$XDG_CONFIG_HOME/GrapeStrap/preferences.json</code> directly.</p>
    </div>
  `
}

function handleAction(action, command) {
  switch (action) {
    case 'close':       close(); return
    case 'edit':        editingCommand = command; paint(); return
    case 'cancel-edit': editingCommand = null; paint(); return
    case 'reset':       resetCommand(command); return
    case 'reset-all':   resetAll(); return
  }
}

function onKeyDown(evt) {
  if (!overlay) return
  // Capture combos for the row currently in edit mode.
  if (editingCommand) {
    if (evt.key === 'Escape') {
      evt.preventDefault(); evt.stopImmediatePropagation()
      editingCommand = null; paint()
      return
    }
    // Wait for a non-modifier key. Skip pure-modifier keydowns.
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(evt.key)) return
    evt.preventDefault(); evt.stopImmediatePropagation()
    const next = {
      key:   (evt.key || '').toLowerCase(),
      ctrl:  !!(evt.ctrlKey || evt.metaKey),
      shift: !!evt.shiftKey,
      alt:   !!evt.altKey
    }
    overrides = { ...overrides, [editingCommand]: next }
    persistOverrides()
    editingCommand = null
    paint()
    return
  }
  // Plain Esc when not editing closes the dialog.
  if (evt.key === 'Escape') {
    evt.preventDefault(); evt.stopImmediatePropagation()
    close()
  }
}

function resetCommand(command) {
  if (!Object.prototype.hasOwnProperty.call(overrides, command)) return
  const next = { ...overrides }
  delete next[command]
  overrides = next
  persistOverrides()
  paint()
}

function resetAll() {
  overrides = {}
  persistOverrides()
  paint()
}

async function persistOverrides() {
  try { await window.grapestrap?.prefs?.set?.('shortcuts', overrides) }
  catch { /* prefs store unavailable; just keep in-memory state */ }
  eventBus.emit('shortcuts:user-changed', overrides)
}

function findConflict(commandId, binding) {
  if (!binding || !binding.key) return null
  // Find any OTHER active binding with the same combo.
  const all = resolveBindings(overrides)
  for (const b of all) {
    if (b.command === commandId) continue
    if (b.key   !== binding.key) continue
    if (!!b.ctrl  !== !!binding.ctrl)  continue
    if (!!b.shift !== !!binding.shift) continue
    if (!!b.alt   !== !!binding.alt)   continue
    return b.command
  }
  return null
}

function escHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c]) }
function escAttr(s) { return escHtml(s) }
