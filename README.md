# GrapeStrap

**The Dreamweaver alternative the Linux community has been waiting for.**

A desktop visual editor for building static Bootstrap 5 websites, modeled after Adobe Dreamweaver's editing paradigm. Linux-first, MIT licensed, no telemetry, plugin-extensible from day 1.

## Status

Pre-alpha. Active development. v0.0.1 target: 4 weeks from project start. See `GRAPESTRAP_BUILD_PLAN_v4.md` for the full plan.

## Philosophy

- **Class-first styling.** Bootstrap utility classes, not inline styles.
- **Dreamweaver muscle memory.** DOM tree, Quick Tag Editor, Linked Files bar, Library Items, master templates, Property Inspector strip, Design/Code/Split.
- **Built for the community.** Plugin system from v0.1, MIT, Flathub published, no telemetry, no phone-home, translations welcomed from day 1.

## Stack

Electron + GrapesJS + Monaco + Golden Layout + Vite. Vanilla JS, no TypeScript.

## Distribution (planned)

`.deb`, AppImage, rpm, tar.gz (v0.0.1) → Flatpak (v0.0.2) → Snap, AUR (v0.1.0).

## Documentation

- [Build Plan v4](./GRAPESTRAP_BUILD_PLAN_v4.md) — full project plan, current source of truth
- [LICENSE](./LICENSE) — MIT
- (Coming with v0.0.1) `docs/INSTALL.md`, `docs/CONTRIBUTING.md`, `docs/ARCHITECTURE.md`, `docs/PLUGIN-DEVELOPMENT.md`

## Anti-features (we will not have)

- Telemetry, analytics, phone-home of any kind
- Auto-updater that nags or installs without consent
- Account creation or sign-in for any base feature
- Locked features behind a paid tier
- Vendor lock-in
