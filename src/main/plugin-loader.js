/**
 * GrapeStrap — Plugin loader (main side)
 *
 * Discovery only. Activation happens in the renderer (the API surface is renderer-
 * scoped: GrapesJS, Monaco, panels). This module:
 *
 *   1. Walks bundled <app>/plugins/, $XDG_CONFIG_HOME/GrapeStrap/plugins/, and the
 *      open project's .grapestrap/plugins/ when bound.
 *   2. Validates each plugin's grapestrap.json manifest (semver, required fields).
 *   3. Returns a registry the renderer queries via IPC.
 *
 * Trust prompt for never-seen-before user plugins is handled in the renderer (it
 * needs to show a dialog with manifest details).
 *
 * Override order (later wins by name):
 *   bundled  →  user  →  project
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import semver from 'semver'

import { log } from './logger.js'

const REQUIRED_FIELDS = ['name', 'version', 'type', 'main', 'grapestrapVersion']
const VALID_TYPES = new Set([
  'block', 'section', 'panel', 'exporter', 'theme',
  'language', 'command', 'snippet-pack'
])

export async function discoverPlugins({ bundledDir, userDir, projectDir, appVersion }) {
  const found = []
  await scanDir(bundledDir, 'bundled', found)
  if (userDir) await scanDir(userDir, 'user', found)
  if (projectDir) await scanDir(join(projectDir, '.grapestrap', 'plugins'), 'project', found)

  // De-dupe by name, later sources win.
  const byName = new Map()
  for (const p of found) byName.set(p.manifest.name, p)
  const plugins = [...byName.values()]

  // Filter on grapestrapVersion compatibility
  const compatible = []
  const incompatible = []
  for (const p of plugins) {
    const range = p.manifest.grapestrapVersion
    const matches = semver.satisfies(stripPre(appVersion), range, { includePrerelease: true })
    if (matches) compatible.push(p)
    else { incompatible.push(p); log.warn(`Plugin ${p.manifest.name} requires grapestrapVersion ${range}, app is ${appVersion} — skipping`) }
  }

  // Assign each compatible plugin a stable URL-safe uid for the
  // gstrap-plugin:// protocol scheme. The renderer uses these to construct
  // import URLs; the protocol handler uses them to look up the plugin dir.
  // Sequential ints are fine — the uid is session-scoped, not persisted.
  compatible.forEach((p, i) => { p.uid = `p${i + 1}` })
  const byUid = new Map(compatible.map(p => [p.uid, p]))

  return {
    plugins: compatible,
    incompatible,
    byUid: uid => byUid.get(uid) || null,
    summary() {
      return compatible.map(p => ({
        uid: p.uid,
        name: p.manifest.name,
        version: p.manifest.version,
        displayName: p.manifest.displayName || p.manifest.name,
        description: p.manifest.description || '',
        type: p.manifest.type,
        source: p.source,
        path: p.dir,
        entry: p.entryPath,
        manifest: p.manifest
      }))
    },
    async readEntry(name) {
      const p = compatible.find(x => x.manifest.name === name)
      if (!p) return null
      const code = await fsp.readFile(p.entryPath, 'utf8')
      return { name, manifest: p.manifest, code }
    }
  }
}

async function scanDir(dir, source, out) {
  let entries
  try { entries = await fsp.readdir(dir, { withFileTypes: true }) }
  catch { return }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    // Support scoped layout: plugins/@grapestrap/blocks-bootstrap5/
    if (entry.name.startsWith('@')) {
      const inner = await fsp.readdir(join(dir, entry.name), { withFileTypes: true }).catch(() => [])
      for (const sub of inner) {
        if (sub.isDirectory()) await tryLoad(join(dir, entry.name, sub.name), source, out)
      }
      continue
    }

    await tryLoad(join(dir, entry.name), source, out)
  }
}

async function tryLoad(pluginDir, source, out) {
  const manifestPath = join(pluginDir, 'grapestrap.json')
  let raw
  try { raw = await fsp.readFile(manifestPath, 'utf8') }
  catch { return }    // No manifest = not a plugin

  let manifest
  try { manifest = JSON.parse(raw) }
  catch (err) {
    log.warn(`Plugin manifest invalid JSON at ${manifestPath}: ${err.message}`)
    return
  }

  for (const field of REQUIRED_FIELDS) {
    if (!manifest[field]) {
      log.warn(`Plugin manifest at ${manifestPath} missing required field: ${field}`)
      return
    }
  }
  if (!VALID_TYPES.has(manifest.type)) {
    log.warn(`Plugin ${manifest.name} has invalid type: ${manifest.type}`)
    return
  }
  if (!semver.valid(manifest.version)) {
    log.warn(`Plugin ${manifest.name} has invalid version: ${manifest.version}`)
    return
  }

  const entryPath = join(pluginDir, manifest.main)
  try { await fsp.access(entryPath) }
  catch {
    log.warn(`Plugin ${manifest.name} entry not found at ${entryPath}`)
    return
  }

  out.push({ manifest, dir: pluginDir, entryPath, source })
}

function stripPre(version) {
  // semver.satisfies treats prereleases strictly — strip the prerelease tag
  // so our 0.0.1-alpha.0 matches a plugin's `^0.0.1` range.
  return version.split('-')[0]
}
