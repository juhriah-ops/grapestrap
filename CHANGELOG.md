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

### Known v0.0.2 architectural follow-up
- Replace the Blob-URL plugin loader with a privileged `gstrap-plugin://` protocol scheme so plugin entry modules can resolve relative imports (helpers, JSON catalogs, sub-files). Today every plugin must be a single self-contained ESM file. Track in v0.0.2 milestones.

### Notes
- v0.0.1 is a walking skeleton. Many menu items are wired but show "not yet wired" toasts; full handlers land in v0.0.2.
- App icon at `assets/icons/icon.png` not yet shipped (tracked separately) — main warns at launch.
