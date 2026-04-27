/**
 * GrapeStrap — XDG Base Directory resolution
 *
 * Strict XDG compliance per https://specifications.freedesktop.org/basedir-spec/
 *
 *   $XDG_CONFIG_HOME/GrapeStrap/   ← preferences.json, plugins/, snippets/
 *   $XDG_CACHE_HOME/GrapeStrap/    ← runtime caches
 *   $XDG_DATA_HOME/GrapeStrap/     ← logs/, plugin-data/, recovery/
 *   $XDG_STATE_HOME/GrapeStrap/    ← workspace layouts, session state
 *
 * Falls back to ~/.config, ~/.cache, ~/.local/share, ~/.local/state if env vars unset.
 *
 * On non-Linux platforms (we don't ship there in v0.x but may in v0.2+) this still works
 * as a pure path resolver — Electron's app.getPath() is platform-aware separately.
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

const APP_NAME = 'GrapeStrap'

function envOr(envVar, fallback) {
  const v = process.env[envVar]
  return v && v.length > 0 ? v : fallback
}

const home = homedir()

export const xdgPaths = {
  config: join(envOr('XDG_CONFIG_HOME', join(home, '.config')), APP_NAME),
  cache:  join(envOr('XDG_CACHE_HOME',  join(home, '.cache')),  APP_NAME),
  data:   join(envOr('XDG_DATA_HOME',   join(home, '.local', 'share')), APP_NAME),
  state:  join(envOr('XDG_STATE_HOME',  join(home, '.local', 'state')), APP_NAME)
}

export const xdg = {
  ...xdgPaths,
  prefsFile:        join(xdgPaths.config, 'preferences.json'),
  pluginsDir:       join(xdgPaths.config, 'plugins'),
  snippetsDir:      join(xdgPaths.config, 'snippets'),
  workspacesDir:    join(xdgPaths.state,  'workspaces'),
  logsDir:          join(xdgPaths.data,   'logs'),
  pluginDataDir:    join(xdgPaths.data,   'plugin-data'),
  recoveryDir:      join(xdgPaths.data,   'recovery'),
  recentProjects:   join(xdgPaths.state,  'recent-projects.json'),
  sessionFile:      join(xdgPaths.state,  'session.json')
}

export function ensureXdgDirs() {
  for (const dir of [
    xdgPaths.config,
    xdgPaths.cache,
    xdgPaths.data,
    xdgPaths.state,
    xdg.pluginsDir,
    xdg.snippetsDir,
    xdg.workspacesDir,
    xdg.logsDir,
    xdg.pluginDataDir,
    xdg.recoveryDir
  ]) {
    mkdirSync(dir, { recursive: true })
  }
}
