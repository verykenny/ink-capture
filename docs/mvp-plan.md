# ink-capture — Path from docs-only to MVP

> Planning/architecture deliverable. Sequenced set of PRs to take the project
> from its current docs-only state to a working MVP. Build on the confirmed
> decisions in [README.md](../README.md) and the hard rules in
> [CLAUDE.md](../CLAUDE.md); this document does not re-litigate them.

## 0. Status & carry-over (read this first)

> Keep this section current as work lands — it's the handoff state for the next
> contributor (human or agent).

**As of 2026-06-18:**

- **A2 dev tooling + CI gate is complete** (`chore/dev-tooling-ci` →
  `development`): the four quality scripts (`lint`, `format:check`, `typecheck`,
  `test`) are wired; Jest + React Native Testing Library run a passing `App`
  smoke test (with a `react-native-vision-camera` mock in `jest.setup.ts`); a
  Husky pre-commit hook runs `lint-staged` and auto-installs via the `prepare`
  script on a fresh `npm install`; a GitHub Actions workflow gates PRs into
  `development` on the four checks plus a JS bundle check; and a `Brewfile` +
  `scripts/setup.sh` give a one-command machine bootstrap. Native iOS/Android CI
  build verification is **deferred but now unblocked** (the A1 boot gate was
  closed 2026-06-17, below) — the bundle check proves only that the JS module
  graph resolves.
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
  iOS Simulator + Android emulator (2026-06-18). **D1** (real OCR) is now
  implemented (PR open into `development`; on-device accuracy spike pending) —
  see Milestone D below.
- **Toolchain reminder (sharpened after the C2 review):** the Jest suite now
  **hard-requires Node ≥22.5 (pinned 26 via `.nvmrc`)**. On Node 20 the **9
  persistence/catalog suites fail to _load_** (`No such built-in module:
node:sqlite`) — a scary-looking suite failure that is purely Node-version drift,
  not a code defect. CI keys off `.nvmrc`; local contributors must `nvm use` to
  match it. (First flagged at B3; C2 widened the affected suites.)
- **Next action:** **D1 is implemented — PR open into `development`**
  (`feature/ocr-recognition`): still-image ML Kit OCR + `OcrCardRecognizer`,
  swapped in at `createAppServices`; stub preserved behind `USE_STUB_RECOGNIZER`;
  iOS bumped to 15.5; iOS + Android build clean locally. The one remaining gate
  is the **on-device accuracy spike** (≥~80% correct top candidate on ~15–20 real
  cards) — a throwaway harness is on `spike/ocr-accuracy`. After a go: merge D1,
  then `chore/native-ci`. On a no-go: fall back to a manual-search MVP (D2).

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
- **E1 (from B3 review) — open:** `CollectionRepository.update()` can change
  `finish`/`condition`, which may move a row onto another stack's identity and hit
  the `UNIQUE (card_id, finish, condition)` index — it **throws rather than
  merging** today. Acceptable now (integrity is protected), but E1 (edit/remove)
  must handle an edit-into-existing-stack as a merge, not an error.
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

#### D1. Still-image OCR + `OcrCardRecognizer` — `feature/ocr-recognition` — ✅ IMPLEMENTED (PR open → `development`; on-device spike pending)

- **Status (2026-06-18):** Implemented behind a PR into `development`; JS suite
  green on Node 26 (typecheck/lint/format/Jest, 231 tests). The on-device
  **accuracy spike is the one open gate** — it needs real cards on a device and
  is pending the user's run (below). The shipped code path _is_ the "go"
  implementation and the reference for the D2 manual-search fallback if the spike
  disappoints.
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
  manual-search fallback UX, the live frame processor. **Native CI** is a
  separate `chore/native-ci` (D1 verifies native builds locally).
- **Spike (go/no-go — PENDING):** ~15–20 real cards in good lighting, **≥~80%**
  resolving with the correct card as the **top candidate** (collector-number
  exact and/or name fuzzy); below the bar → ship a manual-search MVP and treat
  OCR as a D2 fast-follow. A throwaway harness lives on `spike/ocr-accuracy`
  (not merged). Findings get recorded here + in the PR once run on-device.
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
