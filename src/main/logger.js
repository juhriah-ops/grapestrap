/**
 * GrapeStrap — Logger
 *
 * electron-log writes to $XDG_DATA_HOME/GrapeStrap/logs/main.log (and renderer.log
 * via the renderer-side import). We override the default path which would otherwise
 * land in ~/.config/GrapeStrap/logs/ — XDG says logs go in $XDG_DATA_HOME, not config.
 *
 * Rotation: 5 MB max per file, 3 files retained.
 */

import log from 'electron-log/main.js'
import { join } from 'node:path'
import { xdg } from './platform/xdg.js'

export function initLogger() {
  log.transports.file.resolvePathFn = () => join(xdg.logsDir, 'main.log')
  log.transports.file.maxSize = 5 * 1024 * 1024
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
  log.transports.console.format = '[{level}] {text}'

  // Capture renderer logs to the same file (renderer uses electron-log/renderer.js)
  log.initialize({ preload: true })

  return log
}

export { log }
