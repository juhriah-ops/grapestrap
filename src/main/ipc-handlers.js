/**
 * GrapeStrap — IPC handlers
 *
 * Routes preload-bridge requests to main-process services. Every renderer-side
 * grapestrap.* call lands here.
 *
 * Convention: handlers return plain serializable objects. Errors propagate as
 * thrown values; the renderer's preload converts them into rejected promises.
 *
 * UPDATED: 2026-08-30 (Ollama provider) — `ai:list-models` now wraps
 * listModels() in try/catch: it can do a live network fetch (Ollama) and
 * throw a typed {type,message} error instead of resolving, so a bad/
 * unreachable host degrades to {ok:false,error} instead of a rejected
 * invoke. Nothing else in this file changed for the Ollama provider.
 * UPDATED: 2026-08-30 (Phase C tool bridge) — `ai:send` threads an optional
 * `context` object through to sendTurn as a third argument, alongside text
 * and the sender; no behavior change for a caller that omits it.
 * UPDATED: 2026-08-30 (review pass) — `ai:*` handlers now pass through
 * agent-session.js's own return envelopes for cancel/reset/tool-result
 * instead of flattening them to {ok:true} (a failed tool-result callId was
 * silently swallowed into a hang); added `ai:validate-key`; every
 * destructuring handler now defaults its payload to `{}`.
 * UPDATED: 2026-08-30 — `ai:*` block (v0.2 Phase A agent panel wiring:
 * status/set-key/clear-key/list-models/send/cancel/reset/tool-result,
 * routed to ai/agent-session.js + ai/key-store.js).
 * UPDATED: 2026-08-18 — `behaviors:ensure` (version-checked copy of the
 * app-bundled behaviors runtime pair into the open project's site/assets/).
 */

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { promises as fsp } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'

import { log } from './logger.js'
import { getPref, setPref } from './prefs.js'
import { xdg } from './platform/xdg.js'
import { copyFilesIdempotent } from './copy-tasks.js'
import {
  setProjectRoot, getProjectRoot,
  readFile, writeFile, deleteFile, copyAsset, listDir, exists
} from './file-operations.js'
import {
  createProject, loadProject, saveProject,
  exportProject, writeRecovery, readRecovery, clearRecovery,
  importDirectory
} from './project-manager.js'
import {
  listWorkspaces, readWorkspace, writeWorkspace,
  deleteWorkspace, renameWorkspace
} from './workspace-store.js'
import { startPreview, refreshPreview, stopPreview } from './preview-server.js'
import { listStarters, getStarterPage } from './starters/index.js'
import { bindGitStatus, notifyChange as notifyGitChange, refreshNow as refreshGitStatus } from './git-status.js'
import {
  getStatus, sendTurn, cancelTurn, resetHistory, handleToolResult, listModels, validateKey
} from './ai/agent-session.js'
import { setKey, clearKey } from './ai/key-store.js'

let pluginRegistryRef = null

// Asset kind → file picker filter. The kind doubles as the subfolder name
// under assets/ (e.g. 'images' → assets/images/foo.png). Plugins can extend
// asset kinds in v0.0.3 by registering custom filters.
const ASSET_KIND_FILTERS = {
  images: { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif'] },
  fonts:  { name: 'Fonts',  extensions: ['woff', 'woff2', 'ttf', 'otf', 'eot'] },
  videos: { name: 'Videos', extensions: ['mp4', 'webm', 'mov', 'm4v', 'ogg'] }
}

export function registerIpcHandlers({ pluginRegistry }) {
  pluginRegistryRef = pluginRegistry

  // ─── App info ──────────────────────────────────────────────────────────────
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    name: app.getName(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    paths: { ...xdg }
  }))

  // ─── Plugin discovery results ──────────────────────────────────────────────
  ipcMain.handle('plugins:list', () => {
    return pluginRegistryRef ? pluginRegistryRef.summary() : []
  })
  ipcMain.handle('plugins:read-entry', async (_e, pluginName) => {
    if (!pluginRegistryRef) return null
    return pluginRegistryRef.readEntry(pluginName)
  })

  // ─── Preferences ───────────────────────────────────────────────────────────
  ipcMain.handle('prefs:get', (_e, key) => getPref(key))
  ipcMain.handle('prefs:set', (_e, key, value) => { setPref(key, value); return true })

  // ─── Projects ──────────────────────────────────────────────────────────────
  ipcMain.handle('project:new', async (_e, { name, location, templateId, selectedPages }) => {
    // `location` is the full manifest path. When omitted, we ask the user
    // for a PARENT folder (not a save-as path), then create a new
    // <slug>/ subfolder inside it and put the .gstrap there. This matches
    // the v0.0.2-alpha.2 layout: one folder per project, manifest at root,
    // site/ alongside.
    let target = location
    if (!target) {
      const parent = await pickNewProjectParent()
      if (!parent) return null
      const slug = (name || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project'
      const projectFolder = join(parent, slug)
      try {
        const entries = await fsp.readdir(projectFolder).catch(() => null)
        if (entries && entries.length > 0) {
          throw new Error(`Folder "${slug}" already exists in that location and isn't empty.`)
        }
      } catch (err) {
        if (!/already exists/.test(err.message)) throw err
        else throw err
      }
      await fsp.mkdir(projectFolder, { recursive: true })
      target = join(projectFolder, `${slug}.gstrap`)
    }
    await createProject({ targetPath: target, name, templateId, selectedPages })
    await bindProjectWatcher(target)
    log.info(`Created project: ${target}`)
    return await loadProject(target)
  })

  // Starter list for the New Project dialog — ids, labels, per-page metadata.
  ipcMain.handle('project:starters', () => listStarters())

  // Single starter page's editable content, for a per-page selection UI that
  // wants to preview/describe one page without listStarters()'s HTML-free
  // payload. null for an unknown starter id, unknown page name, or 'blank'.
  ipcMain.handle('project:starter-page', (_e, starterId, pageName) => getStarterPage(starterId, pageName))

  ipcMain.handle('project:open', async (_e, providedPath) => {
    const target = providedPath || (await pickOpenProjectPath())
    if (!target) return null
    const project = await loadProject(target)
    await bindProjectWatcher(target)
    log.info(`Opened project: ${target}`)
    return project
  })

  ipcMain.handle('project:import-directory', async (_e, opts) => {
    const sourceDir = opts?.sourceDir || (await pickImportSourceDir())
    if (!sourceDir) return null
    const suggestedName = opts?.name || sourceDir.split(/[\\/]/).filter(Boolean).pop() || 'Imported'
    let targetPath = opts?.targetPath
    if (!targetPath) {
      const parent = await pickNewProjectParent()
      if (!parent) return null
      const slug = suggestedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'imported'
      const projectFolder = join(parent, slug)
      const entries = await fsp.readdir(projectFolder).catch(() => null)
      if (entries && entries.length > 0) {
        throw new Error(`Folder "${slug}" already exists in that location and isn't empty.`)
      }
      await fsp.mkdir(projectFolder, { recursive: true })
      targetPath = join(projectFolder, `${slug}.gstrap`)
    }
    await importDirectory({ sourceDir, targetPath, name: suggestedName })
    await bindProjectWatcher(targetPath)
    log.info(`Imported directory ${sourceDir} → ${targetPath}`)
    return await loadProject(targetPath)
  })

  ipcMain.handle('project:save', async (_e, project) => {
    const result = await saveProject(project)
    // Git-status nudge (V8): chokidar already reports the written files, so
    // this is redundant-by-design — kept for latency and to survive a future
    // watcher-ignore change. No-op when the project isn't a repo-rooted dir.
    notifyGitChange()
    return result
  })

  ipcMain.handle('project:save-as', async (_e, project) => {
    // Save-as in the v0.0.2-alpha.2 layout: pick a parent folder, create a
    // new <slug>/ inside it, write the manifest + site/ tree there. The
    // existing project's projectDir is the source for any unwritten
    // assets the user might want preserved (deferred — for v0.0.2 the
    // save flushes pages/templates/library/globalCSS only).
    const parent = await pickNewProjectParent()
    if (!parent) return null
    const name = project.manifest?.metadata?.name || 'Untitled'
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project'
    const projectFolder = join(parent, slug)
    const entries = await fsp.readdir(projectFolder).catch(() => null)
    if (entries && entries.length > 0) {
      throw new Error(`Folder "${slug}" already exists in that location and isn't empty.`)
    }
    await fsp.mkdir(projectFolder, { recursive: true })
    const target = join(projectFolder, `${slug}.gstrap`)
    const reseated = { ...project, manifestPath: target, projectDir: projectFolder }
    return saveProject(reseated)
  })

  ipcMain.handle('project:export', async (_e, project, outputDirOverride) => {
    const outputDir = outputDirOverride || (await pickExportDir())
    if (!outputDir) return null
    return exportProject(project, outputDir)
  })

  ipcMain.handle('project:write-recovery', async (_e, manifestPath, snapshot) => {
    return writeRecovery(manifestPath, snapshot)
  })
  ipcMain.handle('project:read-recovery', async (_e, manifestPath) => {
    return readRecovery(manifestPath)
  })
  // read-recovery doubles as the "check" (snapshot or null); this is the
  // delete half — save success clears in-process, but discard / went-clean
  // need a renderer-reachable path.
  ipcMain.handle('project:clear-recovery', async (_e, manifestPath) => {
    return clearRecovery(manifestPath)
  })

  ipcMain.handle('project:recent', async () => {
    try {
      const raw = await fsp.readFile(xdg.recentProjects, 'utf8')
      return JSON.parse(raw)
    } catch {
      return []
    }
  })
  ipcMain.handle('project:add-recent', async (_e, manifestPath, name) => {
    let list = []
    try { list = JSON.parse(await fsp.readFile(xdg.recentProjects, 'utf8')) } catch {}
    list = [{ path: manifestPath, name, openedAt: new Date().toISOString() },
            ...list.filter(r => r.path !== manifestPath)]
    list = list.slice(0, 10)
    await fsp.writeFile(xdg.recentProjects, JSON.stringify(list, null, 2), 'utf8')
    return list
  })

  // ─── File ops within project ───────────────────────────────────────────────
  ipcMain.handle('file:read',       (_e, p)        => readFile(p))
  ipcMain.handle('file:write',      (_e, p, data)  => writeFile(p, data))
  ipcMain.handle('file:delete',     (_e, p)        => deleteFile(p))
  ipcMain.handle('file:copy-asset', (_e, src, sub) => copyAsset(src, sub))
  ipcMain.handle('file:list',       (_e, p)        => listDir(p))
  ipcMain.handle('file:exists',     (_e, p)        => exists(p))

  // ─── Image-import helper: open file picker, copy to site/assets/images/ ──
  ipcMain.handle('file:import-image', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return copyAsset(result.filePaths[0], 'site/assets/images')
  })

  // ─── Asset Manager — multi-kind file import + listing ──────────────────────
  // The kind argument determines BOTH the dialog filter and the target subdir.
  // Returns the list of relative paths added (so the panel can paint optimistic).
  ipcMain.handle('file:import-asset', async (_e, kind) => {
    const filter = ASSET_KIND_FILTERS[kind] || ASSET_KIND_FILTERS.images
    const result = await dialog.showOpenDialog({
      title: `Import ${kind}`,
      properties: ['openFile', 'multiSelections'],
      filters: [filter]
    })
    if (result.canceled || result.filePaths.length === 0) return []
    const added = []
    for (const src of result.filePaths) {
      const r = await copyAsset(src, `site/assets/${kind}`)
      added.push(r.path)
    }
    return added
  })

  // Write a binary buffer to site/assets/<kind>/<filename>. Used by the
  // drag-drop path in the Asset Manager — the renderer reads the dropped
  // File via arrayBuffer() and shoots the bytes through here.
  ipcMain.handle('file:write-asset-buffer', async (_e, kind, filename, bytes) => {
    if (!ASSET_KIND_FILTERS[kind]) throw new Error(`Unknown asset kind: ${kind}`)
    const safeName = filename.replace(/[^\w.-]+/g, '_')
    const subdir = `site/assets/${kind}`
    const target = `${subdir}/${safeName}`
    // bytes arrives as Uint8Array from the contextBridge structured clone.
    const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
    return writeFile(target, buf)
  })

  ipcMain.handle('file:list-assets', async () => {
    const out = { images: [], fonts: [], videos: [] }
    for (const kind of Object.keys(out)) {
      try {
        const entries = await listDir(`site/assets/${kind}`)
        out[kind] = entries.filter(e => e.type === 'file').map(e => e.name)
      } catch (err) {
        // ENOENT: dir doesn't exist yet (fresh project, kind not used).
        // Anything else (perm, EIO) — log and continue but don't stay
        // silent. Audit-found: a real error here used to look identical
        // to "empty asset folder."
        if (err?.code !== 'ENOENT' && err?.code !== 'no project open') {
          log.warn(`file:list-assets ${kind}:`, err?.message || err)
        }
      }
    }
    return out
  })

  // ─── Bundled section assets ────────────────────────────────────────────────
  // Inserting a bundled Library section that ships images copies them out of
  // the app's own starters/ bundle into the open project. Renderer-supplied
  // paths are treated as hostile even though today's only caller is in-repo
  // section data — see copySectionAssets for both containment guards.
  ipcMain.handle('sections:copy-assets', (_e, assets) => copySectionAssets(assets))

  // ─── Behaviors runtime ─────────────────────────────────────────────────────
  // Puts the app-bundled behaviors runtime pair into the open project (once,
  // then refreshed only when the app ships a newer version). Deliberately NOT
  // routed through sections:copy-assets: that handler is hard-pinned to the
  // starters/ bundle and to skip-if-exists, and this one needs neither.
  ipcMain.handle('behaviors:ensure', () => ensureBehaviorAssets())

  // ─── Workspace layouts (Wave 3) ────────────────────────────────────────────
  // All validation (name charset, preset shadowing, slug collisions, shape)
  // lives in workspace-store.js — main never trusts renderer input.
  ipcMain.handle('workspaces:list',   ()                      => listWorkspaces())
  ipcMain.handle('workspaces:read',   (_e, name)              => readWorkspace(name))
  ipcMain.handle('workspaces:save',   (_e, payload)           => writeWorkspace(payload))
  ipcMain.handle('workspaces:delete', (_e, name)              => deleteWorkspace(name))
  ipcMain.handle('workspaces:rename', (_e, oldName, newName)  => renameWorkspace(oldName, newName))

  // ─── Preview in browser (Wave 3) ───────────────────────────────────────────
  // start throws on export/bind failure (renderer's handleCommand catch
  // toasts it); refresh no-ops { ok:false } when no server is running so a
  // stale renderer debounce can never throw; stop is idempotent.
  ipcMain.handle('preview:start',   (_e, project, opts) => startPreview(project, opts))
  ipcMain.handle('preview:refresh', (_e, project)       => refreshPreview(project))
  ipcMain.handle('preview:stop',    ()                  => stopPreview())

  // ─── Git status (Wave 3) ───────────────────────────────────────────────────
  // Forces an immediate probe+status, skipping the debounce. Resolves with
  // the wire payload, or null when no project is open — never throws across
  // the bridge (F11). Pushes land on `git:status` like every other broadcast.
  ipcMain.handle('git:refresh', () => refreshGitStatus())

  // ─── AI agent panel (v0.2 Phase A) ─────────────────────────────────────────
  // Mechanical wiring only: agent-session.js owns the turn state machine and
  // the actual provider call, key-store.js owns safeStorage-encrypted key
  // persistence. Every handler here is a thin pass-through — none of them
  // sees, logs, or echoes key material. Streamed content (deltas, tool
  // calls, terminal turn state) is pushed to the renderer as events
  // ('ai:delta' / 'ai:tool-call' / 'ai:turn'), not returned from these
  // handles — see agent-session.js for the push side.
  //
  // Every handler below that destructures its payload defaults it to `{}` —
  // ipcRenderer.invoke can be called directly (bypassing the preload
  // wrapper) with no payload at all, and a bare destructure on `undefined`
  // throws a TypeError instead of a clean validation failure.
  ipcMain.handle('ai:status', () => getStatus())

  ipcMain.handle('ai:set-key', async (_e, { providerId, key } = {}) => {
    try {
      await setKey(providerId, key)
      return { ok: true }
    } catch (err) {
      const isEncryptionGap = err?.message === 'encryption-unavailable'
      // Log the failure shape only — never `key`, never `err` verbatim (an
      // unexpected error class could stringify something we don't control).
      if (!isEncryptionGap) log.warn(`ai:set-key failed for provider "${providerId}"`)
      return {
        ok: false,
        error: {
          type: isEncryptionGap ? 'encryption-unavailable' : 'api',
          message: isEncryptionGap
            ? 'Key encryption is not available on this system.'
            : 'Could not store the key.'
        }
      }
    }
  })

  ipcMain.handle('ai:clear-key', async (_e, { providerId } = {}) => {
    await clearKey(providerId)
    return { ok: true }
  })

  // Round-trips a typed-but-unsaved key against the provider before the
  // user commits it via ai:set-key — never persists anything itself.
  ipcMain.handle('ai:validate-key', (_e, { providerId, key } = {}) => validateKey(providerId, key))

  // listModels() now does a live fetch for some providers (Ollama) and can
  // throw a typed { type, message } error (e.g. host unreachable) instead
  // of just resolving — wrap it the same way ai:set-key wraps its own
  // failure modes, so a bad host degrades to an error envelope the
  // renderer can show inline instead of a rejected invoke.
  ipcMain.handle('ai:list-models', async () => {
    try {
      const models = await listModels()
      return { ok: true, models }
    } catch (err) {
      return { ok: false, error: { type: err?.type || 'api', message: err?.message || 'Could not list models.' } }
    }
  })

  ipcMain.handle('ai:send', (event, { text, context } = {}) => sendTurn(text, event.sender, context))

  // cancelTurn/resetHistory/handleToolResult already return the caller-
  // facing envelope (e.g. cancelTurn's {ok,turnId}) — pass it straight
  // through rather than flattening it to a hardcoded {ok:true}, which used
  // to silently discard a failed/unknown callId from handleToolResult and
  // turn it into a hang instead of a rejection the renderer could act on.
  ipcMain.handle('ai:cancel', () => cancelTurn())

  ipcMain.handle('ai:reset', () => resetHistory())

  ipcMain.handle('ai:tool-result', (_e, { callId, result, isError } = {}) =>
    handleToolResult({ callId, result, isError }))

  // ─── External shell actions ────────────────────────────────────────────────
  ipcMain.handle('shell:open-external', (_e, url) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
  })
  ipcMain.handle('shell:show-in-folder', (_e, p) => {
    if (p) shell.showItemInFolder(p)
  })

  log.info('IPC handlers registered')
}

// ─── Bundled section assets ──────────────────────────────────────────────────

/**
 * Copy a bundled section's images from the app bundle into the open project.
 *
 * Every task is `{ from, to }` where `from` is app-root-relative (it must land
 * inside <appRoot>/starters/, the only tree the app ships as copyable payload)
 * and `to` is site-relative (it must land inside <project>/site/assets/). Both
 * checks run on the RESOLVED path with a path.sep-terminated prefix compare —
 * never on the raw input string — so "..", absolute paths, and a sibling
 * directory that merely shares a name prefix ("starters-scratch/") all fall
 * out of the same comparison. Same reasoning as platform/safe-path.js.
 *
 * The copy itself is copy-tasks.js' skip-if-exists helper, so re-inserting a
 * section, or inserting into a project that was created from that same starter,
 * leaves the on-disk image (which the user may have replaced) untouched.
 *
 * @param {Array<{from: string, to: string}>} assets - Bundle→project copies
 * @returns {Promise<{attempted: number, rejected: string[], failures: string[]}>}
 *          `rejected` are guard refusals (never copied); `failures` are copies
 *          that were attempted and errored. Both are reason strings for the
 *          renderer to surface — an empty pair means every asset is in place.
 * @throws {Error} When no project is open — there is nowhere to copy into.
 */
async function copySectionAssets(assets) {
  const projectRoot = getProjectRoot()
  if (!projectRoot) throw new Error('sections:copy-assets: no project open')
  if (!Array.isArray(assets) || assets.length === 0) {
    return { attempted: 0, rejected: [], failures: [] }
  }

  const bundleRoot = join(app.getAppPath(), 'starters')
  const projectAssetsRoot = join(projectRoot, 'site', 'assets')

  const tasks = []
  const rejected = []

  for (const asset of assets) {
    const from = typeof asset?.from === 'string' ? asset.from : ''
    const to = typeof asset?.to === 'string' ? asset.to : ''
    if (!from || !to) {
      rejected.push(`malformed asset entry (from="${from}", to="${to}")`)
      continue
    }

    const src = resolve(app.getAppPath(), from)
    if (!isWithinDir(bundleRoot, src)) {
      rejected.push(`source outside the starters bundle: ${from}`)
      continue
    }

    const dst = resolve(projectRoot, 'site', to)
    if (!isWithinDir(projectAssetsRoot, dst)) {
      rejected.push(`destination outside site/assets: ${to}`)
      continue
    }

    // Fatal flag on: a section that declares an image and silently ships
    // without it renders as a broken box, which is worse than a warning.
    tasks.push([src, dst, true])
  }

  if (rejected.length > 0) log.warn('sections:copy-assets rejected:', rejected.join('; '))

  const failures = await copyFilesIdempotent(tasks)
  if (failures.length > 0) log.warn('sections:copy-assets failed:', failures.join('; '))

  return { attempted: tasks.length, rejected, failures }
}

// ─── Behaviors runtime ───────────────────────────────────────────────────────

// The runtime pair, and where each half lands inside the project's site/. Both
// files are app-bundled (assets/behaviors/, shipped by the electron-builder
// `assets/**/*` rule and by Vite's publicDir), so there is nothing to generate
// per project — every project gets a byte-identical copy.
const BEHAVIOR_ASSETS = [
  { file: 'gstrap-behaviors.js',  siteDir: join('assets', 'js') },
  { file: 'gstrap-behaviors.css', siteDir: join('assets', 'css') }
]

// Both files open with `/*! gstrap-behaviors v<N> */` on line 1 — 26 bytes.
// Reading the first 40 covers that plus any future whitespace drift, and keeps
// the freshness check to one tiny read per file instead of a full compare.
const VERSION_TAG_PROBE_BYTES = 40
const VERSION_TAG_PATTERN = /gstrap-behaviors\s+(v\d+)/

/**
 * Ensure the open project carries the current behaviors runtime pair.
 *
 * Refresh rule is the version tag, not mtime or content: a project keeps the
 * copy it has until the app ships a new version, at which point the copy is
 * OVERWRITTEN. That is the documented contract for these two files (they are a
 * delivery artifact, not project source — see the header of
 * assets/behaviors/gstrap-behaviors.js) and it is what lets a bug fix in the
 * runtime reach every project that opens in the new build.
 *
 * A destination whose tag is unreadable (missing file, truncated, hand-replaced
 * with something else) is treated as stale and rewritten — "can't prove it's
 * current" resolves toward a working page.
 *
 * @returns {Promise<{copied: string[], skipped: string[]}>} File names written
 *          vs. left alone. Both empty is impossible; both lists together always
 *          name the full pair.
 * @throws {Error} When no project is open, or a copy fails (the renderer's
 *         ensureBehaviors warns and continues — the next call retries, since a
 *         missing destination always reads as stale).
 */
async function ensureBehaviorAssets() {
  const projectRoot = getProjectRoot()
  if (!projectRoot) throw new Error('behaviors:ensure: no project open')

  const bundleRoot = join(app.getAppPath(), 'assets', 'behaviors')
  const copied = []
  const skipped = []

  for (const asset of BEHAVIOR_ASSETS) {
    const src = join(bundleRoot, asset.file)
    const dst = join(projectRoot, 'site', asset.siteDir, asset.file)

    const bundledTag = await readVersionTag(src)
    const projectTag = await readVersionTag(dst)
    if (bundledTag && projectTag === bundledTag) {
      skipped.push(asset.file)
      continue
    }

    await fsp.mkdir(dirname(dst), { recursive: true })
    await fsp.copyFile(src, dst)
    copied.push(asset.file)
  }

  if (copied.length > 0) log.info(`behaviors:ensure copied: ${copied.join(', ')}`)
  return { copied, skipped }
}

/**
 * Read a behaviors file's version tag from its first bytes.
 * @param {string} path - Absolute file path (may not exist)
 * @returns {Promise<string|null>} e.g. 'v1', or null when the file is missing
 *          or carries no recognisable tag
 */
async function readVersionTag(path) {
  let handle = null
  try {
    handle = await fsp.open(path, 'r')
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(VERSION_TAG_PROBE_BYTES), 0, VERSION_TAG_PROBE_BYTES, 0)
    const match = VERSION_TAG_PATTERN.exec(buffer.toString('utf8', 0, bytesRead))
    return match ? match[1] : null
  } catch (err) {
    // ENOENT is the normal first-enable case; anything else (permissions, EIO)
    // still means "we cannot prove this copy is current", so it reads the same.
    if (err?.code !== 'ENOENT') log.warn(`behaviors:ensure could not read tag from ${path}:`, err?.message || err)
    return null
  } finally {
    if (handle) await handle.close().catch(() => {})
  }
}

/**
 * Is an absolute path inside (or equal to) a directory?
 * @param {string} dir - Containing directory
 * @param {string} target - Candidate path
 * @returns {boolean}
 */
function isWithinDir(dir, target) {
  const dirAbs = resolve(dir)
  const targetAbs = resolve(target)
  return targetAbs === dirAbs || targetAbs.startsWith(dirAbs + sep)
}

// ─── Dialog helpers ──────────────────────────────────────────────────────────

// On Linux/Wayland a parentless dialog can render under the main window or
// off-screen entirely. Pass the focused BrowserWindow as parent so the dialog
// is properly modal-attached and always raised on top.
function parentWindow() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null
}

async function pickOpenProjectPath() {
  const parent = parentWindow()
  const opts = {
    title: 'Open GrapeStrap project',
    properties: ['openFile'],
    filters: [{ name: 'GrapeStrap project', extensions: ['gstrap'] }]
  }
  const result = parent
    ? await dialog.showOpenDialog(parent, opts)
    : await dialog.showOpenDialog(opts)
  return (result.canceled || result.filePaths.length === 0) ? null : result.filePaths[0]
}

async function pickNewProjectParent() {
  const parent = parentWindow()
  const opts = {
    title: 'Choose where to create the project folder',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Create here'
  }
  const result = parent
    ? await dialog.showOpenDialog(parent, opts)
    : await dialog.showOpenDialog(opts)
  return (result.canceled || result.filePaths.length === 0) ? null : result.filePaths[0]
}

async function pickImportSourceDir() {
  const parent = parentWindow()
  const opts = {
    title: 'Import folder as GrapeStrap project',
    properties: ['openDirectory']
  }
  const result = parent
    ? await dialog.showOpenDialog(parent, opts)
    : await dialog.showOpenDialog(opts)
  return (result.canceled || result.filePaths.length === 0) ? null : result.filePaths[0]
}

async function pickExportDir() {
  const parent = parentWindow()
  const opts = {
    title: 'Export project to folder',
    properties: ['openDirectory', 'createDirectory']
  }
  const result = parent
    ? await dialog.showOpenDialog(parent, opts)
    : await dialog.showOpenDialog(opts)
  return (result.canceled || result.filePaths.length === 0) ? null : result.filePaths[0]
}

async function bindProjectWatcher(manifestPath) {
  // Every project new/open/import funnels through here — the single seam
  // where a running preview must die: it never outlives the project it
  // serves (Wave 3, PLAN.md F12). No-op when no preview is running.
  await stopPreview()
  const projectDir = manifestPath.replace(/[^/]+$/, '')
  await setProjectRoot(projectDir, evt => {
    BrowserWindow.getAllWindows().forEach(w => {
      if (!w.isDestroyed()) w.webContents.send(`file:${evt.kind}`, evt.path)
    })
    // Git-status debounce rides the same watcher events — no second chokidar.
    notifyGitChange()
  })
  // Re-bind the git-status service and push one immediate status so the
  // branch cell paints on open without waiting for any file event.
  await bindGitStatus(projectDir, payload => {
    BrowserWindow.getAllWindows().forEach(w => {
      if (!w.isDestroyed()) w.webContents.send('git:status', payload)
    })
  })
}
