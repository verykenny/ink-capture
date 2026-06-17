# Architecture — layers, aliases & service interfaces

> Established by task **A3** (`chore/architecture-skeleton`). A3 locks the
> _contracts_ every later milestone (B/C/D) fills in — **interface-only, no
> implementations**. See [docs/mvp-plan.md](mvp-plan.md) §2 for the task list and
> [README.md](../README.md) for the product overview.

## Layers

The app is split into four layers, isolating the recognition and data concerns
behind swappable boundaries:

- **UI** (`@ui`) — screens & reusable components (scan, collection, shared
  components). _Populated in C2._
- **State** (`@state`) — stores / view models; orchestrates user actions and
  holds in-memory state. _Populated in C2._
- **Domain** (`@domain`) — framework-free core types & business rules: card and
  collection models, plus the shared recognition result types. No I/O, no RN
  imports.
- **Services** (`@services`) — the **port interfaces** to the outside world
  (vision/recognition, catalog, persistence). Concrete implementations land in
  later milestones behind these interfaces.
- **Lib** (`@lib`) — small shared utilities/constants used across layers.

## Dependency direction

Dependencies point **inward**. Outer layers depend on inner ones; nothing inner
depends on anything outer.

```
        UI  →  State  →  Domain
                            ▲
                            │ (interfaces depend inward on domain types)
                        Services  ── port interfaces only
                            ▲
                            │ concrete impls injected here (not imported by Domain/State)
                      App (composition root: index.js / App.tsx)
```

- **Ports live in `@services` and depend inward on `@domain`.** For example
  `CardRecognizer.recognize` returns a `@domain` `RecognitionResult`. That makes
  `@services → @domain` a real cross-alias seam `tsc` proves.
- **Consumers depend on the port _interfaces_, never the concrete
  implementations.** The concrete services (a stub/OCR recognizer, the catalog
  sync, the SQLite repository) are **injected at the composition root** (`@app` —
  `index.js` / `src/app/App.tsx`); the domain and state layers never import them.
- `RecognitionResult` is produced by **both** the pure matcher (C1,
  `@domain/matching`) and the OCR recognizer (D1, `@services/vision`). To keep
  dependencies pointing inward it lives in `@domain`, and `@services` imports it.

## Path aliases

Aliases are wired in **both** layers that must agree, because TypeScript `paths`
are a compile-time fiction — Metro and Babel do not read `tsconfig.json`. A
TS-only alias type-checks but **crashes at bundle/runtime**.

- **`tsconfig.json`** — `baseUrl` + `paths` (each alias has a **bare** and a
  **`/*`** entry) for `tsc` and the IDE.
- **`babel.config.js`** — [`babel-plugin-module-resolver`](https://github.com/tleunen/babel-plugin-module-resolver)
  (dev-only, JS-only — no native footprint) with a matching `alias` map. It runs
  inside the babel transform that **both Metro (bundling) and Jest (`babel-jest`)
  already use**, so `metro.config.js` and `jest.config.js` need no alias config.

| Alias       | Target         | Notes                                                   |
| ----------- | -------------- | ------------------------------------------------------- |
| `@domain`   | `src/domain`   | Innermost: models + matching result types               |
| `@services` | `src/services` | Port interfaces (CardRecognizer / Catalog / Repository) |
| `@state`    | `src/state`    | Config-only in A3 (no modules yet; C2 populates)        |
| `@ui`       | `src/ui`       | Config-only in A3 (no modules yet; C2 populates)        |
| `@lib`      | `src/lib`      | Shared utils; carries the runtime bundle-proof          |

There is **no `@app` alias** — `index.js` and `src/app/App.tsx` stay relative;
`App` is the composition root.

The runtime resolution is proven by `App.tsx` importing `APP_NAME` from `@lib`
(so a successful Metro bundle exercises the alias at runtime) and by
[`__tests__/aliases.test.ts`](../__tests__/aliases.test.ts). The type seams are
proven by `tsc`.

> **`@state` / `@ui` are config-only in A3.** Their aliases are wired in both
> configs but exercised by nothing yet (`.gitkeep` placeholders remain). They are
> proven once **C2** populates those layers — intentional, not an oversight.

## Service interfaces (the ports)

The interface-only boundaries A3 locks in:

- **`CardRecognizer`** — [src/services/vision/CardRecognizer.ts](../src/services/vision/CardRecognizer.ts).
  Pluggable recognition backend (`recognize(image) → RecognitionResult`). MVP
  ships a `StubCardRecognizer` (C1); D1 swaps in an `OcrCardRecognizer` with no
  caller change.
- **`CatalogService`** — [src/services/catalog/CatalogService.ts](../src/services/catalog/CatalogService.ts).
  Syncs LorcanaJSON into a local cache and exposes the lookups the matcher uses
  (B2 impl).
- **`CollectionRepository`** / **`PersistenceService`** —
  [src/services/persistence/CollectionRepository.ts](../src/services/persistence/CollectionRepository.ts).
  Local store of owned cards (CRUD + merge-on-insert) and DB lifecycle (B3 impl).
- **`RecognitionResult`** (+ `RecognitionCandidate`, `Confidence`,
  `RecognitionSource`) —
  [src/domain/matching/recognitionResult.ts](../src/domain/matching/recognitionResult.ts).
  The shared output type both the matcher and recognizer produce.

`@domain` and `@services` each re-export their public surface from a barrel
(`src/domain/index.ts`, `src/services/index.ts`).

## The A3 placeholder line (A3 vs B1)

A3 declares the **minimal shape the contracts reference**, clearly marked as
B1-owned. **A3 = contract surface; B1 = value sets + rules.**

- `Finish` / `Condition` are **`type … = string` placeholders**. **B1** narrows
  them to the settled `'normal' | 'foil'` finish union and the condition grades
  (NM | LP | MP | HP | DMG).
- `Card` carries **identity fields only** (`id`, `name`, `setCode`,
  `collectorNumber`). **B1** expands it (rarity, version, availableFinishes,
  imageUrl) and reconciles the README data model.
- `CollectionEntry` is a minimal placeholder so the persistence contract can
  reference it. **B1** finalizes value types, validation, and the merge rule.

A3 does **not** define the `normal | foil` union, the condition grades,
validation, the collection-entry merge rule, or reconcile the (currently stale)
README data model — all of that is **B1**.
