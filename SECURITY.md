<!-- =============================================================
PATH: SECURITY.md
ROLE: Security policy — supported versions, private vulnerability
      reporting path, scope notes
DEPENDS: docs/INSTALL.md (verifying releases), README.md
CREATED: 2026-07-13 (Wave 5 user docs)
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
- Plugins run unsandboxed in the renderer process by design; user plugins
  require explicit drop-in installation and a first-load confirmation. A
  malicious plugin that the user chose to install is outside the threat
  model, but any way for a plugin or project file to run code *without*
  that consent is firmly in scope — report it.
- Release artifacts are currently unsigned; checksums and signing are
  planned post-v0.1.0 (see [docs/INSTALL.md](./docs/INSTALL.md)).
