import type { CollectionEntry } from '@domain';

/** A new entry before persisted id/timestamps. */
export type NewCollectionEntry = Omit<
  CollectionEntry,
  'id' | 'addedAt' | 'updatedAt'
>;

/** The merge identity (card + finish + condition). */
export type CollectionEntryKey = Pick<
  CollectionEntry,
  'cardId' | 'finish' | 'condition'
>;

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
