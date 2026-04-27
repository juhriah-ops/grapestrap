# Installing GrapeStrap

GrapeStrap is a Linux-first desktop visual editor for static Bootstrap 5 sites. This document covers every supported install path, the per-distro packages, building from source, system requirements, Wayland behaviour, and the `.gstrap` MIME registration.

If something doesn't work, please open an issue. See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to report install problems usefully.

> **Status:** Pre-alpha. Packages and channels listed below correspond to the rolling v0.x release plan documented in [`GRAPESTRAP_BUILD_PLAN_v4.md`](../GRAPESTRAP_BUILD_PLAN_v4.md). If a package format is marked "coming v0.0.2" or "coming v0.1.0", it does not exist yet — use AppImage or build from source in the meantime.

---

## Table of contents

1. [System requirements](#system-requirements)
2. [Quick install matrix](#quick-install-matrix)
3. [Debian / Ubuntu (`.deb`)](#debian--ubuntu-deb)
4. [Fedora / openSUSE / RHEL (`.rpm`) — coming v0.0.2](#fedora--opensuse--rhel-rpm--coming-v002)
5. [AppImage (universal)](#appimage-universal)
6. [Tarball (`tar.gz`)](#tarball-targz)
7. [Arch Linux (AUR) — coming v0.1.0](#arch-linux-aur--coming-v010)
8. [Flatpak (Flathub) — coming v0.0.2](#flatpak-flathub--coming-v002)
9. [Snap (Snap Store) — coming v0.1.0](#snap-snap-store--coming-v010)
10. [Building from source](#building-from-source)
11. [Wayland](#wayland)
12. [`.gstrap` MIME registration](#gstrap-mime-registration)
13. [XDG paths and where files live](#xdg-paths-and-where-files-live)
14. [Verifying releases](#verifying-releases)
15. [Uninstalling](#uninstalling)
16. [Troubleshooting](#troubleshooting)

---

## System requirements

GrapeStrap is an Electron application. The runtime ships its own Chromium, Node, and bundled Bootstrap/Monaco/GrapesJS — but it depends on the standard set of GTK/X libraries that every Electron app needs on Linux.

**Minimum runtime requirements:**

- **OS:** Linux x86_64. Glibc 2.31+ (Ubuntu 20.04, Debian 11, Fedora 34, or newer).
- **Display server:** X11 or Wayland. Wayland is auto-detected (see [Wayland](#wayland)).
- **RAM:** 1 GB free for the editor. Large projects benefit from more.
- **Disk:** ~250 MB installed. Project files live wherever you save them.
- **System libraries** (these are pulled in automatically by the `.deb`/`.rpm`; AppImage and tarball users may need to install them manually):
  - `libgtk-3-0` (or `libgtk-4-1`)
  - `libnss3`
  - `libxss1`
  - `libasound2`
  - `libgbm1`
  - `libnotify4` (for desktop notifications)
  - `libsecret-1-0` (for any future credential storage; optional but recommended)

**Building from source additionally requires:**

- **Node.js 20.x or newer** (we test on 20 LTS)
- **npm 10.x or newer** (ships with Node 20)
- **git**
- A C/C++ toolchain (for native module compilation): `build-essential` on Debian/Ubuntu, `@development-tools` group on Fedora, `base-devel` on Arch.

---

## Quick install matrix

| Distro family   | Recommended path           | Status                  |
|-----------------|----------------------------|-------------------------|
| Debian, Ubuntu  | `.deb` from Releases       | Available v0.0.1        |
| Fedora, RHEL    | `.rpm` from Releases       | Coming v0.0.2           |
| Arch, Manjaro   | AUR `grapestrap`           | Coming v0.1.0           |
| Any distro      | AppImage                   | Available v0.0.1        |
| Any distro      | tarball (`tar.gz`)         | Available v0.0.1        |
| Any distro      | Flatpak (Flathub)          | Coming v0.0.2           |
| Any distro      | Snap (Snap Store)          | Coming v0.1.0           |
| Any distro      | Build from source          | Always available        |

Until v0.1.0 ships every package format, **AppImage is the universal fallback**.

---

## Debian / Ubuntu (`.deb`)

The `.deb` is the native package for Debian, Ubuntu, Pop!\_OS, Linux Mint, elementary OS, and other Debian derivatives.

### Install

Download the latest `grapestrap_<version>_amd64.deb` from the [GitHub Releases page](https://github.com/grapestrap/grapestrap/releases), then:

```bash
sudo apt install ./grapestrap_<version>_amd64.deb
```

The `./` prefix is important — `apt install` without it will look on remote repositories.

`apt` will resolve and install all GTK/NSS/X11 dependencies automatically.

### Update

Download a newer `.deb` and run the same command. `apt` will replace the installed version.

### Uninstall

```bash
sudo apt remove grapestrap
```

This leaves your projects, preferences (`$XDG_CONFIG_HOME/GrapeStrap/`), and logs (`$XDG_DATA_HOME/GrapeStrap/logs/`) intact. To remove those as well, see [Uninstalling](#uninstalling).

---

## Fedora / openSUSE / RHEL (`.rpm`) — coming v0.0.2

The `.rpm` will land in v0.0.2 alongside the Flatpak. When it ships, install with:

```bash
sudo dnf install ./grapestrap-<version>.x86_64.rpm
```

or, on openSUSE:

```bash
sudo zypper install ./grapestrap-<version>.x86_64.rpm
```

Until v0.0.2, Fedora and openSUSE users should use the [AppImage](#appimage-universal) or [build from source](#building-from-source).

---

## AppImage (universal)

The AppImage is the universal Linux package. It bundles all dependencies and runs on any glibc 2.31+ distro without extracting or installing anything.

### Run

Download `GrapeStrap-<version>-x86_64.AppImage` from [Releases](https://github.com/grapestrap/grapestrap/releases), then:

```bash
chmod +x GrapeStrap-<version>-x86_64.AppImage
./GrapeStrap-<version>-x86_64.AppImage
```

That's it. The AppImage runs in place. No root, no install, no system changes.

### Optional: integrate into your menu

If you want GrapeStrap to appear in your application launcher and own the `.gstrap` MIME type, install [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) or use [`appimaged`](https://github.com/probonopd/go-appimage). Either will register the `.desktop` entry, the icon, and the MIME association automatically.

Alternatively, drop the AppImage into `~/Applications/` (or anywhere stable), and create a `.desktop` entry by hand:

```ini
# ~/.local/share/applications/grapestrap.desktop
[Desktop Entry]
Type=Application
Name=GrapeStrap
Comment=Visual Bootstrap 5 editor for Linux
Exec=/home/<you>/Applications/GrapeStrap-<version>-x86_64.AppImage %f
Icon=grapestrap
Terminal=false
Categories=Development;WebDevelopment;
MimeType=application/x-grapestrap;text/html;
```

Then refresh:

```bash
update-desktop-database ~/.local/share/applications/
```

### Update

Replace the AppImage with a newer one. AppImageLauncher can do this for you.

---

## Tarball (`tar.gz`)

The tarball is for users who want to drop the editor anywhere on disk without installing system-wide. Useful on locked-down systems, USB sticks, or when you just want to inspect what ships.

### Install

```bash
mkdir -p ~/opt
tar -xzf grapestrap-<version>-linux-x64.tar.gz -C ~/opt/
~/opt/grapestrap-<version>-linux-x64/grapestrap
```

### Optional: launcher entry

```bash
ln -s ~/opt/grapestrap-<version>-linux-x64/grapestrap ~/.local/bin/grapestrap
```

(Make sure `~/.local/bin` is on your `$PATH`.)

You can reuse the `.desktop` template from the [AppImage section](#appimage-universal); replace the `Exec=` line with the binary path.

### Uninstall

```bash
rm -rf ~/opt/grapestrap-<version>-linux-x64
rm -f ~/.local/bin/grapestrap
```

---

## Arch Linux (AUR) — coming v0.1.0

Once v0.1.0 ships, the community-maintained AUR package will be available. Install with your favourite AUR helper:

```bash
# yay
yay -S grapestrap

# paru
paru -S grapestrap
```

A `-bin` variant pulling the official `.tar.gz` and a `-git` variant tracking `main` will also be published.

Until then, Arch users should use the [AppImage](#appimage-universal) or [build from source](#building-from-source).

---

## Flatpak (Flathub) — coming v0.0.2

The Flatpak will ship with v0.0.2 as part of the initial Flathub submission.

```bash
flatpak install flathub org.grapestrap.GrapeStrap
flatpak run org.grapestrap.GrapeStrap
```

The Flatpak sandboxes file access. By default GrapeStrap will request access to your home directory when you open or save a project. You can manage permissions with [Flatseal](https://flathub.org/apps/com.github.tchx84.Flatseal).

---

## Snap (Snap Store) — coming v0.1.0

The Snap will ship with v0.1.0.

```bash
sudo snap install grapestrap
```

The Snap will be published with `--classic` confinement to allow editing files outside the snap home, since project files live wherever the user wants them.

---

## Building from source

Building from source is fully supported and is the recommended path for contributors. It's also the recommended way to install on distros that don't have a packaged release yet.

### 1. Prerequisites

Ensure Node 20+, npm 10+, git, and a C/C++ toolchain are installed:

```bash
# Debian / Ubuntu
sudo apt install -y git build-essential

# Install Node 20 via nodesource (or use nvm/fnm)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Fedora
sudo dnf install -y git nodejs npm @development-tools

# Arch
sudo pacman -S --needed git nodejs npm base-devel
```

Verify:

```bash
node --version    # v20.x or newer
npm --version     # 10.x or newer
git --version
```

### 2. Clone

```bash
git clone https://github.com/grapestrap/grapestrap.git
cd grapestrap
```

### 3. Install dependencies

```bash
npm install
```

This installs the runtime deps (GrapesJS, Monaco, Golden Layout, Bootstrap, Notyf, chokidar, electron-store, electron-log, i18next, prettier, semver), the build deps (Electron, electron-builder, Vite, vite-plugin-electron, Playwright), and the bundled built-in plugins (`@grapestrap/core-blocks`, `@grapestrap/blocks-bootstrap5`, `@grapestrap/blocks-sections`, `@grapestrap/exporter-flat`, `@grapestrap/lang-en`).

First run downloads Chromium for Electron and Playwright; expect 200–400 MB of network traffic and a few minutes.

### 4. Run in development

```bash
npm start
```

This starts Vite in dev mode and launches Electron pointed at the dev server, with hot reload for the renderer.

For the underlying Vite dev server alone (without Electron):

```bash
npm run dev
```

### 5. Build packages

To build every Linux package format at once:

```bash
npm run build:linux
```

This produces `.deb`, AppImage, `.rpm`, and `tar.gz` outputs in `dist/`.

To build a single format:

```bash
npm run build:deb        # Debian / Ubuntu
npm run build:appimage   # universal
npm run build:rpm        # Fedora / RHEL / openSUSE
npm run build:tarball    # tar.gz
npm run build:flatpak    # requires flatpak-builder
npm run build:snap       # requires snapcraft
```

The Flatpak and Snap targets need their respective tooling installed system-wide:

```bash
# Flatpak
sudo apt install flatpak-builder
flatpak install flathub org.electronjs.Electron2.BaseApp//23.08
flatpak install flathub org.freedesktop.Sdk//23.08

# Snap
sudo snap install snapcraft --classic
```

### 6. Run the test suite (optional)

```bash
npm run test:e2e         # Playwright end-to-end tests against Electron
npm run lint
```

The Playwright smoke test exercises the v0.0.1 walking skeleton: open project, drag a block, save, reopen, assert the block is present.

### 7. Install your local build

After `npm run build:deb`:

```bash
sudo apt install ./dist/grapestrap_<version>_amd64.deb
```

Or, for a portable run without packaging:

```bash
npm start
```

---

## Wayland

GrapeStrap auto-detects Wayland at startup and runs natively where available, with a graceful X11 fallback when the environment doesn't support Wayland.

The detection logic lives in `src/main/platform/wayland.js` and works as follows:

1. If `XDG_SESSION_TYPE=wayland` and `WAYLAND_DISPLAY` is set, GrapeStrap launches with `--ozone-platform=wayland --enable-features=UseOzonePlatform`.
2. Otherwise it launches with the default X11 backend.

You can override detection via environment variable:

```bash
# Force Wayland
GRAPESTRAP_PLATFORM=wayland grapestrap

# Force X11 even on a Wayland session
GRAPESTRAP_PLATFORM=x11 grapestrap
```

Or by passing flags directly:

```bash
grapestrap --ozone-platform=wayland
grapestrap --ozone-platform=x11
```

Tested under GNOME (Mutter), KDE Plasma (KWin), Sway, and Hyprland. If you hit a Wayland-specific bug, please file an issue with your compositor name, version, and `echo $XDG_SESSION_TYPE` output.

---

## `.gstrap` MIME registration

GrapeStrap registers the `application/x-grapestrap` MIME type for the `.gstrap` project manifest, so double-clicking a project in Files (Nautilus), Dolphin, or Thunar opens it in the editor.

The `.deb` and `.rpm` packages register the MIME type automatically via the standard `xdg-mime` machinery during installation. The AppImage relies on AppImageLauncher or `appimaged` to do the same. The Flatpak handles it through its manifest.

If for any reason the association doesn't take, register it manually:

```bash
xdg-mime default grapestrap.desktop application/x-grapestrap
update-desktop-database ~/.local/share/applications/
```

To verify:

```bash
xdg-mime query default application/x-grapestrap
# expected: grapestrap.desktop
```

The MIME type is also recognised by the `file` command if you copy the included magic file:

```bash
sudo cp packaging/desktop/grapestrap.xml /usr/share/mime/packages/
sudo update-mime-database /usr/share/mime
```

---

## XDG paths and where files live

GrapeStrap is strict about XDG Base Directory compliance. We do not write to `~/.grapestrap/` or `~/.config/grapestrap/` (lowercase) — we use the proper `$XDG_CONFIG_HOME` / `$XDG_DATA_HOME` / `$XDG_CACHE_HOME` paths, defaulting to the spec when those vars aren't set.

| Purpose                         | Path                                                            |
|---------------------------------|-----------------------------------------------------------------|
| Preferences                     | `$XDG_CONFIG_HOME/GrapeStrap/preferences.json`                  |
| User-installed plugins          | `$XDG_CONFIG_HOME/GrapeStrap/plugins/`                          |
| Snippets library                | `$XDG_CONFIG_HOME/GrapeStrap/snippets/`                         |
| Logs                            | `$XDG_DATA_HOME/GrapeStrap/logs/main.log`                       |
| Plugin data folders             | `$XDG_DATA_HOME/GrapeStrap/plugin-data/<plugin-name>/`          |
| Cache (thumbnails, tmp builds)  | `$XDG_CACHE_HOME/GrapeStrap/`                                   |

If `$XDG_CONFIG_HOME` is unset, it defaults to `~/.config`. If `$XDG_DATA_HOME` is unset, it defaults to `~/.local/share`. If `$XDG_CACHE_HOME` is unset, it defaults to `~/.cache`.

Project files live wherever you save them — they are never stored under XDG. Recovery files (`<project>.gstrap.recovery`) live next to the project, not in the cache.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the rationale.

---

## Verifying releases

Starting with v0.1.0, every release on GitHub is signed with a stable GPG key. The fingerprint is published in the project README and on the website. To verify:

```bash
gpg --recv-keys <FINGERPRINT>
gpg --verify GrapeStrap-<version>-x86_64.AppImage.asc GrapeStrap-<version>-x86_64.AppImage
```

Releases are also accompanied by a `SHA256SUMS` file:

```bash
sha256sum -c SHA256SUMS
```

Pre-v0.1.0 releases are unsigned. Verify by checksum and inspect the source.

---

## Uninstalling

### `.deb`

```bash
sudo apt remove grapestrap

# also purge config
sudo apt purge grapestrap
```

### `.rpm`

```bash
sudo dnf remove grapestrap
```

### AppImage

```bash
rm /path/to/GrapeStrap-<version>-x86_64.AppImage
rm ~/.local/share/applications/grapestrap.desktop  # if you created one
```

### Tarball

```bash
rm -rf ~/opt/grapestrap-<version>-linux-x64
rm -f ~/.local/bin/grapestrap
```

### Flatpak

```bash
flatpak uninstall org.grapestrap.GrapeStrap
```

### Snap

```bash
sudo snap remove grapestrap
```

### Removing user data

To wipe preferences, plugins, snippets, and logs:

```bash
rm -rf "$XDG_CONFIG_HOME/GrapeStrap" "$XDG_DATA_HOME/GrapeStrap" "$XDG_CACHE_HOME/GrapeStrap"
# defaults if those vars are unset:
rm -rf ~/.config/GrapeStrap ~/.local/share/GrapeStrap ~/.cache/GrapeStrap
```

This does not touch your project files. Those are wherever you saved them.

---

## Troubleshooting

### The app doesn't launch and prints `error while loading shared libraries: libnss3.so`

You're missing one of the standard Electron Linux dependencies. Install:

```bash
# Debian / Ubuntu
sudo apt install libgtk-3-0 libnss3 libxss1 libasound2 libgbm1

# Fedora
sudo dnf install gtk3 nss libXScrnSaver alsa-lib mesa-libgbm

# Arch
sudo pacman -S gtk3 nss libxss alsa-lib
```

The `.deb` and `.rpm` packages install these automatically. If you're on AppImage or tarball, you have to install them yourself.

### Wayland session, but the window is fuzzy or has X11 behaviour

Either the Wayland flags didn't get injected, or the compositor doesn't fully support `xdg-shell`. Force Wayland explicitly:

```bash
GRAPESTRAP_PLATFORM=wayland grapestrap
```

If that doesn't help, fall back to X11 and file an issue:

```bash
GRAPESTRAP_PLATFORM=x11 grapestrap
```

### `.gstrap` files don't open from Files / Dolphin / Thunar

The MIME association didn't register. Run:

```bash
xdg-mime default grapestrap.desktop application/x-grapestrap
update-desktop-database ~/.local/share/applications/
```

If you installed via AppImage without AppImageLauncher, the association won't exist at all — install AppImageLauncher or create the `.desktop` entry manually as shown in the [AppImage section](#appimage-universal).

### Permission denied on AppImage

```bash
chmod +x GrapeStrap-<version>-x86_64.AppImage
```

If `chmod` itself fails, the file is on a filesystem that doesn't support exec (some FAT/NTFS mounts). Move it to your home directory.

### Build from source fails with `node-gyp` errors

Make sure you have a C/C++ toolchain installed (`build-essential`, `@development-tools`, or `base-devel`) and that Node is 20.x or newer. If you're on an older glibc, native module compilation may fail — upgrade your distro or use the AppImage.

### Where do I look for logs?

```bash
$XDG_DATA_HOME/GrapeStrap/logs/main.log
# default if unset:
~/.local/share/GrapeStrap/logs/main.log
```

When filing a bug, attach the relevant section of `main.log`.

---

## Next steps

- [README.md](../README.md) — project overview
- [CONTRIBUTING.md](./CONTRIBUTING.md) — how to contribute, file bugs, send patches
- [ARCHITECTURE.md](./ARCHITECTURE.md) — how GrapeStrap is built, for new contributors
- [PLUGIN-DEVELOPMENT.md](./PLUGIN-DEVELOPMENT.md) — write your own plugin
- [GRAPESTRAP_BUILD_PLAN_v4.md](../GRAPESTRAP_BUILD_PLAN_v4.md) — the full build plan
- [CREDITS.md](../CREDITS.md) — attributions
- [LICENSE](../LICENSE) — MIT
