# Contributing to GrapeStrap

Welcome. GrapeStrap is built for and by the Linux community, and contributions of every shape — code, bug reports, plugins, translations, documentation, screenshots, demo videos — are appreciated.

This document explains how to contribute, what we expect, and where to ask questions. It's deliberately short. If something is missing, file an issue or ask in the discussion forum and we'll add it.

---

## Table of contents

1. [Code of Conduct](#code-of-conduct)
2. [Where to ask questions](#where-to-ask-questions)
3. [Reporting bugs](#reporting-bugs)
4. [Requesting features](#requesting-features)
5. [Submitting code](#submitting-code)
6. [Branch naming](#branch-naming)
7. [Commit messages](#commit-messages)
8. [Pull request process](#pull-request-process)
9. [Plugin contributions](#plugin-contributions)
10. [Translation contributions](#translation-contributions)
11. [Documentation contributions](#documentation-contributions)
12. [Governance](#governance)
13. [Recognition](#recognition)

---

## Code of Conduct

GrapeStrap follows the [Contributor Covenant 2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/), adopted from day 1. The full text lives at `.github/CODE_OF_CONDUCT.md` in the repository.

Treat people well. Disagree on technical merit, not on identity. If someone violates the Code of Conduct, contact the maintainers privately at the email address listed in the CoC file. All reports are handled confidentially.

This applies to every project space: GitHub issues and pull requests, Matrix and Discussions, plugin submissions, translation discussions, and any in-person event held under the GrapeStrap banner.

---

## Where to ask questions

| Question type                         | Best place                                              |
|---------------------------------------|---------------------------------------------------------|
| Quick chat, real-time help            | Matrix room (planned for v0.1.0 launch)                 |
| Longer-form questions, design ideas   | [GitHub Discussions](https://github.com/grapestrap/grapestrap/discussions) |
| Bug reports                           | [GitHub Issues](https://github.com/grapestrap/grapestrap/issues) |
| Plugin questions                      | GitHub Discussions, "Plugins" category                  |
| Translation questions                 | GitHub Discussions, "i18n" category                     |
| Security disclosures                  | Private email (see Code of Conduct file)                |

Don't open an issue to ask a question. Discussions exist for that, and they're indexed for future contributors.

---

## Reporting bugs

Use the bug report issue template (`.github/ISSUE_TEMPLATE/bug_report.md`). It asks for:

- GrapeStrap version (`Help > About` or `grapestrap --version`)
- Distro and version (`cat /etc/os-release | head -3`)
- Display server (`echo $XDG_SESSION_TYPE`)
- Install method (`.deb`, AppImage, build from source, etc.)
- Steps to reproduce
- What you expected
- What actually happened
- Relevant section of `main.log` (see [INSTALL.md](./INSTALL.md#troubleshooting) for the path)

Good bug reports get fixed faster. Vague bug reports (`"the editor is broken"`) get bounced back asking for the same details, costing everyone time.

If you can attach a minimal `.gstrap` project that reproduces the bug, that's gold.

---

## Requesting features

Use the feature request template (`.github/ISSUE_TEMPLATE/feature_request.md`). Be specific about:

- The problem you're trying to solve (not just the solution you have in mind)
- What you've tried as a workaround
- Whether the feature could live as a plugin instead of a core change

The build plan ([`GRAPESTRAP_BUILD_PLAN_v4.md`](../GRAPESTRAP_BUILD_PLAN_v4.md)) is the source of truth for what's planned and when. Before requesting, check the [Phase 4 — v0.2 and beyond](../GRAPESTRAP_BUILD_PLAN_v4.md#phase-4--v02-and-beyond) section to see if your idea is already on the roadmap.

We close feature requests that are out of scope (anything that would compromise the no-telemetry, no-cloud, Linux-first stance — see [README.md](../README.md#anti-features-we-will-not-have)) with a polite explanation. That's not a personal rejection.

---

## Submitting code

### Prerequisites

Set up a development environment per the [Building from source](./INSTALL.md#building-from-source) section of INSTALL.md. The minimum is:

- Node 20+
- npm 10+
- git
- A C/C++ toolchain

### Workflow

1. **Find or open an issue.** For non-trivial changes, discuss the approach on an issue or in Discussions before writing code. This avoids wasted effort.
2. **Fork the repo** on GitHub.
3. **Clone your fork** and add the upstream remote:
   ```bash
   git clone git@github.com:<your-user>/grapestrap.git
   cd grapestrap
   git remote add upstream https://github.com/grapestrap/grapestrap.git
   ```
4. **Create a branch** off `main` (see [Branch naming](#branch-naming)).
5. **Make your changes.**
6. **Run the tests:**
   ```bash
   npm run lint
   npm run test:e2e
   ```
   The Playwright smoke test gates v0.0.1 functionality. Don't break it.
7. **Commit** following the conventions below.
8. **Push** to your fork.
9. **Open a pull request** against `grapestrap/grapestrap:main`.

### What to expect

- A maintainer will review within roughly a week. We triage weekly during active development.
- Reviews may include style nits, architectural suggestions, or asks for tests. None of this is personal.
- Small PRs ship faster. If your change is large, split it into reviewable pieces or open an issue first to align on scope.
- Don't be offended if a PR is closed without merging — sometimes ideas don't fit, and we'd rather decline than merge something we'll regret. We try to explain why.

---

## Branch naming

Use a short prefix that signals intent, then a slug:

| Prefix      | For                                          |
|-------------|----------------------------------------------|
| `feat/`     | New features                                 |
| `fix/`      | Bug fixes                                    |
| `docs/`     | Documentation only                           |
| `refactor/` | Refactors with no behavioural change         |
| `test/`     | Test additions or fixes                      |
| `chore/`    | Build, CI, dependency updates                |
| `plugin/`   | Plugin work (in the bundled `plugins/` tree) |

Examples: `feat/quick-tag-editor`, `fix/wayland-window-icon`, `docs/install-arch`, `plugin/blocks-bootstrap5-col-xxl`.

Keep branch names lowercase, hyphenated, and short.

---

## Commit messages

We **encourage** but do not enforce [Conventional Commits](https://www.conventionalcommits.org/) for the v0.x release series. The format is:

```
<type>(<optional scope>): <short summary>

<optional body explaining what and why>

<optional footer with breaking changes, issue refs>
```

Types we use: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `build`, `ci`.

Examples:

```
feat(plugin-host): support project-pinned plugins

Adds discovery of plugins inside <project>/.grapestrap/plugins/. Project
plugins are version-locked and skip the trust prompt because the project
itself is the trust boundary.

Closes #142
```

```
fix(canvas-sync): preserve cursor position when swapping view modes

Switching from Code to Design rebuilt the component tree but discarded
the Monaco selection. We now snapshot the cursor before the rebuild and
restore it afterwards.
```

```
docs(install): add Arch AUR section
```

For v0.x we tolerate freeform messages so long as they are descriptive. `wip`, `fixes`, `asdf`, `more changes` get rejected. We will likely tighten this for v1.0.

Sign-off your commits with `git commit -s` if you can — it's appreciated but not required.

---

## Pull request process

1. **Open the PR against `main`.** We do not maintain long-lived feature branches.
2. **Reference the issue** the PR closes in the description (`Closes #123`).
3. **Describe what changed and why.** Don't make reviewers reverse-engineer the rationale from the diff.
4. **Keep the PR focused.** One logical change per PR. Refactors that cross cut should be a separate PR.
5. **Include tests** if you're touching tested surface area. The Playwright smoke test gates v0.0.1; new features gating v0.0.2 will need their own tests.
6. **Update docs** in the same PR if you're changing user-facing behaviour. Anything that touches install, config, plugin API, or shortcuts should update [INSTALL.md](./INSTALL.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [PLUGIN-DEVELOPMENT.md](./PLUGIN-DEVELOPMENT.md), or `docs/KEYBOARD-SHORTCUTS.md` as appropriate.
7. **Update [CREDITS.md](../CREDITS.md)** if you're pulling in a new third-party dependency or pattern.
8. **Pass CI.** Lint and the Playwright smoke must be green.
9. **Address review feedback.** Push fixup commits; we squash on merge by default.
10. **Be patient.** A maintainer will get to it.

We use **squash merges** for most PRs to keep `main` history clean. The squashed commit message comes from the PR title and description, so write those carefully.

---

## Plugin contributions

GrapeStrap is built on a plugin API from day 1, and we very much want your plugins.

If you've written a plugin:

- **Don't put it in this repo.** Plugins live in their own repos (typically `npm` packages under your own scope, e.g. `@yourname/blocks-bulma`).
- **Submit it to the curated marketplace** at `grapestrap.org/plugins` once that exists (planned alongside v0.1.0 launch). Until then, post it in [Discussions](https://github.com/grapestrap/grapestrap/discussions) under the "Plugins" category and people will find it.
- **Open a `plugin_submission` issue** (`.github/ISSUE_TEMPLATE/plugin_submission.md`) for inclusion in the curated list.

The full plugin authoring guide is [PLUGIN-DEVELOPMENT.md](./PLUGIN-DEVELOPMENT.md).

If you've found a bug in a **bundled** built-in plugin (`@grapestrap/core-blocks`, `@grapestrap/blocks-bootstrap5`, `@grapestrap/blocks-sections`, `@grapestrap/exporter-flat`, `@grapestrap/lang-en`), file it here in the main repo — those plugins live under `plugins/` in this tree.

---

## Translation contributions

Translations are precious. The Linux community translates fast, and we want every language a translator will give us.

The translation process will be fully documented at `docs/translations/` once the i18n runtime ships in v0.1.0. Until then:

1. Open a [Discussion](https://github.com/grapestrap/grapestrap/discussions) under "i18n" announcing the language you want to add.
2. Wait for the v0.1.0 i18n scaffold (planned, near-term).
3. We'll publish a translator guide and a starter `messages.json` template.

A translation submitted as a `language` plugin (`registerLanguage`) is the canonical path — see [PLUGIN-DEVELOPMENT.md](./PLUGIN-DEVELOPMENT.md). The English message catalog ships as `@grapestrap/lang-en`, so your translation looks structurally identical.

We **do not** machine-translate. If you don't speak the language fluently, please don't submit a translation for it.

---

## Documentation contributions

Documentation PRs are welcome and reviewed quickly.

- Fix typos, broken links, factual errors in any `docs/` file or root-level `.md` — open the PR directly, no issue needed.
- Larger doc rewrites (a new section, restructuring) — open an issue first to align on scope.
- Screenshots and demo videos — drop them in [Discussions](https://github.com/grapestrap/grapestrap/discussions). If we want to use them in the docs site or marketing, we'll ask.

We use plain GitHub-flavored Markdown. No emojis in docs (this is a project convention, not a personal preference). Links between docs use **relative paths** so they work in repo browsing, packaged docs, and the eventual website.

---

## Governance

For the v0.x release series, GrapeStrap follows a **BDFL** (Benevolent Dictator For Life) model. The founding maintainer makes final calls on architecture, scope, and roadmap. This is not because community input doesn't matter — it does, and we read every issue and discussion. It's because in early-stage projects, decisive direction beats consensus paralysis.

**At v1.0+,** if the contributor base has stabilised (3+ regular contributors over a sustained period), we'll evaluate moving to a **steering committee** model. The transition criteria and process will be documented as an ADR in `docs/decisions/` ahead of time.

Architectural decisions are recorded as ADRs (Architecture Decision Records) in `docs/decisions/`. Significant design choices get an ADR before they get code. The ADR is open for public comment in a Discussion thread before being marked accepted.

The locked technical decisions (Electron, Vite, Monaco, Golden Layout, vanilla JS, no telemetry, MIT, plugin-from-day-1, code-authoritative-when-active sync) are documented in the [build plan](../GRAPESTRAP_BUILD_PLAN_v4.md#locked-technical-decisions). Reopening these requires a strong case and a migration plan — the bar is high.

---

## Recognition

Every contributor whose code, translation, or plugin lands gets credit. We add contributor names to:

- The git history (your authored commits)
- [CREDITS.md](../CREDITS.md) for substantial contributions and adapted patterns
- The About dialog in the editor (top contributors)
- Release notes (per-release contributor list)

If we miss your credit somewhere, file an issue. We'll fix it.

---

## Thank you

GrapeStrap exists because Linux deserves a real visual web editor and the community is willing to build one. Whatever shape your contribution takes, we appreciate it.

See also:

- [README.md](../README.md) — project overview
- [INSTALL.md](./INSTALL.md) — installation
- [ARCHITECTURE.md](./ARCHITECTURE.md) — how GrapeStrap is built
- [PLUGIN-DEVELOPMENT.md](./PLUGIN-DEVELOPMENT.md) — write a plugin
- [GRAPESTRAP_BUILD_PLAN_v4.md](../GRAPESTRAP_BUILD_PLAN_v4.md) — full build plan
- [CREDITS.md](../CREDITS.md) — attributions
- [LICENSE](../LICENSE) — MIT
