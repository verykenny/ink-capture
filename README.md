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
   - **Finish** (e.g. normal vs. foil/enchanted/special finish)
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
- **State management:** _TBD_ (lightweight store such as Zustand, or React
  context + reducers).

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

| Field               | Type     | Notes                                            |
| ------------------- | -------- | ------------------------------------------------ |
| `id`                | string   | Stable catalog identifier                        |
| `name`              | string   | Card name                                        |
| `version`           | string?  | Subtitle / version (e.g. "Brave Little Tailor")  |
| `setCode`           | string   | Set identifier                                   |
| `collectorNumber`   | string   | Number within the set                            |
| `rarity`            | string   | e.g. Common … Legendary / Enchanted              |
| `availableFinishes` | string[] | Finishes the card can exist in                   |
| `imageUrl`          | string?  | Remote image URL (fetched at runtime, not stored)|

### CollectionEntry (an owned copy)

A user-owned record pointing at a `Card`.

| Field        | Type     | Notes                                              |
| ------------ | -------- | -------------------------------------------------- |
| `id`         | string   | Local identifier                                   |
| `cardId`     | string   | References `Card.id`                                |
| `quantity`   | integer  | Number owned of this card+finish+condition combo   |
| `finish`     | enum     | e.g. `normal` \| `foil` \| `enchanted` \| `special`|
| `condition`  | enum     | e.g. `NM` \| `LP` \| `MP` \| `HP` \| `DMG`         |
| `notes`      | string?  | Free-form user notes                               |
| `addedAt`    | datetime | When the entry was created                         |
| `updatedAt`  | datetime | Last modified                                      |

### Deck (optional — stretch)

A named list of cards for play/brewing.

| Field       | Type     | Notes                            |
| ----------- | -------- | -------------------------------- |
| `id`        | string   | Local identifier                 |
| `name`      | string   | Deck name                        |
| `cards`     | array    | `{ cardId, quantity }` entries   |
| `createdAt` | datetime |                                  |
| `updatedAt` | datetime |                                  |

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

- **Node 20 LTS** — the version is pinned in [`.nvmrc`](.nvmrc); with `nvm`, run
  `nvm use` (or `nvm install`) in the repo root. `npm` ships with Node and is the
  package manager for this project.
- **Watchman** — `brew install watchman`.
- **iOS:** Xcode **16.1+** with an iOS Simulator runtime, plus **Ruby + Bundler +
  CocoaPods** (CocoaPods is managed via the project [`Gemfile`](Gemfile), so you
  don't need a global install — see below).
- **Android:** **JDK 17**, the Android SDK (Platform + Build-Tools 36, NDK
  `27.1.12297006`), and an emulator (AVD) or a connected device. Set
  `ANDROID_HOME` and add `platform-tools`/`emulator` to your `PATH`.

See React Native's
[environment setup](https://reactnative.dev/docs/set-up-your-environment)
(choose **React Native CLI**, not Expo) for platform details.

### Install

```sh
nvm use            # Node 20 (per .nvmrc)
npm install        # JS dependencies

# iOS native dependencies (CocoaPods, via Bundler)
bundle install                       # once, installs CocoaPods pinned in Gemfile
bundle exec pod install --project-directory=ios
```

### Run

Start Metro in one terminal, then build/run the app in another:

```sh
npm start          # Metro bundler

npm run ios        # build + launch on the iOS Simulator
# or
npm run android    # build + launch on an Android emulator/device
```

On first launch the app requests **camera permission**. Granting it shows a live
back-camera preview (the iOS Simulator has no camera hardware, so it shows a
"granted, no device" state — use an Android emulator's virtual camera or a real
device to see the preview).

### Environment configuration

Required environment variables are documented in
[`.env.example`](.env.example). Runtime env wiring (via `react-native-config`) is
not yet implemented — it arrives in a later milestone (B2). No env vars are
required to build and run A1.

Before contributing, read the working agreement in [CLAUDE.md](CLAUDE.md).

---

## Contributing

> Placeholder.

This project uses a development-branch workflow with pull requests and
Conventional Commits. **Before contributing, read [CLAUDE.md](CLAUDE.md)** — it
defines the git workflow, code-quality bar, secrets handling, and IP guardrails
that all contributors (human and AI) must follow.
