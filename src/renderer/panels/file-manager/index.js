/**
 * GrapeStrap — File manager panel
 *
 * Three sections in v0.0.1: Pages, Assets, Styles. Templates and Library
 * sections appear in v0.0.2/v0.1.0 as those features ship. Wave 4 added a
 * Site Files section — code files living under site/ that aren't canvas
 * material; dblclick opens them as code-only file tabs (editor/file-tabs.js).
 * The Graphite-starter wave widened the scan from .php-only to .php/.js/.css
 * (site-relative PATH-PREFIX skip rules now, not a bare dir-name set — the
 * starter's own assets/css/theme.css and assets/js/main.js need to surface
 * here, so assets/ itself is walked and only its vendored sub-trees are
 * skipped) and added a globalCSS dual-writer guard (see rescanSiteFiles).
 * The section renders only when the scan finds any, so file-less projects
 * keep the exact pre-Wave-4 DOM.
 *
 * Wave 3 idempotency contract: GL's loadLayout (workspace apply, Reset
 * Layout) re-invokes this factory with a fresh host element. Event
 * subscriptions are wire-once and repaint through the module `hostEl`
 * (reassigned per run) — the pre-fix version closed over the render-scoped
 * host, so after a reset the re-created panel never repainted again
 * (stale-host closure). DOM listeners stay in the render fn: the host is a
 * fresh element each apply, old listeners die with the old host.
 */

import { projectState } from '../../state/project-state.js'
import { pageState } from '../../state/page-state.js'
import { gitState } from '../../state/git-state.js'
import { eventBus } from '../../state/event-bus.js'
import { showTextPrompt } from '../../dialogs/text-prompt.js'
import { showContextMenu } from '../../dialogs/context-menu.js'
import { createTemplate, deleteTemplate } from '../templates/manage.js'
import { isFileDirty } from '../../editor/file-tabs.js'
import { t } from '../../i18n.js'

// Site Files scan (Wave 4, widened for the Graphite-starter wave): .php/.js/
// .css under site/, recursive. Skip rules are site-relative PATH PREFIXES,
// not bare dir names — assets/ must now be walked (starters keep editable
// theme.css/main.js there), but its vendored/binary sub-trees still aren't
// user code. pages/, templates/, library/ stay skipped: those sources are
// already covered by the Pages/Templates/Library sections above.
const SITE_SCAN_SKIP_DIR_PREFIXES = [
  'assets/vendor/',
  'assets/images/',
  'assets/fonts/',
  'assets/videos/',
  'assets/webfonts/',
  'assets/css/fonts/',
  'pages/',
  'templates/',
  'library/'
]
const SITE_SCAN_MAX_DEPTH = 4
const SITE_SCAN_EXTENSIONS = /\.(php|js|css)$/i

// Bundled-framework basenames that ship in every project's assets/css and
// assets/js from creation (project CLAUDE.md: "Framework files in project's
// site/assets/ from creation"). Not user code, so they don't get a file tab.
// Keyed by exact parent dir so a user's own same-named file elsewhere in
// assets/ still scans normally. Minified/.map variants of ANY file are
// already dropped by isScannableSiteFile's general rules below, so only the
// unminified basenames need listing here.
const SITE_SCAN_FRAMEWORK_FILES = {
  'assets/css': new Set(['bootstrap.css', 'bootstrap-icons.css', 'all.css']),
  'assets/js': new Set(['bootstrap.bundle.js'])
}

let hostEl = null
let eventsWired = false
let siteCodeFiles = []         // site-relative paths, sorted
let siteRescanTimer = null

// True if dirRel (site-relative directory path, no trailing slash) falls
// under one of the skip prefixes above. Checked as the walk descends, so a
// skipped tree is never entered — not filtered out after the fact.
function isSkippedScanDir(dirRel) {
  const withSlash = `${dirRel}/`
  return SITE_SCAN_SKIP_DIR_PREFIXES.some(prefix => withSlash.startsWith(prefix))
}

// True if dirRel/name should surface in the Site Files list. dirRel is the
// file's parent directory (site-relative, '' for site/ root).
function isScannableSiteFile(dirRel, name) {
  if (!SITE_SCAN_EXTENSIONS.test(name)) return false
  const lower = name.toLowerCase()
  if (lower.endsWith('.min.js') || lower.endsWith('.min.css') || lower.endsWith('.map')) return false
  return !SITE_SCAN_FRAMEWORK_FILES[dirRel]?.has(name)
}

export function renderFileManager(host) {
  hostEl = host
  host.classList.add('gstrap-fm-host')
  refresh()

  host.addEventListener('dblclick', evt => {
    const pageEl = evt.target.closest('[data-fm-page]')
    if (pageEl) {
      const name = pageEl.dataset.fmPage
      pageState.open(name)
    }
    const tplEl = evt.target.closest('[data-fm-template]')
    if (tplEl) {
      const name = tplEl.dataset.fmTemplate
      pageState.open(name, { kind: 'template', label: name })
    }
    const fileEl = evt.target.closest('[data-fm-file]')
    if (fileEl) {
      const relPath = fileEl.dataset.fmFile
      // Code-only tab; the label is the basename, the tab key the full
      // site-relative path (unique across nested dirs, can't collide with
      // extensionless page/template names).
      pageState.open(relPath, { kind: 'file', label: relPath.split('/').pop(), viewMode: 'code' })
    }
  })

  host.addEventListener('click', async evt => {
    if (!evt.target.closest('[data-fm-new-template]')) return
    // initialValue 'master' stays literal: template names are charset-
    // validated (letters/digits/-/_ only) — a translated default could fail
    // validation before the user types anything.
    const name = await showTextPrompt({
      title: t('fm.prompt.new-template-title'),
      label: t('fm.prompt.template-name-label'),
      initialValue: 'master',
      okLabel: t('action.create')
    })
    if (name) createTemplate(name)     // validates + toasts + opens the tab
  })

  host.addEventListener('contextmenu', evt => {
    const tplEl = evt.target.closest('[data-fm-template]')
    if (!tplEl) return
    evt.preventDefault()
    const name = tplEl.dataset.fmTemplate
    showContextMenu(evt.clientX, evt.clientY, [
      { label: t('fm.delete-template'), danger: true, action: () => deleteTemplate(name) }
    ])
  })

  wireFmEvents()
}

// Wire-once (house pattern: wireLibraryLock). Handlers repaint via the module
// hostEl so they always target the live panel, never a detached one.
function wireFmEvents() {
  if (eventsWired) return
  eventsWired = true
  eventBus.on('project:opened',        () => { refresh(); rescanSiteFiles() })
  eventBus.on('project:closed',        () => { siteCodeFiles = []; refresh() })
  eventBus.on('project:dirty-changed', () => refresh())
  eventBus.on('templates:changed',     () => refresh())
  eventBus.on('git:status-changed',    () => refresh())
  // Site Files stay live with the disk: the main-process chokidar watcher
  // already forwards add/delete per project file — react only to scannable
  // paths (.php/.js/.css), debounced (chokidar can burst on a folder drop).
  const siteFileWatch = p => { if (typeof p === 'string' && SITE_SCAN_EXTENSIONS.test(p)) queueSiteRescan() }
  window.grapestrap.watcher.onAdded(siteFileWatch)
  window.grapestrap.watcher.onDeleted(siteFileWatch)
}

function queueSiteRescan() {
  clearTimeout(siteRescanTimer)
  siteRescanTimer = setTimeout(rescanSiteFiles, 300)
}

// Walk site/ via the file:list IPC collecting scannable code-file paths.
// Depth-capped, skips dotfiles/dotdirs + the prefix rules above. Repaints
// only when the list actually changed, so the common file-less project never
// re-renders from this path.
async function rescanSiteFiles() {
  const project = projectState.current
  if (!project) return
  // CRITICAL dual-writer guard: the project's globalCSS file is the one
  // edited live in the Custom CSS panel (a dedicated buffer, kept in sync via
  // project:css-changed). If it also showed up here and got opened in the
  // generic Monaco file-tab lane (editor/file-tabs.js), the two panels would
  // hold independent buffers for the same disk file — whichever saves last
  // wins and silently discards the other's edits. So it never enters the
  // Site Files list at all; it's only ever edited through Custom CSS.
  const globalCssPath = project.manifest?.globalCSS || 'assets/css/style.css'
  const found = []
  async function walk(rel, depth) {
    if (depth > SITE_SCAN_MAX_DEPTH) return
    let entries = []
    try {
      entries = await window.grapestrap.file.list(rel ? `site/${rel}` : 'site')
    } catch {
      return // dir vanished mid-scan or no project — nothing to list
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      const childRel = rel ? `${rel}/${e.name}` : e.name
      if (e.type === 'dir') {
        if (!isSkippedScanDir(childRel)) await walk(childRel, depth + 1)
      } else if (e.type === 'file' && isScannableSiteFile(rel, e.name) && childRel !== globalCssPath) {
        found.push(childRel)
      }
    }
  }
  await walk('', 0)
  if (projectState.current !== project) return // project swapped mid-scan
  found.sort()
  if (found.join('\n') !== siteCodeFiles.join('\n')) {
    siteCodeFiles = found
    refresh()
  }
}

function refresh() {
  const host = hostEl
  if (!host) return
  const project = projectState.current
  if (!project) {
    host.innerHTML = `<div class="gstrap-empty">${escHtml(t('fm.no-project'))}<br><br>
      <button class="gstrap-btn" data-cmd="file:new-project">${escHtml(t('fm.new-project'))}</button>
      <button class="gstrap-btn" data-cmd="file:open-project">${escHtml(t('fm.open-project'))}</button>
    </div>`
    host.addEventListener('click', evt => {
      const btn = evt.target.closest('[data-cmd]')
      if (btn) eventBus.emit('command', btn.dataset.cmd)
    }, { once: true })
    return
  }

  // Git dots (Wave 3): stamp data-git-state on rows whose project-relative
  // path appears in the latest git:status payload. Untracked wins over
  // modified (a new file is "new" even once staged); clean / non-repo rows
  // get NO attribute — render nothing, not an empty value. Manifest paths
  // (page.file / template.file) are site/-relative; git paths are
  // project-relative because the repo root IS the project root (F6 guard).
  const gs = gitState.latest
  const changedSet = new Set(gs?.repo ? gs.changed : [])
  const untrackedSet = new Set(gs?.repo ? gs.untracked : [])
  const gitAttr = relPath => {
    if (untrackedSet.has(relPath)) return ' data-git-state="untracked"'
    if (changedSet.has(relPath)) return ' data-git-state="modified"'
    return ''
  }

  // Styles section shows whichever file the manifest actually points at
  // (Graphite ships assets/css/theme.css; earlier starters use style.css)
  // rather than a hardcoded name — same fallback path rescanSiteFiles uses
  // for the dual-writer guard, so the two stay in lockstep.
  const globalCssPath = project.manifest?.globalCSS || 'assets/css/style.css'
  const globalCssLabel = globalCssPath.split('/').pop() || 'style.css'

  const pages = project.pages.map(p => {
    const dirty = projectState.dirtyPages.has(p.name) ? ' is-dirty' : ''
    const git = gitAttr(`site/${p.file || `pages/${p.name}.html`}`)
    return `<li class="gstrap-fm-item${dirty}"${git} data-fm-page="${escAttr(p.name)}">${escHtml(p.name)}.html</li>`
  }).join('')

  const templates = (project.templates || []).map(t => {
    const dirty = projectState.dirtyTemplates.has(t.name) ? ' is-dirty' : ''
    const git = gitAttr(`site/${t.file || `templates/${t.name}.gstrap-tpl`}`)
    return `<li class="gstrap-fm-item${dirty}"${git} data-fm-template="${escAttr(t.name)}">${escHtml(t.name)}.gstrap-tpl</li>`
  }).join('')

  const siteFiles = siteCodeFiles.map(p => {
    const dirty = isFileDirty(p) ? ' is-dirty' : ''
    const git = gitAttr(`site/${p}`)
    return `<li class="gstrap-fm-item${dirty}"${git} data-fm-file="${escAttr(p)}">${escHtml(p)}</li>`
  }).join('')

  host.innerHTML = `
    <div class="gstrap-fm-section">
      <div class="gstrap-fm-section-title">${escHtml(t('fm.pages'))}</div>
      <ul class="gstrap-fm-list">${pages}</ul>
    </div>
    <div class="gstrap-fm-section">
      <div class="gstrap-fm-section-title">${escHtml(t('fm.templates'))}
        <button class="gstrap-fm-section-action" data-fm-new-template title="${escAttr(t('fm.new-template-title'))}">+</button>
      </div>
      <ul class="gstrap-fm-list">${templates}</ul>
    </div>
    <div class="gstrap-fm-section">
      <div class="gstrap-fm-section-title">${escHtml(t('fm.styles'))}</div>
      <ul class="gstrap-fm-list">
        <li class="gstrap-fm-item${projectState.globalCssDirty ? ' is-dirty' : ''}"${gitAttr(`site/${globalCssPath}`)}>${escHtml(globalCssLabel)}</li>
      </ul>
    </div>
    ${siteCodeFiles.length === 0 ? '' : `
    <div class="gstrap-fm-section">
      <div class="gstrap-fm-section-title">${escHtml(t('fm.site-files'))}</div>
      <ul class="gstrap-fm-list">${siteFiles}</ul>
    </div>`}
    <div class="gstrap-fm-section">
      <div class="gstrap-fm-section-title">${escHtml(t('fm.assets'))}</div>
      <ul class="gstrap-fm-list">
        <li class="gstrap-fm-item">images/</li>
        <li class="gstrap-fm-item">fonts/</li>
        <li class="gstrap-fm-item">videos/</li>
      </ul>
    </div>
  `
}

function escHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]) }
function escAttr(s) { return escHtml(s) }
