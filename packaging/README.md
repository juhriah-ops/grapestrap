# Packaging

Distro-specific packaging assets.

## Current targets (v0.1.0)

`.deb`, `.rpm`, AppImage, and `tar.gz` are all built by electron-builder
(`npm run build:linux`, CI: `.github/workflows/release.yml`).

- `desktop/grapestrap.desktop` — XDG Desktop Entry, registered to handle `.gstrap`
- `desktop/grapestrap-mime.xml` — shared-mime-info entry for `application/x-grapestrap`

electron-builder generates its own desktop entry (from
`package.json#build.linux.desktop.entry`) and its own MIME XML (from
`package.json#build.fileAssociations`) at build time for the `.deb`/`.rpm`;
the copies here are the canonical versions for channels that build outside
electron-builder (Flatpak, Snap, AUR). The canonical MIME XML is richer
(icon name, `sub-class-of`) and also ships inside the app at
`resources/mime/grapestrap-mime.xml` via `extraResources`.

## Coming targets (post-v0.1.0)

1. `flatpak/org.grapestrap.GrapeStrap.yml` — Flatpak manifest for Flathub
2. `arch/PKGBUILD` — AUR (community-maintained)
3. `snap/snapcraft.yaml` — Snap Store

## MIME registration

The `.gstrap` association in the `.deb`/`.rpm` is exposed via:

1. The generated desktop entry (`MimeType=application/x-grapestrap;`)
2. The generated MIME XML installed to `/usr/share/mime/packages/grapestrap.xml`

electron-builder's default post-install script runs
`update-mime-database /usr/share/mime` and `update-desktop-database` —
verified in the built artifacts (`dpkg-deb -e` / `rpm -qp --scripts`).
AppImage doesn't register anything (per AppImage philosophy, integration is
opt-in); see `docs/INSTALL.md` for the manual registration steps.
