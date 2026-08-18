/**
 * GrapeStrap — Style Manager: Cascade view sub-panel
 *
 * Lists every CSS rule that matches the selected element, grouped by source:
 *   1. inline   — element.style declarations
 *   2. project  — rules from the project's `style.css` (the <style data-grapestrap-globalcss>
 *                  tag injected into the canvas iframe in grapesjs-init.js)
 *   3. bootstrap — rules from any other stylesheet (BS5 + GrapesJS internals)
 *
 * UPDATED: 2026-08-18 (F3a jump-to-rule) — every rule now also carries the
 * ORIGIN of the sheet it came from, which is finer-grained than the three
 * display groups above: the "bootstrap" bucket holds the real Bootstrap sheet,
 * a starter's own theme.css, vendored sheets and GrapesJS internals alike, and
 * right-clicking each of those has to offer something different. The groups
 * stay as they are (they answer "who wins the cascade"); origin answers "where
 * is this rule written", and is what the context menu routes on:
 *   project   → the Custom CSS panel
 *   bootstrap → the Bootstrap panel (the app-managed sheet, identified by the
 *               data-grapestrap-bootstrap stamp so a live-preview blob href
 *               never hides it)
 *   other     → a file under site/ opens in the code lane; anything else
 *               (CDN, <style> tag) gets a disabled explainer instead of a
 *               menu item that would go nowhere.
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
import { projectState } from '../../state/project-state.js'
import { showContextMenu } from '../../dialogs/context-menu.js'
import { openSiteFile } from '../file-manager/index.js'
import { jumpToCssRule } from './css-jump.js'
import { t } from '../../i18n.js'

export const id = 'cascade'
export const labelKey = 'sm.panel.cascade'

// Hosts that already carry the delegated contextmenu listener. render() runs
// again on the SAME host whenever an open sub-panel is repainted without a
// full paint() (canvas:content-changed, assets:changed), so a listener added
// per render would stack up; a WeakSet keeps the flag off the markup and lets
// a discarded host be collected with it.
const menuWiredHosts = new WeakSet()

export function render(host, ctx) {
  const { component } = ctx
  const editor = getEditor()
  const frameDoc = editor?.Canvas?.getFrameEl()?.contentDocument
  if (!frameDoc || !component) {
    host.innerHTML = `<div class="gstrap-sm-hint">${escapeHtml(t('sm.cascade-unavailable'))}</div>`
    return
  }

  // Find the actual element in the canvas iframe corresponding to the
  // selected GrapesJS component. GrapesJS stores it as component.view.el
  // (Backbone view), or we can fall back to the cid-attributed node.
  const el = component.view?.el || frameDoc.querySelector(`[data-gjs-id="${component.cid}"]`)
  if (!el || !el.matches) {
    host.innerHTML = `<div class="gstrap-sm-hint">${escapeHtml(t('sm.cascade-not-in-dom'))}</div>`
    return
  }

  const groups = collectCascade(frameDoc, el)
  const winners = computeWinners(groups)
  const totalRules = groups.inline.length + groups.project.length + groups.bootstrap.length

  if (totalRules === 0) {
    host.innerHTML = `<div class="gstrap-sm-hint">${escapeHtml(t('sm.cascade-no-rules'))}</div>`
    return
  }

  // Group ids stay literal (they feed the data-cascade-group attribute);
  // only the visible heading goes through t().
  host.innerHTML = `
    ${renderGroup('inline',    t('sm.cascade-inline'),    groups.inline,    winners)}
    ${renderGroup('project',   t('sm.cascade-project'),   groups.project,   winners)}
    ${renderGroup('bootstrap', t('sm.cascade-bootstrap'), groups.bootstrap, winners)}
  `
  wireRuleContextMenu(host)
}

function renderGroup(groupId, label, rules, winners) {
  if (!rules.length) return ''
  return `
    <div class="gstrap-sm-cascade-group" data-cascade-group="${groupId}">
      <div class="gstrap-sm-label">${escapeHtml(label)}</div>
      ${rules.map(r => `
        <div class="gstrap-sm-cascade-rule" data-selector="${escapeHtml(r.selector)}"
             data-origin="${escapeHtml(r.origin)}"${r.href ? ` data-href="${escapeHtml(r.href)}"` : ''}>
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
    inline.push({ id: ruleId++, selector: '(inline)', props, origin: 'inline', href: null })
  }

  // 2 + 3. Stylesheets.
  for (const sheet of doc.styleSheets) {
    let rules
    try { rules = sheet.cssRules } catch { continue }
    if (!rules) continue
    const { origin, href } = sheetOrigin(sheet)

    walkRules(rules, el, hit => {
      const target = origin === 'project' ? project : bootstrap
      target.push({ id: ruleId++, selector: hit.selector, props: hit.props, origin, href })
    })
  }

  return { inline, project, bootstrap }
}

/**
 * Classify one stylesheet: where is it written, and can we get the user there?
 *
 * Bootstrap is recognised by the stamp grapesjs-init puts on whichever <link>
 * currently carries it — during a live preview that link's href is a blob:
 * URL, so keying on the href alone would lose it mid-edit. The href test is
 * only a fallback for a canvas painted before the stamp existed.
 *
 * @param {CSSStyleSheet} sheet - A sheet from the canvas document
 * @returns {{origin: 'project'|'bootstrap'|'other', href: string|null}}
 *          href is the sheet's resolved absolute URL, null for <style> tags.
 */
function sheetOrigin(sheet) {
  const sheetEl = sheet.ownerNode
  const isProject =
    sheetEl?.dataset?.grapestrapGlobalcss != null ||
    sheetEl?.id === 'gstrap-global-css' ||
    sheetEl?.getAttribute?.('data-grapestrap-globalcss') === ''
  if (isProject) return { origin: 'project', href: null }

  const href = sheet.href || null
  const isBootstrap =
    sheetEl?.hasAttribute?.('data-grapestrap-bootstrap') ||
    (typeof href === 'string' && href.split(/[?#]/)[0].endsWith('assets/css/bootstrap.css'))
  return { origin: isBootstrap ? 'bootstrap' : 'other', href }
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

// ─── Right-click a rule → go to where it is written ──────────────────────────

/**
 * Attach the delegated contextmenu handler to a cascade host, once per host.
 * @param {HTMLElement} host - The sub-panel body element
 */
function wireRuleContextMenu(host) {
  if (menuWiredHosts.has(host)) return
  menuWiredHosts.add(host)
  host.addEventListener('contextmenu', evt => {
    const row = evt.target.closest('.gstrap-sm-cascade-rule')
    if (!row) return
    const items = buildRuleMenuItems(row.dataset)
    if (!items.length) return
    evt.preventDefault()
    showContextMenu(evt.clientX, evt.clientY, items)
  })
}

/**
 * The menu for one cascade row, chosen by the rule's origin.
 *
 * Every origin yields exactly one item — enabled when we can actually go
 * somewhere, disabled-with-a-reason when we can't. An inline `style=""`
 * declaration has no rule to visit at all and yields nothing, so the row just
 * doesn't open a menu.
 *
 * @param {DOMStringMap} rowData - The row's data-selector / -origin / -href
 * @returns {Array<object>} showContextMenu items (possibly empty)
 */
function buildRuleMenuItems({ selector, origin, href }) {
  if (!selector) return []
  // An element.style declaration has no rule anywhere to visit — it is written
  // on the element the user already has selected.
  if (origin === 'inline') return []

  if (origin === 'project') {
    return [{
      label: t('ctx.goto-custom-css'),
      action: () => jumpToCssRule('custom-css', selector)
    }]
  }

  if (origin === 'bootstrap') {
    // Belt-and-braces: a vendored-framework project has no editable Bootstrap
    // buffer, so there is no panel content to jump into even though the sheet
    // looks like Bootstrap by its href.
    const editable = typeof projectState.current?.bootstrapCSS === 'string'
    return [{
      label: t('ctx.goto-bootstrap-css'),
      disabled: !editable,
      action: () => jumpToCssRule('bootstrap-css', selector)
    }]
  }

  const relPath = siteRelativePath(href, projectState.current?.projectDir)
  if (relPath) {
    return [{
      label: t('ctx.open-in-code-view', { file: relPath }),
      action: () => openSiteFile(relPath)
    }]
  }
  return [{
    label: t('ctx.rule-external', { origin: href || t('ctx.origin-inline-style') }),
    disabled: true
  }]
}

/**
 * Turn a canvas stylesheet URL into the site-relative path the code lane opens.
 *
 * The canvas <base> is `file://<projectDir>/site/`, so a sheet the project owns
 * resolves to a file: URL underneath it. Anything else — a CDN, a sheet from
 * outside the project tree — returns null and the caller shows the disabled
 * explainer instead.
 *
 * @param {string|null} href - Absolute sheet URL (CSSStyleSheet.href)
 * @param {string|undefined} projectDir - Open project's directory
 * @returns {string|null} e.g. 'assets/css/theme.css'
 */
function siteRelativePath(href, projectDir) {
  if (!href || !projectDir) return null
  let pathname
  try {
    const url = new URL(href)
    if (url.protocol !== 'file:') return null
    // Percent-decoded: a project dir with a space in it is written %20 in the
    // URL but plainly in projectDir, and the two must be comparable.
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return null   // not a parseable absolute URL — treat as external
  }
  const sitePrefix = projectDir.replace(/\/?$/, '/') + 'site/'
  if (!pathname.startsWith(sitePrefix)) return null
  return pathname.slice(sitePrefix.length) || null
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
