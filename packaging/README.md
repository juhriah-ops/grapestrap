# Packaging

Distro-specific packaging assets.

## Current targets (v0.0.1)

- `desktop/grapestrap.desktop` — XDG Desktop Entry, registered to handle `.gstrap`
- `desktop/grapestrap-mime.xml` — shared-mime-info entry for `application/x-grapestrap`

`electron-builder` reads `package.json#build.linux.desktop` to generate the desktop file at install time, but we keep a canonical copy here for distros (Flatpak, Snap, AUR) that build outside electron-builder.

## Coming targets

- **v0.0.2:** `flatpak/org.grapestrap.GrapeStrap.yml` — Flatpak manifest for Flathub submission
- **v0.0.2:** rpm builds via electron-builder (no extra files needed)
- **v0.1.0:** `snap/snapcraft.yaml` — Snap manifest for Snap Store
- **v0.1.0:** `arch/PKGBUILD` — AUR (community-maintained)

## MIME registration

The `.gstrap` association is exposed via:

1. The `.desktop` file (Exec line, MimeType field)
2. `grapestrap-mime.xml` installed to `/usr/share/mime/packages/`

After installation, `update-mime-database /usr/share/mime` and `update-desktop-database` need to be run — the `.deb` postinst handles this; AppImage doesn't (per AppImage philosophy, integration is opt-in).
