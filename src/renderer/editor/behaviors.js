/**
 * GrapeStrap — Behaviors runtime enablement
 *
 * PATH: src/renderer/editor/behaviors.js
 * ROLE: The renderer's one entry point for turning the behaviors runtime on for
 *       the open project: flips `manifest.behaviors`, has main copy the runtime
 *       pair into the project, and announces the change so the canvas picks up
 *       the stylesheet. Every feature that authors a `data-gs-*` attribute
 *       (navbar sections, the Navbar panel, the Animation panel) calls
 *       ensureBehaviors() before or as it writes that attribute.
 * DEPENDS: state/project-state.js, state/event-bus.js, log.js,
 *          window.grapestrap.behaviors.ensure (preload → main)
 * CREATED: 2026-08-18
 *
 * ── What "enabled" means ────────────────────────────────────────────────────
 * `manifest.behaviors = { version: N }` is the single switch. It makes
 * composeFullPageHtml emit the runtime's `<link>`/`<script>` on every page
 * (src/shared/page-html.js), and it makes grapesjs-init add the runtime
 * stylesheet to the canvas. It is deliberately NOT part of `manifest.framework`
 * — a project that vendors its own Bootstrap suppresses the bundled framework
 * set, and the behaviors runtime must survive that.
 *
 * ── Why there is no "disable" ───────────────────────────────────────────────
 * Removing the flag would silently break every `data-gs-*` attribute already on
 * the pages, and nothing here can know whether the user still wants them. Two
 * inert files and two tags are a cheap thing to leave behind; a navbar that
 * stopped reacting to scroll for no visible reason is not. The user can delete
 * the files from Site Files if they truly want them gone.
 *
 * ── Undo ───────────────────────────────────────────────────────────────────
 * Enabling touches the manifest and the project's asset folder — neither is on
 * the canvas undo stack, so Ctrl+Z after inserting a navbar removes the markup
 * and leaves the runtime in place. Same posture as the CSS chunks and copied
 * images an ordinary section insert leaves behind (editor/insert-section.js).
 */

import { projectState } from '../state/project-state.js'
import { eventBus } from '../state/event-bus.js'
import { log } from '../log.js'

// The manifest records which runtime generation a project was enabled against.
// Nothing branches on it yet; it exists so a future runtime with an
// incompatible attribute schema can migrate a project instead of guessing.
// Keep in step with the `v<N>` tag in assets/behaviors/gstrap-behaviors.js.
export const BEHAVIORS_VERSION = 1

/**
 * Turn the behaviors runtime on for the open project, idempotently.
 *
 * Cheap to call on every insert / every panel toggle: when the flag is already
 * set the only work is one IPC round trip that reads 40 bytes per file and
 * skips both copies.
 *
 * @returns {Promise<{copied: string[], skipped: string[]}>} Main's report of
 *          which runtime files it wrote vs. left alone.
 * @throws {Error} When no project is open, or the copy failed (bridge missing,
 *         no write permission). Callers on an insert path warn and continue —
 *         the attributes they wrote are inert until a later call succeeds.
 */
export async function ensureBehaviors() {
  const project = projectState.current
  if (!project?.manifest) throw new Error('ensureBehaviors: no project open')

  if (!project.manifest.behaviors) {
    project.manifest.behaviors = { version: BEHAVIORS_VERSION }
    // Same idiom as every other manifest mutation (dialogs/project-settings.js,
    // dialogs/page-properties.js): mutate in place, then mark — the mark is
    // what emits project:dirty-changed and paints the status bar's dot.
    projectState.markManifestDirty()
    log.info('behaviors: enabled for this project')
  }

  const result = await window.grapestrap.behaviors.ensure()

  // Listeners are idempotent reconcilers (grapesjs-init's framework sync), so
  // emitting on every call — not just the first — costs one reconcile pass and
  // covers the case where the canvas was rebuilt since the last enable.
  eventBus.emit('behaviors:changed', { version: BEHAVIORS_VERSION, ...result })
  return result
}

/**
 * Is the behaviors runtime enabled for the open project?
 * @returns {boolean} false when no project is open
 */
export function isBehaviorsEnabled() {
  return !!projectState.current?.manifest?.behaviors
}
