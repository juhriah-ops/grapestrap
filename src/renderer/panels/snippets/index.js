/**
 * GrapeStrap — Snippets (lives as a tab in the Insert panel, not a standalone
 * GL panel)
 *
 * Snippets are reusable HTML fragments. UNLIKE library items, they are not
 * linked — inserting a snippet drops a free copy that the user can edit
 * independently. Source-of-truth for snippets is split:
 *
 *   - **Project snippets** — `projectState.current.snippets[]`. User-created
 *     via "+ From Selection" tile. Persist with the project file.
 *   - **Plugin snippets** — `pluginRegistry.snippets[]`. Registered by
 *     plugins via `api.registerSnippet({ id, label, content, media? })`.
 *     Read-only from the user's perspective.
 *
 * The Insert panel's snippets tab calls `getSnippetTiles()` to render both
 * sources together. `addProjectSnippetFromSelection()` is the capture path.
 *
 * v0.0.2 deliberately keeps snippets thin. Editing a snippet inline isn't
 * supported — to change one, delete and recapture. Editing-in-tab arrives
 * with v0.0.3 and will share the library-tab plumbing.
 */

import { projectState } from '../../state/project-state.js'
import { pluginRegistry } from '../../plugin-host/registry.js'
import { eventBus } from '../../state/event-bus.js'
import { getEditor } from '../../editor/grapesjs-init.js'
import { showTextPrompt } from '../../dialogs/text-prompt.js'

/**
 * Combined snippet list for the Insert tab. Returns:
 *   [{ id, label, content, media?, source: 'project' | 'plugin', deletable }]
 */
export function getSnippetTiles() {
  const out = []
  const project = projectState.current
  if (project?.snippets) {
    for (const s of project.snippets) {
      out.push({
        id:        snippetTileId('project', s.id),
        label:     s.name || s.id,
        content:   s.html || '',
        media:     s.media || defaultMedia(),
        source:    'project',
        deletable: true,
        rawId:     s.id
      })
    }
  }
  for (const s of pluginRegistry.snippets || []) {
    out.push({
      id:        snippetTileId('plugin', s.id),
      label:     s.label || s.id,
      content:   s.content || '',
      media:     s.media || defaultMedia(),
      source:    'plugin',
      deletable: false,
      rawId:     s.id
    })
  }
  return out
}

export function getSnippetContent(tileId) {
  return getSnippetTiles().find(t => t.id === tileId)?.content || ''
}

/**
 * Capture the currently-selected component as a project snippet. Prompts
 * for a name. Emits `snippets:changed` so the Insert tab refreshes.
 */
export async function addProjectSnippetFromSelection() {
  if (!projectState.current) {
    eventBus.emit('toast', { type: 'warning', message: 'Open or create a project first.' })
    return null
  }
  const editor = getEditor()
  const sel = editor?.getSelected?.()
  if (!sel) {
    eventBus.emit('toast', { type: 'warning', message: 'Select an element first.' })
    return null
  }
  const name = await showTextPrompt({
    title: 'New snippet',
    label: 'Snippet name',
    initialValue: tagOf(sel) || 'snippet',
    okLabel: 'Save'
  })
  if (!name) return null
  const id = generateId(name)
  const snippet = { id, name, html: sel.toHTML() }
  if (!projectState.current.snippets) projectState.current.snippets = []
  projectState.current.snippets.push(snippet)
  projectState.markSnippetsDirty(snippet.id)
  eventBus.emit('snippets:changed')
  return snippet
}

export function deleteProjectSnippet(rawId) {
  const list = projectState.current?.snippets
  if (!list) return
  const i = list.findIndex(s => s.id === rawId)
  if (i < 0) return
  list.splice(i, 1)
  projectState.markSnippetsDirty(rawId)
  eventBus.emit('snippets:changed')
}

function snippetTileId(source, rawId) {
  return `snippet:${source}:${rawId}`
}

function generateId(name) {
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'snippet'
  const existing = new Set((projectState.current?.snippets || []).map(s => s.id))
  let id = slug
  let n = 1
  while (existing.has(id)) { id = `${slug}-${++n}` }
  return id
}

function tagOf(component) {
  return (component?.get?.('tagName') || '').toLowerCase()
}

function defaultMedia() {
  // Tiny inline SVG placeholder. Tile media containers handle scaling.
  return `<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
    <rect x="3" y="4" width="18" height="3" rx="1" fill="currentColor" opacity=".4"/>
    <rect x="3" y="9" width="14" height="2" rx="1" fill="currentColor" opacity=".3"/>
    <rect x="3" y="13" width="18" height="2" rx="1" fill="currentColor" opacity=".3"/>
    <rect x="3" y="17" width="10" height="2" rx="1" fill="currentColor" opacity=".3"/>
  </svg>`
}
