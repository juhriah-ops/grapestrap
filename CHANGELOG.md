# Changelog

All notable changes to GrapeStrap will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning follows [SemVer](https://semver.org/).

## [Unreleased]

Working toward `v0.0.1-alpha`. See `GRAPESTRAP_BUILD_PLAN_v4.md` for the full roadmap.

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
