/**
 * GrapeStrap — Wayland auto-detection
 *
 * Modern Linux desktops (GNOME 40+, KDE 5.24+, Sway, etc.) default to Wayland. Electron
 * renders under XWayland by default, which means blurry HiDPI, broken IME for some
 * locales, and worse touchpad scrolling. Native Wayland fixes all three.
 *
 * Our policy: detect Wayland session, opt into the Ozone Wayland backend automatically.
 * Users on X11 are unaffected; users on Wayland get native rendering without flags.
 *
 * Override:
 *   GRAPESTRAP_FORCE_X11=1     — never use Wayland, even if detected
 *   GRAPESTRAP_FORCE_WAYLAND=1 — always use Wayland (e.g., debugging)
 */

export function detectDisplayProtocol() {
  if (process.env.GRAPESTRAP_FORCE_X11 === '1') return 'x11'
  if (process.env.GRAPESTRAP_FORCE_WAYLAND === '1') return 'wayland'

  // XDG_SESSION_TYPE is set by logind; reliable on systemd distros
  const sessionType = (process.env.XDG_SESSION_TYPE || '').toLowerCase()
  if (sessionType === 'wayland') return 'wayland'
  if (sessionType === 'x11') return 'x11'

  // Fallback: WAYLAND_DISPLAY socket path means we're in a Wayland session
  if (process.env.WAYLAND_DISPLAY) return 'wayland'

  // Default to X11 if nothing else
  return 'x11'
}

/**
 * Apply display-protocol flags to the Electron app instance BEFORE app.whenReady().
 * Must be called early in main.js startup.
 *
 * Pass `app` from electron explicitly (we can't import it here without depending on
 * Electron at module load, which complicates testing).
 */
export function applyDisplayProtocolFlags(app) {
  const protocol = detectDisplayProtocol()
  if (protocol === 'wayland') {
    app.commandLine.appendSwitch('enable-features', 'UseOzonePlatform,WaylandWindowDecorations')
    app.commandLine.appendSwitch('ozone-platform-hint', 'auto')
  }
  return protocol
}
