/**
 * GrapeStrap — Default keybindings
 *
 * Source of truth for the "out of the box" shortcut map. Each entry pairs a
 * command id with a default `{ key, ctrl, shift, alt }` combo and a human
 * label for the Preferences UI. The label is the only field the user sees in
 * the keybinding editor — the command id is the wire-format used by the
 * event bus and the menu router.
 *
 * Active bindings = these defaults overlaid with `prefs.shortcuts`. The
 * override format mirrors a single binding ({ key, ctrl, shift, alt } or
 * `null` to disable a default).
 */

export const DEFAULT_BINDINGS = [
  // File
  { command: 'file:save-as',          label: 'Save As',                 key: 's', ctrl: true, shift: true,  alt: false },
  { command: 'file:save',             label: 'Save',                    key: 's', ctrl: true, shift: false, alt: false },
  { command: 'file:new-page',         label: 'New Page',                key: 'n', ctrl: true, shift: true,  alt: false },
  { command: 'file:new-project',      label: 'New Project',             key: 'n', ctrl: true, shift: false, alt: false },
  { command: 'file:open-project',     label: 'Open Project',            key: 'o', ctrl: true, shift: false, alt: false },
  { command: 'file:export',           label: 'Export',                  key: 'e', ctrl: true, shift: false, alt: false },
  { command: 'edit:wrap-tag',         label: 'Wrap with Tag',           key: 'w', ctrl: true, shift: true,  alt: false },
  { command: 'file:close-tab',        label: 'Close Tab',               key: 'w', ctrl: true, shift: false, alt: false },

  // Edit
  { command: 'edit:redo',             label: 'Redo',                    key: 'z', ctrl: true, shift: true,  alt: false },
  { command: 'edit:undo',             label: 'Undo',                    key: 'z', ctrl: true, shift: false, alt: false },
  { command: 'edit:duplicate',        label: 'Duplicate',               key: 'd', ctrl: true, shift: false, alt: false },
  { command: 'edit:quick-tag',        label: 'Quick Tag Editor',        key: 't', ctrl: true, shift: false, alt: false },

  // View
  { command: 'view:mode-design',      label: 'Design View',             key: '1', ctrl: true, shift: false, alt: false },
  { command: 'view:mode-code',        label: 'Code View',               key: '2', ctrl: true, shift: false, alt: false },
  { command: 'view:mode-split',       label: 'Split View',              key: '3', ctrl: true, shift: false, alt: false },
  { command: 'view:toggle-file-manager', label: 'Toggle Project panel', key: 'b', ctrl: true, shift: false, alt: false },
  { command: 'view:toggle-properties',  label: 'Toggle Properties panel', key: 'j', ctrl: true, shift: false, alt: false },
  { command: 'view:toggle-insert',      label: 'Toggle Insert panel',  key: 'i', ctrl: true, shift: false, alt: false },
  { command: 'view:toggle-dom-tree',    label: 'Toggle DOM tree',      key: 'o', ctrl: true, shift: true,  alt: false },

  // Help
  { command: 'help:shortcuts',        label: 'Keyboard shortcuts help', key: '/', ctrl: true, shift: false, alt: false }
]

/**
 * Resolve the active binding list from defaults + prefs.shortcuts overrides.
 *   overrides[command] = { key, ctrl, shift, alt } → replace
 *   overrides[command] = null                      → disable the default
 *   overrides[command] missing                     → keep the default
 *
 * Returns an array shaped like DEFAULT_BINDINGS for the matcher.
 */
export function resolveBindings(overrides = {}) {
  return DEFAULT_BINDINGS
    .map(def => {
      if (Object.prototype.hasOwnProperty.call(overrides, def.command)) {
        const ov = overrides[def.command]
        if (ov === null) return null
        return { ...def, ...ov }
      }
      return { ...def }
    })
    .filter(Boolean)
}

/** Pretty-print a combo for display: "Ctrl+Shift+S" / "Ctrl+/" / "—". */
export function formatCombo(b) {
  if (!b || !b.key) return '—'
  const parts = []
  if (b.ctrl)  parts.push('Ctrl')
  if (b.shift) parts.push('Shift')
  if (b.alt)   parts.push('Alt')
  parts.push(formatKey(b.key))
  return parts.join('+')
}

function formatKey(k) {
  if (!k) return ''
  if (k.length === 1) return k.toUpperCase()
  return k
}
