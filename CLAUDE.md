# CLAUDE.md — Working agreement for AI agents (and humans)

This file defines the rules of engagement for working in this repository. It
applies to AI coding agents **and** human contributors. If anything here
conflicts with a request, **follow this file and ask a human** before deviating.

Keep this document in sync with [README.md](README.md). If the stack or workflow
changes, update both.

---

## Project summary

**Lorcana Card Recognition & Tracker** (working title: _ink-capture_) is a
cross-platform mobile app that scans physical Disney Lorcana cards with the
phone camera, identifies them, and tracks the user's collection (quantity,
finish, condition). See [README.md](README.md) for full scope, architecture, and
the draft data model.

### Current stack

> Confirmed direction; not yet installed or scaffolded. Items marked _TBD_ are
> still open. Changing a **confirmed** item is an ask-first decision.

- **Bare React Native + TypeScript** (strict mode) — _confirmed_ (bare, not
  Expo-managed).
- `react-native-vision-camera` for capture.
- Recognition behind a pluggable `CardRecognizer` interface. **MVP backend:
  on-device OCR + fuzzy catalog lookup** — _confirmed_. Other candidates (cloud
  vision e.g. Scrydex Vision; on-device image/feature matching) remain behind
  the interface for later.
- OCR engine — _TBD_ (on-device text recognition, e.g. ML Kit / platform Vision
  via a vision-camera frame processor).
- SQLite via `op-sqlite` or `react-native-quick-sqlite` for local storage —
  _TBD which_.
- **Navigation: React Navigation native-stack + `react-native-screens`** —
  _confirmed_ (ratified at C2). Shape: Collection (initial) → Scan → Confirm
  (modal).
- **State management: Zustand** — _confirmed_ (ratified at C2). A vanilla store
  built over the `CollectionRepository` interface, provided to screens via a
  React context (`@state/appServices`).
- **Card catalog: LorcanaJSON** (bulk `allCards.json`, cached on-device) —
  _confirmed_. Chosen because it is the only true bulk source, fitting the
  offline-first OCR backend that matches against a cached catalog locally.
  Lorcast is an _optional secondary_ (on-demand images/prices behind the
  catalog-service interface); lorcana-api.com is a fallback. Card data is
  fetched and cached at runtime, never committed.

---

## Git workflow (HARD RULES)

These are non-negotiable.

- **NEVER commit or push directly to `main`.** Agents must never target `main`
  for commits, pushes, or PRs. `main` is **stable/release only** and is updated
  **only** by occasional, **human-approved** merges from `development`.
- **`development` is the integration branch.** All work converges here first.
- **No direct commits to `development` either.** Every change reaches
  `development` via a **Pull Request** targeting `development`.
- **All work happens on short-lived branches off `development`:**
  - `feature/<short-desc>` — new features
  - `bugfix/<short-desc>` — fixes
  - `chore/<short-desc>` — tooling, docs, config
- **Conventional Commits** for all commit messages:
  `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:` (optionally scoped,
  e.g. `feat(scan): ...`).

### Before starting work

1. Branch from the **latest** `development` (pull/fetch first).
2. Keep PRs **small and focused** — one concern per branch.
3. **Rebase/update from `development`** before opening the PR so it merges
   cleanly.

### Pull request requirements

Every PR description must state:

- **What** changed.
- **Why** it changed.
- **How** it was tested.

PRs target `development`. They are merged after review; `main` receives changes
only through a separate, deliberate, human-approved merge.

---

## Code quality

- **TypeScript strict mode** is required (`strict: true`); no implicit `any`.
- **ESLint + Prettier** must pass; formatting is not hand-maintained.

### Test-driven development (TDD) — the default workflow

**This is a test-driven project.** For any non-trivial logic, write the test
**first**, watch it fail, then write the minimum code to make it pass, then
refactor — the classic **red → green → refactor** loop. Tests are written
alongside the code in the same PR, never deferred to a follow-up.

- **Always TDD (write the test first):** pure domain logic and business rules
  (e.g. collection-entry identity/merge), recognition **matching** logic, data
  **mapping** (catalog → domain models), repository/persistence logic, and state
  reducers/stores. These are framework-free or easily isolated and have clear
  inputs/outputs — there is no excuse to write them test-last.
- **Test, but test-first is impractical:** UI components and screens — cover them
  with render/interaction tests (React Native Testing Library) for meaningful
  behavior, even if the test is written close to the code rather than strictly
  before it.
- **Pragmatic exception (still verify):** pure **scaffolding, native
  configuration, and build wiring** (e.g. the A1 bare-RN scaffold, `Info.plist` /
  `AndroidManifest` permissions, Pods/Gradle setup) are not unit-TDD-able. These
  are verified by the app **building and running** and by manual acceptance steps
  documented in the PR. Where a cheap smoke test is possible (e.g. an `App`
  render test), add one once the test harness exists.
- **Bug fixes:** reproduce the bug with a **failing test first**, then fix it, so
  the test proves the fix and guards against regression.
- **Keep tests fast and deterministic.** Prefer pure unit tests; isolate I/O
  (network, SQLite, camera) behind the service interfaces so logic is tested
  without a device. No network or live catalog/bulk data in tests — use the tiny
  committed fixtures only.

> Test tooling (Jest + React Native Testing Library) is established in task **A2**.
> Until it lands, logic-heavy PRs should not merge ahead of it; sequence work so
> testable logic arrives with a harness to test it.

### Definition of done

A change is "done" when:

1. It builds and the app runs (once the app exists).
2. Lint, format, and type checks pass.
3. New/changed logic was built **test-first** (red → green → refactor) where
   applicable, has tests, and the full test suite passes. Non-TDD-able
   scaffolding/config is verified by build + documented manual acceptance.
4. README/CLAUDE/docs are updated if behavior, stack, or workflow changed.
5. No secrets, copyrighted assets, or bulk card data are committed.
6. The PR describes what/why/how-tested and targets `development`. The
   **how-tested** section names the tests added and the red→green evidence.

---

## Secrets

- **Never commit API keys, tokens, or `.env` files.** `.env` is git-ignored.
- Use **`.env.example`** to document required environment variables (with
  placeholder, non-secret values).
- When introducing a new required env var, add it to `.env.example` **and**
  document its purpose in the same PR.

---

## IP / assets guardrail

This is an **unofficial fan project**. Disney Lorcana is © Ravensburger /
Disney.

- **Do NOT download, bundle, or commit** Lorcana card **images** or **bulk card
  data** into this repository.
- Card data and images are **fetched and cached at runtime only**, from the
  upstream catalog/vision sources under their respective usage policies.
- Keep the repository **free of copyrighted assets**. If you find any committed,
  flag it and remove it.

---

## Ask-first rules

Confirm with a human **before**:

- Adding any **new paid service** or anything that incurs cost.
- **Changing the chosen recognition backend** (or committing to one for the
  first time).
- Adding **heavy native dependencies** (new native modules / build complexity).
- Anything that would **alter the public API surface** of the app or its
  modules.

When in doubt, open an issue or ask — do not assume.
