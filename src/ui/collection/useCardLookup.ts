/**
 * useCardLookup — resolves a `cardId` to its `Card` for display.
 *
 * Loads the cached catalog AND the off-catalog custom store (E1) once into a
 * single id→Card map and returns a lookup. `manual:<rowid>` ids never collide
 * with catalog ids, so the two sources merge cleanly. Purely a display nicety:
 * until the map loads — or if it fails — the lookup returns undefined and callers
 * fall back to the raw `cardId`. No catalog data is bundled; it is read from the
 * runtime cache.
 *
 * @format
 */

import { useEffect, useState } from 'react';
import type { Card } from '@domain';
import { useAppServices } from '@state';

export type CardLookup = (cardId: string) => Card | undefined;

export function useCardLookup(): CardLookup {
  const { catalog, customCards } = useAppServices();
  const [byId, setById] = useState<ReadonlyMap<string, Card>>(() => new Map());

  useEffect(() => {
    let cancelled = false;
    Promise.all([catalog.getAllCards(), customCards.getAll()])
      .then(([catalogCards, manualCards]) => {
        if (!cancelled) {
          const map = new Map<string, Card>();
          for (const card of catalogCards) {
            map.set(card.id, card);
          }
          for (const card of manualCards) {
            map.set(card.id, card);
          }
          setById(map);
        }
      })
      .catch(() => {
        // Name display is optional; callers fall back to the cardId.
      });
    return () => {
      cancelled = true;
    };
  }, [catalog, customCards]);

  return (cardId: string) => byId.get(cardId);
}
