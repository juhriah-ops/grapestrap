# GrapeStrap — Build Plan v5 (v0.1.0 Release Campaign)
**The Dreamweaver alternative the Linux community has been waiting for.**

**Stack:** Electron 43 + GrapesJS 0.21 + Monaco 0.50 + Golden Layout 2.6 + Vite 5
**Targets:** Ubuntu/Debian/Fedora x64 | **Distribution at v0.1.0:** GitHub Releases (.deb, AppImage, rpm, tar.gz)
**License:** MIT | **Telemetry:** None, ever

**Date:** 2026-07-08 | **Baseline:** `v0.0.2-alpha.13` (`59b4de3`, main, 55/55 e2e green)

---

## Corrections & landed-state (2026-07-13, program-docs pass — plan text below left as written; source wins)

**Waves 0–5A are LANDED**, all local-only commits, suite 127/127 green at `e87fb5e`:

| Wave | Commit range | Suite after |
|---|---|---|
| 0 — Rails | `dcc18a8`…`1fe0513` (split `aaa6472`, CI e2e `de5f6cf`, landmine+rc.0 `f4c1cc0`, coverage specs `f70f9ef`) | 68 |
| 1 — Safety net | `701203e` (crash recovery), `db846b8` (i18n core), `8220bf5` (docs) | 77 |
| 2 — Marquee | `a017f2a` (Master Templates), `da11442` (drag-to-resize) | 93 |
| 3 — Mid-size | `06a9634` (panel idempotency), `574e246` (workspaces), `02fcc60` (preview), `6aeb4b9` (git status) | 115 |
| 4 — Content + sweep | `756d97a` (PHP), `d13677d` (starters), `f1f1442`/`667874b`/`ca9dc5e`/`12ab479` (i18n sweep), `75ecb49` (e2e tmp cleanup) | 126 |
| 5A — Packaging | `e055654` (rpm + pipeline), `853c775` (icons + MIME + INSTALL), `e87fb5e` (About + php MIME + chrome-dim) | 127 |

Corrections to plan lines, verified against source (audit trails in `sandbox-artifacts/grapestrap/w*-*/`):

1. **Wave 3 workspaces row:** GL 2.6 has no `toConfig()`/`loadConfig()` — the shipped API is `saveLayout()` → `LayoutConfig.fromResolved()` on save and `loadLayout()` on apply, in `src/renderer/layout/golden-layout-config.js`.
2. **Wave 3 preview row:** the "~60-line `node:http` static server" landed at **363 lines** (`src/main/preview-server.js` — SSE client set, HEAD, heartbeat, teardown). And there is **no second chokidar**: refresh reuses the existing project watcher + `project:saved`, debounced renderer-side.
3. **Wave 3 git-status row:** `bindProjectWatcher` is at **`ipc-handlers.js:369`** (the `:325` ref predates Waves 1-2 insertions). Also note the row's trigger set ("chokidar events + saves") structurally **cannot see pure `.git/` mutations** — chokidar ignores dotfiles, so a terminal-side `git init`/`commit`/branch-switch fires no watcher event; designed around (see `w3-git-status/PLAN.md` §1, §3).
4. **Wave 4 PHP row:** the Monarch contribution import landed at `monaco-init.js:37` (not `:29-32`; monaco ships no `vs/language/php` service — tokenizer only, as scoped).
5. **Test plan summary:** "Est. 55 → ~75 specs" — actual is **127** (23 files; 9 domain + 14 feature). Wave 6's pre-tag gate should read 127, not ~75.
6. **Packaging (found by w5-packaging, matters at Wave 6):** electron-builder 26 changed the desktop-entry schema — `linux.desktop` flat keys must be nested `desktop.entry {}`. **Every `--linux` build at this plan's baseline failed validation** until `e055654`; release.yml would have died at tag time. Also: `desktop.entry` Name/Comment/Categories/MimeType are always clobbered by computed values (removed as dead config), and `linux.mimeTypes` doubled the `fileAssociations` MimeType (removed).
7. **Wave 5 hygiene row status:** internal docs moved to `docs/internal/` and the CHANGELOG v0.1.0 section written (this pass); README rewrite, SECURITY.md, PR template, INSTALL.md polish remain with user-docs.

---

## How this document relates to v4

v5 **supersedes v4's roadmap, milestones, and packaging plan** (v4 §§8-11 and the Development Milestones table). v4 **remains canonical** for everything that hasn't changed:

- §2 Locked Technical Decisions (except packaging rows amended below)
- §4 Plugin Architecture, §15 Plugin API Specification
- §5 Sync Policy (code-authoritative-when-active — still locked)
- §6 Project Structure, §16 Project File Format (.gstrap)
- §12 Block System, §13 Style Manager, §14 Master Templates & Library Items specs
- Keyboard shortcuts, security posture, governance sections

Read v4 for *how features are specified*; read v5 for *what ships when and how the work runs*.

## What changed from v4

1. **"v1" = v0.1.0.** No separately-scoped 1.0 exists; the public launch milestone is the release the world sees. Version ladder: `0.1.0-rc.0` (internal) → `v0.1.0-rc.N` (tagged, draft releases) → `v0.1.0`.
2. **No v0.0.2 final/beta tag will be cut.** The alpha stream (alpha.1–.13) hardened the Phase 2 feature set in place; the project rolls straight into v0.1.0 work.
3. **Drag-to-resize with class snapping moves INTO v0.1.0.** It was scoped for v0.0.2, never built, and it's the marquee Dreamweaver-parity feature. It ships in v1.
4. **Packaging re-scoped.** v0.1.0 ships `.deb` + AppImage + tar.gz + **rpm** via GitHub Releases only. Flatpak/Flathub, Snap/Snap Store, and AUR are **deferred post-v1** (external gatekeepers must not control the launch date). This resolves the v4-vs-release.yml conflict on AUR timing: post-v1.
5. **The informal "v0.0.3" bucket is dissolved.** Theme panel, drag-from-asset-tile, full `<head>` round-trip → post-v1 backlog. Drag-to-resize → v0.1.0 (above).
6. **Dependency debt stays deferred past v1:** vite 5→8 (dev-only esbuild advisory; blocked on vite-plugin-electron compat) and grapesjs 0.21→0.23 (editor core; drop the `underscore` override when done).
7. **Execution model is agent-orchestrated waves** with a hard serialization contract (one build/test pipeline at a time on the build machine) — see §Execution.

---

## Current state audit (2026-07-08)

### Shipped (v4 Phase 1 + Phase 2, verified)

Everything in v4 Phase 1 and Phase 2 is code-complete and covered by 55 Playwright e2e specs **except drag-to-resize**:

- Project lifecycle (.gstrap + full-HTML pages + in-project framework assets), multi-page tabs, import/export
- DOM tree (two-way sync, context menu), Quick Tag (Ctrl+T), Wrap (Ctrl+Shift+W), element-aware property strip
- Full Style Manager (7 sub-panels + pseudo-class state bar + Cascade view + Columns + breakpoint slider)
- Library Items (propagation + lock + detach), Snippets, Linked Files bar, Color picker (EyeDropper), Asset Manager, Page Properties
- Preferences with shortcut rebinding; keyboard map per v4
- Plugin host: 5 built-ins via `gstrap-plugin://` privileged scheme (CORS-enabled for Electron 43/Chromium 150)
- Hygiene (2026-07-06): Electron 31→43, Playwright 1.61, electron-builder 26, ESLint 9 flat config green, npm audit down to 2 dev-only advisories

### Not built / gaps

| Gap | Detail |
|---|---|
| Drag-to-resize columns | Scoped v0.0.2, never built. Now v0.1.0 scope. |
| All of v4 Phase 3 | Master templates, workspace layouts, preview-in-browser, git status, PHP awareness, i18n runtime, crash recovery (halves exist), starter templates |
| CI runs zero tests | `.github/workflows/ci.yml` has the e2e suite commented out — green CI only proves the build compiles |
| Test coverage holes | No spec creates a 2nd page; file-manager ops, undo/redo, plugin-load robustness untested |
| release.yml never validated on Electron 43 | Also stale body text ("rpm arrives in v0.0.2"); no rpm target wired despite `build:rpm` script existing |
| README stale | Pre-alpha wording, wrong repo URL (`github.com/grapestrap/grapestrap` → actual is `juhriah-ops/grapestrap`; also wrong in `package.json` repository/homepage and the three `help:*` links in `src/renderer/shortcuts/menu-router.js`), no badges/screenshots |
| Icon | Single 512×512 **16-bit** PNG; electron-builder wants 8-bit (+ size set) |
| Repo hygiene | No SECURITY.md, no PR template; internal planning docs (BUILD_PLAN_v4, AUDIT_PROMPT, RESTART_DEBUG) sit in the public repo root |

### Two verified landmines

1. **The version bump alone breaks every plugin.** `src/main/plugin-loader.js:47` gates activation with `semver.satisfies(stripPre(appVersion), range)`; all 5 `plugins/*/grapestrap.json` declare `"grapestrapVersion": ">=0.0.1 <0.1.0"`. The moment package.json says `0.1.0-rc.0`, all plugins deactivate and ~every spec fails (test helper hardcodes `activated.length === 5`). **Fix in Wave 0:** ranges → `">=0.0.1 <0.2.0"`, magic number → shared helper constant.
2. **The manifest already anticipated templates.** `.gstrap` carries `pages[].templateName`, `pages[].regions{}`, `templates[]` since v0.0.1, and `loadProject`/`saveProject` round-trip `templates[]` (`src/main/project-manager.js:411-427, 527-532`). Master Templates is **additive** — `MANIFEST_VERSION` stays `1.0`, no migration. `createProject`'s `templateId` param (line 378) has been waiting unused since v0.0.1 — Starter Templates wires it through.

---

## v0.1.0 scope (locked 2026-07-08)

1. **Master Templates** — per v4 §14: `.gstrap-tpl` editor mode, `data-grpstr-region` editable regions, region locking on child pages, propagation, detach, New Page dialog with template select, status-bar region indicator
2. **Drag-to-resize with class snapping** — columns (`col-{bp}-1..12`) + images (`w-25/50/75/100`) + margin/padding edges (`m*-0..5`/`p*-0..5`); ghost outline + live class badge; single undo entry per drag
3. **Crash Recovery** — `.gstrap.recovery` snapshot every 30s when dirty, recovery dialog on launch, cleared on save
4. **Preview in Browser** — toolbar + Ctrl+F12 (both already dispatch `view:preview-browser`); export to XDG cache + loopback HTTP server + SSE auto-reload on save; browser auto-detect. *Amendment to v4: served over `127.0.0.1` HTTP, not `file://` — auto-reload requires it; loopback-only, zero telemetry.*
5. **Workspace Layouts** — save/switch named GL arrangements; Designer/Coder/Compact presets of the locked 4-column shell (shell itself unchanged)
6. **Git Status Indicator** — dots in file manager, branch + ahead/behind in status bar; simple-git; **no commit UI** (full Git = post-v1)
7. **PHP Awareness** — Monaco PHP tokenization + include/require highlight decorations. Highlight only; no resolution, no preview
8. **i18n Runtime** — i18next wired, UI strings through `t()`, catalog in `@grapestrap/lang-en`, `registerLanguage` plugin API, translation guide
9. **Starter Templates** — Blank, Landing Page, Portfolio, Blog; each = master template + pages; New Project dialog with picker
10. **Linux polish** — About modal with no-telemetry pledge, XDG audit, Wayland + MIME verification checklist on real hardware
11. **Packaging** — rpm added to release pipeline; 8-bit icon (+ size set); release.yml validated end-to-end via rc tags
12. **Release hygiene** — CI runs the full e2e suite; README rewrite (correct URLs, badges, screenshots); SECURITY.md; PR template; internal docs → `docs/internal/`; CHANGELOG
13. **Coverage-hole specs** — multi-page, file-manager ops, undo/redo, plugin robustness
14. **This document** — v5 supersedes v4's roadmap; finalized at RC

**Explicitly OUT of v0.1.0 (post-v1 backlog):** Flatpak/Flathub, Snap, AUR; theme panel; drag-from-asset-tile; full `<head>` round-trip; vite 8; grapesjs 0.23; docs site at grapestrap.org + launch announcement (release-day activities, tracked separately); everything in v4 Phase 4.

### Packaging matrix (amended)

| Format | v0.1.0 | Post-v1 |
|---|---|---|
| .deb / AppImage / tar.gz | ✅ (wired today) | ✅ |
| rpm | ✅ (wire `build:rpm` into release.yml) | ✅ |
| Flatpak → Flathub | — | first post-v1 packaging target |
| AUR PKGBUILD | — | with/after Flathub |
| Snap → Snap Store | — | last (lowest demand) |

---

## Execution — orchestrated waves

### Operating rules (entire campaign)

- **Planning parallelizes, building serializes.** Only ONE `npm run build` / Playwright run at a time on the build machine (OOM tripwire). Planner agents produce artifacts in `/home/numb1/sandbox-artifacts/grapestrap/[task]/` — no builds. The integrator holds the single build lock; every integration ends suite-green before the lock releases.
- Suite green at every commit; spec count only grows. The three riskiest features deliver a **failing round-trip/idempotency spec first**, before any UI code.
- File-header breadcrumbs on every new/rewritten JS file. All new UI strings via `t()` from Wave 1 onward.
- Test hygiene: pre-clean `/tmp/gstrap-*` before big runs; never pipe test output through `tail`/`grep` — full log to file, check `test-results/.last-run.json`.
- **User gates:** every GitHub push, every tag, the release publish, and workstation syncs. Prepared by agents, approved by the user.

### Wave 0 — Rails (no feature code)

| Item | Owner |
|---|---|
| Split `tests/e2e/smoke.spec.js` (3,853 lines / 55 tests) into ~9 domain files + `tests/e2e/helpers.js` (`launch`, `openSeedProject`, `dismissWelcome`, `EXPECTED_PLUGIN_COUNT`). Pure relocation — playwright.config.js needs no change (`workers:1` is global). 55/55 green after. | refactor-function-fixer |
| Landmine #1: plugin ranges → `<0.2.0`; version → `0.1.0-rc.0` (untagged) | general-purpose |
| Enable e2e in ci.yml (`xvfb-run --auto-servernum npm run test:e2e` + the apt lib list from release.yml) | general-purpose |
| Coverage-hole specs: `multi-page`, `file-ops`, `undo-redo`, `plugin-robustness` — multi-page bugs must surface **before** templates builds on multi-page | function-planner |
| BUILD_PLAN v5 (this doc) | done 2026-07-08 |

### Wave 1 — Safety net + i18n substrate

| Item | Notes |
|---|---|
| **Crash Recovery** | Disk + IPC halves exist (`writeRecovery`/`readRecovery` project-manager.js:634-645; `autosaveIntervalSeconds: 30` already in prefs DEFAULTS). New: `src/renderer/state/recovery.js` (30s dirty-only snapshot), `src/renderer/dialogs/recovery.js` (clone welcome.js modal pattern), boot check in renderer/main.js, two tiny IPCs (`project:check-recovery`, `project:clear-recovery`). Ships first so a crash during Waves 2-5 testing never costs work. |
| **i18n runtime core ONLY** | `src/renderer/i18n.js` over i18next, fed from `pluginRegistry.languages` (lang-en catalog exists). ~100 lines. The **retroactive extraction sweep is deliberately Wave 4** — it touches every renderer file and would be merge poison while Waves 2-3 are in flight. |

Owner: function-planner → new-build-integrator each; program-docs follows integrations.

### Wave 2 — Format-definer + marquee (riskiest two; planned during W0-1, integrated serially)

| Item | Notes |
|---|---|
| **Master Templates** (integrates first — settles the `.gstrap-tpl` disk format Starter Templates consumes) | Body-only fragments at `site/templates/<name>.gstrap-tpl`; manifest `templates[]` gains `regions:[{id,label}]` (additive). Propagation clones `panels/library-items/propagate.js` (DOMParser + attribute-scoped innerHTML swap) for `data-grpstr-region`; lock UX from `library-items/lock.js`. New-page dialog replaces `showTextPrompt` in `menu-router.js cmdNewPage()`. Region locking = component flags (`editable/draggable/removable/copyable: false`) applied on `canvas:frame:load` — and **re-applied after every code-sync rebuild** (`canvas-sync.js rebuildCanvasFromCode()`). Export skips `.gstrap-tpl`. **RISK #1:** locking × code-authoritative round-trip; region attrs must survive `getCanvasHtml()` serialization — round-trip spec is deliverable #1. |
| **Drag-to-resize** | ~70% pre-built: reuse `style-manager/bs-classes.js` (colClass/colPattern/BREAKPOINTS) + `class-utils.js applyGroup()` (strip-group-then-add = one Backbone write = one undo entry); breakpoint bar supplies the active bp so a Tablet drag writes `col-md-N`. New `src/renderer/editor/drag-resize.js` + one `component:selected` hook in grapesjs-init.js. Handles injected into the canvas iframe; pointer math offsets through `editor.Canvas.getFrameEl().getBoundingClientRect()`. **RISK #2:** iframe coordinate space under breakpoint scaling; suppressing GrapesJS's own drag handlers; real-mouse spec must `dismissWelcome` first. |

### Wave 3 — Independent mid-size (planned 3× in parallel; integrated in this order)

| Item | Notes |
|---|---|
| **Workspace Layouts** (first — max soak for GL churn) | `golden-layout-config.js` toConfig/loadConfig round-trip (its own comments promise this for v0.1.0); apply → `requestFullRelayout()`. **RISK #3:** `loadLayout` re-runs panel factories → duplicate `eventBus.on()` subscriptions (latent in `resetLayout()` today) — idempotency pass across the 7 panel `render*` fns + an apply-3×-listeners-fire-once spec. This is a bug fix, not gold-plating. |
| **Preview in Browser** | New `src/main/preview-server.js`: export via `exportProject()` to `$XDG_CACHE_HOME/GrapeStrap/preview/<slug>/`, ~60-line `node:http` static server on `127.0.0.1:0` injecting an SSE reload snippet; chokidar + `project:saved` re-export triggers reload. Browser PATH probe (firefox/chromium/chrome/brave/vivaldi), spawn detached. `GRAPESTRAP_PREVIEW_CMD` env override so specs never spawn a real browser. |
| **Git Status** | New `src/main/git-status.js` (simple-git already a dep + vite-externalized). Hook `bindProjectWatcher` (ipc-handlers.js:325); `checkIsRepo` → status/branch push to renderer, debounced 750ms off existing chokidar events + saves. Dots in file-manager rows; branch ±ahead/behind cell in status bar. Non-repo → render nothing. |

### Wave 4 — Content + small + extraction

| Item | Owner |
|---|---|
| **Starter Templates** — content (pure HTML, harvested from `plugins/blocks-sections`) authored during Wave 3; wire the unused `templateId` through `project:new`; new-project dialog shares the template-select component with Wave 2's new-page dialog; masters authored as `.gstrap-tpl`; Portfolio's glightbox copied in-project via the `copyFrameworkAssets` pattern | function-planner → integrator |
| **PHP awareness** — php contribution import beside html/css in `monaco-init.js:29-32` + `php-decorations.js` (deltaDecorations on include/require) | refactor-function-fixer |
| **i18n extraction sweep** — mechanical `t()` pass over panels/dialogs/toolbar/status-bar/toasts; main-process menu labels read lang-plugin `messages.json` from disk; `docs/translations/` guide; one commit per file-cluster, green each | refactor-function-fixer |

### Wave 5 — Platform, packaging, hygiene

- rpm: add to `build.linux.target` + release.yml (runner needs the `rpm` apt package); local `npm run build:rpm` dry-run (serialized — it's a build); fix stale release-body text
- Icon → 8-bit PNG + 256/128/64/32/16 set; About modal with no-telemetry pledge (replaces the toast at renderer/main.js:98); XDG audit documented in INSTALL.md; MIME registration needs a deb postinstall (`xdg-mime install`) — verify electron-builder hook or add one
- README rewrite (correct URLs everywhere: README, package.json, menu-router.js help links, release.yml), SECURITY.md, PR template, move BUILD_PLAN_v4/AUDIT_PROMPT/RESTART_DEBUG → `docs/internal/`, CHANGELOG v0.1.0 section
- Owners: general-purpose (packaging/icon), program-docs (dev docs) + user-docs (README/INSTALL)

### Wave 6 — RC + acceptance + release

1. **Pre-tag gate (build machine):** lint + build + full suite (~75 specs est.) + local `electron-builder --linux deb rpm AppImage tar.gz` + AppImage smoke under xvfb + `dpkg -c` inspection.
2. **[USER GATE]** tag `v0.1.0-rc.1` + push → release.yml builds the draft GH release. This run **is** the pipeline's Electron-43 validation (add `rc` to the prerelease `contains()` check).
3. **Workstation acceptance:** install the **CI-built .deb** from the draft release (`sudo apt install ./grapestrap_0.1.0-rc.1_amd64.deb`). Verify desktop entry, `.gstrap` MIME association, Wayland/X11 auto-detect, icon. Source synced via the house tar-pipe as dev-mode fallback.
4. **`docs/internal/ACCEPTANCE-v0.1.0.md`** (user-docs writes): ~40-min numbered checklist — create-from-Landing-starter → edit a region page → drag-resize a column at two breakpoints → Preview in Browser + save-reload → `kill -9` while dirty → relaunch/recover → git-init the project, see dots/branch → save + switch a Coder layout → open a `.php` file → export + open in browser → About pledge. Step / expected / pass-fail / notes per row.
5. Failures → fix + regression spec → `rc.N`. Clean pass → **[USER GATE]** tag `v0.1.0`, publish the draft, badges live, this plan marked current, session log to memory.

### Test plan summary

**Wave 0 split** (helpers.js + 9 files, zero test-body edits): `project-lifecycle`, `editing-commands`, `code-view`, `insert`, `style-manager`, `panels-layout`, `assets-import-export`, `library-snippets-pages`, `prefs-toasts`.

**New specs by wave:** W0 `multi-page`/`file-ops`/`undo-redo`/`plugin-robustness` · W1 `recovery`/`i18n` · W2 `templates` (round-trip + lock + propagate + detach + status bar) / `drag-resize` (real mouse, breakpoint-scoped, one-undo) · W3 `workspaces` (geometry + listener-leak) / `preview` (SSE reload, stubbed browser) / `git-status` · W4 `starter-templates`/`php` + i18n UI probe. Est. 55 → ~75 specs, ~2.2m → ~3.5m under `workers:1`.

---

## Post-v1 backlog (first items after launch)

1. Flatpak manifest + Flathub submission, then AUR PKGBUILD, then Snap
2. Docs site at grapestrap.org + launch announcement push (r/linux, r/webdev, r/opensource, HN, Lobsters)
3. Theme panel (BS5 design tokens), drag-from-asset-tile, full `<head>` round-trip
4. vite 5→8, grapesjs 0.21→0.23 (drop `underscore` override)
5. v4 Phase 4 ladder unchanged: Sass/Less → SFTP deploy → full Git → Behaviors → validation → a11y → image edit → theme designer → light theme → cross-platform (community demand)
