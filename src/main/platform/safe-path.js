/**
 * GrapeStrap — URL-path containment guard
 *
 * PATH: src/main/platform/safe-path.js
 * ROLE: resolveWithinDir(root, urlPath) — resolve a decoded URL path against
 *       a root directory; returns the absolute target or null when the
 *       resolved path escapes the root. Shared by the gstrap-plugin://
 *       protocol handler (main.js) and the preview HTTP server
 *       (preview-server.js)
 * DEPENDS: node:path
 * CREATED: 2026-07-12
 *
 * The check runs on the RESOLVED path, never the input string, so raw "..",
 * percent-decoded "%2e%2e" (callers decode before calling), and absolute-path
 * tricks all fall out of one prefix comparison — the same check the plugin
 * handler has enforced since v0.0.1.
 *
 * file-operations.js safePath is deliberately NOT migrated here: different
 * contract (stateful module-level project root, accepts absolute inputs
 * inside the root, throws instead of returning null). Post-v1 candidate.
 */

import { resolve } from 'node:path'

export function resolveWithinDir(root, urlPath) {
  const rootAbs = resolve(root)
  const rel = String(urlPath ?? '').replace(/^\/+/, '')
  const target = resolve(rootAbs, rel)
  if (target !== rootAbs && !target.startsWith(rootAbs + '/')) return null
  return target
}
