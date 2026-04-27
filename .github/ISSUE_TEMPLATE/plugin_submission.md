---
name: Plugin submission
about: Submit a plugin for the curated list at grapestrap.org/plugins
labels: plugin-submission
---

## Plugin

- **Name:** (`@yourscope/your-plugin`)
- **Repository:** https://github.com/...
- **License:** (must be OSI-approved)
- **Type:** block / section / panel / exporter / theme / language / command / snippet-pack
- **Version:** (semver)
- **GrapeStrap compatibility:** (semver range, e.g., `^0.1.0`)

## What does it do?

One paragraph. Be specific about what it adds and what it doesn't.

## Manifest

Paste your `grapestrap.json` here for review.

## Permissions

If your plugin requests any permissions in the manifest, justify each one. If it accesses the network, hits the file system outside its scoped data dir, or executes user-supplied code — say so prominently.

## Testing

- [ ] Loads cleanly with no console errors on a fresh install
- [ ] Cleanly uninstalls (drop folder removed → editor still works)
- [ ] Tested on at least: GrapeStrap version `___` on `___` Linux distro
- [ ] No telemetry, no remote calls without user consent

## Code of Conduct

By submitting, you agree to abide by the [Contributor Covenant](https://github.com/grapestrap/grapestrap/blob/main/.github/CODE_OF_CONDUCT.md). Plugins that violate it will be removed from the curated list.
