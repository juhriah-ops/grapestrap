/**
 * GrapeStrap — Renderer keybindings
 *
 * Native menu accelerators (CmdOrCtrl+S etc. set in src/main/menus.js) are NOT
 * a reliable way to fire commands on Linux: with the auto-hide menu bar most
 * desktops use, plus the GrapesJS canvas iframe / Monaco both capturing key
 * events when focused, the OS-level accelerator often never makes it back to
 * the BrowserWindow's menu. The user reported "Ctrl+S doesn't work" and the
 * regression spec confirmed: keystroke reaches the document, no menu:action
 * IPC ever fires.
 *
 * Fix: a renderer-side keydown handler in capture phase that mirrors the
 * accelerator → command map from menus.js, dispatches via the same eventBus
 * 'command' channel the menu router already listens on, and stops
 * propagation so Monaco / GrapesJS don't also process the key.
 *
 * The native menu accelerators stay in menus.js — they're still useful as
 * label hints in the menu UI and they DO fire when the menu has focus
 * (Alt+F → S). This module is the always-works path.
 *
 * Also attaches to the GrapesJS canvas iframe contentDocument when the canvas
 * loads, since iframe keydown events do NOT bubble to the parent document.
 */

import { eventBus } from '../state/event-bus.js'
import { log } from '../log.js'

// One row per native-menu accelerator we want to honor from the keyboard.
// Keys are case-insensitive on the right-hand side; modifier flags are exact.
// Order matters — first match wins (so put more-specific shift+key before
// the same key without shift).
const BINDINGS = [
  // File
  { key: 's', ctrl: true, shift: true,  command: 'file:save-as' },
  { key: 's', ctrl: true, shift: false, command: 'file:save' },
  { key: 'n', ctrl: true, shift: true,  command: 'file:new-page' },
  { key: 'n', ctrl: true, shift: false, command: 'file:new-project' },
  { key: 'o', ctrl: true, shift: false, command: 'file:open-project' },
  { key: 'e', ctrl: true, shift: false, command: 'file:export' },
  { key: 'w', ctrl: true, shift: true,  command: 'edit:wrap-tag' },
  { key: 'w', ctrl: true, shift: false, command: 'file:close-tab' },

  // Edit
  { key: 'z', ctrl: true, shift: true,  command: 'edit:redo' },
  { key: 'z', ctrl: true, shift: false, command: 'edit:undo' },
  { key: 'd', ctrl: true, shift: false, command: 'edit:duplicate' },
  { key: 't', ctrl: true, shift: false, command: 'edit:quick-tag' },

  // View
  { key: '1', ctrl: true, shift: false, command: 'view:mode-design' },
  { key: '2', ctrl: true, shift: false, command: 'view:mode-code' },
  { key: '3', ctrl: true, shift: false, command: 'view:mode-split' },
  { key: 'b', ctrl: true, shift: false, command: 'view:toggle-file-manager' },
  { key: 'j', ctrl: true, shift: false, command: 'view:toggle-properties' },
  { key: 'i', ctrl: true, shift: false, command: 'view:toggle-insert' },
  { key: 'o', ctrl: true, shift: true,  command: 'view:toggle-dom-tree' },

  // Help
  { key: '/', ctrl: true, shift: false, command: 'help:shortcuts' }
]

function match(evt) {
  const k = (evt.key || '').toLowerCase()
  for (const b of BINDINGS) {
    if (b.key !== k) continue
    if (!!b.ctrl !== !!(evt.ctrlKey || evt.metaKey)) continue
    if (!!b.shift !== !!evt.shiftKey) continue
    return b
  }
  return null
}

// Editing form fields should NOT swallow keys that are normal text editing
// (Ctrl+A select-all is a system shortcut, but Ctrl+S in a text field still
// means save the project — never "submit form"). However, we DO skip if the
// active element is a single-line input where the user is typing — there's
// no project mutation possible from there, but we don't want to interfere
// with system-level paste/cut behavior either. Keep this conservative: only
// suppress when the target is a text input/textarea AND the key is one we
// don't have a binding for.
function isInTextField(target) {
  if (!target) return false
  const tag = (target.tagName || '').toLowerCase()
  if (tag === 'input') {
    const type = (target.type || 'text').toLowerCase()
    return ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].includes(type)
  }
  return tag === 'textarea' || target.isContentEditable
}

function handle(evt) {
  const binding = match(evt)
  if (!binding) return
  // Don't trample the user's typing in a text field for keys that have OS
  // semantics — but Save (Ctrl+S) and friends should still fire. Currently
  // every binding here is a global app shortcut, not text-editing, so we
  // always proceed.
  void isInTextField  // intentionally unused for now; kept for v0.0.2 nuance
  evt.preventDefault()
  evt.stopImmediatePropagation()
  log.debug('keybinding fired', binding.command)
  eventBus.emit('command', binding.command)
}

const attached = new WeakSet()

function attachTo(doc) {
  if (!doc || attached.has(doc)) return
  attached.add(doc)
  doc.addEventListener('keydown', handle, true)
}

export function wireKeybindings() {
  attachTo(document)

  // GrapesJS canvas iframe — keydown events inside the iframe do NOT bubble
  // to the parent document, so we attach a second listener there once the
  // canvas frame loads. canvas:frame:load fires every time the iframe
  // reloads (project switch, etc.); attached set dedupes.
  eventBus.on('canvas:ready', editor => {
    bindCanvas(editor)
  })
}

function bindCanvas(editor) {
  const tryAttach = () => {
    const frame = editor?.Canvas?.getFrameEl?.()
    const doc = frame?.contentDocument
    if (doc) attachTo(doc)
  }
  tryAttach()
  editor?.on?.('canvas:frame:load', tryAttach)
}
