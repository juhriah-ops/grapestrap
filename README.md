<!-- =============================================================
PATH: README.md
ROLE: Release-facing project front page — what GrapeStrap is,
      v0.1.0 feature list, install pointers, build-from-source
DEPENDS: docs/INSTALL.md (install detail), CHANGELOG.md (feature
         facts), LICENSE
CREATED: 2026-07-13 (Wave 5 rewrite of the pre-alpha stub)
============================================================= -->

# GrapeStrap

[![CI](https://github.com/juhriah-ops/grapestrap/actions/workflows/ci.yml/badge.svg)](https://github.com/juhriah-ops/grapestrap/actions/workflows/ci.yml)

GrapeStrap is a Linux desktop visual editor for building static Bootstrap 5
websites. It follows Adobe Dreamweaver's editing paradigm — a visual canvas,
a code view, and a split view over the same document — and produces plain
HTML, CSS, and JavaScript you can deploy anywhere. MIT licensed. No
telemetry.

[Screenshot: the main editor window — canvas with a page open, File Manager
on the left, DOM/Properties/Custom CSS tabs on the right, menu and toolbar
visible]

## Status

Version 0.1.0 is the first public release. This is pre-1.0 software: it is
tested (127 end-to-end specs run in CI) but young. Report problems on the
[issue tracker](https://github.com/juhriah-ops/grapestrap/issues).

## What it does

**Editing**

- **Visual canvas, code view, and split view** over the same page. The code
  editor (Monaco) shows the full HTML document, including the `<head>`;
  edits round-trip between views.
- **Drag-to-resize with class snapping.** Dragging a column, image, or
  spacing handle snaps to Bootstrap classes (`col-md-7`, `w-50`, margin and
  padding scale steps) instead of writing pixel CSS. Resizes are
  breakpoint-aware: drag while the canvas is narrowed to a tablet or mobile
  width and the breakpoint-scoped class is written.
- **Bootstrap-aware Style Manager** — seven sub-panels, a pseudo-class state
  bar, a Columns editor for `.row` layouts, and a breakpoint slider above
  the canvas.
- **DOM tree, Quick Tag editor, element wrap, property strip** — the
  Dreamweaver toolset, two-way synced with the canvas.

**Site structure**

- **Master templates.** Page chrome lives in a template with marked editable
  regions; editing the template propagates to every page that uses it.
  Pages on disk stay standalone, fully composed HTML — no template
  resolution is needed to deploy.
- **Library items and snippets** — linked instances that propagate, and
  free-copy fragments.
- **Starter templates** for new projects: Blank, Graphite, Orbit, Vista.
- **Self-contained projects.** Each project keeps its deployable site in a
  `site/` folder with Bootstrap, Bootstrap Icons, and Font Awesome bundled
  in-project — no CDN dependency. Copy `site/` to a web server and every
  link resolves.
- **PHP awareness.** `.php` files open with syntax highlighting and
  `include`/`require` decorations, listed in a Site Files section.
  (Highlighting only — GrapeStrap does not execute PHP.)

**Workflow**

- **Preview in Browser** with auto-reload on save. The preview is served
  from a loopback-only local server; nothing leaves 127.0.0.1.
- **Crash recovery.** While a project has unsaved changes, a recovery
  snapshot is written next to the project file about every 30 seconds; the
  next launch offers Restore or Discard.
- **Git status indicators** — modified/untracked dots in the File Manager
  and branch plus ahead/behind in the status bar for projects that are git
  repositories. Read-only in this release.
- **Workspace layouts** — save and switch named panel arrangements, with
  Designer, Coder, and Compact presets.
- **Asset Manager and Import Folder** for bringing images, fonts, videos,
  and existing sites into a project.
- **Rebindable keyboard shortcuts** via the Preferences dialog.

**Extensibility and languages**

- **Plugin system.** Five bundled plugins ship with the app; user plugins
  install by dropping a folder under `$XDG_CONFIG_HOME/GrapeStrap/plugins/`
  and are confirmed before first load. See
  [docs/PLUGIN-DEVELOPMENT.md](./docs/PLUGIN-DEVELOPMENT.md).
- **Translations.** The interface is fully localizable; languages ship as
  plugins. See [docs/translations/README.md](./docs/translations/README.md)
  to contribute one.

## Install

Each release ships four Linux x86_64 artifacts on the
[GitHub Releases page](https://github.com/juhriah-ops/grapestrap/releases):

| Artifact | For |
|----------|-----|
| `.deb` | Debian, Ubuntu, Mint, Pop!\_OS, elementary |
| `.rpm` | Fedora, openSUSE, RHEL and derivatives |
| AppImage | any distro, no install |
| `.tar.gz` | manual/portable installs |

Full instructions — including `.gstrap` file-type registration, Wayland/X11
behavior, and where GrapeStrap writes files — are in
[docs/INSTALL.md](./docs/INSTALL.md). Flatpak, Snap, and AUR packages are
planned after v0.1.0.

## Build from source

Requires Node.js 20+, npm 10+, and git.

```bash
git clone https://github.com/juhriah-ops/grapestrap.git
cd grapestrap
npm install
npm start                # run the editor from the working tree
npm run build:linux      # package deb + rpm + AppImage + tar.gz into release/
```

The end-to-end suite (127 specs) runs against a built tree:

```bash
npm run build
xvfb-run -a npx playwright test
npm run lint
```

See [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md) before opening a pull
request.

## Documentation

- [docs/INSTALL.md](./docs/INSTALL.md) — installing, updating, removing
- [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md) — bug reports, code, translations
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — how GrapeStrap is built
- [docs/PLUGIN-DEVELOPMENT.md](./docs/PLUGIN-DEVELOPMENT.md) — write a plugin
- [CHANGELOG.md](./CHANGELOG.md) — release history
- [SECURITY.md](./SECURITY.md) — reporting vulnerabilities

## Privacy

GrapeStrap sends nothing, ever. There is no telemetry, no analytics, no
phone-home, no auto-updater, and no account or sign-in for any feature. The
only network activity the app initiates is the local loopback preview
server, and that never leaves your machine. This is a permanent commitment,
restated in Help → About in the app.

## License

[MIT](./LICENSE).
