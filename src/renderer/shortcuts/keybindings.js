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
import { resolveBindings } from './default-bindings.js'
import { log } from '../log.js'

// Active bindings = defaults + user overrides from prefs.shortcuts. Mutable
// so the rebinder dialog can swap in new bindings without a reload.
let activeBindings = resolveBindings({})

export function setBindingOverrides(overrides) {
  activeBindings = resolveBindings(overrides || {})
  eventBus.emit('shortcuts:reloaded', activeBindings)
}

export function getActiveBindings() {
  return activeBindings.slice()
}

function match(evt) {
  const k = (evt.key || '').toLowerCase()
  // Order matters — search shift-first so e.g. Ctrl+Shift+S beats Ctrl+S.
  // We rely on the default-bindings.js order for that.
  for (const b of activeBindings) {
    if (b.key !== k) continue
    if (!!b.ctrl  !== !!(evt.ctrlKey || evt.metaKey)) continue
    if (!!b.shift !== !!evt.shiftKey) continue
    if (!!b.alt   !== !!evt.altKey) continue
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

export async function wireKeybindings() {
  // Pull persisted overrides from the main-process prefs store. Failure to
  // read prefs (e.g. fresh install where the file doesn't exist yet) is fine
  // — defaults stand.
  try {
    const overrides = await window.grapestrap?.prefs?.get?.('shortcuts')
    if (overrides && typeof overrides === 'object') setBindingOverrides(overrides)
  } catch { /* defaults stand */ }

  attachTo(document)

  // GrapesJS canvas iframe — keydown events inside the iframe do NOT bubble
  // to the parent document, so we attach a second listener there once the
  // canvas frame loads. canvas:frame:load fires every time the iframe
  // reloads (project switch, etc.); attached set dedupes.
  eventBus.on('canvas:ready', editor => {
    bindCanvas(editor)
  })

  // Preferences dialog edits broadcast on this channel — re-resolve the
  // active set without restarting the app.
  eventBus.on('shortcuts:user-changed', overrides => setBindingOverrides(overrides))
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
