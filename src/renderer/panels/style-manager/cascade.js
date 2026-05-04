/**
 * GrapeStrap — Style Manager: Cascade view sub-panel
 *
 * Lists every CSS rule that matches the selected element, grouped by source:
 *   1. inline   — element.style declarations
 *   2. project  — rules from the project's `style.css` (the <style data-grapestrap-globalcss>
 *                  tag injected into the canvas iframe in grapesjs-init.js)
 *   3. bootstrap — rules from any other stylesheet (BS5 + GrapesJS internals)
 *
 * Implementation is deliberately lightweight:
 *   - walks `iframeDocument.styleSheets`, calling `.matches(selector)` on the
 *     selected element for each rule's selectorText
 *   - for grouped selectors (`.btn, .btn-primary`), splits on commas and tests
 *     each piece individually
 *   - skips at-rules whose conditions don't apply (we test through `.cssRules`
 *     and recurse one level into media queries — deeper nesting is unusual in
 *     BS5 and would require a CSSStyleSheet specificity walker)
 *
 * Override hints: properties that appear in multiple rules are flagged. The
 * "winning" value is whichever rule appears last in document order on the
 * highest-specificity rule — for the lightweight version we just rank by:
 *   inline > project > bootstrap (within group, last-wins)
 * which matches CSS cascade ordering for same-specificity rules. Real
 * specificity weighing is a v0.0.3 enhancement.
 */

import { getEditor } from '../../editor/grapesjs-init.js'

export const id = 'cascade'
export const label = 'Cascade'

export function render(host, ctx) {
  const { component } = ctx
  const editor = getEditor()
  const frameDoc = editor?.Canvas?.getFrameEl()?.contentDocument
  if (!frameDoc || !component) {
    host.innerHTML = `<div class="gstrap-sm-hint">Cascade unavailable — canvas not ready.</div>`
    return
  }

  // Find the actual element in the canvas iframe corresponding to the
  // selected GrapesJS component. GrapesJS stores it as component.view.el
  // (Backbone view), or we can fall back to the cid-attributed node.
  const el = component.view?.el || frameDoc.querySelector(`[data-gjs-id="${component.cid}"]`)
  if (!el || !el.matches) {
    host.innerHTML = `<div class="gstrap-sm-hint">Selected element not yet in canvas DOM.</div>`
    return
  }

  const groups = collectCascade(frameDoc, el)
  const winners = computeWinners(groups)
  const totalRules = groups.inline.length + groups.project.length + groups.bootstrap.length

  if (totalRules === 0) {
    host.innerHTML = `<div class="gstrap-sm-hint">No CSS rules match this element.</div>`
    return
  }

  host.innerHTML = `
    ${renderGroup('Inline',    groups.inline,    winners)}
    ${renderGroup('Project',   groups.project,   winners)}
    ${renderGroup('Bootstrap', groups.bootstrap, winners)}
  `
}

function renderGroup(label, rules, winners) {
  if (!rules.length) return ''
  return `
    <div class="gstrap-sm-cascade-group" data-cascade-group="${label.toLowerCase()}">
      <div class="gstrap-sm-label">${label}</div>
      ${rules.map(r => `
        <div class="gstrap-sm-cascade-rule">
          <div class="gstrap-sm-cascade-selector">${escapeHtml(r.selector)}</div>
          ${Object.entries(r.props).map(([k, v]) => {
            const overridden = winners[k] && winners[k].id !== r.id
            return `<div class="gstrap-sm-cascade-decl ${overridden ? 'is-overridden' : ''}">
              <span class="gstrap-sm-cascade-prop">${escapeHtml(k)}</span>:
              <span class="gstrap-sm-cascade-val">${escapeHtml(v)}</span>
            </div>`
          }).join('')}
        </div>
      `).join('')}
    </div>
  `
}

/**
 * Walk all stylesheets in the canvas iframe document and collect rules that
 * apply to `el`, grouped by origin.
 *
 * Cross-origin stylesheets throw on `.cssRules` access — we wrap the read in
 * try/catch and skip silently. (BS5 served locally by the project shouldn't
 * trip this, but plugins occasionally pull from CDNs.)
 */
function collectCascade(doc, el) {
  const inline = []
  const project = []
  const bootstrap = []
  let ruleId = 0

  // 1. Inline (element.style).
  if (el.style && el.style.length) {
    const props = {}
    for (let i = 0; i < el.style.length; i++) {
      const k = el.style[i]
      props[k] = el.style.getPropertyValue(k)
    }
    inline.push({ id: ruleId++, selector: '(inline)', props })
  }

  // 2 + 3. Stylesheets.
  for (const sheet of doc.styleSheets) {
    let rules
    try { rules = sheet.cssRules } catch { continue }
    if (!rules) continue
    const sheetEl = sheet.ownerNode
    const isProject =
      sheetEl?.dataset?.grapestrapGlobalcss != null ||
      sheetEl?.id === 'gstrap-global-css' ||
      sheetEl?.getAttribute?.('data-grapestrap-globalcss') === ''

    walkRules(rules, el, hit => {
      const target = isProject ? project : bootstrap
      target.push({ id: ruleId++, selector: hit.selector, props: hit.props })
    })
  }

  return { inline, project, bootstrap }
}

function walkRules(rules, el, emit, depth = 0) {
  if (depth > 3) return  // be paranoid about pathological nesting
  for (const rule of rules) {
    if (rule.type === 1 /* STYLE_RULE */) {
      const text = rule.selectorText || ''
      // Grouped selectors — split + test each so we report which sub-selector matched.
      const parts = splitSelectors(text)
      for (const part of parts) {
        let matches = false
        try { matches = el.matches(part) } catch { continue }
        if (matches) {
          const props = {}
          for (let i = 0; i < rule.style.length; i++) {
            const k = rule.style[i]
            props[k] = rule.style.getPropertyValue(k)
          }
          if (Object.keys(props).length) emit({ selector: part, props })
        }
      }
    } else if (rule.type === 4 /* MEDIA_RULE */) {
      // Recurse into matching media queries.
      try {
        if (rule.media && window.matchMedia(rule.media.mediaText).matches) {
          walkRules(rule.cssRules, el, emit, depth + 1)
        }
      } catch { /* noop */ }
    } else if (rule.type === 12 /* SUPPORTS_RULE */) {
      try {
        if (CSS.supports(rule.conditionText)) {
          walkRules(rule.cssRules, el, emit, depth + 1)
        }
      } catch { /* noop */ }
    }
  }
}

// Split a selector list on commas, respecting parens and brackets so
// `:is(.a, .b)` stays intact.
function splitSelectors(text) {
  const out = []
  let depth = 0
  let buf = ''
  for (const ch of text) {
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    if (ch === ',' && depth === 0) {
      out.push(buf.trim())
      buf = ''
      continue
    }
    buf += ch
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

/**
 * For each property, find the "winning" rule. Without a real specificity
 * computation we use document-order precedence within a tier, with tier
 * priority inline > project > bootstrap. This matches the user's expectation
 * for ~95% of BS-only stylesheets.
 */
function computeWinners(groups) {
  const winners = {}
  // Walk in reverse priority, last write wins.
  for (const tier of [groups.bootstrap, groups.project, groups.inline]) {
    for (const rule of tier) {
      for (const k of Object.keys(rule.props)) {
        winners[k] = rule
      }
    }
  }
  return winners
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
