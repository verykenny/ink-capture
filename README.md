# Lorcana Card Recognition & Tracker

> Working title: **ink-capture**

A cross-platform mobile app that scans physical Disney Lorcana cards with your
phone camera, identifies them, and tracks your personal collection. Point the
camera at a card, let the app recognize it, and add it to a local collection
with quantity, finish, and condition. The goal is a fast, offline-friendly way
for players and collectors to catalog what they own without manually typing in
every card.

> **Status:** Bootstrapped. A bare React Native + TypeScript (strict) app boots
> on iOS and Android with `react-native-vision-camera` installed and camera/
> microphone permissions wired (task A1). The current screen only requests
> camera permission and shows a live preview — recognition, storage, and
> collection features are still to come. See [Roadmap](#roadmap) and
> [Getting Started](#getting-started).

---

## MVP

The minimum viable product is a single, tight loop:

1. **Scan** a card using the device camera.
2. **Identify** the card (which set, which card, collector number).
3. **Add** it to a **local collection**, recording:
   - **Quantity** owned
   - **Finish** (normal vs. foil)
   - **Condition** (e.g. NM / LP / MP / HP / DMG)

Everything in the MVP works against on-device storage. Account sync, sharing,
deck building, and pricing are explicitly out of scope for the MVP.

---

## Tech stack

> **Confirmed direction** (not yet installed/scaffolded). The framework and
> recognition backend are decided; items marked _TBD_ remain open and will be
> settled during scaffolding.

- **App framework:** **Bare React Native + TypeScript** (strict mode) —
  _confirmed_. Bare (not Expo-managed) so on-device vision/frame processing has
  full native access.
- **Camera capture:** [`react-native-vision-camera`](https://github.com/mrousavy/react-native-vision-camera)
- **Recognition backend (MVP):** **On-device OCR + fuzzy catalog lookup** —
  _confirmed_ (see [Recognition approach](#recognition-approach)). Chosen for
  offline-first operation and no recurring API cost.
- **Card catalog:** **[LorcanaJSON](https://lorcanajson.org/)** bulk data,
  cached on-device — _confirmed_ (Lorcast optional secondary; see
  [Card data source](#card-data-source)).
- **Local storage:** SQLite via
  [`op-sqlite`](https://github.com/OP-Engineering/op-sqlite) or
  [`react-native-quick-sqlite`](https://github.com/margelo/react-native-quick-sqlite)
  — _TBD which library_.
- **OCR engine:** _TBD_ — on-device text recognition (e.g. ML Kit / platform
  Vision via a vision-camera frame processor). To be selected during scaffolding.
- **State management:** **[Zustand](https://github.com/pmndrs/zustand)** —
  _confirmed_ (ratified at C2). A vanilla store over the `CollectionRepository`
  interface; no provider boilerplate.
- **Navigation:** **[React Navigation](https://reactnavigation.org/)**
  native-stack + `react-native-screens` — _confirmed_ (ratified at C2).

---

## Recognition approach

Card recognition is the riskiest part of the project, so it is designed as a
**pluggable interface with swappable backends**. The app depends on a single
`CardRecognizer` abstraction; concrete implementations can be developed,
compared, and swapped without touching the rest of the app.

```
interface CardRecognizer {
  recognize(image): Promise<RecognitionResult>  // candidate cards + confidence
}
```

Candidate backends:

- **(a) Cloud vision API** — send the captured image to a hosted vision service
  (e.g. **Scrydex Vision**) and receive a card match. Highest accuracy with
  least on-device work; requires network and likely an API key/cost.
- **(b) On-device OCR + fuzzy lookup** — OCR the **collector number** and **card
  name** from the captured frame, then fuzzy-match against a cached card
  catalog. Works offline once the catalog is cached; accuracy depends on OCR
  quality and lighting.
- **(c) On-device image / feature matching** — match the captured card against
  reference card images using image hashing or feature descriptors. Fully
  offline; heavier to build and tune.

**Decision (MVP):** the MVP ships with **backend (b) — on-device OCR + fuzzy
lookup**, chosen for offline-first operation and no recurring API cost.
Backends (a) and (c) remain candidates and stay behind the `CardRecognizer`
interface for later. Changing the selected backend is an
[ask-first decision](CLAUDE.md).

Because (b) resolves a scan by fuzzy-matching against the cached card catalog,
the [card data source](#card-data-source) choice is now on the critical path —
OCR quality and catalog coverage together determine recognition accuracy.

---

## Card data source

The app needs Lorcana **card metadata** (set, name, collector number, finishes,
etc.) to resolve a scan into a known card.

**Chosen primary catalog: [LorcanaJSON](https://lorcanajson.org/)** — _confirmed_.
It is the only true **bulk** source (a single `allCards.json`), which suits the
offline-first OCR backend: the catalog is downloaded once, cached on-device, and
matched against locally. It also has the richest fields (full identifier =
collector number + set, all finish/foil/enchanted variants, multi-resolution
image URLs) and is stable and versioned.

- **[Lorcast](https://lorcast.com/)** (API) — _optional secondary_, kept behind
  the catalog-service interface for on-demand image/price fetches when bulk
  caching them isn't wanted.
- **[lorcana-api.com](https://lorcana-api.com/)** — fallback; its online
  `/fuzzy/` search is largely redundant once matching happens locally.

Because the OCR backend resolves a scan by fuzzy-matching the **cached** catalog,
the catalog service is a **sync-and-cache** module: download → store in SQLite →
build a local index on collector number + normalized name. Matching then tries an
exact collector-number hit first, with fuzzy name matching as the fallback.

Card data is **fetched and cached at runtime**, not bundled into this repo (see
[Legal / IP](#legal--ip)).

---

## High-level architecture

A layered architecture keeps the recognition and data concerns isolated and
swappable:

- **UI layer** — screens and components (camera/scan screen, collection list,
  card detail, add/edit entry).
- **State layer** — app state and view models; orchestrates user actions and
  holds in-memory state.
- **Domain layer** — core types and business rules (Card, CollectionEntry,
  Deck; matching/merge rules) with no framework or I/O dependencies.
- **Services layer** — the swappable boundaries to the outside world:
  - **Vision service** — implements the `CardRecognizer` interface.
  - **Catalog service** — fetches and caches Lorcana card metadata.
  - **Persistence service** — local SQLite storage for the collection.

Dependencies point inward: UI → State → Domain, with the Domain layer depending
only on service interfaces, not concrete implementations.

### Code structure & service interfaces

The layered design above is wired up behind **path aliases** (`@domain`,
`@services`, `@state`, `@ui`, `@lib`) and **interface-only service ports** —
`CardRecognizer`, `CatalogService`, and `CollectionRepository` /
`PersistenceService` (plus the shared `RecognitionResult`). Concrete
implementations are injected at the composition root and land in later
milestones behind these ports. See
[docs/architecture.md](docs/architecture.md) for the layer map, dependency
direction, the alias table, and pointers to each interface file.

> The draft [data model](#draft-data-model) below is **settled in B1** (the
> `finish = normal | foil` decision and the condition grades); the architecture
> skeleton ships only forward-declared placeholders for those types.

---

## Proposed directory structure

> Proposed — created during scaffolding, not yet present.

```
ink-capture/
├── README.md
├── CLAUDE.md
├── .gitignore
├── .env.example
└── src/
    ├── app/                # navigation, app entry, screens wiring
    ├── ui/                 # screens & reusable components
    │   ├── scan/
    │   ├── collection/
    │   └── components/
    ├── state/              # stores / view models
    ├── domain/             # core types & business rules (framework-free)
    │   ├── models/         # Card, CollectionEntry, Deck
    │   └── matching/       # recognition matching / merge logic
    ├── services/
    │   ├── vision/         # CardRecognizer interface + backends
    │   ├── catalog/        # Lorcana catalog fetch + cache
    │   └── persistence/    # SQLite storage
    └── lib/                # shared utilities
```

---

## Draft data model

> **Draft.** Field names and types are subject to change during scaffolding.

### Card (catalog entry)

A card as defined by the upstream catalog. Read-only reference data.

| Field               | Type     | Notes                                                                                                                                          |
| ------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                | string   | Stable catalog identifier                                                                                                                      |
| `name`              | string   | Card name                                                                                                                                      |
| `version`           | string?  | Subtitle / version (e.g. "Brave Little Tailor")                                                                                                |
| `setCode`           | string   | Set identifier                                                                                                                                 |
| `collectorNumber`   | string   | Number within the set                                                                                                                          |
| `rarity`            | string   | e.g. Common … Legendary / Enchanted. Enchanted & special printings are distinct `Card` rows (own collector number + rarity), **not** finishes. |
| `availableFinishes` | Finish[] | Finishes this card exists in (closed set: `normal` \| `foil`)                                                                                  |
| `imageUrl`          | string?  | Remote image URL (fetched at runtime, not stored)                                                                                              |

### CollectionEntry (an owned copy)

A user-owned record pointing at a `Card`.

| Field       | Type    | Notes                                                              |
| ----------- | ------- | ------------------------------------------------------------------ |
| `id`        | string  | Local identifier                                                   |
| `cardId`    | string  | References `Card.id`                                               |
| `quantity`  | integer | Positive integer; number owned of this card+finish+condition combo |
| `finish`    | enum    | `normal` \| `foil`                                                 |
| `condition` | enum    | `NM` \| `LP` \| `MP` \| `HP` \| `DMG`                              |
| `notes`     | string? | Free-form user notes                                               |
| `addedAt`   | string  | ISO 8601 UTC timestamp (when the entry was created)                |
| `updatedAt` | string  | ISO 8601 UTC timestamp (last modified)                             |

### Deck (optional — stretch)

A named list of cards for play/brewing.

| Field       | Type     | Notes                          |
| ----------- | -------- | ------------------------------ |
| `id`        | string   | Local identifier               |
| `name`      | string   | Deck name                      |
| `cards`     | array    | `{ cardId, quantity }` entries |
| `createdAt` | datetime |                                |
| `updatedAt` | datetime |                                |

---

## Roadmap

**MVP**

- Camera scan → recognize → add to local collection (quantity, finish,
  condition).
- One recognition backend behind the `CardRecognizer` interface.
- Local SQLite persistence; runtime-cached card catalog.
- Browse/search the local collection.

**v1**

- Edit/remove entries; manual add/correction when recognition is uncertain.
- Collection stats (counts by set, completion %).
- Improved scanning UX (multi-frame capture, confidence display).
- Hardening: error states, offline behavior, basic tests.

**Stretch goals**

- Deck building.
- A second recognition backend + on-device/offline recognition.
- Pricing data, export/import, and optional cloud sync/sharing.

---

## Legal / IP

Disney Lorcana is © Ravensburger / Disney. **This is an unofficial fan project**
and is not affiliated with, endorsed, or sponsored by Ravensburger or Disney.

Card **art and bulk card data are not redistributed in this repository**. All
card images and metadata are fetched and cached **at runtime** from third-party
sources under those sources' respective usage policies. Contributors must keep
the repo free of copyrighted assets (see the IP guardrail in
[CLAUDE.md](CLAUDE.md)).

---

## Getting Started

This is a **bare** React Native app (not Expo-managed). You'll need a working
React Native native toolchain for iOS and/or Android.

### Prerequisites

- **Node 26** — the version is pinned in [`.nvmrc`](.nvmrc); with `nvm`, run
  `nvm use` (or `nvm install`) in the repo root. `npm` ships with Node and is the
  package manager for this project. (Node **≥ 22.5** is the hard minimum: the test
  suite uses Node's built-in `node:sqlite`, added in 22.5 — see `engines` in
  [`package.json`](package.json).)
- **Watchman** — `brew install watchman`.
- **iOS:** Xcode **16.1+** with an iOS Simulator runtime, plus **Ruby + Bundler +
  CocoaPods** (CocoaPods is managed via the project [`Gemfile`](Gemfile), so you
  don't need a global install — see below). If you installed Xcode from the App
  Store and `xcodebuild`/CocoaPods aren't found, see
  [Troubleshooting](#troubleshooting) (the `xcode-select` pointer).
- **Android:** **JDK 17**, the Android SDK (Platform + Build-Tools 36, NDK
  `27.1.12297006`), and an emulator (AVD) or a connected device. Set
  `ANDROID_HOME` and add `platform-tools`/`emulator` to your `PATH`.

On macOS the SDK that Android Studio installs lives at `~/Library/Android/sdk`.
Add this to your shell profile (`~/.zshrc`), then open a new terminal:

```sh
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
```

Verify with `adb --version`. List installed emulators with `emulator -list-avds`
and boot one with `emulator -avd <name>` (the `npm run android` build will also
start a connected emulator/device).

See React Native's
[environment setup](https://reactnative.dev/docs/set-up-your-environment)
(choose **React Native CLI**, not Expo) for platform details.

### Install

**One-command setup (recommended).** After Homebrew, Xcode, and Android Studio
are installed (see Prerequisites), bootstrap everything — Homebrew packages, the
pinned Node, JS deps (which installs the Git hook), and iOS Pods:

```sh
brew bundle              # watchman, nvm, zulu@17 (from the Brewfile)
bash scripts/setup.sh    # nvm install/use -> npm install -> bundle install -> pod install
```

`scripts/setup.sh` is idempotent, so it is safe to re-run.

**Manual steps (fallback)** — equivalent to what `setup.sh` runs:

```sh
nvm use            # Node 26 (per .nvmrc)
npm install        # JS dependencies

# iOS native dependencies (CocoaPods, via Bundler)
bundle install                       # once, installs CocoaPods pinned in Gemfile
bundle exec pod install --project-directory=ios
```

### Run

Start Metro in one terminal, then build/run the app in another:

```sh
npm start          # Metro bundler

npm run ios        # iOS — needs a physical device on Apple Silicon (see Troubleshooting)
# or
npm run android    # build + launch on an Android emulator/device
```

On first launch the app requests **camera permission**. Granting it shows a live
back-camera preview — **tap the card to focus, pinch to zoom** (pinch out engages
the ultra-wide for close-up macro). The **iOS Simulator can't run this app on
Apple Silicon** (ML Kit ships no arm64-simulator slice — see Troubleshooting); use
a **physical iOS device** or an Android emulator's virtual camera.

**When do I need `pod install`?** Not on every build. The day-to-day loop is just
`npm start` + `npm run ios` (or `npm run android`); pure JS/TS changes only need
Metro. CocoaPods has to re-run **only when the native dependency set changes** — a
fresh clone, a newly added/updated native module, or a `Podfile` edit. `ios/Pods/`
is git-ignored and regenerated locally from the committed `Podfile.lock`, so after
pulling a branch that changed native deps you may need to sync it once. On RN 0.86
`npm run ios` is designed to run the pod step for you (via `bundle exec`, thanks to
the committed `Gemfile`); if it ever doesn't, see the "not in sync with the
Podfile.lock" note under Troubleshooting.

### Troubleshooting

If a build fails or the environment looks off, run the React Native environment
doctor — it checks Node, watchman, the iOS/Android toolchains, and more:

```sh
npx react-native doctor
```

**`xcodebuild`/CocoaPods not found after installing Xcode from the App Store.**
The App Store installs Xcode but leaves the command-line tools pointed at the
standalone Command Line Tools, so `xcodebuild` errors and `react-native doctor`
reports Xcode as "not found". Point the toolchain at Xcode, then accept the
license and install its components:

```sh
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
sudo xcodebuild -runFirstLaunch
```

**Bundler crashes with `undefined method 'untaint'` (or similar) during
`bundle install`.** `Gemfile.lock` is pinned to **Bundler 1.17.2**, which only
runs on **Ruby < 3.2**. macOS ships a compatible system Ruby (2.6.x), so the
default works — but if a newer Ruby (3.2+, e.g. from Homebrew or rbenv) is first
on your `PATH`, Bundler 1.17.2 fails to load. Use the system Ruby explicitly:

```sh
BUNDLE_PATH=vendor/bundle /usr/bin/bundle install
BUNDLE_PATH=vendor/bundle /usr/bin/bundle exec pod install --project-directory=ios
```

`BUNDLE_PATH=vendor/bundle` (already set by `scripts/setup.sh`) installs gems
into the gitignored project-local `vendor/bundle`, so **no `sudo` is needed**
against the system Ruby.

**"Unable to boot device in current state: Booted."** Harmless — the simulator
was already running, so the boot request was a no-op. Dismiss it; the build
continues.

**iOS Simulator won't run the app on Apple Silicon (`xcodebuild` lists no
simulator / "Unable to find a destination").** ML Kit ships **no arm64-simulator**
binaries, so `pod install` excludes `arm64` for the simulator
(`EXCLUDED_ARCHS[sdk=iphonesimulator*] = arm64`) and the build targets `x86_64` —
but Apple Silicon Macs only have **arm64** simulators, so there is no simulator to
run on. **Run on a physical iOS device** (the camera is the whole point;
simulators have no camera anyway):

- **Signing & Capabilities → Automatically manage signing → pick your Team** (a
  free personal Apple ID works for development).
- First launch on the phone: **Settings → General → VPN & Device Management →
  Trust** your developer certificate.
- A Debug build loads JS from Metro over the LAN, so **allow the "Local Network"
  prompt** and keep the phone on the **same Wi-Fi** as the Mac. After that, JS
  changes just need a **Reload** (shake → Reload) — no rebuild.

**Xcode's debugger pauses on `__abort_with_payload` at launch (continuing
works).** A benign, internally-handled system exception that the attached
debugger stops on. Either click Continue, delete the "All Exceptions" breakpoint
(⌘8), or simply launch the app from the **home screen** instead of Xcode's ▶ — no
debugger, no pause.

**CocoaPods warns "your terminal must use UTF-8 encoding."** Set a UTF-8 locale
(add it to your shell profile to make it permanent):

```sh
export LANG=en_US.UTF-8
```

**Build fails with "The sandbox is not in sync with the Podfile.lock."** Your
local `ios/Pods/` is stale after a native-dependency or `Podfile` change (e.g.
pulling a branch that added a native module). Re-sync the pods once, then rebuild:

```sh
bundle exec pod install --project-directory=ios   # or: bash scripts/setup.sh
```

**App shows a red "Could not connect to development server" screen.** Metro
isn't running. Start it with `npm start` (in its own terminal), then reload the
app (`r` in the Metro terminal, or shake → Reload).

### Environment configuration

Required environment variables are documented in
[`.env.example`](.env.example). Runtime env wiring (via `react-native-config`) is
not yet implemented — it arrives in a later milestone (B2). No env vars are
required to build and run A1.

Before contributing, read the working agreement in [CLAUDE.md](CLAUDE.md).

---

## Contributing

This project uses a development-branch workflow with pull requests and
Conventional Commits. **Before contributing, read [CLAUDE.md](CLAUDE.md)** — it
defines the git workflow, code-quality bar, secrets handling, and IP guardrails
that all contributors (human and AI) must follow.

### Quality gate

Four checks make up the local Definition-of-Done gate. Run them before opening a
PR:

```sh
npm run lint           # ESLint (React Native + TypeScript rules), warnings fail the gate
npm run format:check   # Prettier formatting check (npm run format to auto-fix)
npm run typecheck      # tsc --noEmit (TypeScript strict mode)
npm test               # Jest + React Native Testing Library
```

A **Husky pre-commit hook** runs `lint-staged` automatically on every commit,
auto-fixing lint/format issues on staged files (and aborting the commit on
unfixable lint errors). The hook is installed for you when `npm install` runs
its `prepare` script — no manual setup on a fresh clone.

**GitHub Actions** runs all four checks plus a JS bundle check on every pull
request into `development`, so the same gate is enforced in CI.
