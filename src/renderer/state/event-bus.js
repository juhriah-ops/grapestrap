/**
 * GrapeStrap — Renderer-side event bus
 *
 * Tiny EventTarget-style emitter. No framework, no Redux. ~50 lines.
 * Handlers receive a single payload argument; emit() always passes one even if
 * undefined, simplifying consumer code.
 *
 * Naming convention: namespace:event (e.g., "project:opened", "tab:closed").
 * Plugins are encouraged to namespace their events under their plugin name.
 */

class EventBus {
  constructor() {
    this.handlers = new Map()
  }

  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set())
    this.handlers.get(event).add(handler)
    return () => this.off(event, handler)
  }

  off(event, handler) {
    this.handlers.get(event)?.delete(handler)
  }

  emit(event, payload) {
    const set = this.handlers.get(event)
    if (!set) return
    for (const handler of set) {
      try { handler(payload) }
      catch (err) {
        // eslint-disable-next-line no-console
        console.error(`event handler for "${event}" threw:`, err)
      }
    }
  }

  once(event, handler) {
    const wrapper = (payload) => {
      this.off(event, wrapper)
      handler(payload)
    }
    return this.on(event, wrapper)
  }

  listenerCount(event) {
    return this.handlers.get(event)?.size || 0
  }
}

export const eventBus = new EventBus()
