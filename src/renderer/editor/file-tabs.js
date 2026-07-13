/**
 * GrapeStrap — File tabs (code-only editor lane)
 *
 * PATH: src/renderer/editor/file-tabs.js
 * ROLE: Backs pageState tabs of kind 'file' — site files that are code, not
 *       canvas material (Wave 4: .php only, surfaced by the file-manager's
 *       Site Files section). One lazily-created Monaco editor lives in the
 *       canvas panel's [data-region="monaco-file"] slot; each open file gets
 *       its own model (language inferred from the file's URI extension, which
 *       is how .php lights up via the php contribution in monaco-init.js).
 *       Content loads through the existing file:read IPC; dirty buffers flush
 *       to disk through file:write when the project saves. NO execution, no
 *       preview wiring — editing and saving only.
 * DEPENDS: editor/monaco-init.js, editor/php-decorations.js,
 *          state/event-bus.js, i18n.js, log.js
 * CREATED: 2026-07-12
 *
 * Why dirty state lives HERE and not in projectState: cmdSave calls
 * projectState.markAllClean() as soon as project:save IPC resolves, but the
 * file flush below is async and reads the dirty set AFTER that — a
 * projectState-hosted set would be wiped before the flush saw it. Module
 * scope also keeps projectState's manifest-shaped world (pages/templates/
 * library) free of non-manifest entities.
 *
 * Model lifetime: models survive their tab closing (unsaved edits and undo
 * history keep until the user saves or closes the project — no silent data
 * loss without a close-warn dialog). Everything disposes on project:closed.
 * Known limitation, documented in the Wave 4 artifacts: file-tab buffers are
 * not captured by the crash-recovery snapshot loop.
 */

import { monaco, createMonacoSingle } from './monaco-init.js'
import { attachPhpDecorations } from './php-decorations.js'
import { eventBus } from '../state/event-bus.js'
import { t } from '../i18n.js'
import { log } from '../log.js'

let hostEl = null
let fileEditor = null
let eventsWired = false

// site-relative path → { model, loading } — `loading` suppresses the dirty
// flag while the async file:read populates a freshly created model.
const records = new Map()
const dirtyFiles = new Set()

const diskPath = relPath => `site/${relPath}`

export function isFileTab(tab) {
  return (tab?.kind ?? 'page') === 'file'
}

export function isFileDirty(relPath) {
  return dirtyFiles.has(relPath)
}

/** Canvas panel hands us the monaco-file slot once, on first factory run. */
export function mountFileTabHost(host) {
  hostEl = host
  wireFileTabEvents()
}

// Wire-once (house pattern: wireLibraryLock).
function wireFileTabEvents() {
  if (eventsWired) return
  eventsWired = true
  eventBus.on('project:saved', () => { flushDirtyFiles() })
  eventBus.on('project:closed', () => resetFileTabs())
}

function ensureEditor() {
  if (fileEditor || !hostEl) return
  fileEditor = createMonacoSingle(hostEl)
  attachPhpDecorations(fileEditor)
}

/**
 * Focus a file tab: attach (creating + loading if first visit) the model for
 * tab.pageName, which is the site-relative file path. Chrome (which panes are
 * visible) is the canvas panel's job; this only handles editor + model.
 */
export function activateFileTab(tab) {
  ensureEditor()
  if (!fileEditor) return
  const relPath = tab.pageName
  let rec = records.get(relPath)
  if (!rec) {
    const uri = monaco.Uri.file(`/${relPath}`)
    // Re-open after project close/open cycles can leave a same-URI model
    // behind only if reset missed it — getModel guard keeps createModel from
    // throwing on a duplicate URI either way.
    const model = monaco.editor.getModel(uri) ||
      monaco.editor.createModel('', undefined, uri)
    rec = { model, loading: true }
    records.set(relPath, rec)
    model.onDidChangeContent(() => {
      if (rec.loading) return
      if (!dirtyFiles.has(relPath)) {
        dirtyFiles.add(relPath)
        eventBus.emit('project:dirty-changed', { files: [...dirtyFiles] })
      }
    })
    window.grapestrap.file.read(diskPath(relPath))
      .then(content => {
        if (model.isDisposed()) return
        model.setValue(content)
        rec.loading = false
      })
      .catch(err => {
        rec.loading = false
        log.warn(`file tab read failed: ${relPath}:`, err?.message || err)
        eventBus.emit('toast', {
          type: 'error',
          message: t('file.toast.read-failed', { path: relPath, error: err?.message || String(err) })
        })
      })
  }
  fileEditor.setModel(rec.model)
}

/** Write every dirty file buffer back to disk. Runs on project:saved. */
async function flushDirtyFiles() {
  for (const relPath of [...dirtyFiles]) {
    const rec = records.get(relPath)
    if (!rec || rec.model.isDisposed()) {
      dirtyFiles.delete(relPath)
      continue
    }
    try {
      await window.grapestrap.file.write(diskPath(relPath), rec.model.getValue())
      dirtyFiles.delete(relPath)
      eventBus.emit('project:dirty-changed', { files: [...dirtyFiles] })
    } catch (err) {
      // Keep the dirty flag — the buffer still differs from disk.
      log.warn(`file tab write failed: ${relPath}:`, err?.message || err)
      eventBus.emit('toast', {
        type: 'error',
        message: t('file.toast.write-failed', { path: relPath, error: err?.message || String(err) })
      })
    }
  }
}

/** Project closed: detach and dispose every model, drop dirty state. */
function resetFileTabs() {
  fileEditor?.setModel(null)
  for (const { model } of records.values()) {
    if (!model.isDisposed()) model.dispose()
  }
  records.clear()
  dirtyFiles.clear()
}
