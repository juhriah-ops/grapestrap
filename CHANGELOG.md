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

### Notes
- v0.0.1 is a walking skeleton. Many menu items are wired but show "not yet wired" toasts; full handlers land in v0.0.2.
- `npm install` and runtime verification not yet performed in this scaffold pass.
