/**
 * GrapeStrap — Renderer logger
 *
 * Mirrors to electron-log via preload's IPC bridge so renderer logs land in the
 * same main.log file. Console output is also kept for devtools convenience.
 */

const levels = ['error', 'warn', 'info', 'debug', 'verbose']

function send(level, args) {
  // electron-log/renderer uses ipcRenderer directly; we don't have it. Console
  // first; preload-bridged log can land here later via grapestrap.app.log() when
  // we expose it.
  // eslint-disable-next-line no-console
  console[level === 'verbose' ? 'log' : level](...args)
}

export const log = Object.fromEntries(levels.map(l => [l, (...args) => send(l, args)]))
