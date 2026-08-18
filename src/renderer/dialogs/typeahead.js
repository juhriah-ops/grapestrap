/**
 * GrapeStrap — Reusable input typeahead
 *
 * PATH: src/renderer/dialogs/typeahead.js
 * ROLE: Attaches a debounced suggestion popover to a text input. Deliberately
 *       generic — the Properties panel's add-class input is the first
 *       consumer (panels/properties-side/class-suggestions.js supplies the
 *       items), but any future free-text input with a closed-ish vocabulary
 *       (quick-tag names, snippet names) can reuse this without copy-pasting
 *       the popover plumbing.
 * DEPENDS: (none — vanilla DOM; positioning/dismiss patterns mirror
 *          dialogs/context-menu.js), styles/typeahead.css
 * CREATED: 2026-08-18
 *
 * Public API:
 *   attachTypeahead(input, { getItems, onPick, minChars, maxItems, debounceMs })
 *     → { detach() }
 *
 *   getItems(query) → Array<{value, label?, hint?}> | Promise<same>
 *   onPick(value)   → the caller commits the value; the widget only clears
 *                     its OWN popover state — it never touches input.value,
 *                     so a caller that re-renders its whole host (like the
 *                     Properties panel does per selection) stays in charge.
 *
 * Enter-key contract (the one subtle piece here): the FIRST Enter on a class
 * nobody has typed before must commit that raw text without requiring Esc
 * first. So the popover opens with NO row highlighted — arrowing in is an
 * opt-in action. Enter with a highlight does preventDefault +
 * stopImmediatePropagation and picks (pre-empting the page's own Enter-commit
 * handler on the same input, which is why this listener is capture-phase and
 * must be attached before that handler runs). Enter with the popover open but
 * NOT highlighted just closes the popover and lets the event fall through
 * untouched, so the raw-text commit still fires.
 *
 * Re-render safety: renderForElement-style callers rebuild their host's
 * innerHTML per selection, discarding the input this was attached to. No
 * long-lived registry is needed for that — removing a FOCUSED element from
 * the document fires a native blur on it, which this widget already treats
 * as a close signal (deferred one tick so a popover click's own handler can
 * still run first). The popover node lives on document.body, not inside the
 * caller's host, so it survives the host's own innerHTML replacement and
 * cleans itself up on that deferred blur regardless of what triggered it.
 */

const MIN_POPOVER_WIDTH_PX = 220
const VIEWPORT_MARGIN_PX = 4

/**
 * @param {HTMLInputElement} input - The text input to augment
 * @param {object} options
 * @param {(query: string) => (Array<{value:string,label?:string,hint?:string}>|Promise<Array<object>>)} options.getItems
 * @param {(value: string) => void} options.onPick
 * @param {number} [options.minChars=1] - Query length that opens the popover
 * @param {number} [options.maxItems=12] - Rows rendered, whatever getItems returns
 * @param {number} [options.debounceMs=80] - Delay between a keystroke and the getItems call
 * @returns {{detach: () => void}}
 */
export function attachTypeahead(input, {
  getItems,
  onPick,
  minChars = 1,
  maxItems = 12,
  debounceMs = 80
} = {}) {
  if (!input || typeof getItems !== 'function' || typeof onPick !== 'function') {
    // A wiring mistake, not a runtime condition worth throwing over — a
    // no-op detach keeps the `{ detach }` contract intact for a caller that
    // doesn't optional-chain the return value.
    return { detach() {} }
  }

  let popover = null
  let items = []
  let activeIndex = -1
  let requestToken = 0
  let debounceTimer = null
  let blurTimer = null
  let detached = false

  function closePopover() {
    if (blurTimer) { clearTimeout(blurTimer); blurTimer = null }
    if (!popover) return
    popover.remove()
    popover = null
    items = []
    activeIndex = -1
  }

  function renderPopover() {
    if (!popover) {
      popover = document.createElement('div')
      popover.className = 'gstrap-typeahead'
      document.body.appendChild(popover)
    }
    popover.innerHTML = items.map((item, idx) => `
      <div class="gstrap-typeahead-item${idx === activeIndex ? ' is-active' : ''}" data-idx="${idx}">
        <span class="gstrap-typeahead-value">${escHtml(item.label || item.value)}</span>
        ${item.hint ? `<span class="gstrap-typeahead-hint">${escHtml(item.hint)}</span>` : ''}
      </div>
    `).join('')
    wireRowEvents()
    positionPopover()
  }

  function wireRowEvents() {
    if (!popover) return
    // The click's own mousedown would otherwise steal focus from `input`
    // before the click handler runs — and the resulting blur would tear the
    // popover down out from under its own click. preventDefault on
    // pointerdown keeps focus on the input for the whole gesture.
    popover.addEventListener('pointerdown', evt => evt.preventDefault())
    popover.querySelectorAll('.gstrap-typeahead-item').forEach(row => {
      const idx = Number(row.dataset.idx)
      row.addEventListener('mousemove', () => setActive(idx))
      row.addEventListener('click', () => pick(idx))
    })
  }

  function positionPopover() {
    if (!popover) return
    const inputRect = input.getBoundingClientRect()
    const width = Math.max(inputRect.width, MIN_POPOVER_WIDTH_PX)
    popover.style.width = `${width}px`

    const vw = window.innerWidth
    let left = inputRect.left
    if (left + width > vw - VIEWPORT_MARGIN_PX) left = Math.max(VIEWPORT_MARGIN_PX, vw - width - VIEWPORT_MARGIN_PX)
    popover.style.left = `${left}px`

    // Measured AFTER width/left land and the rows are in the DOM, so the
    // flip-above decision uses the popover's real rendered height (same
    // "measure then clamp" order context-menu.js uses).
    const vh = window.innerHeight
    const popRect = popover.getBoundingClientRect()
    let top = inputRect.bottom + 2
    if (top + popRect.height > vh - VIEWPORT_MARGIN_PX) {
      const above = inputRect.top - popRect.height - 2
      top = above >= VIEWPORT_MARGIN_PX ? above : VIEWPORT_MARGIN_PX
    }
    popover.style.top = `${top}px`
  }

  function setActive(idx) {
    if (!popover) return
    activeIndex = idx
    popover.querySelectorAll('.gstrap-typeahead-item').forEach(row => {
      row.classList.toggle('is-active', Number(row.dataset.idx) === activeIndex)
    })
    popover.querySelector('.gstrap-typeahead-item.is-active')?.scrollIntoView({ block: 'nearest' })
  }

  /** Wrapping ArrowUp/Down move. Direction is +1 or -1. */
  function moveActive(direction) {
    if (!items.length) return
    const next = activeIndex < 0
      ? (direction === 1 ? 0 : items.length - 1)
      : (activeIndex + direction + items.length) % items.length
    setActive(next)
  }

  function pick(idx) {
    const item = items[idx]
    closePopover()
    if (item) onPick(item.value)
  }

  /**
   * Fetch + render for the input's current value.
   * @param {number} [initialDirection] - When set (opening via an arrow key
   *        on a closed popover), highlight the first (1) or last (-1) row
   *        as soon as results land, instead of leaving nothing highlighted.
   */
  async function open(initialDirection = 0) {
    const query = input.value
    if (query.length < minChars) { closePopover(); return }

    const token = ++requestToken
    let result
    try {
      result = await getItems(query)
    } catch (err) {
      console.error('typeahead getItems failed', err)
      result = []
    }
    // A newer keystroke fired another request while this one was in flight —
    // the stale response must not clobber a fresher (or since-closed) state.
    if (token !== requestToken || detached) return

    items = (result || []).slice(0, maxItems)
    if (items.length === 0) { closePopover(); return }
    activeIndex = -1
    renderPopover()
    if (initialDirection) moveActive(initialDirection)
  }

  function scheduleOpen() {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => open(), debounceMs)
  }

  function onInput() {
    scheduleOpen()
  }

  function onFocus() {
    if (input.value.length >= minChars) scheduleOpen()
  }

  function onBlur() {
    // Deferred one tick: a popover row's click sequence is
    // pointerdown(prevented) → blur(none, focus never left) in the normal
    // case, but if focus ever does leave (a re-render tearing the input out
    // from under an open popover), the deferred close still lets any
    // already-queued click handler run before the popover disappears.
    blurTimer = setTimeout(closePopover, 0)
  }

  // Capture phase so this preempts the caller's own bubble-phase Enter
  // commit handler on the same input.
  function onKeyDown(evt) {
    if (!popover) {
      if (evt.key === 'ArrowDown' || evt.key === 'ArrowUp') {
        evt.preventDefault()
        open(evt.key === 'ArrowDown' ? 1 : -1)
      }
      return
    }
    if (evt.key === 'ArrowDown') { evt.preventDefault(); moveActive(1); return }
    if (evt.key === 'ArrowUp') { evt.preventDefault(); moveActive(-1); return }
    if (evt.key === 'Enter') {
      if (activeIndex >= 0) {
        evt.preventDefault()
        evt.stopImmediatePropagation()
        pick(activeIndex)
      } else {
        // No highlight: close and let the SAME Enter event continue to the
        // caller's raw-text commit handler — a first-time custom class must
        // never require Esc before it can be committed.
        closePopover()
      }
      return
    }
    if (evt.key === 'Tab' && activeIndex >= 0) {
      evt.preventDefault()
      pick(activeIndex)
      return
    }
    if (evt.key === 'Escape') {
      // Don't let Esc also dismiss whatever else might be listening for it
      // (a panel, a modal) while the popover was the thing actually open.
      evt.stopPropagation()
      closePopover()
    }
  }

  input.addEventListener('input', onInput)
  input.addEventListener('focus', onFocus)
  input.addEventListener('blur', onBlur)
  input.addEventListener('keydown', onKeyDown, true)

  return {
    detach() {
      detached = true
      clearTimeout(debounceTimer)
      clearTimeout(blurTimer)
      input.removeEventListener('input', onInput)
      input.removeEventListener('focus', onFocus)
      input.removeEventListener('blur', onBlur)
      input.removeEventListener('keydown', onKeyDown, true)
      closePopover()
    }
  }
}

function escHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}
