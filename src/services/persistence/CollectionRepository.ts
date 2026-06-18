import type { CollectionEntry, NewCollectionEntry } from '@domain';

// NewCollectionEntry & CollectionEntryKey now live in the domain layer (the
// merge identity belongs to @domain); re-export them so this module stays the
// canonical import site for persistence consumers.
export type { NewCollectionEntry, CollectionEntryKey } from '@domain';

/** DB lifecycle: open + migrate. Called once at the composition root (B3 impl). */
export interface PersistenceService {
  init(): Promise<void>;
}

/** Local store of owned cards. Impl (B3): SQLite + B1's merge-on-insert rule. */
export interface CollectionRepository {
  add(entry: NewCollectionEntry): Promise<CollectionEntry>; // merge or create
  list(): Promise<CollectionEntry[]>;
  getById(id: string): Promise<CollectionEntry | null>;
  update(
    id: string,
    changes: Partial<NewCollectionEntry>,
  ): Promise<CollectionEntry>;
  remove(id: string): Promise<void>;
}
