/**
 * collectionStore — the in-memory view of the persisted collection.
 *
 * A Zustand *vanilla* store (no React coupling) built by `createCollectionStore`
 * over the `CollectionRepository` **interface** — never SQLite directly — so it
 * is injectable and testable with the real repo over an in-memory database. The
 * store owns the collection list plus a load/add status; screens read it through
 * `useStore` and write through `add`.
 *
 * `add` re-lists after the repository write so merge-on-insert is faithfully
 * reflected: re-adding the same (cardId, finish, condition) bumps that stack's
 * quantity rather than appending a row.
 *
 * @format
 */

import { createStore, type StoreApi } from 'zustand/vanilla';
import type { CollectionEntry, NewCollectionEntry } from '@domain';
import type { CollectionRepository } from '@services';

export type CollectionStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface CollectionState {
  entries: CollectionEntry[];
  status: CollectionStatus;
  error?: string;
  /** Reload the collection from the repository. */
  load(): Promise<void>;
  /** Persist an entry (merge-on-insert) and reflect the refreshed list. */
  add(entry: NewCollectionEntry): Promise<CollectionEntry>;
  /** Edit an entry (merge-on-edit) and reflect the refreshed list. */
  update(
    id: string,
    changes: Partial<NewCollectionEntry>,
  ): Promise<CollectionEntry>;
  /** Delete an entry and reflect the refreshed list. */
  remove(id: string): Promise<void>;
}

export type CollectionStore = StoreApi<CollectionState>;

/** Narrow an unknown thrown value to a display string. */
const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const createCollectionStore = (
  repo: CollectionRepository,
): CollectionStore =>
  createStore<CollectionState>(set => ({
    entries: [],
    status: 'idle',

    load: async () => {
      set({ status: 'loading', error: undefined });
      try {
        const entries = await repo.list();
        set({ entries, status: 'ready' });
      } catch (error) {
        set({ status: 'error', error: messageOf(error) });
      }
    },

    add: async entry => {
      let created: CollectionEntry;
      try {
        created = await repo.add(entry);
      } catch (error) {
        // Only a failed WRITE is a failure.
        set({ status: 'error', error: messageOf(error) });
        throw error;
      }
      // The write committed; refresh the list so a merge (quantity bump) vs. a
      // fresh row is reflected as the repository actually resolved it — the store
      // never guesses the outcome. A failed *refresh* must not report the save as
      // a failure (that would invite a duplicate add): keep status 'ready'.
      try {
        const entries = await repo.list();
        set({ entries, status: 'ready', error: undefined });
      } catch {
        set({ status: 'ready', error: undefined });
      }
      return created;
    },

    update: async (id, changes) => {
      let updated: CollectionEntry;
      try {
        updated = await repo.update(id, changes);
      } catch (error) {
        // Only a failed WRITE is a failure.
        set({ status: 'error', error: messageOf(error) });
        throw error;
      }
      // The edit committed; re-list so a merge (source folded into another stack)
      // vs. an in-place edit is reflected exactly as the repository resolved it. A
      // failed *refresh* must not report the committed edit as a failure.
      try {
        const entries = await repo.list();
        set({ entries, status: 'ready', error: undefined });
      } catch {
        set({ status: 'ready', error: undefined });
      }
      return updated;
    },

    remove: async id => {
      try {
        await repo.remove(id);
      } catch (error) {
        set({ status: 'error', error: messageOf(error) });
        throw error;
      }
      try {
        const entries = await repo.list();
        set({ entries, status: 'ready', error: undefined });
      } catch {
        set({ status: 'ready', error: undefined });
      }
    },
  }));
