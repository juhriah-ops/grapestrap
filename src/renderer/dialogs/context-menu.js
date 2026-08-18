/**
 * GrapeStrap — Context menu
 *
 * Floating menu shown at a viewport coordinate, dismissed on outside-click,
 * Esc, or item activation. Used by the canvas iframe and DOM tree right-click
 * handlers; intentionally generic so toolbars, the file manager etc. can reuse
 * it later.
 *
 * Public API:
 *   showContextMenu(x, y, items[]) → Promise<unknown> (resolves with the item
 *   action's return value, or undefined if dismissed)
 *
 *   item shape: { label, accelerator?, action(), disabled?, danger?, separator? }
 *
 * Why we re-position when the menu would overflow the viewport: at the right
 * or bottom edge, opening at the click point would show the menu off-screen.
 * We snap left/up so the menu is always fully visible. (Native Electron menus
 * do the same thing.)
 *
 * Keyboard nav: ↑↓ moves focus between non-disabled items, Enter activates,
 * Esc dismisses. Arrow nav skips separators and disabled items.
 *
 * UPDATED: 2026-08-18 — two focus/teardown bugs that made a SECOND menu
 * impossible to open (found by tests/e2e/cascade-jump.spec.js, which
 * right-clicks a Cascade row, jumps into Monaco, then right-clicks another):
 *
 *   1. The window `blur` listener was registered in CAPTURE phase, so it also
 *      heard the blur of every element inside the window — including the one
 *      the menu's own `first.focus()` had just stolen focus from. Opening a
 *      menu while Monaco (or a previous menu item) held focus dismissed it in
 *      the same tick it appeared. It is now a non-capturing listener with an
 *      explicit `target === window` check, which is the intent: dismiss when
 *      the APPLICATION WINDOW loses focus.
 *   2. dismiss() detached the overlay BEFORE unhooking its listeners, and
 *      detaching a node that holds focus fires blur synchronously — so
 *      dismiss() re-entered itself and the outer call then threw
 *      NotFoundError from removeChild ("the node to be removed is no longer a
 *      child of this node"), out through showContextMenu() before the
 *      replacement menu was ever built. It now unhooks first, detaches with
 *      Element.remove() (a no-op on an already-detached node), and guards
 *      against re-entry.
 */

let activeMenu = null

export function showContextMenu(x, y, items) {
  if (activeMenu) activeMenu.dismiss(undefined)

  const host = document.getElementById('gstrap-modals')
  if (!host) return Promise.resolve(undefined)

  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.className = 'gstrap-ctxmenu-overlay'
    overlay.tabIndex = -1

    const menu = document.createElement('ul')
    menu.className = 'gstrap-ctxmenu'
    menu.setAttribute('role', 'menu')

    items.forEach((item, idx) => {
      if (item.separator) {
        menu.appendChild(Object.assign(document.createElement('li'), {
          className: 'gstrap-ctxmenu-sep'
        }))
        return
      }
      const li = document.createElement('li')
      li.className = 'gstrap-ctxmenu-item'
      if (item.disabled) li.classList.add('is-disabled')
      if (item.danger) li.classList.add('is-danger')
      li.dataset.idx = String(idx)
      li.tabIndex = item.disabled ? -1 : 0
      li.setAttribute('role', 'menuitem')
      li.innerHTML = `
        <span class="gstrap-ctxmenu-label">${escHtml(item.label)}</span>
        ${item.accelerator ? `<span class="gstrap-ctxmenu-accel">${escHtml(item.accelerator)}</span>` : ''}
      `
      li.addEventListener('click', evt => {
        evt.stopPropagation()
        if (item.disabled) return
        activate(idx)
      })
      menu.appendChild(li)
    })

    overlay.appendChild(menu)
    host.appendChild(overlay)

    // Position. Measure first, then nudge so we don't overflow the viewport.
    const rect = menu.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = x, top = y
    if (left + rect.width  > vw - 4) left = Math.max(4, vw - rect.width  - 4)
    if (top  + rect.height > vh - 4) top  = Math.max(4, vh - rect.height - 4)
    menu.style.left = `${left}px`
    menu.style.top  = `${top}px`

    let dismissed = false
    function dismiss(value) {
      // Re-entry guard: detaching the overlay blurs whichever item had focus,
      // and any listener reacting to that blur can land back in here mid-call.
      if (dismissed) return
      dismissed = true
      // Unhook BEFORE detaching, so the blur the detach fires reaches nothing.
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onOutside, true)
      window.removeEventListener('blur', onBlur)
      overlay.remove()
      // Only clear the shared handle if it still points at THIS menu — a
      // stale dismiss must never orphan the menu that replaced it.
      if (activeMenu === handle) activeMenu = null
      resolve(value)
    }
    function activate(idx) {
      const item = items[idx]
      if (!item || item.disabled || item.separator) return
      let result
      try { result = item.action?.() } catch (err) { console.error('ctxmenu action threw', err) }
      Promise.resolve(result).then(v => dismiss(v))
    }

    function onKey(evt) {
      if (evt.key === 'Escape') { evt.preventDefault(); dismiss(undefined); return }
      if (evt.key === 'Enter') {
        evt.preventDefault()
        const focused = document.activeElement
        if (focused?.dataset?.idx !== undefined) activate(Number(focused.dataset.idx))
        return
      }
      if (evt.key === 'ArrowDown' || evt.key === 'ArrowUp') {
        evt.preventDefault()
        moveFocus(evt.key === 'ArrowDown' ? 1 : -1)
      }
    }
    function moveFocus(direction) {
      const enabled = [...menu.querySelectorAll('.gstrap-ctxmenu-item:not(.is-disabled)')]
      if (!enabled.length) return
      const cur = enabled.indexOf(document.activeElement)
      const next = cur < 0
        ? (direction === 1 ? 0 : enabled.length - 1)
        : (cur + direction + enabled.length) % enabled.length
      enabled[next].focus()
    }
    function onOutside(evt) {
      if (!menu.contains(evt.target)) {
        evt.preventDefault()
        dismiss(undefined)
      }
    }
    // The APP WINDOW losing focus, not an element inside it losing focus:
    // element blur events don't bubble, so a non-capturing window listener
    // hears only the window's own — and the target check keeps that true if
    // someone re-adds capture later.
    function onBlur(evt) {
      if (evt.target !== window) return
      dismiss(undefined)
    }

    // Published before the listeners go on: dismiss() reads it, and any of
    // them can fire the moment they are registered.
    const handle = { dismiss }
    activeMenu = handle

    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onOutside, true)
    window.addEventListener('blur', onBlur)

    // Focus the first enabled item so keyboard nav works without a click.
    const first = menu.querySelector('.gstrap-ctxmenu-item:not(.is-disabled)')
    first?.focus()
  })
}

function escHtml(s) {
  return String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}
