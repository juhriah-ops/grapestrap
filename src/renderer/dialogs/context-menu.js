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

    function dismiss(value) {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onOutside, true)
      window.removeEventListener('blur', onBlur, true)
      activeMenu = null
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
    function onBlur() { dismiss(undefined) }

    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onOutside, true)
    window.addEventListener('blur', onBlur, true)

    // Focus the first enabled item so keyboard nav works without a click.
    const first = menu.querySelector('.gstrap-ctxmenu-item:not(.is-disabled)')
    first?.focus()

    activeMenu = { dismiss }
  })
}

function escHtml(s) {
  return String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}
