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
import { openColorPicker } from '../color-picker/index.js'
import { t } from '../../i18n.js'
import { codeMarkup } from '../../i18n-html.js'

export const id = 'pseudo'
export const labelKey = 'sm.panel.pseudo'

// Properties exposed in the editor. `kind` controls input type:
//   color → color input + free-text fallback
//   text  → free-text (e.g. transform, box-shadow)
//   number → 0–1 step 0.05 (opacity)
const PROPS = [
  { key: 'background-color', labelKey: 'sm.prop.background',      kind: 'color' },
  { key: 'color',            labelKey: 'sm.prop.text-color',     kind: 'color' },
  { key: 'border-color',     labelKey: 'sm.prop.border-color',   kind: 'color' },
  { key: 'opacity',          labelKey: 'sm.prop.opacity',        kind: 'number' },
  { key: 'cursor',           labelKey: 'sm.prop.cursor',         kind: 'select',
    options: ['', 'pointer', 'default', 'not-allowed', 'wait', 'text', 'move', 'help'] },
  { key: 'transform',        labelKey: 'sm.prop.transform',      kind: 'text',
    placeholder: 'scale(1.05)' },
  { key: 'box-shadow',       labelKey: 'sm.prop.box-shadow',     kind: 'text',
    placeholder: '0 0 0 .25rem rgba(13,110,253,.25)' },
  { key: 'text-decoration',  labelKey: 'sm.prop.text-decoration', kind: 'select',
    options: ['', 'none', 'underline', 'line-through'] }
]

export function render(host, ctx) {
  const { component, pseudoState, requestRender, onClearPseudoState } = ctx

  if (pseudoState === 'normal' || !pseudoState) {
    host.innerHTML = `
      <div class="gstrap-sm-hint">
        ${codeMarkup(t('sm.pseudo-hint'))}
      </div>
    `
    return
  }

  if (!projectState.current) {
    host.innerHTML = `
      <div class="gstrap-sm-hint">
        ${codeMarkup(t('sm.pseudo-needs-project-hint'))}
      </div>
    `
    return
  }

  const selector = pickSelector(component, isBsUtility)
  if (!selector) {
    host.innerHTML = `
      <div class="gstrap-sm-hint">
        ${codeMarkup(t('sm.pseudo-needs-selector-hint', { state: pseudoState }))}
        <button class="gstrap-sm-pill" data-revert>${codeMarkup(t('sm.back-to-normal'))}</button>
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
      ${codeMarkup(t('sm.pseudo-editing', { selector, state: pseudoState }))}
      <button class="gstrap-sm-pill gstrap-sm-clear" data-clear-rule>${codeMarkup(t('action.clear'))}</button>
    </div>
    ${PROPS.map(p => renderRow(p, rule[p.key] || '')).join('')}
  `

  host.querySelectorAll('[data-prop]').forEach(input => {
    input.addEventListener('input', () => writeFromInputs(host, selector, pseudoState))
    input.addEventListener('change', () => writeFromInputs(host, selector, pseudoState))
  })

  // Wire color triggers to open the picker. The trigger button is per-row;
  // it shows the live color via --cp-color, and clicking opens the popover
  // anchored to it. Picker writes back into the paired text input so
  // writeFromInputs sees the new value.
  host.querySelectorAll('[data-cp-trigger]').forEach(btn => {
    syncTriggerColor(btn, host)
    btn.addEventListener('click', () => {
      const key = btn.dataset.cpTrigger
      const textInput = host.querySelector(`input[data-prop="${key}"][data-pair="text"]`)
      const current   = textInput?.value || ''
      openColorPicker({
        anchor: btn,
        value: current,
        onChange: next => {
          if (textInput) {
            textInput.value = next
            textInput.dispatchEvent(new Event('input', { bubbles: true }))
          }
          syncTriggerColor(btn, host)
        }
      })
    })
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
    return `
      <div class="gstrap-sm-row">
        <label class="gstrap-sm-label">${codeMarkup(t(prop.labelKey))}</label>
        <div class="gstrap-sm-pseudo-pair">
          <button type="button" class="gstrap-cp-trigger" data-cp-trigger="${prop.key}"
                  aria-label="${escapeAttr(t('sm.pick-aria', { label: t(prop.labelKey) }))}"></button>
          <input type="text"  data-prop="${prop.key}" data-pair="text"
                 value="${escapeAttr(value)}" placeholder="#0d6efd or var(--bs-primary)" />
        </div>
      </div>
    `
  }
  if (prop.kind === 'number') {
    return `
      <div class="gstrap-sm-row">
        <label class="gstrap-sm-label">${codeMarkup(t(prop.labelKey))}</label>
        <input type="number" min="0" max="1" step="0.05" data-prop="${prop.key}"
               value="${escapeAttr(value)}" placeholder="0.85" class="gstrap-sm-pseudo-input" />
      </div>
    `
  }
  if (prop.kind === 'select') {
    return `
      <div class="gstrap-sm-row">
        <label class="gstrap-sm-label">${codeMarkup(t(prop.labelKey))}</label>
        <select data-prop="${prop.key}" class="gstrap-sm-pseudo-input">
          ${prop.options.map(o => `<option value="${o}" ${o === value ? 'selected' : ''}>${o || '—'}</option>`).join('')}
        </select>
      </div>
    `
  }
  return `
    <div class="gstrap-sm-row">
      <label class="gstrap-sm-label">${codeMarkup(t(prop.labelKey))}</label>
      <input type="text" data-prop="${prop.key}" value="${escapeAttr(value)}"
             placeholder="${escapeAttr(prop.placeholder || '')}" class="gstrap-sm-pseudo-input" />
    </div>
  `
}

function writeFromInputs(host, selector, pseudoState) {
  const props = {}
  const seen = new Set()
  for (const el of host.querySelectorAll('[data-prop]')) {
    const key = el.dataset.prop
    if (seen.has(key)) continue
    const v = (el.value ?? '').trim()
    if (v) props[key] = v
    seen.add(key)
  }
  const css = projectState.current.globalCSS || ''
  projectState.current.globalCSS = writeRule(css, selector, pseudoState, props)
  projectState.markCssDirty()
  eventBus.emit('project:css-changed')
}

function syncTriggerColor(btn, host) {
  const key = btn.dataset.cpTrigger
  const input = host.querySelector(`input[data-prop="${key}"][data-pair="text"]`)
  const value = input?.value || ''
  btn.style.setProperty('--cp-color', value || 'transparent')
}

function escapeAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}
