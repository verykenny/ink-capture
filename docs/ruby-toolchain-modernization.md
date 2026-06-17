# Tech debt — Ruby toolchain modernization

> Tracked task / planning note. Captures a deferred toolchain change so it is not
> lost. Builds on the hard rules in [CLAUDE.md](../CLAUDE.md) and the setup docs
> in [README.md](../README.md); this document does not re-litigate them.

**Status:** Open — not started. Low urgency (the current setup works; see below).
**Type:** `chore` / tooling. **Ask-first** per [CLAUDE.md](../CLAUDE.md) (it
alters the toolchain and the committed lockfile).
**Logged:** 2026-06-17.

## Problem / context

iOS dependency setup currently relies on the **macOS system Ruby (2.6.10)** plus
the **Bundler 1.17.2** pinned in `Gemfile.lock` (`BUNDLED WITH 1.17.2`,
`RUBY VERSION 2.6.10p210`). This works today via `scripts/setup.sh`, which sets
`BUNDLE_PATH=vendor/bundle` so gems install project-local without `sudo`.

Two latent fragilities:

1. **System Ruby is a dead end.** `/usr/bin/ruby` is Apple-owned, SIP-protected
   (cannot be upgraded in place), and Apple has deprecated the bundled Ruby with
   removal planned in a future macOS. The project should not depend on it
   long-term.
2. **The Bundler pin is a trap.** Bundler 1.17.2 only runs on **Ruby < 3.2**
   (it calls `String#untaint`, removed in Ruby 3.2). So if a contributor or CI
   makes a newer Ruby the default _without_ also bumping the locked Bundler, a
   plain `bundle install` crashes. This actually happened on 2026-06-17 when a
   Homebrew Ruby 4.0.5 (pulled in as a `brew install cocoapods` dependency)
   shadowed system Ruby; it was resolved by removing the brew Ruby. The README
   "Troubleshooting" section documents the workaround, but the root fragility
   remains.

The repo pins **Node** (`.nvmrc`) and **Java** (`Brewfile` → `zulu@17`) but
**not Ruby** — this task closes that gap.

## Why it is deferred (not urgent)

The committed path works on a stock Mac, and the only failure mode is a
non-default Ruby being forced ahead of system Ruby without a matching Bundler.
Do **not** undertake this as a standalone "upgrade Ruby" step — updating Ruby
_alone_ reintroduces the Bundler-pin crash and is net-negative. Do it only as the
complete, reviewed change below.

## Proposed approach (do all of it together, one PR)

Pin a single modern Ruby with a version manager and regenerate the lockfile's
Bundler so every machine and CI use the same toolchain.

1. Install a version manager: `brew install rbenv ruby-build`, then add
   `rbenv init` to the shell profile. (rbenv is already referenced in the
   project `Gemfile` comments; `chruby`/`mise`/`asdf` are acceptable equivalents.)
2. `rbenv install 3.3.x` — **target the Ruby 3.3.x line** (stable, well-supported
   by CocoaPods and React Native). **Avoid Ruby 4.0.x** (bleeding-edge; it is the
   version that broke Bundler 1.17.2 and some older gems may lag).
3. Add a committed **`.ruby-version`** (`3.3.x`) at the repo root — the per-project
   pin contributors and CI inherit automatically.
4. `gem install bundler` (current), then `bundle install` to **regenerate
   `Gemfile.lock`** with a modern `BUNDLED WITH` and `RUBY VERSION`. Re-run
   `bundle exec pod install --project-directory=ios` and confirm Pods still
   resolve.
5. Update `Brewfile`, `scripts/setup.sh`, and the README "Getting Started" /
   "Troubleshooting" sections to reflect rbenv (and drop the now-obsolete
   system-Ruby workaround).
6. **Verify on CI** (the A2 GitHub Actions gate) so contributors and CI agree;
   adjust the workflow's Ruby setup if it depends on system Ruby.

## Acceptance criteria (Definition of done)

- `.ruby-version` committed; `rbenv`/manager documented in README + `setup.sh`.
- `Gemfile.lock` regenerated with a modern Bundler; `bundle install` and
  `bundle exec pod install` succeed on the pinned Ruby **without** `BUNDLE_PATH`
  gymnastics or `sudo`.
- A fresh `scripts/setup.sh` run works end-to-end on the pinned Ruby.
- CI green on the change.
- README/CLAUDE/docs updated; system-Ruby workaround note removed or revised.

## Out of scope / explicitly rejected

- **Modifying the macOS system Ruby** — impossible (SIP) and inadvisable.
- **`brew install ruby` as the fix** — installs a single unpinned global Ruby that
  shadows system Ruby with no per-project control; this is what caused the
  2026-06-17 discrepancy.

## References

- README "Getting Started → Troubleshooting" (the xcode-select fix and the
  Bundler-vs-newer-Ruby note) — added in PR #8.
- `Gemfile` (pins, with rbenv/rvm comments), `Gemfile.lock` (`BUNDLED WITH`),
  `scripts/setup.sh` (`BUNDLE_PATH=vendor/bundle`).
