<!-- =============================================================
PATH: .github/PULL_REQUEST_TEMPLATE.md
ROLE: Pull request template — what/why prompts + house checklist
DEPENDS: docs/CONTRIBUTING.md (workflow, squash-merge policy),
         docs/translations/README.md (i18n key process)
CREATED: 2026-07-13 (Wave 5 user docs)
============================================================= -->

## What

<!-- What does this PR change? One or two sentences. -->

## Why

<!-- What problem does it solve? Link the issue: Fixes #NNN -->

## How was it verified

<!-- Paste the tail of your test run. New features and bug fixes need a spec. -->

## Checklist

- [ ] Full e2e suite green: `npm run build`, then `xvfb-run -a npx playwright test`
      (the suite drives the built tree — rebuild after any `src/` change)
- [ ] `npm run lint` clean
- [ ] New or rewritten source files carry the file-header breadcrumb block
      (`PATH:` / `ROLE:` / `DEPENDS:` / `CREATED:`)
- [ ] No inline styles — Bootstrap utility classes or project CSS only
- [ ] User-facing strings go through `t()` with catalog keys added — see
      [docs/translations/README.md](../docs/translations/README.md)
- [ ] `CHANGELOG.md` `[Unreleased]` updated for user-visible changes

<!-- PRs are squash-merged: the PR title and description become the commit
     message on main, so write them as you would a commit message. -->
