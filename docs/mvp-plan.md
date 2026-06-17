# ink-capture — Path from docs-only to MVP

> Planning/architecture deliverable. Sequenced set of PRs to take the project
> from its current docs-only state to a working MVP. Build on the confirmed
> decisions in [README.md](../README.md) and the hard rules in
> [CLAUDE.md](../CLAUDE.md); this document does not re-litigate them.

## 0. Status & carry-over (read this first)

> Keep this section current as work lands — it's the handoff state for the next
> contributor (human or agent).

**As of 2026-06-17:**

- **A2 dev tooling + CI gate is complete** (`chore/dev-tooling-ci` →
  `development`): the four quality scripts (`lint`, `format:check`, `typecheck`,
  `test`) are wired; Jest + React Native Testing Library run a passing `App`
  smoke test (with a `react-native-vision-camera` mock in `jest.setup.ts`); a
  Husky pre-commit hook runs `lint-staged` and auto-installs via the `prepare`
  script on a fresh `npm install`; a GitHub Actions workflow gates PRs into
  `development` on the four checks plus a JS bundle check; and a `Brewfile` +
  `scripts/setup.sh` give a one-command machine bootstrap. Native iOS/Android CI
  build verification is **deferred** (tied to closing the A1 boot gate below) —
  the bundle check proves only that the JS module graph resolves.
  - Two hardening fixes made in passing: `@react-native/jest-preset` was
    referenced by `jest.config.js` but missing from `package.json` (it is only
    an _optional_ peer dep of `react-native`, so `npm ci` never installed it) —
    added as a dev dependency; and `npm run lint` now uses `--max-warnings=0`
    because the `@react-native` config emits issues as warnings, so a bare
    `eslint .` exited 0 and never blocked bad code.
- **A1 scaffold is complete but NOT fully verified** (`chore/scaffold-bare-rn`,
  PR #6 → `development`): bare **React Native 0.86.0** + TypeScript (strict)
  scaffolded, New Architecture ON, `react-native-vision-camera` **v4.7.3**
  installed with camera/microphone permissions wired (iOS `Info.plist` + Android
  manifest), a minimal camera-permission "hello" screen at `src/app/App.tsx`, the
  `src/` placeholder tree, and a real README "Getting Started". `npx tsc --noEmit`
  is clean and iOS `pod install` succeeds (77 pods, vision-camera links with frame
  processors disabled). Bundle id `com.verykenny.inkcapture`.
  - vision-camera was pinned to **v4** (not the newer v5, which mandates the
    `react-native-nitro-modules`/`react-native-nitro-image` native deps — a
    heavier, ask-first footprint). Frame-processor/worklets deps are deferred to
    **D1**.
  - ⚠️ **Still pending — re-run both builds to close the A1 acceptance gate:** the
    iOS `xcodebuild` and Android Gradle builds were interrupted mid-compile, so the
    app has **not yet been confirmed to boot** on an iOS simulator or Android
    emulator, and the camera-permission prompt has not been observed end-to-end.
    Run `npm run ios` and `npm run android`, confirm the app launches and the
    permission prompt appears, before treating A1 as truly done / before merging
    PR #6.
- **Next action:** finish A1 verification (re-run the two builds, above — still
  open; it also gates adding native build verification to CI), then Task **A3**
  (`chore/architecture-skeleton`) — TS path aliases and the interface-only
  service boundaries (`CardRecognizer`, `CatalogService`, `PersistenceService`).
  See §2 / the A3 task.

**Settled decisions (don't re-litigate):**

- **Card finish model** (human-approved 2026-06-16): `finish = normal | foil`;
  enchanted and special/promo printings are distinct `Card` rows. Apply in B1.

**Recommendations not yet ratified** — each gets confirmed at its forcing PR, so
treat as the default unless a human overrides:

- SQLite → **op-sqlite** (forced at B3).
- State management → **Zustand** (forced at C2).
- OCR engine → **ML Kit Text Recognition** (forced at D1).

**Carry-over actions for later PRs (easy to forget):**

- **B1:** `README.md`'s draft data model is **currently stale** — it still shows
  `finish = normal | foil | enchanted | special` and lists `enchanted` under both
  `finish` and `rarity`. Reconcile it to the settled model (above) alongside the
  code in the B1 PR.
- **B2:** Add `react-native-config` (or similar) so bare RN can read
  `CATALOG_API_BASE_URL` from `.env`. It's a small **native dep → ask-first** per
  CLAUDE.md before adding.
- **D1:** The ML Kit vision-camera frame-processor plugin is a heavy **native
  dep → ask-first** before adding.
- **Secrets:** MVP backend needs no API key; the commented `RECOGNITION_API_KEY`
  lines in `.env.example` are correctly forward-looking — leave as-is, and don't
  wire a paid backend without the ask-first step.

## 1. Architectural assessment

The documented architecture is solid and this plan builds on it, not redrawing
it. Key observations, risks, and the few things to refine:

### Top risks (in priority order)

1. **Recognition accuracy is the whole ballgame and it's last to de-risk if you
   build UI-first.** OCR on a Lorcana card (name + collector number, over busy
   art, variable lighting) is the single biggest unknown. The docs already treat
   it as the riskiest part and wrap it in `CardRecognizer` — good. This plan
   exploits that interface: **build the entire scan→confirm→save loop against a
   _stub_ recognizer first**, prove the pipeline end-to-end, then swap in real
   OCR behind the same interface. We get a runnable, testable app _before_ we
   gamble on OCR quality.
2. **Bare RN native toolchain is the second unknown.** Bare (not Expo) means iOS
   Pods + Android Gradle + a native frame-processor for
   `react-native-vision-camera`. It must land first, with CI proving a clean
   build, so every later PR has a known-good baseline.
3. **IP guardrail vs. test fixtures.** The catalog mapper is exactly the
   "non-trivial data mapping" the DoD says to test — but bulk `allCards.json`
   must not be committed. Resolution: commit a **tiny, hand-authored fixture**
   (3–5 representative cards covering finishes/enchanted/variant numbering) as
   test data, never the bulk file.
4. **Catalog licensing/etiquette.** LorcanaJSON is a community bulk source.
   Before wiring a runtime fetch, confirm the canonical URL, versioning/ETag
   mechanism, and any rate/caching expectations. Cache aggressively (download
   once, refresh on version change).

### Refinements to the docs (flagged, not silently changed)

- **`enchanted` vs `foil` modeling — decided (2026-06-16, human-approved).** In
  Lorcana, _enchanted_ is a rarity with its own collector number, while _foil_ is
  a finish of an otherwise-normal card. The draft model previously listed
  `enchanted` under both `finish` (CollectionEntry) and `rarity` (Card).
  **Resolution:** `finish = normal | foil` only; enchanted and special/promo
  printings are distinct `Card` rows (own collector number/rarity), not finishes.
  Encode this in B1 (code + README data model together).
- **`.env` won't be read by bare RN out of the box.** `.env.example` documents
  `CATALOG_API_BASE_URL` etc., but bare RN needs `react-native-config` (or
  similar) to surface env vars to native + JS. Add it in the catalog PR; flag it
  as a (small) native dep.
- **Secrets posture for the MVP is effectively "no secrets."** The confirmed
  backend (on-device OCR + LorcanaJSON bulk) needs no API key. The
  `RECOGNITION_API_KEY` lines are correctly forward-looking and commented. Don't
  let anyone wire a paid backend without the ask-first step.

### Sequencing rationale

Foundations (unavoidable horizontal layer, kept thin) → Domain & Data (pure,
fully testable, no device needed) → a **vertical slice with a stub recognizer**
(runnable app early) → real OCR swapped in behind the interface → hardening.
Favoring the stub-first slice is the deliberate call: it turns the riskiest
component into a _drop-in replacement_ rather than a blocking dependency.

---

## 2. Sequenced task list

Every task branches off latest `development`, PRs into `development`, uses
Conventional Commits, and is "done" per the CLAUDE.md DoD (builds/runs +
lint+format+typecheck pass + tests for non-trivial logic + docs updated). Only
_task-specific_ acceptance criteria are called out below.

### Milestone A — Foundations

#### A1. Scaffold bare React Native + TypeScript (strict) — `chore/scaffold-bare-rn`

- **Scope (in):** `npx @react-native-community/cli init` (bare), TS
  `strict: true`, runnable iOS + Android "hello" app, `react-native-vision-camera`
  installed with camera/microphone permissions wired in `Info.plist` +
  `AndroidManifest`. Proposed `src/` tree created (empty dirs/placeholders).
- **Out:** Any feature code, OCR, DB, navigation.
- **Depends on:** nothing (root).
- **Acceptance:** App boots on iOS simulator and Android emulator; camera
  permission prompt appears; `tsc --noEmit` clean. README "Getting Started"
  filled in with real run steps.
- **Size:** **L.** No open decision, but the riskiest setup — do it carefully.

#### A2. Dev tooling + CI gate — `chore/dev-tooling-ci`

- **Scope (in):** ESLint + Prettier (RN/TS configs), Jest + React Native Testing
  Library, `lint-staged` + pre-commit hook, npm scripts (`lint`,
  `format:check`, `typecheck`, `test`), GitHub Actions running all four + a build
  check on PRs into `development`. **Also:** a `Brewfile` (watchman, nvm,
  zulu@17) and a `scripts/setup.sh` that chains `nvm install`, `npm install`,
  `bundle install`, and `bundle exec pod install` so a fresh-machine clone is one
  command after Xcode + Android Studio are installed. Add `npx react-native
doctor` to the README troubleshooting notes.
- **Out:** Feature tests (none exist yet) beyond a smoke test.
- **Depends on:** A1.
- **Acceptance:** CI green on the PR; a deliberately bad lint/format/type error
  fails locally. `bash scripts/setup.sh` on a clean checkout completes without
  errors. Makes the DoD enforceable for everything after it.
- **Size:** **M.** No open decision.

#### A3. Architecture skeleton & service interfaces — `chore/architecture-skeleton`

- **Scope (in):** TS path aliases (`@domain`, `@services`, …) and the
  **interface-only** boundaries: `CardRecognizer`, `CatalogService`,
  `PersistenceService` / `CollectionRepository`, plus shared result types
  (`RecognitionResult`, candidate + confidence). No implementations.
- **Out:** Any concrete impl, DB, OCR.
- **Depends on:** A1 (A2 ideally first so it's linted).
- **Acceptance:** Interfaces compile; dependency direction documented (UI→State→
  Domain; Domain depends only on these interfaces). Short `docs/architecture.md`
  or README section pointing to the interfaces.
- **Size:** **S.** Locks the contracts the rest of the plan fills in.

### Milestone B — Domain & Data

#### B1. Domain models + rules — `feature/domain-models`

- **Scope (in):** `Card`, `CollectionEntry`, `finish`/`condition` enums, and pure
  functions: collection-entry **identity/merge rule** (card + finish + condition
  ⇒ same stack, increment quantity), validation. Framework-free.
- **Out:** Persistence, UI, `Deck` (stretch).
- **Depends on:** A3.
- **Acceptance:** Unit tests cover merge/identity and the enchanted-vs-foil
  decision. No RN imports.
- **Size:** **S–M.** **Model decision (settled):** `finish = normal | foil`;
  enchanted and special/promo printings are distinct `Card` rows (own collector
  number/rarity), not finishes. Update the `README.md` data model in this PR too.

#### B2. Catalog service (sync-and-cache) — `feature/catalog-service`

- **Scope (in):** Fetch `allCards.json` from LorcanaJSON; **map LorcanaJSON →
  `Card`**; cache with version/ETag check (download once, refresh on version
  change); build local index on collector number + normalized name. Add
  `react-native-config` for `CATALOG_API_BASE_URL`.
- **Out:** Fuzzy matching itself (C1), images/prices, Lorcast secondary.
- **Depends on:** B1; coordinates with B3 for where the cache lives — **do B3
  before B2's persistence half**.
- **Acceptance:** Mapper unit-tested against a **tiny committed fixture (3–5
  cards)** — never the bulk file. IP guardrail noted in the PR. Env var added to
  `.env.example` with docs.
- **Size:** **M.** Flag `react-native-config` as a small native dep in the PR.

#### B3. Persistence: SQLite schema + collection repository — `feature/persistence-sqlite`

- **Scope (in):** Choose SQLite lib, init DB, migration runner, tables for
  catalog cache + `CollectionEntry`, implement `CollectionRepository` (CRUD +
  merge-on-insert using B1's rule).
- **Out:** UI, catalog fetching.
- **Depends on:** B1, A3.
- **Acceptance:** Repository tested (in-memory or on-device); migrations
  idempotent.
- **Size:** **M.** **Forces the SQLite decision → recommend `op-sqlite`**: the
  actively-maintained successor (Margelo points `react-native-quick-sqlite`
  users to it), JSI-based, faster, supports reactive queries we'll want for the
  collection list. `quick-sqlite` is effectively legacy.

### Milestone C — Vertical slice with a stub recognizer

#### C1. Recognition matching engine + stub recognizer — `feature/recognition-matching`

- **Scope (in):** Pure matching — **exact collector-number hit first, fuzzy
  normalized-name fallback** against the cached catalog, returning ranked
  candidates + confidence. Plus a `StubCardRecognizer` (returns a fixed/manually
  chosen card) implementing `CardRecognizer` so the slice runs with no OCR.
- **Out:** OCR, camera frame processing.
- **Depends on:** B1, B2 (needs the cached index).
- **Acceptance:** Matching unit-tested (exact hits, fuzzy near-misses,
  no-match) — core "recognition matching" logic the DoD names explicitly.
- **Size:** **M.** Recommend a small well-tested fuzzy lib or hand-rolled
  Levenshtein on normalized names.

#### C2. Scan → confirm → add-to-collection slice + browse — `feature/scan-to-collection-slice`

- **Scope (in):** Navigation, camera/scan screen (capture a frame), confirm sheet
  (top candidate + finish/condition pickers), write via `CollectionRepository`,
  and a collection list screen that reads it back. Wired with **StubRecognizer +
  real catalog + real persistence**. First end-to-end runnable product.
- **Out:** Real OCR (next milestone), edit/remove, stats.
- **Depends on:** C1, B3, B2.
- **Acceptance:** On device/sim you can "scan" (stub), confirm, save, and see it
  in the list across app restarts. State layer tested where non-trivial.
- **Size:** **L.** **Forces the state-management decision → recommend Zustand**
  (no provider boilerplate, tiny, pairs well with op-sqlite reactive reads;
  context+reducers is more ceremony for no benefit at this scale).

### Milestone D — Real recognition (swap the stub)

#### D1. OCR frame processor + `OcrCardRecognizer` — `feature/ocr-recognition`

- **Scope (in):** A vision-camera **frame processor** that OCRs name + collector
  number, feeding C1's matcher; ship as `OcrCardRecognizer` and swap it in behind
  `CardRecognizer` (one wiring change). Start with a short spike to validate
  accuracy before committing.
- **Out:** Tuning/multi-frame (D2).
- **Depends on:** C1, C2.
- **Acceptance:** Real card scans resolve to correct candidates in good lighting;
  the stub remains available behind a flag for tests. Matching stays
  unit-tested; OCR integration validated manually on real cards (documented in
  PR "how tested").
- **Size:** **L.** **Forces the OCR decision → recommend ML Kit Text
  Recognition** via a vision-camera frame-processor plugin: free, fully
  on-device (offline-first, no recurring cost), and **cross-platform**. Apple
  Vision is iOS-only, which breaks the cross-platform goal. Flag the
  frame-processor plugin as a heavy native dep → **ask-first** before adding.

#### D2. Recognition tuning & manual fallback — `feature/recognition-tuning`

- **Scope (in):** Confidence thresholds, optional multi-frame capture, graceful
  fallback to **manual search/correction** when confidence is low.
- **Out:** Second backend, pricing.
- **Depends on:** D1.
- **Acceptance:** Low-confidence scans route to manual pick instead of guessing
  wrong; thresholds tested.
- **Size:** **M.**

### Milestone E — Hardening (mostly v1)

- **E1. Edit/remove entries + manual add** — `feature/collection-edit` (M)
- **E2. Error/offline/empty states** — `feature/error-states` (M): first-run
  catalog download, offline behavior, no-match UX.
- **E3. Collection search + stats** — `feature/collection-stats` (M): search,
  counts by set, completion %.

---

## 3. Do this first

**Start with `chore/scaffold-bare-rn` (Task A1).** Bare RN +
`react-native-vision-camera` native setup is the largest unknown and a hard
prerequisite for _everything_ — there's no app to run, lint, or test against
until it exists, and the DoD ("builds and the app runs") can't be met by any
other PR first. Land a clean, runnable shell with camera permissions, then
immediately follow with A2 so CI enforces the quality bar on every subsequent
PR. Pure-TS domain work (B1) is tempting since it needs no device, but it can't
be _run_ and would sit unverifiable until the scaffold catches up — foundation
first.

---

## 4. MVP cut line

| Tier                   | Tasks                                                                                                | Rationale                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **MVP**                | A1, A2, A3, B1, B2, B3, C1, C2, **D1**, plus minimal browse (in C2)                                  | Delivers the documented MVP loop: scan → identify (real OCR) → add to local collection with quantity/finish/condition, persisted, browsable. |
| **v1**                 | D2, E1, E2, E3                                                                                       | Manual correction, edit/remove, error/offline states, stats/search — the "hardening + improved UX" the roadmap lists.                        |
| **Deferred / stretch** | `Deck`, second `CardRecognizer` backend (cloud/feature-matching), pricing, export/import, cloud sync | All explicitly out of MVP per README; the interface already accommodates the second backend later.                                           |

**Nuance:** C2 ships first with the _stub_ recognizer (fully runnable, just not
"real"). D1 is what makes it MVP-grade. If OCR accuracy disappoints in the D1
spike, the stub-first design means you can ship a "manual search + add" MVP and
treat OCR as a fast-follow — a deliberate fallback the architecture buys you.

---

## Open decisions & their forcing PRs

| Decision         | Forced by | Recommendation                                          |
| ---------------- | --------- | ------------------------------------------------------- |
| SQLite library   | B3        | **op-sqlite**                                           |
| State management | C2        | **Zustand**                                             |
| OCR engine       | D1        | **ML Kit Text Recognition** (cross-platform, on-device) |

The **enchanted-vs-foil** modeling for B1 is now settled (`finish = normal |
foil`; enchanted/special are distinct `Card` rows). One item still needs a human
confirm before its PR: the **ML Kit frame-processor native dep** (D1, ask-first
per CLAUDE.md).
