# Changelog

All notable changes to GrapeStrap will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning follows [SemVer](https://semver.org/).

## [Unreleased]

Working toward `v0.0.1-alpha`. See `GRAPESTRAP_BUILD_PLAN_v4.md` for the full roadmap.

### Added (2026-05-02 — right-click context menu)
- Generic floating context-menu component in `src/renderer/dialogs/context-menu.js`. `showContextMenu(x, y, items[])` returns a Promise that resolves with the activated action's return value (or undefined on dismiss). Items: `{ label, accelerator?, action, disabled?, danger?, separator? }`. Auto-positions away from viewport edges; ↑↓ Enter Esc keyboard nav; outside-click + window blur dismiss. New `styles/context-menu.css`.
- Shared per-component action helpers in `src/renderer/shortcuts/component-actions.js`: `duplicateComponent`, `deleteComponent`, `copyComponentHtml`, `editComponentTag`, `wrapComponentInTag`, plus `buildComponentMenuItems(component)` returning the canonical menu definition. Single source of truth — keyboard accelerators in the menu match `menu-router.js` so the right-click and keyboard paths can't drift apart.
- `contextmenu` handler on the GrapesJS canvas iframe (in `editor/grapesjs-init.js`): listens on `frame.contentDocument`, synthesises a `mousedown` so GrapesJS runs its own selection logic, then emits `canvas:context-menu` with viewport-translated coords + the selected component.
- `contextmenu` handler on DOM tree rows (in `panels/dom-tree/index.js`): same `canvas:context-menu` event, so both surfaces use one open path.
- One central listener in `main.js` opens the menu via `showContextMenu(x, y, buildComponentMenuItems(component))`. Registered BEFORE `showWelcomeIfFirstRun()` so it isn't silently broken until the first-run dialog is dismissed.
- Wired real handlers for `edit:duplicate` / `edit:delete` in `menu-router.js` (previously emitted no-op events). Selection-required, with toast warnings if nothing is selected or the page root is targeted.
- New Playwright spec `'Right-click on DOM tree row opens context menu; Duplicate adds a sibling; Delete removes'` exercises the full loop: right-click → menu visible with the expected 5 items → click Duplicate → component count rises → right-click → click Delete → count returns to baseline. All 7 specs green in 19.5 s.

### Fixed (2026-05-02 — GL host collapsed to 0px on launch; "canvas drift" was a misdiagnosis)
- **Actual root cause:** the seven shell chrome regions in `src/renderer/index.html` (toolbar, tabs, linked-files, main, insert, strip, status) were positioned by CSS-grid auto-placement against `grid-template-rows: var(--toolbar-h) var(--tabs-h) auto 1fr auto auto auto`. `.gstrap-linkedfiles` is `hidden` by default (no project loaded) and resolves to `display: none`, which **removes the element from the grid entirely** — not just its visual size. Auto-placement then shifted every subsequent child UP one row: `#gstrap-main` landed in the auto row originally meant for linked-files (intrinsic content size = 0, so the row collapsed to 0 px), `#gstrap-insert` took the 1fr row that was meant for GL, and so on. Result: GL rendered into a 0-px-tall host (panes invisible) while the insert panel's 89 px of tiles sat at the top of a 622 px row of empty `--bg-2` background. The "canvas drifts downward on resize" symptom in memory was a misread — the canvas was **never** being given any vertical space; what the user saw on each resize was the insert panel re-stretching its empty row, not the canvas growing.
- **Fix (`src/renderer/styles/shell.css`):** named `grid-template-areas` (`toolbar / tabs / linked / main / insert / strip / status`) with each chrome class pinned via `grid-area: <name>`. Named areas pin elements to their slot regardless of which siblings are `display: none`, so hiding linked-files no longer slides everything else up. Also kept `minmax(0, 1fr)` on the GL row (prevents intrinsic content from inflating it) and `overflow: hidden` on `.gstrap-shell`.
- **Verified:** new regression spec `'canvas pane does not drift on alternating window resize'` flips the viewport across six sizes and asserts (a) `gstrap-main.clientHeight > 100` (rules out the collapse), and (b) the height returns exactly to baseline when the viewport returns to baseline. All 6 specs green in 18.9 s.
- **Layout-driver consolidation (also shipped, defense-in-depth):** even though it wasn't the root cause, the renderer previously had three competing layout drivers — the host `ResizeObserver` with a 1 px gate (`3ae4b57`), an unguarded `window.addEventListener('resize')` that called `updateSize()` without the gate, and Monaco's `automaticLayout: true` (an internal RO per Monaco instance × 3 instances). Now: one host RO with an integer `clientWidth/clientHeight` gate fans out to `layout.updateSize()` → `relayoutAllMonaco()` → `getEditor()?.refresh()`. The window listener is gone (the host RO catches window resize for free). Monaco `automaticLayout` is off in `monaco-init.js` and `panels/custom-css/index.js`; each editor is registered via `registerForRelayout(editor)` which installs a per-container rAF-coalesced integer-gated RO so GL splitter drags re-lay-out it. The canvas panel installs the same RO on `.gstrap-canvas-host` to call `editor.refresh()` on splitter drag.
- **CSS box-sizing scoping:** an initial attempt added a global `*, *::before, *::after { box-sizing: border-box }` reset which broke Golden Layout's vendor pixel arithmetic on nola1 (panels rendered blank). Restricted to only `.gstrap-*` chrome classes; `.lm_*` and the canvas iframe internals keep the page default.

### Added
- Project plan v4 (supersedes v3): rolling v0.x release model, plugin architecture from day 1, locked Code-authoritative-when-active sync policy, Library Items separated from master templates, Linux community commitments (XDG, Wayland, Flatpak/Snap, no telemetry).
- Walking-skeleton scaffold: Electron main + preload + renderer with the locked security posture; Vite + electron-builder build; XDG Base Directory module; Wayland auto-detection; native menus; IPC handlers; project manager (`.gstrap` manifest + sibling page files on disk); chokidar file watcher; plugin loader (bundled + user + project); plugin host runtime + API surface; renderer state (event bus, project state, per-tab page state); GrapesJS canvas init; Monaco init with `file://` worker config; canvas-sync module enforcing Code-authoritative-when-active; Golden Layout with file-manager / canvas / properties / custom-css panes; toolbar; page tabs; Insert panel (6 tabs); Property Inspector strip; status bar; welcome dialog.
- Bundled plugins (each with manifest + entry): `@grapestrap/core-blocks`, `@grapestrap/blocks-bootstrap5`, `@grapestrap/blocks-sections` (12 sections, Gramateria-adapted), `@grapestrap/exporter-flat`, `@grapestrap/lang-en`.
- Documentation: `docs/INSTALL.md`, `docs/CONTRIBUTING.md`, `docs/ARCHITECTURE.md`, `docs/PLUGIN-DEVELOPMENT.md`.
- Linux desktop integration: `.desktop` entry, MIME XML for `.gstrap`, packaging README.
- GitHub Actions: `release.yml` (Linux artifacts on tag push), `ci.yml` (lint + build on PR/push).
- Community files: bug report / feature request / plugin submission templates; Code of Conduct (Contributor Covenant 2.1); CREDITS.md.

### Fixed (2026-04-27 — first launch verification)
- `package.json` pinned `grapesjs-blocks-bootstrap5@^1.0.0` (does not exist on npm); bumped to `^0.2.31` so install resolves.
- Main process referenced `dist/preload/preload.js` but `vite-plugin-electron` emits the preload as `preload.mjs` under `"type": "module"`. Pointed `webPreferences.preload` at the real filename. Without this, the renderer reported "FATAL: preload bridge missing".
- CSP on `src/renderer/index.html` blocked `blob:` in `script-src`, so the plugin host's Blob-URL dynamic-import fell over for every bundled plugin (`activated 0 plugin(s)`). Allowed `blob:` in `script-src`.
- GrapesJS pulled `font-awesome` from `cdnjs.cloudflare.com` by default (CSP-blocked). Set `cssIcons: ''` in the editor init since canvas icons ship from bundled `assets/canvas-icons/`.
- `@grapestrap/lang-en` used `import …assert { type: 'json' }` (deprecated) and the relative-import form fails under blob-URL loading anyway. Inlined the message catalog with a comment explaining the v0.0.1 limitation.

### Verified
- `npm install` clean against pinned versions, Electron 31.7.7 downloaded.
- `npm run build` produces all three Electron targets (renderer, main, preload).
- Headless Electron launch (Xvfb): preload bridge attaches, plugin discovery finds 5 / 5 bundled plugins, `activated 5 plugin(s)`, GrapesJS and Monaco both initialize without errors.
- **Playwright smoke test (`tests/e2e/smoke.spec.js`) passes in ~3 s**: create project → open page tab → mutate page html → save → relaunch → reopen → sentinel string survives the round-trip. **M1 gate is green.**

### Added (2026-04-27 — page-tab → canvas plumbing)
- `pageState.open()` now emits `tab:focused` for newly-created tabs (previously only re-opens). Canvas subscribers fire on first open of a project.
- Canvas panel listens for `tab:focused` and swaps content via new `loadHtmlIntoCanvas` / `getCanvasHtml` helpers in `grapesjs-init.js`. Outgoing tab's editor html is captured back into projectState before the swap, so unsaved edits survive tab switches.
- New `canvas:content-changed` event fired on `component:add` / `component:remove` / `component:update` / `style:custom`. Canvas panel uses it to mark the active page dirty on real edits, with a `loadingTabName` guard so the component:add storm during programmatic loads doesn't dirty-flag a page just for being opened.
- `cmdSave` / `cmdSaveAs` / `cmdExport` flush the active tab's canvas html into projectState before calling the IPC, so on-disk state reflects what's on screen.
- Playwright config (`playwright.config.js`) and the M1 smoke test (`tests/e2e/smoke.spec.js`) — drives the same IPC the menu router uses, no native dialogs.
- `__gstrap` window handle exposed unconditionally (was gated on `import.meta.env.PROD`). Containment is the preload-bridge + sandbox + contextIsolation posture, not symbol-hiding.

### Added (2026-04-27 — Property Inspector strip element-aware UI, originally planned for v0.0.2)
- Property strip is now element-aware. Always shows tag, ID input, classes input. Adds: `href` + `target` for `<a>`; `src` + `alt` for `<img>`; an H1–H6 level dropdown for headings (changes the tag in-place via `replaceWith`, preserving children + attributes).
- Inputs commit on `change` / blur, not on every keystroke — fewer canvas-state churns and undo entries.
- New stylesheet `src/renderer/styles/property-strip.css` — monospace inputs, VS-Code-ish colors for the tag pill, focused-accent border.
- Playwright spec verifies the heading-level dropdown actually swaps the tag (h1 → h3).

### Added (2026-04-27 — Quick Tag Editor + Wrap with Tag, originally planned for v0.0.2)
- **Ctrl+T** (Quick Tag Editor): floating input shows the selected element as `<tag attr="…">`. Edit, Enter to apply, Esc / backdrop to cancel. Tag rename + attribute update preserves the element's children. The text-form input matches Dreamweaver's classic UX (faster than a structured form once the muscle memory is there; structured editing already lives in the Properties panel).
- **Ctrl+Shift+W** (Wrap with Tag): same dialog, wraps the selected element's outer HTML in a new tag.
- New parser in `src/renderer/dialogs/quick-tag.js` handles `<h2 class="foo bar" id="hi">` style input — quoted ('"' or `'`) or bare values, valueless attrs, optional self-closing `/`. Tag name lowercased; attributes preserved verbatim.
- New stylesheet `src/renderer/styles/quick-tag.css` — top-centered overlay with a backdrop, monospace input, error flash on parse fail.
- Two new Playwright specs verify both shortcuts: select h1 → Ctrl+T → fill `<h2 class="rebranded">` → Enter → element renames to h2; select h1 → Ctrl+Shift+W → fill `<header class="page-head">` → wrap. All 4 specs (M1 smoke + DOM tree + Quick Tag + Wrap) pass in ~12 s combined.

### Added (2026-04-27 — DOM Tree panel, originally planned for v0.0.2)
- New left-sidebar `DOM` panel mirrors the canvas component tree as an indented list. Click a row to select the component on the canvas; canvas selection highlights the matching tree row. Refresh is coalesced via `queueMicrotask` so a section drop that adds 30 children only repaints once.
- Golden Layout default config gains a fourth column: FILE MGR | DOM TREE | CANVAS | PROPS+CSS.
- New stylesheet `src/renderer/styles/dom-tree.css` — indented monospace rows, hover, selected state, VS-Code-ish color scheme for tags / ids / classes.
- Second Playwright spec verifies the DOM tree's two-way sync: tree contains main/h1/p rows from the seed index page; clicking the h1 row selects the matching component on the canvas; the selection highlights in the tree.
- Drag-to-reorder + right-click context menu (wrap, delete, duplicate, edit tag) deferred to a follow-up commit. Read-only is the v1 scope.

### Architecture (2026-04-27 — plugin protocol scheme, originally planned for v0.0.2)
- Privileged `gstrap-plugin://<uid>/<file>` protocol scheme replaces the Blob-URL plugin loader. Plugins now load as ES modules from a hierarchical URL, so multi-file plugins with relative imports (`./helpers.js`, `./messages.json`, sub-modules) work natively. The previous Blob-URL approach broke any non-trivial plugin layout because blob URLs have no parent directory.
- Scheme registered pre-`app.whenReady` as `standard + secure + supportFetchAPI + codeCache`. Handler attaches post-discovery; reads files from disk via `net.fetch` against `pathToFileURL(target)`, with a path-traversal guard pinning every read to inside the owning plugin's directory.
- Each plugin gets a session-scoped numeric `uid` (`p1`, `p2`, …) that the renderer uses as the URL host. The plugin's name (which can include `@scope/name`) is not URL-safe as a hostname, so the uid indirection sidesteps that.
- CSP `script-src` / `style-src` / `img-src` / `font-src` / `connect-src` now allow `gstrap-plugin:`. `blob:` removed from `script-src` (no longer needed). `worker-src` keeps `blob:` for Monaco workers.
- `@grapestrap/lang-en` reverted to `import messages from './messages.json' with { type: 'json' }` — the proof that relative JSON imports work end-to-end. The v0.0.1 inlined catalog is gone.
- Build plan §"Phase 2 → Plugin System" updated: the protocol-scheme rewrite is shipped, not pending.

### Notes
- v0.0.1 is a walking skeleton. Many menu items are wired but show "not yet wired" toasts; full handlers land in v0.0.2.
- App icon at `assets/icons/icon.png` not yet shipped (tracked separately) — main warns at launch.
