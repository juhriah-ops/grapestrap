/**
 * GrapeStrap — Per-tab page state
 *
 * Each open tab holds:
 *   - kind: 'page' | 'library'   (v0.0.2: library items open as tabs alongside pages)
 *   - pageName: unique tab key (page name for kind='page', library item id for kind='library')
 *   - viewMode: 'design' | 'code' | 'split'
 *   - device: 'Desktop' | 'Tablet' | 'Mobile'
 *   - selectedElement: GrapesJS component ref (null if nothing selected)
 *   - monacoState: { html: { value, scroll, cursor }, css: { ... } }
 *
 * Switching tabs preserves all of this so the user returns to exactly where
 * they were. Closing a tab discards its tab state.
 */

import { eventBus } from './event-bus.js'

class PageStateManager {
  constructor() {
    this.tabs = []           // [{ pageName, viewMode, device, selectedElement, monacoState, dirty }]
    this.activeIndex = -1
  }

  open(pageName, opts = {}) {
    const existing = this.tabs.findIndex(t => t.pageName === pageName)
    if (existing >= 0) {
      this.activeIndex = existing
      eventBus.emit('tab:focused', this.tabs[existing])
      return this.tabs[existing]
    }
    const tab = {
      kind: opts.kind || 'page',
      pageName,
      label: opts.label || pageName,
      viewMode: opts.viewMode || 'design',
      device: opts.device || 'Desktop',
      selectedElement: null,
      monacoState: { html: null, css: null },
      dirty: false
    }
    this.tabs.push(tab)
    this.activeIndex = this.tabs.length - 1
    eventBus.emit('tab:opened', tab)
    eventBus.emit('tab:focused', tab)
    return tab
  }

  close(pageName) {
    const i = this.tabs.findIndex(t => t.pageName === pageName)
    if (i < 0) return
    const [removed] = this.tabs.splice(i, 1)
    if (this.activeIndex >= this.tabs.length) this.activeIndex = this.tabs.length - 1
    eventBus.emit('tab:closed', removed)
    if (this.tabs.length > 0 && this.activeIndex >= 0) {
      eventBus.emit('tab:focused', this.tabs[this.activeIndex])
    }
  }

  focus(pageName) {
    const i = this.tabs.findIndex(t => t.pageName === pageName)
    if (i >= 0) {
      this.activeIndex = i
      eventBus.emit('tab:focused', this.tabs[i])
    }
  }

  closeAll() {
    while (this.tabs.length) this.close(this.tabs[0].pageName)
  }

  active() {
    return this.activeIndex >= 0 ? this.tabs[this.activeIndex] : null
  }

  setViewMode(pageName, mode) {
    const tab = this.tabs.find(t => t.pageName === pageName)
    if (!tab) return
    tab.viewMode = mode
    eventBus.emit('viewmode:changed', { tab, mode })
  }

  setDevice(pageName, device) {
    const tab = this.tabs.find(t => t.pageName === pageName)
    if (!tab) return
    tab.device = device
    eventBus.emit('device:changed', { tab, device })
  }

  setSelected(pageName, element) {
    const tab = this.tabs.find(t => t.pageName === pageName)
    if (!tab) return
    tab.selectedElement = element
    eventBus.emit(element ? 'element:selected' : 'element:deselected', { tab, element })
  }
}

export const pageState = new PageStateManager()
