/**
 * GrapeStrap — AI tool executor (renderer half of the tool bridge)
 *
 * PATH: src/renderer/panels/ai/tool-executor.js
 * ROLE: Runs the nine renderer-bridged tools against the live editor, project
 *       state, and project files, then answers each ai:tool-call with
 *       grapestrap.ai.toolResult(). Owns the write-confirm flow and the
 *       one-undo-step-per-turn grouping.
 * DEPENDS: ai/chat-state.js, editor/grapesjs-init.js, editor/placement.js,
 *          dialogs/quick-tag.js, panels/templates/manage.js,
 *          state/project-state.js, state/page-state.js, state/event-bus.js,
 *          i18n.js, log.js, preload bridge (window.grapestrap.ai / .file)
 * CREATED: 2026-08-30
 *
 * Protocol: main emits ai:tool-call { turnId, callId, name, input } and parks
 * the provider's promise until ai:tool-result answers that callId, with a
 * deadline timer behind it. So EVERY path through here must answer exactly
 * once — a thrown handler that never replies parks the single-flight turn
 * slot until main's timeout fires. That is why executeToolCall wraps every
 * handler and why the confirm flow hands ownership of the reply over
 * explicitly (DEFERRED) rather than by falling out of the function.
 *
 * Tool RESULT strings are model-facing, not user-facing: they are plain
 * English and deliberately NOT run through t(). Only the transcript rows this
 * module adds (the tool row, the confirm row) are localized.
 *
 * ─── Undo grouping — read before changing anything here ───────────────────
 *
 * Requirement: everything one AI turn changes on the canvas reverts with ONE
 * Ctrl+Z. GrapesJS 0.21.13's UndoManager has no transaction API; grouping is
 * implicit "magic fusion" in backbone-undo 0.2.6 — a module-scoped counter
 * that increments once per callstack and is released by _.defer, so only
 * mutations inside a SINGLE synchronous callstack share an index, and
 * um.undo() reverts every stack entry carrying that index at once.
 *
 * Separate tool calls arrive as separate IPC events, so they can never fuse
 * on their own. What this module does instead is re-stamp: each mutating tool
 * runs inside recordUndoRange, which notes the stack's last entry before and
 * after it, and at the terminal event every entry inside those ranges is
 * rewritten to the first one's magicFusionIndex. One undo then reverts the
 * whole turn, using the grouping mechanism exactly as backbone-undo intends —
 * only the stamping is ours.
 *
 * Ranges are per tool, and anchored to entry OBJECTS rather than to stack
 * depth, which buys two things:
 *   - an edit the user makes on the canvas between two tool calls falls
 *     outside every range and keeps its own undo step, instead of being
 *     swallowed into the AI's;
 *   - overflow trimming (backbone-undo shifts entries off the front past
 *     maximumStackLength, 500) is detected at close via indexOf instead of
 *     silently producing a wrong slice.
 *
 * Residual semantics worth knowing: a user edit made DURING a single tool's
 * synchronous mutation cannot be separated from it — but that window is one
 * callstack, so no user input can land inside it. And if an anchor has been
 * trimmed away by the time the turn ends, the turn stays multi-step; that is
 * reported in the log rather than papered over.
 *
 * NOT covered, by pre-existing design: edit_global_css. The project global
 * stylesheet is a plain string on the project object, written the same way
 * the Style Manager's bare-rule store and menu-router write it; it never
 * touches the CssComposer, so no rule of it is on any undo stack. A CSS edit
 * is not undoable with Ctrl+Z today, from this module or any other. That
 * asymmetry predates the AI panel (see editor/insert-section.js) and closing
 * it means moving those writes into editor.Css, which is out of scope here.
 */

import { chatState } from './chat-state.js'
import { getEditor, getCanvasHtml } from '../../editor/grapesjs-init.js'
import { resolvePlacement, insertAtPlacement } from '../../editor/placement.js'
import { formatComponentAsQuickTag } from '../../dialogs/quick-tag.js'
import { validateNewName, createPage } from '../templates/manage.js'
import { projectState } from '../../state/project-state.js'
import { pageState } from '../../state/page-state.js'
import { eventBus } from '../../state/event-bus.js'
import { t } from '../../i18n.js'
import { log } from '../../log.js'

// Ceiling on any single tool result. Long enough to carry a real page, short
// enough that one oversized file cannot blow the conversation's token budget.
const TOOL_OUTPUT_CAP = 16000

// Returned by a handler that has taken ownership of its own reply (the write
// confirm parks the call until the user answers). A symbol, so no tool result
// string can ever collide with it.
const DEFERRED = Symbol('tool-result-deferred')

// callId → { messageId, path, content } for every write awaiting an answer.
const pendingConfirms = new Map()

// callIds already executed this turn. main parks one promise per call, so a
// redelivered ai:tool-call must be dropped rather than run a second time — a
// re-run would mutate the canvas twice for one model request.
const executedCallIds = new Set()

// One { before, after } anchor pair per mutating tool run this turn. Anchors
// are stack ENTRY MODELS, not indexes: backbone-undo shifts entries off the
// front once the stack passes maximumStackLength (500), which silently
// invalidates any absolute depth recorded earlier in the turn.
let turnUndoRanges = []

// True between the first tool call of a turn and its terminal event. Only used
// to decide whether a rejected tool result is worth warning about.
let isTurnLive = false

// ─── Bridge helpers ────────────────────────────────────────────────────────

/** @returns {object|null} the preload AI bridge, or null when unavailable */
function getAiBridge() {
  return window.grapestrap?.ai || null
}

/** @returns {object|null} the preload file bridge, or null when unavailable */
function getFileBridge() {
  return window.grapestrap?.file || null
}

/**
 * Answer one tool call. The only place toolResult is invoked.
 *
 * @param {string} callId - the call being answered
 * @param {string} text - result content for the model
 * @param {boolean} isError - true to send it back as an error result
 * @returns {void}
 */
function replyToCall(callId, text, isError) {
  const bridge = getAiBridge()
  if (!bridge) {
    log.warn(`ai tools: cannot answer ${callId} — preload AI bridge missing`)
    return
  }
  // toolResult RESOLVES with main's envelope — it does not reject on a callId
  // main no longer has parked, so a .catch alone would never see that. An
  // unknown-call is expected once the turn has ended (main cleared its pending
  // map); while the turn is still live it means this reply was dropped and the
  // model is waiting on a call that will now only end at main's deadline.
  Promise.resolve(bridge.toolResult(callId, text, !!isError))
    .then(envelope => {
      if (envelope?.ok === false && isTurnLive) {
        log.warn(`ai tools: main rejected the result for ${callId} — ${envelope?.error?.type || 'unknown'}`)
      }
    })
    .catch(error => {
      log.warn(`ai tools: answering ${callId} failed — ${error?.message || error}`)
    })
}

/**
 * Flatten whatever a rejected bridge call threw into one model-readable line.
 *
 * Errors crossing contextBridge arrive prefixed with "Error invoking remote
 * method 'file:read': …"; the model does not need the IPC channel name, so
 * the prefix is stripped.
 *
 * @param {unknown} error - the thrown value
 * @returns {string} a single-line description
 */
function toolErrorText(error) {
  const raw = error?.message || String(error || 'Unknown error.')
  return raw.replace(/^Error invoking remote method '[^']*':\s*/, '')
}

/**
 * Truncate an oversized result and say so, so the model knows it is looking
 * at a prefix rather than the whole file.
 *
 * @param {string} text - candidate result
 * @param {number} cap - maximum characters to keep
 * @returns {string} text, or its prefix plus a truncation note
 */
function capText(text, cap) {
  const value = typeof text === 'string' ? text : ''
  if (value.length <= cap) return value
  return `${value.slice(0, cap)}\n\n[Truncated: ${value.length} characters total, first ${cap} shown.]`
}

// ─── Undo grouping ─────────────────────────────────────────────────────────

/**
 * Reach backbone-undo's live stack, probing every internal this module
 * depends on.
 *
 * getInstance() is public GrapesJS API; `.stack` and the entries' Backbone
 * get/set are backbone-undo internals, pinned at 0.2.6 by GrapesJS's own
 * dependency. Probing rather than assuming means a future bump degrades to
 * per-tool undo steps instead of throwing inside a turn.
 *
 * @returns {object|null} the UndoStack collection, or null when unusable
 */
function getUndoStack() {
  try {
    const stack = getEditor()?.UndoManager?.getInstance?.()?.stack
    if (!stack || !Array.isArray(stack.models)) return null
    // Probe BOTH halves of the re-stamp: closeTurnUndoGroup reads
    // magicFusionIndex with .get and rewrites it with .set. A sample is only
    // available once something has been tracked; an empty stack is fine and
    // gets probed on a later call.
    const sample = stack.models[0]
    if (sample && (typeof sample.get !== 'function' || typeof sample.set !== 'function')) return null
    return stack
  } catch (error) {
    log.warn(`ai tools: undo stack unavailable — ${error?.message || error}`)
    return null
  }
}

/**
 * Run one mutating tool and record exactly which undo entries it produced.
 *
 * Anchors are the stack's last entry before and after the mutation. Recording
 * a RANGE PER TOOL rather than one span for the whole turn is what keeps an
 * edit the user made on the canvas between two tool calls out of the AI's
 * undo group — that edit lands after this tool's `after` anchor and before the
 * next tool's `before` anchor, so no range covers it.
 *
 * @param {Function} mutate - performs the mutation; its return value is passed through
 * @returns {*} whatever mutate() returned
 */
function recordUndoRange(mutate) {
  const stack = getUndoStack()
  const before = stack ? stack.models[stack.models.length - 1] || null : null
  const result = mutate()
  if (stack) {
    const after = stack.models[stack.models.length - 1] || null
    // after === before means the tool changed nothing the undo manager tracks
    // (every edit_global_css write, for one) — no range to record.
    if (after && after !== before) turnUndoRanges.push({ before, after })
  }
  return result
}

/**
 * Fuse this turn's recorded ranges into one undo step.
 *
 * Indexes are derived at close time via indexOf on the anchor models, so an
 * overflow trim between the mutation and here is detected rather than silently
 * producing a wrong slice. A trimmed anchor means the turn's own entries are
 * partly gone from the stack, and there is nothing correct left to fuse — the
 * turn stays multi-step and says so in the log.
 *
 * @returns {void}
 */
function closeTurnUndoGroup() {
  const ranges = turnUndoRanges
  turnUndoRanges = []
  if (ranges.length === 0) return

  const stack = getUndoStack()
  if (!stack) return

  const entries = []
  for (const range of ranges) {
    const endIndex = stack.models.indexOf(range.after)
    // A null `before` legitimately means "the stack was empty", which starts
    // the range at 0; a non-null one that indexOf cannot find was trimmed.
    const beforeIndex = range.before ? stack.models.indexOf(range.before) : -1
    if (endIndex === -1 || (range.before && beforeIndex === -1)) {
      log.warn('ai tools: an undo anchor was trimmed off the stack — leaving this turn as multiple undo steps')
      return
    }
    entries.push(...stack.models.slice(beforeIndex + 1, endIndex + 1))
  }

  // 0 entries: nothing trackable changed. 1: already a single undo step.
  if (entries.length < 2) return

  try {
    const groupIndex = entries[0].get('magicFusionIndex')
    if (typeof groupIndex !== 'number') return
    for (const entry of entries) entry.set('magicFusionIndex', groupIndex)
  } catch (error) {
    // Degrades to one undo step per mutating tool — worse, but not broken.
    log.warn(`ai tools: could not fuse the turn's undo entries — ${error?.message || error}`)
  }
}

// ─── Shared tool helpers ───────────────────────────────────────────────────

/**
 * @returns {object} the live editor
 * @throws {Error} when the canvas has not initialized yet
 */
function requireEditor() {
  const editor = getEditor()
  if (!editor) throw new Error('The canvas is not ready yet. Ask the user to open a project first.')
  return editor
}

/**
 * @returns {object} the open project
 * @throws {Error} when no project is open
 */
function requireProject() {
  const project = projectState.current
  if (!project) throw new Error('No project is open. Ask the user to open one first.')
  return project
}

/**
 * Normalize whatever append()/replaceWith() handed back into one component.
 *
 * GrapesJS returns a single component, an array, or undefined depending on
 * the content and the version — menu-router normalizes the same way.
 *
 * @param {object|Array<object>|undefined} added - return value to normalize
 * @returns {object|null} the first component, or null
 */
function firstComponent(added) {
  if (Array.isArray(added)) return added[0] || null
  return added || null
}

/**
 * Reject a path before it reaches the bridge.
 *
 * main's safePath() already jails every file call to the project root, so
 * this is the second lock rather than the only one — but rejecting here turns
 * a traversal attempt into a precise, model-readable refusal instead of an
 * IPC rejection string, and keeps the attempt out of the main process.
 *
 * @param {unknown} path - the model-supplied path
 * @returns {string} '' when acceptable, else the refusal text
 */
function pathRefusal(path) {
  if (typeof path !== 'string' || !path.trim()) return 'The path argument is required.'
  if (path.includes('..')) return `Refused: "${path}" contains ".." — paths must stay inside the project.`
  if (path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)) {
    return `Refused: "${path}" is an absolute path — use a path relative to the project root.`
  }
  return ''
}

/**
 * @param {string} path - project-relative path
 * @returns {Promise<boolean>} true when the file already exists
 */
async function projectFileExists(path) {
  const file = getFileBridge()
  // UNKNOWN MEANS ASK. This answer is the only thing standing between the
  // model and an unconfirmed overwrite, so every path where we do not actually
  // know resolves to true: a false here writes over the user's file without
  // asking, while a wrong true costs one dismissable prompt.
  if (!file) return true
  try {
    return !!(await file.exists(path))
  } catch (error) {
    log.warn(`ai tools: exists(${path}) failed — treating it as existing so the overwrite is confirmed — ${error?.message || error}`)
    return true
  }
}

/**
 * Write a file and phrase the outcome for the model.
 *
 * @param {string} path - project-relative path
 * @param {string} content - full file contents
 * @returns {Promise<string>} confirmation line
 * @throws {Error} whatever the bridge rejected with (bad path, IO failure)
 */
async function writeProjectFile(path, content) {
  const file = getFileBridge()
  if (!file) throw new Error('File access is unavailable in this window.')
  const written = await file.write(path, typeof content === 'string' ? content : '')
  return `Wrote ${written?.path || path}.`
}

// ─── Tool handlers ─────────────────────────────────────────────────────────
//
// Each returns the model-facing result string, throws to produce an error
// result, or returns DEFERRED to take ownership of its own reply.

/**
 * Summarize the open project: name, pages, active page, top of the file tree.
 *
 * @returns {Promise<string>} the overview
 */
async function getProjectOverview() {
  const project = requireProject()
  const pages = (project.pages || []).map(page => page?.name).filter(Boolean)
  const activeTab = pageState.active()
  const activePage = activeTab && (activeTab.kind || 'page') === 'page' ? activeTab.pageName : null

  const lines = [
    `Project: ${project.name || '(unnamed)'}`,
    `Pages (${pages.length}): ${pages.length ? pages.join(', ') : '(none)'}`,
    `Active page: ${activePage || '(none open in the editor)'}`
  ]

  const templates = (project.templates || []).map(entry => entry?.name).filter(Boolean)
  if (templates.length) lines.push(`Templates: ${templates.join(', ')}`)

  const file = getFileBridge()
  if (file) {
    try {
      const entries = await file.list('site')
      const described = entries
        .map(entry => (entry.type === 'dir' ? `${entry.name}/` : entry.name))
        .sort()
      lines.push(`site/ contains: ${described.length ? described.join(', ') : '(empty)'}`)
    } catch (error) {
      // A listing failure is not worth failing the whole overview over — the
      // page-level facts above are the part the model actually acts on.
      lines.push(`site/ listing unavailable: ${toolErrorText(error)}`)
    }
  }

  return capText(lines.join('\n'), TOOL_OUTPUT_CAP)
}

/**
 * Describe the current canvas selection.
 *
 * @returns {string} quick-tag line plus the element's outer HTML
 */
function getSelectedElement() {
  const editor = requireEditor()
  const selected = editor.getSelected()
  if (!selected) return 'Nothing is currently selected on the canvas.'
  const html = selected.toHTML?.() || ''
  // TOOL_OUTPUT_CAP, not the 4000-char context cap: the context block is a
  // per-turn preamble that rides on every message, so it is kept small on
  // purpose. This is a tool result the model asked for — the reason to call it
  // is to see the whole element.
  return `${formatComponentAsQuickTag(selected)}\n\n${capText(html, TOOL_OUTPUT_CAP)}`
}

/**
 * Read a page's HTML.
 *
 * The active page is served from the live canvas, not from the stored page
 * record: the record only catches up on tab swap and save, so reading it for
 * the page the user is looking at would hand the model a stale copy and
 * invite it to "fix" edits that are already there.
 *
 * @param {{page?: string}} input - optional page name
 * @returns {string} the page markup
 */
function getPageHtml({ page } = {}) {
  const project = requireProject()
  const activeTab = pageState.active()
  const activePage = activeTab && (activeTab.kind || 'page') === 'page' ? activeTab.pageName : null

  if (!page || page === activePage) {
    const live = getCanvasHtml()
    if (live) return capText(live, TOOL_OUTPUT_CAP)
    if (!page) return 'No page is open in the editor. Pass a page name, or ask the user to open one.'
  }

  const entry = project.pages?.find(candidate => candidate?.name === page)
  if (!entry) {
    const names = (project.pages || []).map(candidate => candidate?.name).filter(Boolean)
    return `No page named "${page}". This project has: ${names.join(', ') || '(none)'}.`
  }
  return capText(entry.html || '', TOOL_OUTPUT_CAP)
}

/**
 * Swap the selected element for new markup.
 *
 * Uses component.replaceWith directly rather than menu-router's
 * applyTagReplace: that helper rebuilds the element from a parsed {tag, attrs}
 * pair and keeps the old children, which is the Quick Tag contract. This tool
 * promises the opposite — the supplied HTML replaces the element outright.
 *
 * @param {{html: string}} input - replacement markup
 * @returns {string} confirmation
 * @throws {Error} when nothing is selected or the html argument is empty
 */
function replaceElementHtml({ html } = {}) {
  const editor = requireEditor()
  if (typeof html !== 'string' || !html.trim()) throw new Error('The html argument is required.')
  const selected = editor.getSelected()
  if (!selected) {
    throw new Error('Nothing is selected on the canvas. Ask the user to select an element, or use insert_html.')
  }

  const first = recordUndoRange(() => {
    const replaced = firstComponent(selected.replaceWith(html))
    if (replaced) editor.select(replaced)
    return replaced
  })
  eventBus.emit('canvas:content-changed')
  return `Replaced the selected element with the supplied markup${first ? '' : ' (the canvas returned no component to reselect)'}.`
}

/**
 * Work out where insert_html's markup goes.
 *
 * resolvePlacement has no "sibling after" mode — a bare {} means "inside" for
 * a container tag, which is right for append and wrong for after. The
 * before-placement is always {parent, at: index} for a real anchor, so after
 * is that same parent at the next index.
 *
 * @param {object} editor - live editor
 * @param {object|null} anchor - the selected component, or null
 * @param {string} position - 'append' | 'before' | 'after'
 * @returns {{parent: object, at: number}} placement for insertAtPlacement
 */
function placementForPosition(editor, anchor, position) {
  const wrapper = editor.getWrapper()
  // No selection: the tool contract says the markup lands at the end of the body.
  if (!anchor || anchor === wrapper) return { parent: wrapper, at: -1 }
  if (position === 'before') return resolvePlacement(editor, anchor, { before: true })
  if (position === 'after') {
    const before = resolvePlacement(editor, anchor, { before: true })
    return { parent: before.parent, at: before.at + 1 }
  }
  return resolvePlacement(editor, anchor, {})
}

/**
 * Insert markup relative to the selection.
 *
 * @param {{html: string, position?: string}} input - markup and placement
 * @returns {string} confirmation
 * @throws {Error} when the html argument is empty
 */
function insertHtml({ html, position = 'append' } = {}) {
  const editor = requireEditor()
  if (typeof html !== 'string' || !html.trim()) throw new Error('The html argument is required.')
  const anchor = editor.getSelected() || null
  const placement = placementForPosition(editor, anchor, position)

  recordUndoRange(() => {
    const { added } = insertAtPlacement(editor, placement, html)
    const first = firstComponent(added)
    if (first) editor.select(first)
  })
  eventBus.emit('canvas:content-changed')

  const where = anchor ? `${position} the selected element` : 'at the end of the page'
  return `Inserted the markup ${where}.`
}

/**
 * Append to or replace the project global stylesheet.
 *
 * Mirrors the Custom CSS panel's write route exactly — mutate
 * projectState.current.globalCSS, flag it dirty, then emit project:css-changed
 * so the canvas <style> tag and the panel's Monaco buffer both re-sync. That
 * event is what keeps the several writers of this one string consistent;
 * skipping it leaves the panel's buffer stale and the next keystroke there
 * silently clobbers this edit.
 *
 * @param {{css: string, mode: string}} input - stylesheet source and write mode
 * @returns {string} confirmation
 * @throws {Error} on a missing project or a bad argument
 */
function editGlobalCss({ css, mode } = {}) {
  const project = requireProject()
  if (typeof css !== 'string') throw new Error('The css argument is required.')
  if (mode !== 'replace' && mode !== 'append') {
    throw new Error('The mode argument must be "replace" or "append".')
  }

  // Wrapped for symmetry with the other mutating tools, and so this tool
  // joins the group for free if globalCSS ever moves into the CssComposer.
  // Today it records an empty range: the write below touches no tracked
  // model, so recordUndoRange sees no new stack entry. See the header —
  // global CSS is not Ctrl+Z-undoable anywhere in this app.
  recordUndoRange(() => {
    const existing = project.globalCSS || ''
    project.globalCSS = mode === 'replace' ? css : `${existing}${existing.endsWith('\n') ? '' : '\n'}${css}`
    projectState.markCssDirty()
    eventBus.emit('project:css-changed')
  })

  const verb = mode === 'replace' ? 'Replaced' : 'Appended to'
  return `${verb} the project stylesheet. Note: this edit is not covered by Ctrl+Z — say so if the user asks to undo it.`
}

/**
 * Create a new empty page.
 *
 * @param {{name: string}} input - the new page name
 * @returns {string} confirmation
 * @throws {Error} when the name is rejected or creation fails
 */
function createProjectPage({ name } = {}) {
  requireProject()
  if (typeof name !== 'string' || !name.trim()) throw new Error('The name argument is required.')

  const rejection = validateNewName(name)
  if (rejection) throw new Error(rejection)

  const page = createPage(name)
  if (!page) throw new Error(`Could not create a page named "${name}".`)
  // createPage opens the new page's tab (manage.js#commitNewPage), which also
  // moves the canvas and the selection off whatever the user was looking at —
  // worth stating so the model does not then act on a stale selection.
  return `Created page "${page.name}" at ${page.file}, and opened it as the active page.`
}

/**
 * Read a project file.
 *
 * @param {{path: string}} input - project-relative path
 * @returns {Promise<string>} file contents
 * @throws {Error} on a refused path or a read failure
 */
async function readProjectFile({ path } = {}) {
  const refusal = pathRefusal(path)
  if (refusal) throw new Error(refusal)
  const file = getFileBridge()
  if (!file) throw new Error('File access is unavailable in this window.')
  const content = await file.read(path)
  return capText(typeof content === 'string' ? content : String(content ?? ''), TOOL_OUTPUT_CAP)
}

/**
 * Write a project file, asking the user first when it would overwrite.
 *
 * @param {{path: string, content: string}} input - path and full contents
 * @param {{callId: string}} call - the pending call, for the confirm row
 * @returns {Promise<string|symbol>} confirmation, or DEFERRED while awaiting
 *          the user's answer
 * @throws {Error} on a refused path or a write failure
 */
async function writeProjectFileTool({ path, content } = {}, { callId, rowId } = {}) {
  const refusal = pathRefusal(path)
  if (refusal) throw new Error(refusal)
  if (typeof content !== 'string') throw new Error('The content argument is required.')

  if (!(await projectFileExists(path))) return writeProjectFile(path, content)

  // Overwrite: park the call behind an inline Allow/Deny row. main holds the
  // provider promise open until we answer or its deadline fires, so no reply
  // is sent from here — resolveToolConfirm owns the reply AND the tool row.
  const row = chatState.addNotice(t('ai.confirm.overwrite', { path }), 'confirm', callId)
  pendingConfirms.set(callId, { messageId: row?.id || '', toolRowId: rowId || '', path, content })
  return DEFERRED
}

const TOOL_HANDLERS = {
  get_project_overview: getProjectOverview,
  get_selected_element: getSelectedElement,
  get_page_html: getPageHtml,
  replace_element_html: replaceElementHtml,
  insert_html: insertHtml,
  edit_global_css: editGlobalCss,
  create_page: createProjectPage,
  read_file: readProjectFile,
  write_file: writeProjectFileTool
}

// ─── Public surface ────────────────────────────────────────────────────────

/**
 * Run one ai:tool-call and answer it.
 *
 * Never rejects and never returns without either replying or handing the
 * reply to the confirm flow — a silent path here parks main's turn slot until
 * its deadline fires.
 *
 * @param {{turnId: string, callId: string, name: string, input: object}} payload
 * @returns {Promise<void>}
 */
export async function executeToolCall(payload) {
  const callId = typeof payload?.callId === 'string' ? payload.callId : ''
  const name = typeof payload?.name === 'string' ? payload.name : ''
  if (!callId) {
    log.warn('ai tools: ignoring a tool call with no callId')
    return
  }
  // A redelivered call must not run twice. Answering it again would also be
  // pointless — main holds one parked promise per callId and has already
  // taken our first reply.
  if (executedCallIds.has(callId)) {
    log.warn(`ai tools: ignoring a repeat delivery of ${callId}`)
    return
  }
  executedCallIds.add(callId)
  isTurnLive = true

  const toolLabel = name || '?'
  const row = chatState.addNotice(t('ai.toolrow.running', { tool: toolLabel }), 'tool')
  const rowId = row?.id || ''

  /**
   * Settle the row and answer the call. Both exits go through here so the
   * transcript can never be left saying a finished tool is still running.
   *
   * @param {string} text - result content for the model
   * @param {boolean} isError - true to answer as an error result
   * @returns {void}
   */
  const finishCall = (text, isError) => {
    if (rowId) {
      chatState.setText(rowId, t(isError ? 'ai.toolrow.failed' : 'ai.toolrow.done', { tool: toolLabel }))
    }
    replyToCall(callId, text, isError)
  }

  const handler = TOOL_HANDLERS[name]
  if (!handler) {
    finishCall(`Unknown tool: ${name}`, true)
    return
  }

  try {
    const result = await handler(payload?.input || {}, { callId, turnId: payload?.turnId, rowId })
    // DEFERRED: the confirm flow owns both the reply and the row from here.
    if (result === DEFERRED) return
    finishCall(typeof result === 'string' ? result : String(result ?? ''), false)
  } catch (error) {
    finishCall(toolErrorText(error), true)
  }
}

/**
 * Answer a parked write confirmation.
 *
 * @param {string} callId - the call the user answered
 * @param {boolean} allowed - true for Overwrite, false for Deny
 * @returns {Promise<void>} always resolves
 */
export async function resolveToolConfirm(callId, allowed) {
  const pending = pendingConfirms.get(callId)
  // Already answered, or abandoned when the turn ended — either way there is
  // nothing left to reply to, and a second toolResult would be rejected.
  if (!pending) return
  pendingConfirms.delete(callId)
  if (pending.messageId) chatState.removeMessage(pending.messageId)

  /**
   * @param {string} text - result content for the model
   * @param {boolean} isError - true to answer as an error result
   * @returns {void}
   */
  const finishCall = (text, isError) => {
    if (pending.toolRowId) {
      chatState.setText(
        pending.toolRowId,
        t(isError ? 'ai.toolrow.failed' : 'ai.toolrow.done', { tool: 'write_file' })
      )
    }
    replyToCall(callId, text, isError)
  }

  if (!allowed) {
    finishCall('User denied the write.', true)
    return
  }
  try {
    finishCall(await writeProjectFile(pending.path, pending.content), false)
  } catch (error) {
    finishCall(toolErrorText(error), true)
  }
}

/**
 * Close out a turn: fuse its undo entries and drop any unanswered confirms.
 *
 * Called from the panel on every terminal ai:turn. The confirm rows go
 * without a reply on purpose — main already cleared its pending calls when
 * the turn ended (clearPendingToolCalls), so answering now would only be
 * rejected as an unknown callId.
 *
 * @returns {void}
 */
export function finishToolTurn() {
  for (const pending of pendingConfirms.values()) {
    if (pending.messageId) chatState.removeMessage(pending.messageId)
    // The write never happened, and its tool row would otherwise sit at
    // "Running…" for the rest of the session.
    if (pending.toolRowId) {
      chatState.setText(pending.toolRowId, t('ai.toolrow.failed', { tool: 'write_file' }))
    }
  }
  pendingConfirms.clear()
  executedCallIds.clear()
  isTurnLive = false
  closeTurnUndoGroup()
}

/**
 * Whether a write is waiting on the user right now. Exposed for the panel's
 * test surface — nothing in the app branches on it.
 *
 * @returns {boolean} true while at least one confirm row is unanswered
 */
export function hasPendingConfirm() {
  return pendingConfirms.size > 0
}
