/**
 * GrapeStrap — Style Manager: Pseudo-class state editor sub-panel
 *
 * Pairs with the pseudo-class state bar (rendered above the accordion in
 * `index.js`). When the bar is in 'normal' the sub-panel shows a hint pointing
 * the user at the bar. When the bar is on a non-normal state (`:hover`,
 * `:focus`, `:active`, `:disabled`), this panel becomes a property editor for
 * a `selector:state` rule in project `style.css`.
 *
 * Selector resolution: `pickSelector(component)` from css-rule-utils. The
 * first non-BS-utility class wins; element id is the fallback. If neither
 * exists, the panel renders a "needs a class" stub and the bar should toast +
 * revert (handled in `index.js`).
 *
 * Property surface is intentionally small — the most common pseudo-state
 * properties for hover/focus interactions. Power users go to the Custom CSS
 * panel for everything else.
 */

import { projectState } from '../../state/project-state.js'
import { eventBus } from '../../state/event-bus.js'
import { readRule, writeRule, pickSelector, isBsUtility } from './css-rule-utils.js'

export const id = 'pseudo'
export const label = 'Pseudo-class Styles'

// Properties exposed in the editor. `kind` controls input type:
//   color → color input + free-text fallback
//   text  → free-text (e.g. transform, box-shadow)
//   number → 0–1 step 0.05 (opacity)
const PROPS = [
  { key: 'background-color', label: 'Background',  kind: 'color' },
  { key: 'color',            label: 'Text color',  kind: 'color' },
  { key: 'border-color',     label: 'Border color',kind: 'color' },
  { key: 'opacity',          label: 'Opacity',     kind: 'number' },
  { key: 'cursor',           label: 'Cursor',      kind: 'select',
    options: ['', 'pointer', 'default', 'not-allowed', 'wait', 'text', 'move', 'help'] },
  { key: 'transform',        label: 'Transform',   kind: 'text',
    placeholder: 'scale(1.05)' },
  { key: 'box-shadow',       label: 'Box shadow',  kind: 'text',
    placeholder: '0 0 0 .25rem rgba(13,110,253,.25)' },
  { key: 'text-decoration',  label: 'Text decoration', kind: 'select',
    options: ['', 'none', 'underline', 'line-through'] }
]

export function render(host, ctx) {
  const { component, pseudoState, requestRender, onClearPseudoState } = ctx

  if (pseudoState === 'normal' || !pseudoState) {
    host.innerHTML = `
      <div class="gstrap-sm-hint">
        Pick a state above (<code>:hover</code>, <code>:focus</code>…) to edit
        styles for that state. Rules write to project <code>style.css</code>.
      </div>
    `
    return
  }

  if (!projectState.current) {
    host.innerHTML = `
      <div class="gstrap-sm-hint">
        Open or create a project first — pseudo-class styles save to the
        project's <code>style.css</code>.
      </div>
    `
    return
  }

  const selector = pickSelector(component, isBsUtility)
  if (!selector) {
    host.innerHTML = `
      <div class="gstrap-sm-hint">
        This element has no custom class or id. Add a class in the Properties
        panel above (e.g. <code>cta-link</code>) so we can scope
        <code>:${pseudoState}</code> styles to it.
        <button class="gstrap-sm-pill" data-revert>Back to Normal</button>
      </div>
    `
    host.querySelector('[data-revert]')?.addEventListener('click', () => {
      onClearPseudoState?.()
    })
    return
  }

  const rule = readRule(projectState.current.globalCSS || '', selector, pseudoState)

  host.innerHTML = `
    <div class="gstrap-sm-pseudo-banner">
      Editing <code>${selector}:${pseudoState}</code>
      <button class="gstrap-sm-pill gstrap-sm-clear" data-clear-rule>Clear</button>
    </div>
    ${PROPS.map(p => renderRow(p, rule[p.key] || '')).join('')}
  `

  host.querySelectorAll('[data-prop]').forEach(input => {
    input.addEventListener('input', () => writeFromInputs(host, selector, pseudoState))
    input.addEventListener('change', () => writeFromInputs(host, selector, pseudoState))
  })

  host.querySelector('[data-clear-rule]')?.addEventListener('click', () => {
    const css = projectState.current.globalCSS || ''
    projectState.current.globalCSS = writeRule(css, selector, pseudoState, {})
    projectState.markCssDirty()
    eventBus.emit('project:css-changed')
    requestRender()
  })
}

function renderRow(prop, value) {
  if (prop.kind === 'color') {
    const safe = /^#[0-9a-f]{3,8}$/i.test(value) ? value : ''
    return `
      <div class="gstrap-sm-row">
        <label class="gstrap-sm-label">${prop.label}</label>
        <div class="gstrap-sm-pseudo-pair">
          <input type="color" data-prop="${prop.key}" data-pair="color" value="${safe || '#000000'}" />
          <input type="text"  data-prop="${prop.key}" data-pair="text"
                 value="${escapeAttr(value)}" placeholder="#0d6efd or var(--bs-primary)" />
        </div>
      </div>
    `
  }
  if (prop.kind === 'number') {
    return `
      <div class="gstrap-sm-row">
        <label class="gstrap-sm-label">${prop.label}</label>
        <input type="number" min="0" max="1" step="0.05" data-prop="${prop.key}"
               value="${escapeAttr(value)}" placeholder="0.85" class="gstrap-sm-pseudo-input" />
      </div>
    `
  }
  if (prop.kind === 'select') {
    return `
      <div class="gstrap-sm-row">
        <label class="gstrap-sm-label">${prop.label}</label>
        <select data-prop="${prop.key}" class="gstrap-sm-pseudo-input">
          ${prop.options.map(o => `<option value="${o}" ${o === value ? 'selected' : ''}>${o || '—'}</option>`).join('')}
        </select>
      </div>
    `
  }
  return `
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">${prop.label}</label>
      <input type="text" data-prop="${prop.key}" value="${escapeAttr(value)}"
             placeholder="${escapeAttr(prop.placeholder || '')}" class="gstrap-sm-pseudo-input" />
    </div>
  `
}

function writeFromInputs(host, selector, pseudoState) {
  const props = {}
  // Pair colors: prefer the text input if it has a non-empty value (lets user
  // type `var(--bs-primary)`), else use the color picker.
  const seen = new Set()
  for (const el of host.querySelectorAll('[data-prop]')) {
    const key = el.dataset.prop
    if (seen.has(key)) continue
    const pair = el.dataset.pair
    if (pair) {
      const text  = host.querySelector(`[data-prop="${key}"][data-pair="text"]`)?.value.trim() || ''
      const color = host.querySelector(`[data-prop="${key}"][data-pair="color"]`)?.value || ''
      const value = text || (color && color !== '#000000' ? color : '')
      if (value) props[key] = value
      seen.add(key)
    } else {
      const v = (el.value ?? '').trim()
      if (v) props[key] = v
      seen.add(key)
    }
  }
  const css = projectState.current.globalCSS || ''
  projectState.current.globalCSS = writeRule(css, selector, pseudoState, props)
  projectState.markCssDirty()
  eventBus.emit('project:css-changed')
}

function escapeAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}
