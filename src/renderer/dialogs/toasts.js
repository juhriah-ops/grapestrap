/**
 * GrapeStrap — Toast renderer
 *
 * The eventBus 'toast' event has been emitted from a dozen places since
 * v0.0.1 (cmdSave's "Saved." success, "Open a project first." warnings,
 * the menu-router's catch-all for thrown commands, etc.) but nothing was
 * listening — so save reported success silently, and silent-failure
 * warnings actually were silent. Reported on nola1 2026-05-03: "no
 * indication of save but its saving."
 *
 * Single subscriber: build a toast card in #gstrap-toasts (already in
 * index.html, already positioned by shell.css), auto-dismiss after a
 * type-dependent timeout, allow click-to-dismiss. No queue cap — toast
 * volume is low and stacking visually communicates "lots is happening."
 *
 * No external dep, ~70 lines, exits the v0.0.1 walking-skeleton list.
 */

import { eventBus } from '../state/event-bus.js'

const TIMEOUTS = {
  success: 1800,
  info:    2400,
  warning: 4000,
  error:   6500
}

let host = null

export function wireToasts() {
  host = document.getElementById('gstrap-toasts')
  if (!host) return
  eventBus.on('toast', payload => show(payload))
}

function show(payload) {
  if (!host) return
  const type = payload?.type || 'info'
  const message = String(payload?.message ?? '')
  if (!message) return

  const card = document.createElement('div')
  card.className = `gstrap-toast gstrap-toast-${type}`
  card.setAttribute('role', type === 'error' ? 'alert' : 'status')
  card.innerHTML = `
    <span class="gstrap-toast-icon" aria-hidden="true">${iconFor(type)}</span>
    <span class="gstrap-toast-msg"></span>
    <button class="gstrap-toast-x" aria-label="Dismiss">×</button>
  `
  card.querySelector('.gstrap-toast-msg').textContent = message
  host.appendChild(card)

  const dismiss = () => {
    if (!card.isConnected) return
    card.classList.add('is-leaving')
    setTimeout(() => card.remove(), 180)
  }
  card.querySelector('.gstrap-toast-x').addEventListener('click', dismiss)
  card.addEventListener('click', evt => {
    // Click anywhere on the card dismisses. Don't double-fire if the user
    // clicked the explicit X.
    if (evt.target.closest('.gstrap-toast-x')) return
    dismiss()
  })

  const ttl = TIMEOUTS[type] ?? TIMEOUTS.info
  setTimeout(dismiss, ttl)
}

function iconFor(type) {
  switch (type) {
    case 'success': return '✓'
    case 'warning': return '!'
    case 'error':   return '✕'
    default:        return 'i'
  }
}
