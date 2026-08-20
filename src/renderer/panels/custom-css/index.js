/**
 * GrapeStrap — Custom CSS panel (project-global style.css)
 *
 * PATH: src/renderer/panels/custom-css/index.js
 * ROLE: Small Monaco instance bound to the project's style.css. Saves on
 *       Ctrl+S like everything else (the project save loop picks up globalCSS).
 * DEPENDS: editor/monaco-init.js, state/project-state.js, state/event-bus.js
 * CREATED: 2026-05-04 (breadcrumb header added with the Wave 3 rewrite)
 *
 * globalCSS has multiple writers (this editor, Style Manager background/
 * pseudo-class panels, menu-router). All of them emit 'project:css-changed';
 * this panel both emits (on local edits) and listens (to refresh its buffer
 * after an external write). Without the listener the Monaco buffer goes
 * stale and the next keystroke here silently clobbers the external rule —
 * the alpha.12 "Properties writes don't stick" bug.
 *
 * Wave 3 idempotency contract: GL's loadLayout (workspace apply, Reset
 * Layout) re-invokes this factory. The Monaco editor is created exactly ONCE
 * inside a module-held persistent subtree that re-runs re-parent into the
 * fresh GL host — so the CSS-editor undo stack survives applies and the old
 * pre-fix leak (a new editor per reset, old one never disposed, stranded in
 * liveEditors) is structurally impossible. Event subscriptions are wire-once.
 */

import { monaco, registerForRelayout, attachEditorContextItems } from '../../editor/monaco-init.js'
import { projectState } from '../../state/project-state.js'
import { eventBus } from '../../state/event-bus.js'

let cssEditor = null
let persistentRoot = null
let eventsWired = false

// Shared between the local-edit handler and the external-write refresh below;
// module scope because the two live in different wire-once blocks.
let refreshingFromState = false

export function renderCustomCss(host) {
  host.classList.add('gstrap-cssp-host')

  if (persistentRoot) {
    // GL re-invoked us: re-parent the living editor, re-measure next frame.
    host.appendChild(persistentRoot)
    requestAnimationFrame(() => {
      try { cssEditor?.layout?.() } catch (_) { /* editor transitioning */ }
    })
    return
  }

  persistentRoot = document.createElement('div')
  persistentRoot.className = 'gstrap-persistent-root'
  persistentRoot.innerHTML = `<div class="gstrap-monaco-host" data-region="cssp"></div>`
  host.appendChild(persistentRoot)
  const slot = persistentRoot.querySelector('[data-region="cssp"]')

  cssEditor = monaco.editor.create(slot, {
    value: projectState.current?.globalCSS || '/* Project-global custom CSS */\n',
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
  registerForRelayout(cssEditor)
  attachEditorContextItems(cssEditor)

  // Live preview: every edit updates projectState.current.globalCSS AND
  // emits 'project:css-changed' (debounced). grapesjs-init listens on that
  // and re-syncs the <style data-grapestrap-globalcss> tag inside the
  // canvas iframe so the canvas reflects new CSS without a manual save.
  // Reported on nola1 2026-05-04: edits in the Custom CSS toolbar didn't
  // update the page until something else fired the sync event.
  // (Editor-scoped, so inherently once: the editor is only ever created once.)
  let livePreviewTimer = null
  cssEditor.onDidChangeModelContent(() => {
    if (!projectState.current || refreshingFromState) return
    projectState.current.globalCSS = cssEditor.getValue()
    projectState.markCssDirty()
    clearTimeout(livePreviewTimer)
    livePreviewTimer = setTimeout(() => eventBus.emit('project:css-changed'), 250)
  })

  wireCssPanelEvents()
}

// Wire-once (house pattern: wireLibraryLock). Handlers read the module
// `cssEditor` binding — created once, so no stale references possible.
function wireCssPanelEvents() {
  if (eventsWired) return
  eventsWired = true

  // External writers (Style Manager background/pseudo panels, menu-router)
  // mutate projectState.current.globalCSS directly, then emit. Refresh the
  // buffer so the next local keystroke starts from current state instead of
  // clobbering theirs. The value-equality check makes our own debounced emit
  // a no-op (buffer === state by then), so this can't loop; the flag keeps
  // the programmatic setValue from re-entering the change handler above.
  eventBus.on('project:css-changed', () => {
    if (!projectState.current) return
    const state = projectState.current.globalCSS || ''
    if (cssEditor.getValue() === state) return
    const pos = cssEditor.getPosition()
    refreshingFromState = true
    cssEditor.setValue(state)
    refreshingFromState = false
    if (pos) cssEditor.setPosition(pos)
  })

  eventBus.on('project:opened', () => {
    cssEditor.setValue(projectState.current?.globalCSS || '')
  })
  eventBus.on('project:closed', () => {
    cssEditor.setValue('')
  })
}

export function getCssEditor() {
  return cssEditor
}
