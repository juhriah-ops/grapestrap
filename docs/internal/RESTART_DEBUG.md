# GrapeStrap — campaign pickup brief

Paste this into a fresh Claude session. Self-contained — assumes no memory of the prior session.

---

## Context

You are picking up the **v0.1.0 release campaign**. The roadmap is `GRAPESTRAP_BUILD_PLAN_v5.md` at the repo root (v4, now at `docs/internal/GRAPESTRAP_BUILD_PLAN_v4.md`, stays canonical for feature specs only). The user runs the app on nola1 (Linux workstation `jsmith@192.168.0.192`) and tests against real projects.

State at session start (updated 2026-07-13 — **Waves 0–5A complete**; Wave 5B dev-docs pass in flight):

- Repo: `/home/numb1/projects/grapestrap`
- Branch: `main`, clean tree. HEAD moves with the 5B doc commits — trust `git log`, not this line. Feature HEAD for Waves 0–5A: `e87fb5e`.
- Last tag: `v0.0.2-alpha.13` = `59b4de3`. package.json is `0.1.0-rc.0` **UNTAGGED on purpose** — the rc ladder tags in Wave 6.
- **Every campaign commit is LOCAL-ONLY.** Pushes, tags, the release publish, and nola1 syncs are USER-GATED (v5 operating rules). Never push, tag, or sync without the user's explicit go-ahead. The first push will also be release.yml/CI's first validation run on this stack.
- Specs: **127/127 green** via `xvfb-run -a npx playwright test` — 23 files: 9 domain files (Wave 0 split of the old smoke.spec.js) + 14 feature/coverage files. Shared helpers in `tests/e2e/helpers.js` (`launch`, `openSeedProject`, `selectFirstByTag`, `dismissWelcome`, `EXPECTED_PLUGIN_COUNT`). Suite drives `dist/main/main.js` — `npm run build` REQUIRED before e2e after any src/ change.
- `npm run lint` (ESLint 9 flat config, covers src/ plugins/ tests/) must stay clean.
- Origin: `github.com/juhriah-ops/grapestrap` — local is AHEAD.
- nola1: synced via tar pipe (no git/rsync there). Verify with `cat .git/refs/heads/main`. User-gated like everything else.

## Wave ledger — what landed (`59b4de3..e87fb5e`)

| Wave | Commits | Landed |
|---|---|---|
| 0 — Rails | `dcc18a8` `aaa6472` `de5f6cf` `f4c1cc0` `f70f9ef` `1fe0513` | Build Plan v5; smoke.spec.js split into 9 domain files + helpers.js; CI runs the full e2e suite; plugin-semver landmine defused (ranges → `<0.2.0`, shared `EXPECTED_PLUGIN_COUNT`) + version `0.1.0-rc.0`; coverage-hole specs (multi-page, file-ops, undo-redo, plugin-robustness) + the two bugs they surfaced (cross-tab undo leaked the previous page's tree → UndoManager fence in `swapToTab`; save never cleared dirty dots → `projectState.markAllClean()`) |
| 1 — Safety net | `701203e` `db846b8` `8220bf5` | Crash recovery (`.gstrap.recovery` snapshots ~30s while dirty, restore/discard dialog on launch — `src/renderer/state/recovery.js`, `dialogs/recovery.js`, IPC `project:clear-recovery`); i18n runtime core (`src/renderer/i18n.js` over i18next, pref `general.language`) |
| 2 — Marquee | `a017f2a` `da11442` | Master Templates (`site/templates/<name>.gstrap-tpl`, `data-grpstr-region` editable regions, propagation/lock/detach, new-page dialog — `panels/templates/`, `dialogs/new-page.js`); drag-to-resize with class snapping (`editor/drag-resize.js` — cols/images/margin+padding, breakpoint-aware, one drag = one undo). Undo contract RESOLVED: canvas history is per view-session — `rebuildCanvasFromCode` is fenced out of undo and clears it |
| 3 — Mid-size | `06a9634` `574e246` `02fcc60` `6aeb4b9` | Panel-factory idempotency (fixes the latent Reset Layout listener leak; failing-first spec); workspace layouts (`main/workspace-store.js`, `renderer/layout/workspaces.js`, `dialogs/workspace-manage.js` — GL API is `saveLayout()` / `LayoutConfig.fromResolved()` / `loadLayout()`); preview in browser (`main/preview-server.js` — 363-line loopback HTTP + SSE reload, `main/platform/mime.js` + `safe-path.js`, `renderer/preview.js`; no second chokidar — reuses the project watcher + `project:saved`); git status (`main/git-status.js`, `renderer/state/git-state.js` — FM dots + status-bar branch/ahead-behind; chokidar ignores dotfiles so pure `.git/` mutations are invisible — designed around, see `sandbox-artifacts/grapestrap/w3-git-status/PLAN.md` §1) |
| 4 — Content + sweep | `756d97a` `d13677d` `f1f1442` `75ecb49` `667874b` `ca9dc5e` `12ab479` | PHP awareness (Monarch tokenizer import in `monaco-init.js`, `editor/php-decorations.js`, `editor/file-tabs.js`, File Manager "Site Files" section); starter templates (Blank/Landing/Portfolio/Blog — `main/starters/`, `dialogs/new-project.js` + `template-select.js`, activates the long-parked `createProject` `templateId`); i18n extraction sweep (catalog 131 → 459 keys; main-process menus via `main/menu-i18n.js`; guide at `docs/translations/README.md`); e2e temp-dir cleanup (`keepXdg` opt-out — the suite was leaking ~2GB of XDG scratch per full run) |
| 5A — Packaging | `e055654` `853c775` `e87fb5e` | rpm target + release pipeline fixes — **electron-builder 26 changed the schema: `linux.desktop` flat keys must be `desktop.entry {}`; every `--linux` build failed validation before `e055654`**; hicolor icon set 16→512; `.gstrap` MIME registration (`/usr/share/mime/packages/grapestrap.xml` + postinst `update-mime-database`); INSTALL.md reality pass; About modal + no-telemetry pledge (`dialogs/about.js`); `.php` preview MIME → text/plain; locked-chrome dim |

Audit trails with verified claims per wave: `/home/numb1/sandbox-artifacts/grapestrap/w{0..5}-*/` (HANDOFF.md or PLAN.md per task).

## Next: Wave 6 — RC + acceptance + release (v5 §Wave 6; user gates throughout)

1. **Pre-tag gate (build machine):** lint + build + full 127-spec suite + local `electron-builder --linux deb rpm AppImage tar.gz` + AppImage smoke under xvfb + `dpkg -c` inspection.
2. **[USER GATE]** tag `v0.1.0-rc.1` + push → release.yml builds the draft GH release (this run IS the pipeline's Electron-43 validation; `rc` is already in the prerelease `contains()` check).
3. **Workstation acceptance:** install the CI-built .deb on nola1; verify desktop entry, `.gstrap` MIME association, Wayland/X11 auto-detect, icon.
4. `docs/internal/ACCEPTANCE-v0.1.0.md` checklist (user-docs writes it) — run end to end.
5. Failures → fix + regression spec → `rc.N`. Clean pass → **[USER GATE]** tag `v0.1.0`, publish the draft.

Before Wave 6, the remaining Wave 5B item: user-docs (README rewrite, SECURITY.md, PR template, INSTALL.md polish).

## Known small gaps (flagged, not fixed — don't silently "improve")

- `bs-classes.js` `SPACING_SIDES` still emits dead BS4 `mr-*`/`ml-*` tokens (BS 5.3 uses `ms-*`/`me-*`) — one-line fix ticket.
- Breakpoint-bar readout goes stale after a View-menu device switch.
- Spacing drags on a template region element get wiped by the next template propagation (skip-handles-when-`removable===false` is the cheap fix).
- File-tab buffers (`.php`, and as of the Graphite-starter wave `.js`/`.css` Site Files too — file-tabs.js's dirty tracking is extension-agnostic) are NOT in crash-recovery snapshots; `projectState.isDirty()` doesn't see file-tab dirty state.
- `xdg.recoveryDir` is dead config (snapshots live next to the manifest).
- Seeded-but-unused i18n keys: `app.tagline`, `empty.no-project`, `empty.no-tabs`, `empty.search-no-results`.
- electron-builder warns `desktopName`/`syncDesktopName` unset (Wayland app_id) — check at Wave 6 acceptance.
- Deferred deps (post-v1): vite 5→8 (dev-only esbuild advisory), grapesjs 0.21→0.23 (underscore pinned via overrides meanwhile).

## Architecture notes (verified still accurate 2026-07-12)

### Layout — one row of three children, all stacks

```
LEFT STACK (18%)              CENTER (56%)              RIGHT STACK (26%)
Project | Library | Asset     Canvas / Code / Split     DOM | Properties | Custom CSS
```

Properties is the default-active right tab. View → Toggle X hides just that tab + content. If ALL THREE right tabs end up hidden, the whole right stack collapses via the size-redistribute trick so the canvas reclaims its 26%; toggling any one back on restores the stack.

### Panel hide/show — `src/renderer/layout/panel-visibility.js`

The canonical "make GL re-layout when programmatic state changes" path: snapshot the parent's children sizes, set the target's `size = 0`, redistribute the freed share proportionally to visible siblings, `requestFullRelayout()`. GL's own `item.hide()` does NOT work for our case — `setSize → calculateAbsoluteSizes` iterates ALL contentItems regardless of visibility and assigns each its `size`-percent share. Orphaned splitters next to hidden items are hidden via `.is-gstrap-hidden + .lm_splitter, .lm_splitter:has(+ .is-gstrap-hidden) { display: none }`.

### `requestFullRelayout()` — never `layout.updateSize()` standalone

Monaco runs with `automaticLayout: false` (intentional — per-instance ROs raced the host RO; see `monaco-init.js` comment). It only re-lays-out when `relayoutAllMonaco()` pokes it. `requestFullRelayout()` (exported from `src/renderer/layout/golden-layout-config.js`) runs the same chain the host RO runs: `layout.updateSize()` + `relayoutAllMonaco()` + GrapesJS `refresh()`. Use it after ANY programmatic GL change — workspace-layout apply does.

### Panel hosts — DON'T position-absolute the `.lm_content`

Host classes (`gstrap-fm-host`, `gstrap-props-host`, `gstrap-dom-host`, `gstrap-am-host`, `gstrap-lib-host`) are added directly to `.lm_content` (panel render fns receive `container.element`, which IS the `.lm_content`). `position: absolute; inset: 0` escapes GL's containing block — content renders at the header's Y, 2px wider than the column. Use `height: 100%; overflow-y: auto` — GL gives `.lm_content` a definite pixel height, so it resolves correctly and scroll works.

### Linux menu-bar lock

Electron + GTK CSD on Linux can drop the application menu bar during rapid resize cycles. `createMainWindow` in `src/main/main.js` does `setAutoHideMenuBar(false)` + `setMenuBarVisibility(true)` and re-asserts on `resize` / `maximize` / `unmaximize` / `leave-full-screen`. Don't remove these defenses.

## Constraints

- 127 specs MUST stay green. Bump the count, don't drop it.
- One `npm run build` / Playwright run at a time on this machine (OOM tripwire; zram exists on purpose).
- **Tmpfs gotcha**: each spec mkdtemps a project + copies ~50MB of frameworks. Pre-clean before big runs: `find /tmp -maxdepth 1 -type d -name "gstrap-*" -mmin +5 -exec rm -rf {} +`.
- Full test output to a log file, then check `test-results/.last-run.json` — never pipe the run through `tail`/`grep` alone.
- File-header breadcrumbs on every new/rewritten JS file. All new UI strings via `t()`.
- Don't break: the framework-in-project layout, the full-HTML page format, the right-stack consolidation, the locked 4-column shell, the `.gstrap-tpl` disk format.
- **NO push, NO tag, NO nola1 sync without explicit user approval.** Prepare, then ask.

## Ship recipe (local commit only — pushes/tags are Wave 6 user gates)

```bash
cd /home/numb1/projects/grapestrap
npm run build 2>&1 | tail -3
xvfb-run -a npx playwright test > /tmp/gstrap-suite.log 2>&1; tail -5 /tmp/gstrap-suite.log   # expect 266 (or more) passed — 2026-08-18
npm run lint
# ...update CHANGELOG.md [Unreleased] section
git add -A && git commit -m "Wave N: <message>"
# STOP HERE. Pushing origin, tagging, and nola1 sync happen only on explicit user approval.
```

nola1 tar-pipe (reference — run only when the user asks): clean `dist test-results playwright-report .git` on the far side first, then `tar c --exclude=node_modules --exclude=test-results --exclude=playwright-report . | ssh jsmith@192.168.0.192 "cd /home/jsmith/projects/grapestrap && tar x"`. nola1 has no git CLI — verify with `cat .git/refs/heads/main` over SSH.

## Useful greps

- Layout config + `requestFullRelayout()` + saved-layout API: `src/renderer/layout/golden-layout-config.js`
- Workspace layouts: `src/renderer/layout/workspaces.js` + `src/main/workspace-store.js` + `src/renderer/dialogs/workspace-manage.js`
- Panel hide/show + size redistribute: `src/renderer/layout/panel-visibility.js`
- Toggle wiring + body classes: `src/renderer/panels/view-toggles.js`
- Master templates: `src/renderer/panels/templates/` (`propagate.js`, `lock.js`, `manage.js`, `context-items.js`) + `src/renderer/dialogs/new-page.js`
- Drag-to-resize: `src/renderer/editor/drag-resize.js` (+ `drag-resize-canvas.css`)
- Crash recovery: `src/renderer/state/recovery.js` + `src/renderer/dialogs/recovery.js`
- Preview server: `src/main/preview-server.js` + `src/renderer/preview.js` + `src/main/platform/mime.js`
- Git status: `src/main/git-status.js` + `src/renderer/state/git-state.js`
- PHP / file tabs: `src/renderer/editor/file-tabs.js` + `php-decorations.js`; Monarch import in `monaco-init.js`
- Starters: `src/main/starters/` + `src/renderer/dialogs/new-project.js` / `template-select.js`
- i18n: `src/renderer/i18n.js` + `i18n-html.js` + `src/main/menu-i18n.js`; catalog `plugins/lang-en/messages.json`; guide `docs/translations/README.md`
- Custom CSS panel + globalCSS write: `src/renderer/panels/custom-css/index.js`
- Monaco RO + relayout: `src/renderer/editor/monaco-init.js`
- Linux menu-bar lock: `src/main/main.js` (`createMainWindow`)
