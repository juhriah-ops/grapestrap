// =============================================================
// PATH: src/renderer/state/git-state.js
// ROLE: Cache of the latest git:status payload pushed from main —
//       re-emits it on the eventBus and replays it to late subscribers
//       (Wave 3 git-status indicator)
// DEPENDS: state/event-bus.js, preload bridge (grapestrap.git.onStatus)
// CREATED: 2026-07-12
// =============================================================
//
// House state-module pattern (sibling of project-state.js). initGitState()
// subscribes ONCE at boot, before any project can open, so no push is ever
// missed — main pushes the immediate on-bind status while the project.open
// IPC is still resolving, i.e. before project:opened fires. Late
// subscribers (file-manager, status-bar repaints) read gitState.latest
// directly — hard-won lesson: replay current state for late subscribers.

import { eventBus } from './event-bus.js'

export const gitState = {
  latest: null   // last git:status payload ({repo:false} | full shape), or null
}

export function initGitState() {
  window.grapestrap.git.onStatus(payload => {
    gitState.latest = payload
    eventBus.emit('git:status-changed', payload)
  })
  // No project → nothing to indicate; clear + re-emit so cells/dots erase.
  eventBus.on('project:closed', () => {
    gitState.latest = null
    eventBus.emit('git:status-changed', null)
  })
}
