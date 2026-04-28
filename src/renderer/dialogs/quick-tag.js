/**
 * GrapeStrap — Quick Tag dialog
 *
 * Dreamweaver-faithful Ctrl+T / Ctrl+Shift+W: a small floating input that
 * shows the selected element as `<tag attr="…">` text. On Enter, parse and
 * apply. Esc / backdrop dismiss without changes.
 *
 * Two modes:
 *   - 'edit'  → replace selected component's tag + attrs (preserve children)
 *   - 'wrap'  → wrap selected component's full outer HTML in a new element
 *
 * Returns a Promise<{tag, attrs} | null>. Resolves null on cancel.
 *
 * Why a single text input vs. a structured form: the text form is faster for
 * the keyboard-driven Dreamweaver muscle memory the panel exists to honor.
 * Structured editing of attributes already lives in the Properties panel.
 */

let activeDialog = null

export function showQuickTagDialog({ initialText, mode = 'edit', anchor = null } = {}) {
  if (activeDialog) {
    activeDialog.dismiss(null)
  }

  const host = document.getElementById('gstrap-modals')
  if (!host) return Promise.resolve(null)

  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.className = 'gstrap-quick-tag-overlay'
    overlay.innerHTML = `
      <div class="gstrap-quick-tag-card" data-mode="${mode}">
        <div class="gstrap-quick-tag-mode">${mode === 'wrap' ? 'Wrap with Tag' : 'Quick Tag Editor'}</div>
        <input class="gstrap-quick-tag-input" type="text"
               spellcheck="false" autocomplete="off"
               value="${escAttr(initialText)}">
        <div class="gstrap-quick-tag-hint">Enter to apply · Esc to cancel</div>
      </div>
    `
    host.appendChild(overlay)

    const input = overlay.querySelector('.gstrap-quick-tag-input')
    input.focus()
    // Place the cursor inside the tag, not at the end, so the user can
    // immediately type to override.
    const angle = input.value.indexOf('<')
    if (angle >= 0) input.setSelectionRange(angle + 1, input.value.length - 1)

    function dismiss(value) {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay)
      activeDialog = null
      resolve(value)
    }

    overlay.addEventListener('click', evt => {
      if (evt.target === overlay) dismiss(null)
    })
    input.addEventListener('keydown', evt => {
      if (evt.key === 'Escape') { evt.preventDefault(); dismiss(null) }
      else if (evt.key === 'Enter') {
        evt.preventDefault()
        try { dismiss(parseQuickTag(input.value)) }
        catch (err) { flashError(input, err.message) }
      }
    })

    activeDialog = { dismiss }
    void anchor // reserved for v0.0.2 polish (anchor near element on canvas)
  })
}

/**
 * Parses `<tagname attr1="val" attr2='v' attr3 …>` into `{ tag, attrs }`.
 * Self-closing slash is tolerated. Returns lowercased tag.
 */
export function parseQuickTag(text) {
  let s = String(text || '').trim()
  if (!s) throw new Error('Empty tag')
  s = s.replace(/^</, '').replace(/\/?\s*>?$/, '').trim()

  const tagMatch = s.match(/^([a-zA-Z][a-zA-Z0-9-]*)/)
  if (!tagMatch) throw new Error('Tag name expected')
  const tag = tagMatch[1].toLowerCase()
  const rest = s.slice(tag.length).trim()

  const attrs = {}
  // Each attribute: name, optional = value where value is "..." or '...' or bare.
  const re = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g
  let m
  while ((m = re.exec(rest))) {
    const name = m[1]
    const value = m[3] !== undefined ? m[3]
                : m[4] !== undefined ? m[4]
                : m[5] !== undefined ? m[5]
                : ''
    attrs[name] = value
  }
  return { tag, attrs }
}

/**
 * Builds the current `<tag attr="...">` string for a GrapesJS component.
 * Quotes attribute values, escapes embedded quotes.
 */
export function formatComponentAsQuickTag(component) {
  const tag = (component.get?.('tagName') || 'div').toLowerCase()
  const attrs = component.getAttributes?.() || {}
  const classes = component.getClasses?.() || []
  const flatClasses = classes
    .map(c => typeof c === 'string' ? c : (c?.get?.('name') || ''))
    .filter(Boolean)
  const merged = { ...attrs }
  if (flatClasses.length) merged.class = flatClasses.join(' ')

  const parts = [tag]
  for (const [k, v] of Object.entries(merged)) {
    if (v === '' || v === true) parts.push(k)
    else parts.push(`${k}="${escAttr(String(v))}"`)
  }
  return `<${parts.join(' ')}>`
}

function flashError(input, message) {
  input.classList.add('is-error')
  input.title = message
  setTimeout(() => input.classList.remove('is-error'), 600)
}

function escAttr(s) {
  return String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}
