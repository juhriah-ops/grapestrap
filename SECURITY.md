<!-- =============================================================
PATH: SECURITY.md
ROLE: Security policy — supported versions, private vulnerability
      reporting path, scope notes
DEPENDS: docs/INSTALL.md (verifying releases), README.md
CREATED: 2026-07-13 (Wave 5 user docs)
UPDATED: 2026-08-30 (v0.2 Phase D) — AI panel scope note: the app's first
         opt-in network egress, and how the linked API key is stored
UPDATED: 2026-08-30 (review pass) — noted that Linux's basic_text
         safeStorage backend is explicitly rejected, so the no-keyring
         refusal is an actual guarantee there, not just the common case.
UPDATED: 2026-08-30 (Ollama provider) — one clause: Ollama traffic goes
         only to the user-configured local host, no key involved.
UPDATED: 2026-08-30 (review pass) — softened "local host" to "the Ollama
         address you configure" — the validator accepts any well-formed
         http(s) URL, not just localhost, so "local" overstated it.
============================================================= -->

# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.1.x (latest release) | Yes |
| 0.0.x alpha releases | No — upgrade to the latest release |

Fixes land in the latest 0.1.x release. There are no backports during the
0.x series.

## Reporting a vulnerability

Report vulnerabilities privately through GitHub's vulnerability reporting
for this repository:

**https://github.com/juhriah-ops/grapestrap/security/advisories/new**

Do not open a public issue for a security problem — public issues are
visible immediately, before a fix exists.

Include in the report:

- GrapeStrap version (Help → About) and install method (`.deb`, `.rpm`,
  AppImage, tarball, source build)
- Distro and display server (`echo $XDG_SESSION_TYPE`)
- Steps to reproduce
- Impact as you understand it (what an attacker gains)

You will receive responses through the advisory thread. GrapeStrap is
maintained by a small team; please allow a reasonable window for triage and
a fix before public disclosure, and coordinate the disclosure date in the
advisory thread.

## Scope notes

- GrapeStrap is a local desktop application. It has no accounts, no cloud
  component, and no telemetry. The only network listener it starts is the
  Preview-in-Browser server, which binds to 127.0.0.1 only.
- **AI panel — the one opt-in exception, and the app's first outbound
  network egress.** Nothing leaves the machine until you link an Anthropic
  account in Preferences → AI; from that point on, using the panel sends
  the messages you type and any page or element content the assistant
  requests to Anthropic, under your own API key. The key is encrypted at
  rest via Electron's `safeStorage` (OS keyring-backed) in
  `$XDG_CONFIG_HOME/GrapeStrap/ai-keys.json`, file mode `0600`; GrapeStrap
  never logs it and never transmits it anywhere but the linked provider's
  own API. Unlinking removes the stored key. A system with no usable
  keyring (`encryptionAvailable: false`) is refused a key-input field
  entirely — the alternative there is `ANTHROPIC_API_KEY` in the
  environment, which the app treats as linked but never writes to disk
  itself. On Linux, `encryptionAvailable` explicitly treats Electron's
  `basic_text` `safeStorage` backend (an unencrypted fallback used when no
  keyring is reachable) as unavailable, so "refused a key-input field" is
  an actual guarantee there, not just the common case. With the Ollama
  provider, traffic goes only to the Ollama address you configure — no
  key, and no Anthropic traffic either. That address is validated as a
  well-formed `http://` or `https://` URL, not restricted to localhost —
  GrapeStrap does not verify it actually points at your own machine or
  network, so treat a pasted or shared host value the way you'd treat any
  other endpoint you're choosing to trust.
- Plugins run unsandboxed in the renderer process by design; user plugins
  require explicit drop-in installation and a first-load confirmation. A
  malicious plugin that the user chose to install is outside the threat
  model, but any way for a plugin or project file to run code *without*
  that consent is firmly in scope — report it.
- Release artifacts are currently unsigned; checksums and signing are
  planned post-v0.1.0 (see [docs/INSTALL.md](./docs/INSTALL.md)).
