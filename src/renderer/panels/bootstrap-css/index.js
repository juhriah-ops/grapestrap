/**
 * GrapeStrap — Bootstrap CSS panel (the project's own site/assets/css/bootstrap.css)
 *
 * PATH: src/renderer/panels/bootstrap-css/index.js
 * ROLE: Monaco instance bound to projectState.current.bootstrapCSS — the
 *       project's editable copy of Bootstrap. Dreamweaver model: the framework
 *       sheet is a project file the user may edit, not a read-only vendor
 *       artifact. Saves on Ctrl+S with everything else (the project save loop
 *       writes bootstrapCSS through project-manager.saveProject).
 * DEPENDS: editor/monaco-init.js, state/project-state.js, state/event-bus.js,
 *          i18n.js, styles/bootstrap-css.css
 * CREATED: 2026-08-18
 *
 * Structural clone of panels/custom-css/index.js — same persistentRoot /
 * eventsWired / refreshingFromState idempotency contract (GL's loadLayout
 * re-invokes this factory on every workspace apply and Reset Layout; the
 * editor is created exactly once and re-parented into the fresh host, so the
 * undo stack survives and no editor is ever orphaned in liveEditors).
 *
 * One difference from Custom CSS: the buffer can be ABSENT. A project that
 * vendors its own framework (manifest.framework — the Graphite / Orbit
 * starters) never gets the app's Bootstrap copied in, so loadProject returns
 * `bootstrapCSS === undefined`. There is then nothing to edit here and the
 * panel shows a hint pointing at Site Files instead of an empty editor that
 * would look like a blank stylesheet.
 */

import { monaco, registerForRelayout, attachEditorContextItems } from '../../editor/monaco-init.js'
import { projectState } from '../../state/project-state.js'
import { eventBus } from '../../state/event-bus.js'
import { t } from '../../i18n.js'

// Live preview debounce. Matches the Custom CSS panel: long enough that a
// burst of keystrokes produces one canvas swap, short enough to feel live.
const LIVE_PREVIEW_DEBOUNCE_MS = 250

let bootstrapCssEditor = null
let persistentRoot = null
let eventsWired = false

// Shared between the local-edit handler and the external-write refresh below;
// module scope because the two live in different wire-once blocks.
let refreshingFromState = false

/**
 * GL panel factory. Idempotent: the first call builds the editor inside a
 * module-held subtree, later calls only re-parent that subtree.
 * @param {HTMLElement} host - The GL .lm_content element for this panel
 */
export function renderBootstrapCss(host) {
  host.classList.add('gstrap-bscss-host')

  if (persistentRoot) {
    // GL re-invoked us: re-parent the living editor, re-measure next frame.
    host.appendChild(persistentRoot)
    requestAnimationFrame(() => {
      try { bootstrapCssEditor?.layout?.() } catch (_) { /* editor transitioning */ }
    })
    return
  }

  persistentRoot = document.createElement('div')
  persistentRoot.className = 'gstrap-persistent-root gstrap-bscss-root'
  persistentRoot.innerHTML = `
    <div class="gstrap-monaco-host" data-region="bscss"></div>
    <div class="gstrap-bscss-unavailable" data-region="bscss-unavailable">
      <p class="gstrap-bscss-unavailable-text"></p>
    </div>`
  host.appendChild(persistentRoot)

  // Label through t(), set as text (never innerHTML) — the catalog is
  // user-replaceable via a language plugin.
  persistentRoot.querySelector('.gstrap-bscss-unavailable-text')
    .textContent = t('panel.bootstrap-css.unavailable')

  const slot = persistentRoot.querySelector('[data-region="bscss"]')

  bootstrapCssEditor = monaco.editor.create(slot, {
    value: projectState.current?.bootstrapCSS ?? '',
    language: 'css',
    theme: 'vs-dark',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
    minimap: { enabled: false },
    // automaticLayout intentionally OFF — see monaco-init.js for the rationale.
    automaticLayout: false,
    // Escape .lm_content overflow clipping — see monaco-init.js COMMON_OPTIONS.
    fixedOverflowWidgets: true,
    scrollBeyondLastLine: false
  })
  registerForRelayout(bootstrapCssEditor)
  // Generic Find / Replace / Deselect All context items — verified in
  // monaco-init.js to carry no globalCSS-specific behaviour, so they attach
  // here unchanged.
  attachEditorContextItems(bootstrapCssEditor)

  // Live preview: each edit updates projectState.current.bootstrapCSS and
  // (debounced) emits 'project:bootstrap-css-changed'. grapesjs-init listens
  // on that and swaps the canvas iframe's Bootstrap <link> for a blob URL
  // built from this buffer, so the canvas reflects framework edits without a
  // save. Disk stays untouched until Ctrl+S — same dirty-until-save contract
  // every other buffer in the app follows.
  let livePreviewTimer = null
  bootstrapCssEditor.onDidChangeModelContent(() => {
    if (!projectState.current || refreshingFromState) return
    // Vendored-framework project: there is no buffer to own. The editor is
    // read-only in that state, but guard anyway so a programmatic write can
    // never invent a bootstrapCSS field that saveProject would then create a
    // file from.
    if (projectState.current.bootstrapCSS === undefined) return
    projectState.current.bootstrapCSS = bootstrapCssEditor.getValue()
    projectState.markBootstrapCssDirty()
    clearTimeout(livePreviewTimer)
    livePreviewTimer = setTimeout(
      () => eventBus.emit('project:bootstrap-css-changed'), LIVE_PREVIEW_DEBOUNCE_MS)
  })

  syncAvailability()
  wireBootstrapCssPanelEvents()
}

// Wire-once (house pattern: custom-css wireCssPanelEvents). Handlers read the
// module `bootstrapCssEditor` binding — created once, so no stale references.
function wireBootstrapCssPanelEvents() {
  if (eventsWired) return
  eventsWired = true

  // Symmetry with the Custom CSS panel's external-writer refresh. Nothing
  // else writes bootstrapCSS today, so this is a no-op in practice (our own
  // debounced emit is filtered by the value-equality check); it exists so a
  // future writer can't silently desync this buffer the way the alpha.12
  // "Properties writes don't stick" bug desynced globalCSS.
  eventBus.on('project:bootstrap-css-changed', () => {
    if (!projectState.current) return
    const state = projectState.current.bootstrapCSS ?? ''
    if (bootstrapCssEditor.getValue() === state) return
    const pos = bootstrapCssEditor.getPosition()
    refreshingFromState = true
    bootstrapCssEditor.setValue(state)
    refreshingFromState = false
    if (pos) bootstrapCssEditor.setPosition(pos)
  })

  eventBus.on('project:opened', () => {
    refreshFromState(projectState.current?.bootstrapCSS ?? '')
  })
  eventBus.on('project:closed', () => {
    refreshFromState('')
  })
}

/**
 * Replace the buffer without the change handler treating it as a user edit
 * (which would mark the fresh project dirty on open).
 * @param {string} value - Full stylesheet text
 */
function refreshFromState(value) {
  refreshingFromState = true
  try {
    bootstrapCssEditor.setValue(value)
  } finally {
    refreshingFromState = false
  }
  syncAvailability()
}

/**
 * Show either the editor or the "this project vendors its own framework" hint,
 * based on whether the open project has an editable Bootstrap sheet. Class
 * toggle only — the two regions' geometry lives in styles/bootstrap-css.css.
 *
 * With NO project open the editor stays (empty, as every other panel's empty
 * state) — the hint is a statement about a specific project and would be a lie
 * on the launch screen.
 */
function syncAvailability() {
  if (!persistentRoot) return
  const project = projectState.current
  const unavailable = !!project && typeof project.bootstrapCSS !== 'string'
  persistentRoot.classList.toggle('is-unavailable', unavailable)
  // Read-only in the unavailable state so a stray keystroke can't produce a
  // buffer nobody asked for (and so the caret doesn't blink invitingly behind
  // the hint if the CSS ever changes).
  try { bootstrapCssEditor?.updateOptions({ readOnly: unavailable }) }
  catch (_) { /* editor transitioning */ }
}

/**
 * The panel's Monaco editor, or null before the panel has ever rendered.
 * Jump-to-rule (F3a) resolves its target editor through this.
 * @returns {object|null} Monaco standalone code editor
 */
export function getBootstrapCssEditor() {
  return bootstrapCssEditor
}
