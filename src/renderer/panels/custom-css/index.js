/**
 * GrapeStrap — Custom CSS panel (project-global style.css)
 *
 * Small Monaco instance bound to the project's style.css. Saves on Ctrl+S like
 * everything else (the project save loop picks up globalCSS).
 */

import { monaco } from '../../editor/monaco-init.js'
import { projectState } from '../../state/project-state.js'
import { eventBus } from '../../state/event-bus.js'

let cssEditor = null

export function renderCustomCss(host) {
  host.classList.add('gstrap-cssp-host')
  host.innerHTML = `<div class="gstrap-monaco-host" data-region="cssp"></div>`
  const slot = host.querySelector('[data-region="cssp"]')

  cssEditor = monaco.editor.create(slot, {
    value: projectState.current?.globalCSS || '/* Project-global custom CSS */\n',
    language: 'css',
    theme: 'vs-dark',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
    minimap: { enabled: false },
    automaticLayout: true,
    scrollBeyondLastLine: false
  })

  cssEditor.onDidChangeModelContent(() => {
    if (!projectState.current) return
    projectState.current.globalCSS = cssEditor.getValue()
    projectState.markCssDirty()
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
