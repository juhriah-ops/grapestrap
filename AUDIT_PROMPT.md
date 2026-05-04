# GrapeStrap audit + error-check restart prompt

Paste this into a fresh Claude session. Self-contained — assumes no memory of the prior session.

---

## Context

You are picking up GrapeStrap, a Linux-native visual Bootstrap 5 editor (Dreamweaver alternative). The prior session shipped a huge amount of v0.0.2 work — `v0.0.2-alpha`, `v0.0.2-alpha.1`, `v0.0.2-alpha.2` tags cut, plus 23+ commits of features and bug fixes from real testing on the user's nola1 workstation.

State at session start:

- Repo: `/home/numb1/projects/grapestrap`
- Branch: `main` — clean working tree
- HEAD: `1983c6a` (or later)
- Tags: `v0.0.1-alpha`, `v0.0.2-alpha`, `v0.0.2-alpha.1`, `v0.0.2-alpha.2`
- Specs: should be 44/44 green via `xvfb-run -a npx playwright test`
- Origin: `github.com/juhriah-ops/grapestrap`
- Workstation: nola1 (`jsmith@192.168.0.192`) has a synced copy at `~/projects/grapestrap` — push via `tar c --exclude=node_modules --exclude=test-results --exclude=playwright-report --exclude=.git . | ssh jsmith@192.168.0.192 "cd /home/jsmith/projects/grapestrap && tar x"` (no git/rsync there)

Read the auto-memory entry at `~/.claude/projects/-home-numb1/memory/session_2026_05_04_grapestrap_sm_c.md` for the architecture decisions, gotchas, and known follow-ups. The build plan is at `GRAPESTRAP_BUILD_PLAN_v4.md` in the repo.

## Your task: error-check + audit pass

The user is shifting modes — instead of building new features, do a thorough sweep of what we have. Look for:

### 1. Code-level errors and inconsistencies
- Dead code / unused imports / orphaned helpers
- Race conditions in event handlers (look for things that emit and subscribe to the same event in a tight loop)
- Memory leaks: long-lived listeners that don't clean up, MutationObservers / ResizeObservers without `disconnect`, intervals without `clearInterval`
- Duplicate event listeners across modules (we have multiple panels listening to `canvas:content-changed` etc.)
- Persisted state (prefs, project manifest) that's read in some places but written in others without sync
- Functions that mutate `projectState.current.*` without calling `markPageDirty` / `markCssDirty` / similar
- IPC handlers in `src/main/ipc-handlers.js` that don't validate input or surface errors clearly
- Type / shape mismatches at the IPC boundary (renderer expects shape X, main returns Y)

### 2. UX consistency
- Modals (Preferences, Page Properties) all use the same shell CSS classes — verify they're consistent
- Toggle behaviors (`view:toggle-*`) — make sure every toggle has a menu item, persists, and survives relaunch
- Keyboard shortcuts: cross-check `default-bindings.js` against `menus.js` and `keybindings.js`
- Toasts: every error path should toast, no silent failures (we already had `try {} catch {}` swallowing bootstrap export errors — there may be more)

### 3. Spec coverage gaps
- Run `xvfb-run -a npx playwright test` to confirm 44/44 baseline
- Look for code paths NOT covered by specs that probably should be:
  - Save flow on a library tab
  - Page Properties cancel flow (does the project state revert?)
  - Asset Manager delete via the per-tile × button
  - Snippet create-from-selection via the dialog (currently the spec bypasses the prompt)
  - Refresh button on a fresh project (no dirty state)
  - Library item Detach (UI doesn't exist yet — surface this as a v0.0.3 task or build minimum)

### 4. Documentation drift
- `CHANGELOG.md` should match the git tags. Cross-check that v0.0.2-alpha entries cover all the features actually shipped and that v0.0.2-alpha.1 / .2 entries are accurate.
- `GRAPESTRAP_BUILD_PLAN_v4.md` Phase 2 table — every "v0.0.2" item should be either shipped or explicitly marked deferred to v0.0.3.
- `README.md` — likely stale, references walking-skeleton state
- `package.json` version + main entry — confirm `0.0.2-alpha.2` and `dist/main/main.js`

### 5. Disk-layout integrity (post v0.0.2-alpha.2)
- `createProject` / `loadProject` / `saveProject` / `exportProject` / `importDirectory` all consistently use `siteDir(projectDir)` for content paths
- Manifest paths stored relative-to-`site/` (no `site/` prefix) — verify nothing leaked an absolute or `site/`-prefixed path
- Old-layout detection on load throws a clear error (already tested, but verify the error message is actionable)

### 6. Plugin system
- All 5 bundled plugins (`core-blocks`, `blocks-bootstrap5`, `blocks-sections`, `exporter-flat`, `lang-en`) load without error
- Plugin manifests have `grapestrapVersion: ">=0.0.1 <0.1.0"` (after the caret-rule regression fix). Confirm none reverted.
- Plugin host correctly handles version-incompatible plugins (skip + log, don't crash)

### 7. Cleanup opportunities
- Unused CSS rules
- Orphaned event names that nothing listens to (or nothing emits)
- Git-untracked dev artifacts
- Files referenced in CHANGELOG but not actually present

## Method

1. **Baseline**: `xvfb-run -a npx playwright test` — confirm 44/44 green before changing anything. If any fail, that's your starting bug.
2. **Survey**: read top-level READMEs + CHANGELOG, then walk `src/main/`, `src/preload/`, `src/renderer/` looking for the categories above.
3. **Triage**: don't fix everything inline. Build a punch-list (TaskCreate works for this). Ask the user before tackling anything that requires a design call.
4. **Fix the obvious**: orphaned imports, duplicate listeners, missing dirty marks, swallowed errors. Spec each fix.
5. **Surface the not-obvious**: anything you find that needs a user decision, write up clearly with the tradeoff and ask.

## Constraints

- Stay within v0.0.2-alpha.x scope — fix bugs, don't add v0.0.3 features unless they're ALREADY half-built and clearly broken
- 44 specs MUST stay green; add new specs for any non-trivial fix
- Don't break the v0.0.2-alpha.2 layout (BREAKING change already cut)
- Push to nola1 + origin after each meaningful commit
- The user values short responses, no narrating internal deliberation. Status updates only at key moments.

## Known v0.0.3 backlog (not for this audit)

- Theme panel for BS5 design tokens (color/spacing/typography overrides via CSS custom properties)
- GL v2 `item.hide()/show()` integration so panel toggles fully relayout (current CSS hide leaves splitter slots)
- Drag-from-asset-tile onto canvas
- Full `<head>` round-trip on import (currently lossy beyond title/description)
- Drag-to-resize columns with snap-to-12-grid

If something from this list is genuinely broken right now, surface it; don't attempt a build.
