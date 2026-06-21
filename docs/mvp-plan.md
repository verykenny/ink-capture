# ink-capture — Path from docs-only to MVP

> Planning/architecture deliverable. Sequenced set of PRs to take the project
> from its current docs-only state to a working MVP. Build on the confirmed
> decisions in [README.md](../README.md) and the hard rules in
> [CLAUDE.md](../CLAUDE.md); this document does not re-litigate them.

## 0. Status & carry-over (read this first)

> Keep this section current as work lands — it's the handoff state for the next
> contributor (human or agent).

**As of 2026-06-21:**

- **A2 dev tooling + CI gate is complete** (`chore/dev-tooling-ci` →
  `development`): the four quality scripts (`lint`, `format:check`, `typecheck`,
  `test`) are wired; Jest + React Native Testing Library run a passing `App`
  smoke test (with a `react-native-vision-camera` mock in `jest.setup.ts`); a
  Husky pre-commit hook runs `lint-staged` and auto-installs via the `prepare`
  script on a fresh `npm install`; a GitHub Actions workflow gates PRs into
  `development` on the four checks plus a JS bundle check; and a `Brewfile` +
  `scripts/setup.sh` give a one-command machine bootstrap. **Native iOS/Android CI
  build verification landed in `chore/native-ci`** (`.github/workflows/native-build.yml`):
  a path-filtered macOS iOS-simulator build + Ubuntu Android `assembleDebug`,
  complementing the JS bundle check (which only proves the module graph resolves).
  - Two hardening fixes made in passing: `@react-native/jest-preset` was
    referenced by `jest.config.js` but missing from `package.json` (it is only
    an _optional_ peer dep of `react-native`, so `npm ci` never installed it) —
    added as a dev dependency; and `npm run lint` now uses `--max-warnings=0`
    because the `@react-native` config emits issues as warnings, so a bare
    `eslint .` exited 0 and never blocked bad code.
- **A1 scaffold is complete and verified** (`chore/scaffold-bare-rn`,
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
  - ✅ **Verified 2026-06-17 — A1 acceptance gate closed.** The app builds and
    boots on the **iOS Simulator** (iPhone 17 / iPhone 17 Pro, iOS 26.5) and the
    **Android emulator** (Pixel_9, API 35), and the **camera-permission prompt was
    observed end-to-end** on both. PR #6 is merged; A1 is done. (Verification was
    done on a fresh M5 clone — the setup gotchas surfaced are now in the README
    troubleshooting notes; see also the unrelated `ios/Podfile.lock` prebuilt-hash
    follow-up flagged during that work.)
- **A3 architecture skeleton & service interfaces is complete**
  (`chore/architecture-skeleton`, PR #14 → `development`, merged 2026-06-17): TS
  path aliases (`@domain`, `@services`, `@state`, `@ui`, `@lib`) wired in **both**
  `tsconfig.json` (`baseUrl` + `paths`, bare + `/*` per alias) and
  `babel.config.js` (`babel-plugin-module-resolver`, a dev-only/JS-only dep) —
  `metro.config.js`/`jest.config.js` left untouched and the Jest
  `moduleNameMapper` fallback was **not** needed. Ships interface-only service
  ports (`CardRecognizer`, `CatalogService`,
  `CollectionRepository`/`PersistenceService`) plus the shared `RecognitionResult`
  family, and forward-declared placeholder domain types (`Card`,
  `CollectionEntry`, with `Finish`/`Condition` as `string`). Adds
  `docs/architecture.md` and a README Architecture subsection. The dual-config is
  bundle-proven (`App.tsx` imports `APP_NAME` from `@lib`; the Android JS bundle
  resolves it) and CI is green.
  - **Placeholder line (A3 vs B1):** A3 ships only the contract surface. The
    `finish = normal | foil` union, the condition grades, validation, the
    collection-entry merge rule, and the README data-model reconciliation are all
    **B1**. `@state`/`@ui` aliases are config-only (their `.gitkeep`s remain)
    until **C2** populates those layers.
  - **Optional follow-up (still open, non-gating):** native iOS/Android build
    verification in CI — unblocked by the closed A1 boot gate; A3's PR shipped
    without it, so do it as a fast-follow `chore/`.
- **B1 domain models + rules is complete** (`feature/domain-models`, PR #17 →
  `development`, merged 2026-06-17): the A3 placeholders
  are narrowed to the settled model and the collection-entry identity/merge rule
  and validation are encoded, all **pure and framework-free** (no `react-native*`
  imports; the suite runs with no device). `Finish`/`Condition` are now
  `as const` tuples → derived unions + `isFinish`/`isCondition` guards, with
  `finish = normal | foil` and conditions `NM|LP|MP|HP|DMG`; `Card` is expanded
  (`version?`, `rarity`, `availableFinishes: readonly Finish[]`, `imageUrl?`, all
  `readonly`); `CollectionEntry.addedAt`/`updatedAt` are settled as ISO 8601 UTC
  strings (branded type deferred); and `NewCollectionEntry`/`CollectionEntryKey`
  were relocated into `@domain` (re-exported byte-compatibly from
  `@services/persistence`) so the domain depends only inward. `resolveAddition`
  returns a pure `AddOutcome` intent (increment carries `targetId` plus the
  summed quantity only; create carries the incoming entry; throws on more than
  one stack per identity), and `validateNewCollectionEntry` /
  `assertValidNewCollectionEntry` validate the untrusted loose shape. The README
  data model is reconciled in the same PR. Full local gate green (6 suites / 59
  tests; TDD red→green for the value-set, merge, and validation chunks).
  - **Deliberate B1 deferrals (tracked, not debt):** (1) the branded
    `IsoTimestamp` type for `addedAt`/`updatedAt` (plain ISO `string` for now);
    (2) the cross-field invariant `finish ∈ Card.availableFinishes`, which needs
    a Card↔Entry join and lands at the B2/B3/C2 seam — `validateNewCollectionEntry`
    deliberately does not enforce it. Neither blocks B3.
  - **B3 hand-off (don't forget):** the merge rule assumes at most one stack per
    `(cardId, finish, condition)` and throws otherwise — B3 must enforce a
    `UNIQUE` index on those columns so that path is impossible.
  - **Test infra:** `jest.config.js` gained a scoped `testPathIgnorePatterns` for
    `__tests__/fixtures/` so the hand-authored fixtures helper isn't run as an
    empty suite; no `babel.config.js` / `tsconfig.json` alias changes.
- **B3 persistence (SQLite schema + collection repository) is complete**
  (`feature/persistence-sqlite`, PR #19 → `development`, merged 2026-06-17): the
  `CollectionRepository` and
  `PersistenceService` contracts get a SQLite body behind a thin `SqliteDatabase`
  driver seam (`execute` + `close` + `withTransaction`), so the exact production
  SQL runs against op-sqlite on a device (`OpSqliteDatabase`, the only op-sqlite
  importer) and a real in-memory SQLite in Jest. Migration 001 creates
  `collection_entries` with the **mandatory `UNIQUE (card_id, finish, condition)`
  index** (B1's invariant — makes `resolveAddition`'s >1-stack throw structurally
  impossible) plus `finish`/`condition`/`quantity` CHECKs; migration 002 creates
  the catalog cache (`catalog_cards` + its two indexes, `catalog_meta`) for B2.
  The runner is `PRAGMA user_version` + an ordered, forward-only, idempotent
  migration array. `add()` is merge-on-insert: identity-scoped SELECT →
  `resolveAddition` → faithful create/increment write (increment touches only
  quantity + `updated_at`, by `targetId`; incoming notes dropped), all
  transactional. Id is rowid-derived (`id = String(rowid)`, read back via
  `RETURNING *`); the clock is injected for deterministic timestamps. Full local
  gate green (87 tests; TDD red→green for migrations, CRUD, and merge-on-insert).
  - **Ratified op-sqlite (the forcing PR):** `@op-engineering/op-sqlite` is now
    the installed SQLite library (ask-first gate cleared by the user).
  - **Test-engine decision (ratified in-flight):** the Jest SQLite engine is
    Node's built-in **`node:sqlite`**, NOT a native devDependency. better-sqlite3
    (the originally-ratified test engine) is a native `.node` addon, and Jest
    sandboxes each test file's module registry — the second persistence spec to
    load it re-runs `process.dlopen` on the process-global binary and corrupts it
    so CHECK/UNIQUE violations silently stop throwing (a non-deterministic suite).
    node:sqlite is compiled into Node → no dlopen, deterministic, zero dep.
    **B2 must use the same `TestSqliteDatabase` helper** (`__tests__/persistence/`)
    for its persistence specs. This added `@types/node` + `"node"` to the tsconfig
    `types` and set `engines.node` to `>=22.5.0` (when `node:sqlite` landed).
    - **Toolchain bump (don't miss it):** the pinned dev/CI Node went **20 → 26**
      (`.nvmrc` + CI, commit `378db55`) — the version B3 is actually developed and
      tested against. **Existing contributors must `nvm install` the new `.nvmrc`**
      or `node:sqlite`-backed tests won't run. (`node:sqlite` is a recent built-in;
      may emit an `ExperimentalWarning` on some Node lines — low risk, suite green
      on 26.)
  - **B2 hand-off:** the catalog cache lives in `catalog_cards`
    (id, name, normalized_name, version, set_code, collector_number, rarity,
    available_finishes as a JSON array, image_url) and `catalog_meta(key, value)`
    for the version/ETag — **B3 created them empty; B2 owns population + mapping.**
- **B2 catalog service (sync-and-cache) is complete** (`feature/catalog-service`,
  PR #21 → `development`, merged 2026-06-17): the `CatalogService` contract gets a body —
  `LorcanaCatalogService` fetches LorcanaJSON's `metadata.json` + `allCards.json`,
  maps each card to the settled `Card` model, and caches it into B3's
  `catalog_cards` / `catalog_meta` (no new migration), exposing
  `findByCollectorNumber` (indexed exact hit) and `getAllCards` (C1's fuzzy feed).
  All pure/isolated and fully tested with **no network and no device** (56 new
  tests; TDD red→green for the mapper, normalization, cache, and service).
  - **Confirmed catalog source + versioning:** base
    `https://lorcanajson.org/files/current/en`; fetch the raw `allCards.json`
    (`{ metadata, sets, cards[] }`), poll the small `metadata.json` and key the
    cache-skip on **`generatedOn`** (store `formatVersion` too) — re-download only
    when `generatedOn` changes. The `.zip` + MD5/ETag are out of scope. Verified
    read-only against a live sample while authoring the fixture (esp. the
    `foilTypes` values).
  - **Mapping decisions (ratified):** `Card.id = String(raw.id)`;
    `availableFinishes` from `foilTypes` (`'normal'` iff it contains `'None'`,
    `'foil'` iff any other entry; default `['normal']`; order `['normal','foil']`);
    Enchanted/Special are foil-only **distinct rows**, never a finish.
    `normalized_name` = `normalizeCardName(name+version)` — a B2-owned shared util
    **C1 reuses on OCR text** (NFD-strip-diacritics → lowercase → strip
    punctuation → collapse whitespace → trim).
  - **Seams:** all network goes through an injectable `HttpJsonClient`
    (prod impl wraps global `fetch`; tests inject a fake — no live data, ever);
    persistence is the B3 `SqliteDatabase` seam exercised via `TestSqliteDatabase`
    (node:sqlite). The refresh is one transaction (DELETE-all + re-INSERT + meta
    upsert), so a failed/partial download leaves the prior cache intact.
  - **Ratified `react-native-config` (^1.6.1):** the env dep that lets bare RN
    surface `CATALOG_API_BASE_URL` (ask-first gate cleared by the user). Used as
    an _override_ only — `DEFAULT_CATALOG_BASE_URL` is the canonical code default,
    so the app works with no `.env`. Isolated to `catalogConfig.ts` (mocked in
    Jest); iOS autolinks, Android adds the `dotenv.gradle` apply line. **Native
    install/autolink + on-device sync smoke is the documented manual acceptance**
    (per the DoD native-config exception).
  - **IP guardrail:** only a tiny hand-authored fixture (3 `cards.ts`-matching
    rows + 2 numeric-id edge cards, fake `example.test` image URLs) is committed —
    never the bulk `allCards.json`, never card images.
  - **Follow-ons (from B2 review, non-blocking):** (1) **iOS `.env` override not
    wired** — the iOS pod autolinks but surfacing an actual `.env` _value_ into the
    iOS build needs a build phase; `DEFAULT_CATALOG_BASE_URL` (code default) covers
    MVP, so this only matters if a real iOS catalog-URL override is ever needed.
    (2) **Refresh is a full table-replace** (DELETE-all + re-INSERT); fine at this
    scale/frequency — a diff-upsert is a future optimization only if refresh cost
    matters.
- **✅ Milestone B (Domain & Data) is complete** — B1 + B2 + B3 all merged. The
  domain models/rules, the SQLite persistence + repository, and the catalog
  sync-and-cache are all in place and tested.
- **C1 recognition matching engine + stub recognizer is complete**
  (`feature/recognition-matching`, PR #23 → `development`, merged 2026-06-17) —
  the pure matching engine (exact collector-number tier → fuzzy normalized-name
  fallback, ranked candidates + confidence), the `createCardMatcher` seam over
  `CatalogReader`, the shared `cardMatchKey` (catalogCache delegates to it), and
  `StubCardRecognizer` all landed and tested (fixtures only; 189 tests green). See
  the C1 task below for the full breakdown. **C2 is now unblocked.**
  - **Settled fuzzy approach:** a **hand-rolled Levenshtein** + normalized
    `similarity` → [0,1] (`src/domain/matching/levenshtein.ts`) — no fuzzy-lib
    dependency. (Closes the "small lib vs. hand-rolled" open recommendation.)
  - **Downstream notes (from C1 review, non-blocking):** (1) **`confidence` is a
    relative ranking score, not a calibrated probability** — exact-no-name is
    `1/N` (ambiguity), exact-with-name and fuzzy are name `similarity`, so a
    correct exact hit with an off name can read <1.0. **C2 should use it as a
    confirm-UI hint + ordering only**; **D2** formalizes thresholds/manual
    fallback. (2) The fuzzy tier **scans the whole catalog in memory per match**
    (`getAllCards()` → `similarity` over every row) — fine for MVP/stub; a
    `normalized_name`-index prefilter is a future optimization that matters at
    **D1** (real-time scanning).
- **C2 scan→confirm→add-to-collection slice + browse is complete**
  (`feature/scan-to-collection-slice`, PR #25 → `development`, merged 2026-06-18): the first end-to-end
  runnable product — navigation, a Zustand store, the three screens, and the real
  composition root, wired with `StubCardRecognizer.forCard(demoCard)` + the real
  catalog + real persistence. Relaunch lands on the persisted Collection list;
  scan (stub) → confirm (finish/condition pickers from `FINISHES`/`CONDITIONS`,
  quantity) → save via `CollectionRepository.add` (merge-on-insert) → the entry
  appears in the list and survives restart. The temporary B3 "Test DB" button +
  inline composition root are removed. Full local gate green (24 suites / 209
  tests; TDD red→green for the store; RNTL render/interaction tests for all three
  screens + the App smoke through the loading gate). **On-sim acceptance PASSED on
  iOS (iPhone 17) + Android (Pixel_9) on 2026-06-18** (see the dedicated bullet
  below). What landed:
  - **State = Zustand** (forcing PR; ask-first cleared). A **vanilla store**
    (`@state/collectionStore`, `createCollectionStore(repo)`) over the
    `CollectionRepository` **interface** — never SQLite — holding the collection
    list + a load/add status. `add` re-lists after the write so merge-on-insert
    is reflected exactly as the repository resolved it.
  - **Navigation = React Navigation native-stack + `react-native-screens`**
    (native dep; ask-first cleared). Shape: **Collection (initial) → Scan →
    Confirm (modal)**. Android `MainActivity.onCreate(null)` added per the
    `react-native-screens` requirement (runtime-verified on a cold Android
    relaunch); iOS `pod install` (80 pods) + Android Gradle build both succeed and
    `ios/Podfile.lock` is regenerated + committed.
  - **Injectable composition root** — `@app/compositionRoot.createAppServices()`
    builds the concrete graph; `initialize()` runs the startup sequence
    (`persistence.init()` → `catalog.sync()` → pick demo card → wire the stub
    recognizer → `store.load()`) behind a minimal loading gate; `App({ services })`
    accepts injected fakes (tests run with no DB/network/native). **D1 swaps the
    recognizer in one line** in `initialize()`.
  - **`@state`/`@ui` conventions set (E1/E2/E3 inherit):** dependency direction
    `@ui → @state → @domain`; services are consumed as **interfaces** via a React
    context (`@state/appServices`, `useAppServices`) — the context lives in
    `@state` (not `@app`) so UI never imports outward (there is no `@app` alias).
    The route table (`RootStackParamList`) lives in `@ui/navigationTypes` for the
    same reason. Only `@app` imports concrete services. Pickers are a generic
    segmented `OptionSelector` fed the domain `FINISHES`/`CONDITIONS` sets (no
    picker native dep). **Confidence is a display hint only — never gates Save.**
  - **Jest wiring:** `transformIgnorePatterns` now whitelists `@react-navigation`
    - its native peers (they ship ESM), and `react-native-safe-area-context` is
      mocked with its shipped jest mock (its provider withholds children until an
      onLayout that never fires under Jest). Screens are tested by rendering the
      component directly (no `NavigationContainer`), so `react-native-screens` is
      not exercised there.
  - **Deliberately out (clean seams):** real OCR (D1), edit/remove (E1), rich
    first-run/offline/no-match/error UX (E2 — C2 has a minimal gate + no-match
    branch only), search/stats (E3).
  - **On-sim acceptance — ✅ PASSED on both platforms (2026-06-18):** iOS
    Simulator (iPhone 17, iOS 26.5) and Android emulator (Pixel*9, API 35).
    `pod install` (80 pods, `RNScreens` autolinked) + Gradle build both succeed;
    the app boots past the loading gate (real catalog `sync()` over the network);
    scan (stub) → Confirm shows a real catalog card (\_Ariel — On Human Legs*,
    "100% match") with the `FINISHES`/`CONDITIONS` pickers → save via the
    repository → appears in the list → **survives a cold relaunch** (iOS
    terminate+relaunch; Android `am force-stop`+relaunch, exercising the
    `react-native-screens` `onCreate(null)` path with no crash); merge-on-insert
    increments in place (iOS ×2→×3, single row). Documented with screenshots in
    PR #25. Closes B2's open "confirm iOS pod autolink when C2 wires the
    composition root" item.
- **✅ Milestone C (vertical slice with a stub recognizer) is complete** — C1 + C2
  merged. The app is the first **end-to-end runnable product**: scan (stub) →
  confirm → save → browse, on the real catalog + real persistence, verified on the
  iOS Simulator + Android emulator (2026-06-18). **D1** (real OCR) is **merged**
  (PR #27), with the on-device accuracy spike **passed 10/10** (see Milestone D
  below).
- **Toolchain reminder (sharpened after the C2 review):** the Jest suite now
  **hard-requires Node ≥22.5 (pinned 26 via `.nvmrc`)**. On Node 20 the **9
  persistence/catalog suites fail to _load_** (`No such built-in module:
node:sqlite`) — a scary-looking suite failure that is purely Node-version drift,
  not a code defect. CI keys off `.nvmrc`; local contributors must `nvm use` to
  match it. (First flagged at B3; C2 widened the affected suites.)
- **✅ MVP loop achieved — code-complete and runnable, not yet field-hardened.**
  D1 (PR #27, merged 2026-06-18) makes the documented loop real: **scan a physical
  card → on-device ML Kit OCR → C1 match → confirm → save → browse, persisted.**
  All MVP-tier tasks (A1–C2, **D1**) are merged, and **native iOS+Android build CI
  is now wired** (`chore/native-ci`, PR #29 — closes the long-standing optional
  follow-up). **Honest caveat:** the 10/10 spike was on curated stills; **live-camera
  accuracy is not yet field-reliable** (glare/focus/misreads, e.g. _Boun_ #104 →
  _Billy Bones_ #104 ~26%). PR #30 added tap-to-focus + ultra-wide macro autofocus
  - pinch zoom to help; **D2 is what makes recognition dependable in the field.**
- **Native deps added at D1 (visibility / retroactive ratification):**
  `@react-native-ml-kit/text-recognition` (on-device, free, no key — the approved
  OCR engine) and a light filesystem module `@dr.pogodin/react-native-fs`, used
  only to delete the captured still after OCR (privacy/storage — the temp-file
  cleanup the plan asked for). The ML Kit pod bumped the **iOS deployment target to
  15.5** (handled in the Podfile). The fs module is a small native dep added under
  the cleanup requirement rather than its own ask-first — flagging for awareness.
- **D2 recognition tuning & manual fallback is complete**
  (`feature/recognition-tuning`, PR #32 → `development`, merged 2026-06-21): a pure
  `decideRecognition` routing policy (floor 0.70 / margin 0.15 / top-N 10), a
  unified manual-pick / search screen, the "Wrong card?" escape, dev-only
  flag-gated diagnostics (`DEBUG_RECOGNITION`), plus a JS single-flight OCR guard +
  a patched ML Kit native leak fix (`patch-package`) — so a low-confidence or
  ambiguous scan (the _Boun_ #104 case) routes to a top-N / manual pick instead of
  silently saving the wrong card. **On-device acceptance PASSED (iPhone 16 Pro /
  iOS 27, 2026-06-20): recognition is field-SAFE** — zero wrong auto-saves across
  the test scans, correct card at #1 every time and present in the pick list.
  - **Key finding from the device run (→ D3):** confidence is **systematically
    capped below the 0.70 floor**, so correct reads route to the manual pick (one
    extra tap) rather than auto-confirming. Two root causes — both refinements, not
    D2 defects (D2's job was "no wrong saves," which it does): **(A)** the collector
    number filters the candidate set but never _boosts_ confidence (`rankExactTier`
    = name similarity only); **(B, higher impact)** the parser's subtitle selection
    often grabs the **artist credit / ability text** instead of the card
    **version**, and since the matcher key is `name + version`, a correct title +
    wrong subtitle scores _worse_ than the title alone (Boun: 29% vs ~100% with the
    right subtitle). Captured as **D3** below.
- **D3 recognition confidence refinement is complete**
  (`feature/recognition-confidence`, PR #36 → `development`, merged 2026-06-21) — lifts
  correct reads above the 0.70 auto-confirm floor **without relaxing the
  no-wrong-save guarantee**, all pure logic and test-first. What landed:
  - **(B, the dominant drag) version/subtitle selection in `parseCardText` — now
    anchored to the type line.** Real `DEBUG_RECOGNITION` captures (2026-06-21)
    pinned the failure: the **version prints smaller than the big all-caps name**,
    so the old `height ≥ ½·name` gate dropped it and the parser fell through to the
    artist credit / ability / flavor text below (`DAVID XANATOS chosen character.`,
    `BALOO ura Pauseli`, `BOUN Alice Pisoni`; on an Action card `PROMISING LEAD ley
lines…`). Fix: when a type line is found below the name, the **version is the
    title-like line(s) BETWEEN the name and that type line — taken by position, not
    height** (the tallest-ALL-CAPS name pick and the ≤6-word pre-filter are
    unchanged; type-line- and artist-credit-shaped lines — a leading `> » · • →`
    glyph or a co-artist `Name / Name` slash — are still excluded). So **character**
    cards yield `NAME version` whatever the version's size, and **Action / Item /
    Location / Song** cards yield the **bare NAME** (their type line sits directly
    under the name, nothing between → no version).
  - **Rotation-aware (the decisive on-device finding).** A second device run
    (per-line frames now dumped in the diagnostics) showed the captures come out
    **sideways** — ML Kit reports each line as `w≈capHeight, h≈textLength`, so the
    card's top-to-bottom axis is the image **X** axis, not Y, and the y-based
    ordering scrambled. `selectTitleLines` now **detects rotation** from the lines
    (text is always longer than tall) and measures cap height + a stacking position
    on the detected axis; the version is the nearest non-type, non-artist line to
    the name that sits **closer than the type line** (the type line is the anchor —
    no height ratios). Validated against the **verbatim device frames** (THOMAS,
    DAVID XANATOS, GIZMODUCK, PROMISING LEAD). _(Upstream follow-up: applying the
    capture's EXIF/orientation before ML Kit would avoid the sideways read at the
    source — a separate `MlKitOcrEngine`/capture change.)_
  - **(small guard) BALOO trailing-digit:** `TRAILING_NUMBER` narrowed from
    `\s*\d+\s*$` to `(?:\s+\d+|\d{2,})\s*$` — a single digit fused to letters
    (`BALO0`, an O/0 misread) is kept; a whitespace-separated digit or a 2+-digit run
    (`MADRIGAL22`) is still stripped.
  - **(A) collector-number corroboration — in `decideRecognition` ONLY (the resolved
    judgment call: option ii, NOT an affine boost in `rankExactTier`):** an additive
    `corroboratedMin` (0.55) relaxes the floor when the scan's collector number
    equals #1's. The **margin gate is unchanged** (still on raw similarities), so
    relaxing _how high_ #1 must score never relaxes _how much_ it must beat #2 —
    same-number decoys (Boun/Billy #104) stay ambiguous. `matchEntries` /
    `rankExactTier` stay pure and **unchanged** (the D2 boundary), and
    `Candidate.confidence` still means raw name similarity (ConfirmSheet's "% match"
    stays honest).
  - **Thresholds (recorded):** `confidentMin = 0.70` and `ambiguityMargin = 0.15`
    are **unchanged**; `corroboratedMin = 0.55` is the only new constant — no global
    floor drop. The `topN = 10` is unchanged.
  - **The unit-3 gate result:** on a **clean** capture all four diagnostic cards
    (GIZMODUCK #105, BOUN #104, BALOO #69, DAVID XANATOS #184) already clear 0.70 at
    confidence 1.0 via (B) alone — so (A) is the safety margin for the **near-clean**
    band [0.55, 0.70), not a requirement for clean reads.
  - **Tested:** test-first throughout (red → green). Full JS gate green on Node 26
    (lint `--max-warnings=0` / format / typecheck / **338 tests**): the parser suite
    (failure geometry, the BALOO guard, a `\b`-boundary guard, a **real
    device-captures suite** and a **real ROTATED-captures suite** built from the
    verbatim 2026-06-21 `DEBUG_RECOGNITION` frame dumps), 7 `decideRecognition`
    boundary tests, and an end-to-end `recognitionConfidence` spec (clean captures
    clear 0.70, a polluted-capture case, and an Action-card-over-same-number-decoy
    case — all auto-confirm). Both the type-line-anchored and the rotation-aware
    selection are verified red on the prior parser. A pre-PR multi-agent adversarial
    review surfaced only two graceful, prime-directive-safe nits (both addressed).
  - **✅ On-device acceptance PASSED (2026-06-21).** Two device runs of the field
    build drove the fixes (small-printed version → type-line anchor; **sideways
    captures → rotation-aware selection**). The final run resolved **10/10 cards at
    the correct #1, 100% confidence** — GIZMODUCK #105, BOUN #104, BALOO #69, DAVID
    XANATOS #184, THOMAS #1, MIRABEL #19, EILONWY #7, RESTORING THE HEART #39,
    PROMISING LEAD #162, CARD SOLDIERS #129 — disambiguating every same-number
    collision, with **zero wrong #1s** (the safety guarantee held). Two cards whose
    collector number was dropped by OCR (lost `/`) still resolved at 100% via the
    name, confirming the fuzzy-name resilience. Captured via the new
    `DEBUG_RECOGNITION` Share/export + per-line frame dump. _(Extended mixed-scan
    soak remains the standing DoD native-exception note.)_
- **E2 error/offline/empty states is complete — ✅ merged + on-device acceptance
  PASSED** (`feature/error-states`, PR #38 → `development`, **MERGED `393c208`**): a
  new `appInitStore` startup state machine gates the app — it reads the **local
  catalog cache before any network call**, so an offline launch with a cached catalog
  boots straight to `ready` (the network `sync()` becomes a fail-soft background
  refresh) and only a first run with no cache awaits the download. Offline-no-cache
  and a download error collapse to one recoverable `first-run-failed` → Retry; hard
  failures (DB init, a broken local read) surface an error gate instead of a hung
  spinner. No-match scans route to the catalog search with a `reason:'no-match'`
  prompt; empty-collection / empty-search states are friendly and test-locked.
  **Reactive offline detection — no `netinfo`, no new dep; A3 contracts + `sync()` /
  `HttpJsonClient` + `AppServices` untouched** (12 files). Gate green on Node 26
  (348 tests, +10; test-first). An adversarial multi-agent review found 2
  low-severity hardening gaps, both fixed. **Architect code review PASSED.**
  - **✅ On-device acceptance PASSED (2026-06-21).** All 3 manual checks ran green on
    a physical device: **airplane-mode first run** → setup-needed + Retry (no hung
    spinner); **airplane-mode cached launch** → boots straight to `ready`, fully
    usable; **no-match scan** → routes to catalog search with the `reason:'no-match'`
    prompt. **Process note:** PR #38 was **merged before** these checks ran, so they
    were **post-merge verification**, not a pre-merge gate — now closed.
- **Per-developer iOS code signing is wired** (`chore/ios-signing-xcconfig`,
  PR #40 → `development`, **MERGED `49a6068`**): the Apple `DEVELOPMENT_TEAM` now
  lives only in a **git-ignored** `ios/Signing.local.xcconfig` (committed template:
  `ios/Signing.local.xcconfig.example`), included into the app's Pods base xcconfigs
  by an idempotent Podfile `post_install` hook (re-applies on every `pod install`).
  The team ID is **never** baked into the tracked `project.pbxproj`, so a stray
  working-tree `git checkout`/`reset` can no longer wipe it — the exact failure that
  broke device signing during an earlier review. `#include?` (optional) keeps CI / a
  fresh clone building without the file. Verified post-merge: signing resolves to the
  real Team ID, full JS gate green (348 tests), and a device build succeeds.
  **Lesson recorded: review branches read-only or in a worktree — never run a
  tree-wide `git checkout -- .` with uncommitted changes present.**
- **Recognition follow-ons (tracked, unscheduled):** (i) capture orientation
  (EXIF before ML Kit — small native change, also lifts OCR accuracy); (ii) lenient
  `N/204` collector-number parse (pure logic). Capture-quality / **multi-frame**
  remains the deferred reliability lever. Touch opportunistically; not E2 work.
- **Next action:** **E1** (edit/remove + manual add — incl. the off-catalog manual
  entry E2 deliberately excluded; mind the B3 `update()`-into-existing-stack UNIQUE
  edge), then **E3** (collection search + stats). The two recognition follow-ons
  above remain tracked/unscheduled. _(E2 and the iOS signing infra both landed
  2026-06-21; the next milestone task is unscoped pending Build Lead selection.)_

**Settled decisions (don't re-litigate):**

- **Card finish model** (human-approved 2026-06-16): `finish = normal | foil`;
  enchanted and special/promo printings are distinct `Card` rows. **Applied in
  B1 (PR #17, merged 2026-06-17).**
- **SQLite library → `@op-engineering/op-sqlite`** (ratified at B3, its forcing
  PR). The Jest test engine is Node's built-in **`node:sqlite`** (not a native
  devDependency — see the B3 status entry for why).
- **Catalog source + versioning → LorcanaJSON** (ratified at B2). Base
  `https://lorcanajson.org/files/current/en`; cache the raw `allCards.json`,
  keyed on `metadata.json`'s `generatedOn` (re-download only on change). The
  LorcanaJSON `id` (stringified) is the `Card.id`; `availableFinishes` derives
  from `foilTypes`; `normalizeCardName` is the shared name-normalization C1
  reuses. Lorcast stays a _future secondary_ (images/prices) behind the
  catalog-service interface.
- **Env config → `react-native-config`** (^1.6.1, ratified at B2). Surfaces an
  optional `CATALOG_API_BASE_URL` override; the canonical URL is a code default.
- **State management → Zustand** (ratified at C2, its forcing PR). A vanilla
  store over the `CollectionRepository` interface, provided via React context.
- **Navigation → React Navigation native-stack + `react-native-screens`**
  (ratified at C2; native-dep ask-first cleared). Shape: Collection → Scan →
  Confirm (modal).

**Recommendations not yet ratified** — each gets confirmed at its forcing PR, so
treat as the default unless a human overrides:

- OCR engine → **ML Kit Text Recognition** (forced at D1).

**Carry-over actions for later PRs (easy to forget):**

- **B1 — ✅ done (PR #17):** `README.md`'s draft data model has been reconciled to
  the settled finish model (`finish = normal | foil`; `enchanted` kept under
  `rarity` only, with a note that enchanted/special are distinct `Card` rows),
  alongside the code in the same PR.
- **B1 (from A3 review) — ✅ done (PR #17):** both A3 placeholders are closed.
  `Finish`/`Condition` are narrowed from `string` to `as const`-derived unions
  plus `isFinish`/`isCondition` guards, and `CollectionEntry.addedAt`/`updatedAt`
  are settled as ISO 8601 UTC `string`s (the in-file "may switch to `Date`" note
  is gone; the branded `IsoTimestamp` type is explicitly deferred).
- **B3 (from B1) — ✅ done:** the `UNIQUE (card_id, finish, condition)` index is
  created in migration 001 and proven by test — B1's `resolveAddition` >1-stack
  throw is now structurally unreachable in normal operation.
- **C2 (from B3) — ✅ done:** the temporary "Test DB" smoke button, its handler,
  the inline composition root, and the `debugButton` style were removed when
  `App.tsx` was replaced by the real navigation/composition root. No `TODO(C2)`
  markers remain.
- **E1 (from B3 review) — ✅ done (`feature/collection-edit`):** see the **E1
  decisions** record below. `update()` now MERGES an edit-into-existing-stack
  transactionally instead of throwing on the `UNIQUE (card_id, finish, condition)`
  index.

> **E1 decisions (ratified, `feature/collection-edit`):**
>
> - **Edit-merge supersedes the B3 reject contract — DONE.** `update()` now MERGES
>   an edit that moves a row onto an existing `(card_id, finish, condition)` stack
>   — target quantity += source quantity, source deleted, one transaction —
>   instead of throwing `UNIQUE`. Signature unchanged; reuses B1's
>   `resolveAddition`; the old "rejects (UNIQUE)" test is intentionally replaced by
>   a merge test. Closes the B3-review carry-over.
> - **Off-catalog manual cards (the E2-deferred fallback).** `manual:<rowid>`
>   synthetic id from a new `custom_cards` table (migration 003); name is the only
>   required field; provenance implicit in the id prefix — **no `Card`/
>   `CollectionEntry` schema, identity-tuple, or UNIQUE-index change**. Mint-fresh
>   per add. New additive `CustomCardRepository` exposed via a new required
>   `AppServices.customCards`; `useCardLookup` resolves from catalog + custom
>   store; `ConfirmSheet` gains an empty-meta guard. Manual cards aren't
>   catalog-searchable (no-match fallback only).
> - **Deliberate A3/B1-boundary deltas:** `update()` semantics (throw→merge)
>   behind its unchanged signature; additive off-catalog storage +
>   `AppServices.customCards`; new `collectionStore` `update`/`remove`. No
>   recognition-pipeline / `CardRecognizer` / `CatalogService` / `HttpJsonClient`
>   changes.

- **B2 — ✅ done:** `react-native-config` (^1.6.1) added so bare RN reads an
  optional `CATALOG_API_BASE_URL` override from `.env` (ask-first gate cleared by
  the user). Isolated to `catalogConfig.ts`, mocked in Jest; the canonical URL is
  a code default. **Native acceptance — ✅ done at C2 (2026-06-18):** iOS pod
  autolink + Android Gradle build both succeed, and the on-device catalog `sync()`
  runs for real on first boot (the app clears the loading gate by downloading the
  live catalog) on the iOS Simulator + Android emulator. See the C2 on-sim bullet.
- **D1:** The ML Kit vision-camera frame-processor plugin is a heavy **native
  dep → ask-first** before adding.
- **Secrets:** MVP backend needs no API key; the commented `RECOGNITION_API_KEY`
  lines in `.env.example` are correctly forward-looking — leave as-is, and don't
  wire a paid backend without the ask-first step.
- **Tech debt (tracked, deferred):** the Ruby toolchain is unpinned — setup
  relies on system Ruby 2.6.10 + the Bundler 1.17.2 pin, which is fragile against
  a newer default Ruby. Modernization plan (rbenv + `.ruby-version` + regenerated
  lockfile) is captured in
  [ruby-toolchain-modernization.md](ruby-toolchain-modernization.md). Low urgency,
  ask-first.

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
  filled in with real run steps. — ✅ **Met (verified 2026-06-17).**
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
  or README section pointing to the interfaces. **Path aliases must be wired in
  both `tsconfig.json` and Metro/Babel** (`babel-plugin-module-resolver` or
  `metro.config.js`) — a TS-only alias compiles but fails at bundle/runtime — and
  proven by a trivial cross-alias import that actually bundles (`npm test` and the
  CI JS bundle check stay green). — ✅ **Met (merged 2026-06-17, PR #14).**
- **Optional follow-up (does not gate A3):** add native iOS/Android build
  verification to CI — now unblocked by the closed A1 boot gate. **Still open:**
  A3's PR shipped without it; do it as a fast-follow `chore/`.
- **Size:** **S.** Locks the contracts the rest of the plan fills in.

### Milestone B — Domain & Data

#### B1. Domain models + rules — `feature/domain-models`

- **Scope (in):** `Card`, `CollectionEntry`, `finish`/`condition` enums, and pure
  functions: collection-entry **identity/merge rule** (card + finish + condition
  ⇒ same stack, increment quantity), validation. Framework-free.
- **Out:** Persistence, UI, `Deck` (stretch).
- **Depends on:** A3.
- **Acceptance:** Unit tests cover merge/identity and the enchanted-vs-foil
  decision. No RN imports. — ✅ **Met locally (6 suites / 59 tests, full gate
  green); PR #17 → `development` open, pending merge.**
- **Size:** **S–M.** **Model decision (settled):** `finish = normal | foil`;
  enchanted and special/promo printings are distinct `Card` rows (own collector
  number/rarity), not finishes. Update the `README.md` data model in this PR too.

#### B2. Catalog service (sync-and-cache) — `feature/catalog-service` — ✅ implemented

- **Scope (in):** Fetch `allCards.json` from LorcanaJSON; **map LorcanaJSON →
  `Card`**; cache with version/ETag check (download once, refresh on version
  change); build local index on collector number + normalized name. Add
  `react-native-config` for `CATALOG_API_BASE_URL`.
- **Out:** Fuzzy matching itself (C1), images/prices, Lorcast secondary.
- **Depends on:** B1; B3 (cache lives there) — **✅ B3 done:** populate the
  `catalog_cards` + `catalog_meta` tables (migration 002) via the persistence
  layer; use the `TestSqliteDatabase` (node:sqlite) helper for persistence specs.
- **Acceptance:** Mapper unit-tested against a **tiny committed fixture (5
  cards)** — never the bulk file. IP guardrail noted in the PR. Env var added to
  `.env.example` with docs. — **met:** 56 green tests (mapper/normalize/cache/
  service) with no network and Config mocked; cache-skip + transactional refresh
  proven; base URL `https://lorcanajson.org/files/current/en`, cache keyed on
  `generatedOn`.
- **Size:** **M.** Flag `react-native-config` as a small native dep in the PR.

#### B3. Persistence: SQLite schema + collection repository — `feature/persistence-sqlite` — ✅ implemented

- **Scope (in):** Choose SQLite lib, init DB, migration runner, tables for
  catalog cache + `CollectionEntry`, implement `CollectionRepository` (CRUD +
  merge-on-insert using B1's rule).
- **Out:** UI, catalog fetching.
- **Depends on:** B1, A3.
- **Acceptance:** Repository tested (in-memory or on-device); migrations
  idempotent. — **met:** 87 green tests against in-memory `node:sqlite`; UNIQUE
  index + idempotent re-init + merge-on-insert all proven by test.
- **Size:** **M.** **SQLite decision ratified → `@op-engineering/op-sqlite`** (the
  JSI-based, actively-maintained successor to `react-native-quick-sqlite`). Behind
  the `SqliteDatabase` driver seam; the Jest engine is the built-in `node:sqlite`
  (a native test devDep would corrupt under Jest's per-file module sandboxing).

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
- **✅ Implemented (`feature/recognition-matching`):** delivered as planned and
  fully tested (fixtures only — no bulk `allCards.json`, no card images). What
  landed:
  - **Pure ranking core in `@domain`** (no `@services` import): hand-rolled
    `levenshtein` + `similarity` (`src/domain/matching/levenshtein.ts`) and
    `matchEntries` (`src/domain/matching/cardMatching.ts`). Two-tier — exact
    `collectorNumber` filter (name disambiguates colliding sets; **not**
    thresholded so a low-confidence number hit is still surfaced) → fuzzy
    normalized-name fallback (similarity, drop `< 0.5`, sort desc, cap top `5`,
    tunable via `MatchOptions`). A non-empty exact tier wins outright (fallback,
    not merged). DoD cases covered: exact hit, fuzzy near-miss, ambiguous
    near-tie (best-first stable), collectorNumber+name disambiguation, no-match.
  - **Matcher seam for C2/D1 — `createCardMatcher(reader, options?)`**
    (`src/services/vision/cardMatcher.ts`): bridges a narrow
    `CatalogReader = Pick<CatalogService, 'getAllCards'>` (the real
    `CatalogService` satisfies it structurally) to the pure core, returning a
    `RecognitionResult` with `source` echoed. **D1's `OcrCardRecognizer` calls
    `matcher.match(source)`** after OCR and returns its result — no interface
    change.
  - **Shared `cardMatchKey(card)`** (`src/services/catalog/cardMatchKey.ts`) =
    normalized `name`+`version`; B2's `catalogCache.normalizedNameFor` now
    delegates to it, so the cached `normalized_name` column and the matcher key
    are the identical string by construction — zero drift (proven by a
    `"elsa snow queen"` query resolving end-to-end).
  - **`StubCardRecognizer`** (`src/services/vision/StubCardRecognizer.ts`)
    implements `CardRecognizer`, ignores the image, resolves a fixed
    `RecognitionResult`; **`StubCardRecognizer.forCard(card, confidence = 1)`**
    is the one-liner **C2** wires into the scan→confirm→save slice, and D1 keeps
    it behind a flag for tests.
  - **Deferred (intentional MVP simplifications):** the indexed
    `findByCollectorNumber` (setCode-aware path) waits for a future setCode
    recognition signal — the frozen `RecognitionSource` carries no setCode;
    merging the exact + fuzzy tiers and memoizing `getAllCards()` per `match()`
    are later refinements.

#### C2. Scan → confirm → add-to-collection slice + browse — `feature/scan-to-collection-slice` — ✅ implemented

- **Scope (in):** Navigation, camera/scan screen (capture a frame), confirm sheet
  (top candidate + finish/condition pickers), write via `CollectionRepository`,
  and a collection list screen that reads it back. Wired with **StubRecognizer +
  real catalog + real persistence**. First end-to-end runnable product.
  **Also remove B3's temporary "Test DB" smoke button** from `App.tsx` (revert
  `f27ea39` / the `TODO(C2)` markers) — see the carry-over list above.
- **Out:** Real OCR (next milestone), edit/remove, stats.
- **Depends on:** C1, B3, B2.
- **Acceptance:** On device/sim you can "scan" (stub), confirm, save, and see it
  in the list across app restarts. State layer tested where non-trivial. — **met
  (logic/CI):** 24 suites / 209 tests green — the store over the real repo on
  `TestSqliteDatabase` (incl. merge-on-insert), RNTL tests for all three screens,
  and an `App` smoke through the loading gate; no network/native in Jest. **On-sim:
  ✅ verified on iOS Simulator (iPhone 17) + Android emulator (Pixel_9) on
  2026-06-18** — full scan→confirm→save→relaunch loop incl. merge-on-insert and
  the Android `onCreate(null)` cold-relaunch path; screenshots in PR #25.
- **Size:** **L.** **State-management decision → Zustand (ratified).** Navigation
  → React Navigation native-stack + `react-native-screens` (native-dep ask-first
  cleared). Composition root is injectable; the recognizer is the stub
  (`StubCardRecognizer.forCard(demoCard)`), swapped for OCR in one line at D1.

### Milestone D — Real recognition (swap the stub)

#### D1. Still-image OCR + `OcrCardRecognizer` — `feature/ocr-recognition` — ✅ complete — spike PASSED 10/10 (PR #27 → `development`, merged 2026-06-18)

- **Status (2026-06-18):** Implemented behind a PR into `development`; JS suite
  green on Node 26 (typecheck/lint/format/Jest, 242 tests). The on-device
  **accuracy spike PASSED 10/10 (100%)** — see the Spike entry below. PR is ready
  to merge; the height-based parser (reworked from the spike captures) is the
  shipped code path.
- **Approach (ratified — changed from the original frame-processor sketch):**
  **still-image** capture — tap → `camera.takePhoto()` → file URI → ML Kit
  `recognize(uri)` → `parseCardText` → C1 matcher. **No live frame processor, no
  `react-native-worklets-core`** (a live frame processor is a possible D2).
  `CardImage { uri }` already fit, so no interface change.
- **Scope (in / done):** an injectable `OcrEngine` seam + `MlKitOcrEngine` (the
  only module importing the native lib; maps ML Kit's `{left,top,…}` frames into
  the seam's `{x,y,…}`); the pure, test-first `parseCardText` (name + collector
  number, with `String(Number(n))` normalization so `"042"`→`"42"` hits the
  matcher's exact tier); `OcrCardRecognizer` composing engine → parser →
  `matcher.match`; real still capture + temp-file cleanup (`@dr.pogodin/react-
native-fs` `unlink`, in a `finally`) in `ScanScreen`; the one-site swap in
  `createAppServices`, with `StubCardRecognizer` preserved behind a
  `USE_STUB_RECOGNIZER` flag. The C1 matcher and all A3 contracts are unchanged.
- **Out (still D2):** confidence thresholds / auto-accept, multi-frame capture,
  manual-search fallback UX, the live frame processor. **Native CI** landed
  separately in `chore/native-ci` (D1 verified native builds locally).
- **Spike (go/no-go — ✅ GO, 2026-06-18):** Two on-device batches (Android, 10
  real cards spanning characters, songs, actions, items, foils). **ML Kit OCR is
  strong** — it read name + collector number off foil/busy art on all 10 (one "7"
  misread as "T"). The first run resolved only 5/10, but every miss was a **parser
  bug**, not OCR (the 0.5 height band swept in body/flavor text and the big
  lore/strength glyphs OCR'd "O4"/"43", printed taller than the name). After
  reworking the parser (name = tallest alphabetic line; stat glyphs excluded;
  merged stat digits stripped; regression-fixtured from the captures), the
  **re-run resolved 10/10 = 100% correct top candidate** (9 at confidence 1.0;
  Mirabel 0.50 — subtitle dropped, still #1 by a clear margin) — decisively above
  the ≥~80% bar, even with Eilonwy's misread collector (its clean name carried it
  via the fuzzy tier). **GO: D1 is mergeable.** (Sample was 10; a few more cards
  would fully hit the stated 15–20 — nice-to-have, not a blocker.) Throwaway
  harness (live + batch-from-photos + JSON export) lives on `spike/ocr-accuracy`
  (not merged); spike photos stay git-ignored (IP).
- **Native deps + app-size:** `@react-native-ml-kit/text-recognition` (on-device,
  free, **no API key**) + `@dr.pogodin/react-native-fs`. The ML Kit lib pulls
  **all five script recognizers** (Latin + Chinese/Devanagari/Japanese/Korean)
  on both platforms — a real size cost: iOS resolves GoogleMLKit 8.0.0 across 98
  pods; Android pulls `com.google.mlkit:text-recognition*:16.0.1`; the all-ABI
  **debug** fat APK is ~192 MB (release per-ABI/density splits are far smaller).
  Trimming to Latin-only (patch the podspec / prune the Android deps) is a
  possible D2 size optimization.
- **Min-OS check:** iOS bumped **15.1 → 15.5** (ML Kit's pod floor); Android
  **minSdk 24** already clears ML Kit's 21 — no bump. The one deliberate,
  documented change.
- **Acceptance:** Local native builds clean on **both** platforms (iOS Debug
  simulator build SUCCEEDED; Android `:app:assembleDebug` SUCCESSFUL). The
  matcher stays unit-tested + unchanged; parser + recognizer are unit-tested
  (fake engine + the real matcher over a fixture catalog). **Manual real-card
  acceptance is pending the on-device spike**; a low-confidence/empty read still
  routes to the Confirm screen (never blocked).
- **Size:** **L.** ML Kit Text Recognition: free, fully on-device (offline-first,
  no recurring cost), **cross-platform** (Apple Vision is iOS-only). The native
  ML Kit gate was cleared at kickoff.

#### D2. Recognition tuning & manual fallback — `feature/recognition-tuning`

- **Status: IMPLEMENTED on `feature/recognition-tuning`; PR → `development`
  pending review (2026-06-20).** The live-accuracy gap is closed with a **routing
  policy + manual fallback**, not matcher math: a collector number alone can't
  disambiguate same-number cards across sets (no `setCode` on `RecognitionSource`),
  so the honest fix is to gate low/ambiguous reads to a top-N / manual pick rather
  than assert #1. `matchEntries` is unchanged.
- **Why it was urgent (live finding, 2026-06-18):** D1's spike scored **10/10 on
  pre-shot, well-composed stills**, but **live on-device accuracy is poor** — e.g.
  _Boun_ (#104) repeatedly resolves to _Billy Bones_ (#104) at ~26%. Two cards
  share collector number 104, so the exact tier ranks same-number cards by name
  similarity; when the **live OCR reads the name weakly** (glare, angle, ultra-wide
  macro distortion, motion, lighting), the wrong same-number card wins — and
  nothing gated on the low score, so it silently saved wrong.
- **What shipped (in):**
  - **Pure routing policy — `decideRecognition` (`@domain/matching`):**
    `confident | ambiguous | none`. Confident iff the top candidate clears a
    confidence floor **and** beats #2 by an ambiguity margin; else ambiguous
    (best-first top-N pick); empty → none. **Thresholds (tunable constants):
    `confidentMin = 0.70`, `ambiguityMargin = 0.15`, `topN = 10`.** The single
    tested home for the gate; the UI only routes on the decision. (Confidence is a
    relative name-similarity, not a calibrated probability — these are routing
    heuristics, refined against the diagnostics: `topN` was raised 5→10 after
    on-device reads showed the correct same-number printing could land just past a
    cap of 5 — e.g. _Baloo_ #69 at rank 6 — and so be truncated out of the pick.)
  - **Dev diagnostics (dev-only, flag-gated `DEBUG_RECOGNITION`):** the recognizer
    logs raw ML Kit text + parsed `RecognitionSource` + ranked candidates, so the
    thresholds are tuned against what live OCR actually reads, not guesses. Never
    in the release UI (`src/services/vision/recognitionDiagnostics.ts` +
    `visionConfig`).
  - **Manual fallback — one unified `CardSearchScreen` + `CandidateList`:** an
    ambiguous scan seeds the list with the scan's top-N (the right same-number card
    is on offer — the Boun case); a search box runs a debounced, name-only
    `createCardMatcher(catalog).match({ name })` over the cached catalog. Matcher
    reuse — **no A3 change, no new `CatalogService` method**, reuses
    `normalizeCardName`. Pick → ConfirmSheet.
  - **ScanScreen routing:** `confident → Confirm({ card, confidence })`;
    `ambiguous → CardSearch({ seed: top-N })`; `none → CardSearch({})`. A
    low-confidence/ambiguous scan **never silently asserts a wrong #1**.
  - **ConfirmSheet decoupled** to take a chosen `{ card; confidence? }`
    (behavior-preserving) so confident scans, ambiguous picks, and manual searches
    all feed the one confirm+save screen; adds a **"Wrong card? Search manually"**
    escape. Confidence stays a **hint, never a gate** — a determined user is never
    hard-blocked.
- **Deferred (explicit seams left):** **capture-quality / multi-frame** (the manual
  fallback is the safety net; any future multi-frame stays still-based — a live
  frame processor / `react-native-worklets-core` is **ask-first**); second backend
  & pricing (D2-out); the **Mirabel** dropped-subtitle parser edge (left to the
  fallback top-N — it ranked #1 anyway, so no blind parser over-tune); the ML Kit
  Latin-only size trim; the `normalized_name`-index search prefilter.
- **Depends on:** D1.
- **Tested:** `decideRecognition` is pure + **test-first** (clear winner; the Boun
  case → ambiguous with Boun in the top-N; near-tie; single above/below floor;
  empty → none; floor/margin boundary cases). RNTL for the screens (seeded top-N,
  manual search→Confirm, the "Wrong card?" escape, ScanScreen's three routing
  branches). Diagnostics formatter + flag unit-tested. **Full Jest suite green on
  Node 26; `tsc` / `eslint --max-warnings=0` / `prettier --check` clean.**
- **On-device acceptance — ✅ PASSED (iPhone 16 Pro / iOS 27, 2026-06-20):**
  recognition is **field-SAFE** — every low-confidence read routed to the manual
  pick with the correct card present; **zero wrong auto-saves**; correct card at #1
  on all test scans (GIZMODUCK #105, BOUN #104, BALOO #69, DAVID XANATOS #184);
  collector number read correctly every time; the OCR resource-leak fix held over a
  4-capture soak (extended soak remains the DoD native exception). The one gap —
  confidence capped below the floor so good reads route to manual — is **D3**.
- **A3 / seam integrity:** `CardRecognizer` / `RecognitionResult` /
  `RecognitionCandidate` / `CatalogService` and `matchEntries` all unchanged. IP
  guardrail: hand-authored fixtures only. **Deps added (leak fix):** `patch-package`
  (+ `postinstall`) carrying a `@react-native-ml-kit/text-recognition` patch, plus
  the JS-side `withSingleFlight` OCR serializer — build tooling / a patched
  existing dep, no new runtime native module.
- **Size:** **M–L** (delivered).

#### D3. Recognition confidence refinement — `feature/recognition-confidence`

- **Status: ✅ COMPLETE — on-device PASSED; PR #36 → `development`, merged
  2026-06-21.** Pure logic, test-first, full JS gate green on Node 26 (338 tests).
  See the §0 D3 entry for the full breakdown.
  **Version selection is anchored to the type line AND rotation-aware** — the
  version is the nearest non-type/non-artist line to the name that sits closer than
  the type line, measured on a rotation-detected stacking axis (2026-06-21 device
  frames showed captures come out **sideways**); Action/Item/Location/Song cards
  yield the bare name. **On-device acceptance PASSED: 10/10 cards correct #1 at
  100%, zero wrong #1s.** **Decisions recorded:** number-trust lives **only in
  `decideRecognition`** (an additive `corroboratedMin` = 0.55 floor relaxation,
  margin gate untouched) — `matchEntries` / `rankExactTier` stay pure and
  **unchanged** (the D2 boundary), and there is **no affine boost** in
  `rankExactTier` (the `conf = α + (1−α)·nameSim` option was rejected as unsafe).
  `confidentMin = 0.70` / `ambiguityMargin = 0.15` / `topN = 10` are **unchanged**;
  0.55 is the only new threshold.
- **Why:** D2 made recognition **field-SAFE** (no wrong auto-saves) but confidence
  is systematically capped below the 0.70 floor, so correct reads route to the
  manual pick (one extra tap) instead of auto-confirming. Surfaced by the D2
  on-device run (2026-06-20).
- **Scope (in):**
  - **(A — priority) Fix version/subtitle selection** in `parseCardText` so it
    picks the card's **version**, not the artist credit or ability text. Exploit
    the Lorcana layout: `NAME` (all-caps) → version (Title Case) → `Storyborn • …`
    type line, with the artist credit lower and prefixed by an artist glyph (OCR'd
    `>` / `→` / `•`, often containing `/` for co-artists). Anchor the version as
    the Title-Case line between the name and the type line, and/or exclude
    artist-credit-shaped lines.
  - **(B) Fold the exact collector-number match into confidence**, margin-gated so
    same-number decoys aren't all inflated — either a number-corroboration credit
    in `rankExactTier` (`conf = α + (1−α)·nameSim`) or a number-aware trust gate in
    `decideRecognition`. **Record the `matchEntries` / A3 boundary decision** D2
    deliberately left intact, and re-tune the 0.70 / 0.15 thresholds with the
    diagnostics once (A)/(B) land.
  - **(small parser guard)** Don't strip a single trailing digit from an otherwise
    all-caps name — the `BALOO`→`BALO0`→`BALO` O/0-misread case, where the
    `MADRIGAL22` stat-stripper over-fires.
- **Out:** capture-quality / **multi-frame** (still deferred — the upstream OCR
  ceiling an extra pass would lift, e.g. `Suited Up→Suted Up`); a second backend;
  pricing.
- **Depends on:** D2.
- **Acceptance: ✅ MET.** The diagnostic cards **auto-confirm (≥ 0.70)** — on
  fixtures (through the real chain) and **on-device: 10/10 cards correct #1 at 100%,
  zero wrong #1s** (2026-06-21, rotated real captures, every same-number collision
  disambiguated). Thresholds recorded (0.70 / 0.15 unchanged, 0.55 added); the
  `matchEntries`/A3 boundary call recorded; pure logic, test-first. Extended
  mixed-scan soak remains the standing DoD native-exception note.
- **Priority:** version/subtitle selection > collector-number corroboration — the
  parser fix is the dominant confidence drag and largely subsumes the number credit
  (on clean captures the four cards clear 0.70 without it). **Size:** **M.**

### Milestone E — Hardening (mostly v1)

- **E1. Edit/remove entries + manual add** — `feature/collection-edit` (M)

#### E2. Error/offline/empty states — `feature/error-states` (M) — ✅ complete — merged (PR #38, `393c208`) + on-device acceptance PASSED

- **Scope (delivered):** first-run catalog download (progress + failure/Retry);
  offline behavior (cached-catalog launch is fully usable; first-run-no-network →
  setup-needed + Retry); no-match UX (`decideRecognition` → `none` routes to the
  catalog search with a `reason:'no-match'` prompt); friendly empty-collection /
  empty-search states.
- **How:** an `appInitStore` (Zustand vanilla, deliberately NOT part of
  `AppServices`) owns the startup state machine (`starting → first-run-downloading
→ first-run-failed → ready | error`); `App` renders a gate off `phase` and
  `compositionRoot.initialize()` is removed. The **local cache read precedes any
  network call** so offline-with-cache never blocks; `sync()` failure is caught
  here (the service still throws). **Reactive offline detection — no `netinfo`, no
  new dep** (the resolved judgment call).
- **E1 boundary held:** no-match → catalog search + pick (reuse confirm→save), NOT
  off-catalog manual entry — that stays **E1**.
- **A3 / seam integrity:** `CatalogService` / `sync()` / `HttpJsonClient` /
  `CardRecognizer` / `AppServices` all untouched; 12 files, no dependency change.
- **Tested:** 348 green on Node 26 (+10; test-first) — `appInitStore` (first-run
  success; download-fail → retry → success; offline-with-cache usable;
  offline-no-cache setup-needed; cached launch skips the downloading phase),
  no-match routing, empty states. Adversarial multi-agent review: 2 low-severity
  gaps found + fixed.
- **✅ On-device acceptance PASSED (2026-06-21, post-merge):** airplane-mode first
  run → setup-needed + Retry; airplane-mode cached launch → boots usable; no-match
  scan → catalog search. PR #38 was merged before these ran, so they were post-merge
  verification (the camera/device path is the documented DoD native exception).

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

| Tier                   | Tasks                                                                                                | Rationale                                                                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MVP**                | A1, A2, A3, B1, B2, B3, C1, C2, **D1**, plus minimal browse (in C2)                                  | Delivers the documented MVP loop: scan → identify (real OCR) → add to local collection with quantity/finish/condition, persisted, browsable.                          |
| **v1**                 | D2, **D3**, E1, E2, E3                                                                               | Manual correction (D2 ✅), recognition confidence refinement (D3), edit/remove, error/offline states, stats/search — the "hardening + improved UX" the roadmap lists. |
| **Deferred / stretch** | `Deck`, second `CardRecognizer` backend (cloud/feature-matching), pricing, export/import, cloud sync | All explicitly out of MVP per README; the interface already accommodates the second backend later.                                                                    |

**Nuance:** C2 ships first with the _stub_ recognizer (fully runnable, just not
"real"). D1 is what makes it MVP-grade. If OCR accuracy disappoints in the D1
spike, the stub-first design means you can ship a "manual search + add" MVP and
treat OCR as a fast-follow — a deliberate fallback the architecture buys you.

---

## Open decisions & their forcing PRs

| Decision         | Forced by | Recommendation                                                             |
| ---------------- | --------- | -------------------------------------------------------------------------- |
| SQLite library   | B3        | ✅ **op-sqlite** (ratified; tests use `node:sqlite`)                       |
| State management | C2        | ✅ **Zustand** (ratified; vanilla store over the repo)                     |
| Navigation       | C2        | ✅ **React Navigation** native-stack + screens (ratified)                  |
| OCR engine       | D1        | ✅ **ML Kit Text Recognition** (still-image; on-device; implemented at D1) |

The **enchanted-vs-foil** modeling for B1 is settled (`finish = normal | foil`;
enchanted/special are distinct `Card` rows) **and implemented in B1 (PR #17)**.
One item still needs a human confirm before its PR: the **ML Kit
frame-processor native dep** (D1, ask-first per CLAUDE.md).
