/**
 * useCardLookup — resolves a `cardId` to its catalog `Card` for display.
 *
 * Loads the cached catalog once (via the injected `CatalogService`) into an
 * id→Card map and returns a lookup. Purely a display nicety: until the map
 * loads — or if it fails — the lookup returns undefined and callers fall back to
 * the raw `cardId`. No catalog data is bundled; it is read from the runtime cache.
 *
 * @format
 */

import { useEffect, useState } from 'react';
import type { Card } from '@domain';
import { useAppServices } from '@state';

export type CardLookup = (cardId: string) => Card | undefined;

export function useCardLookup(): CardLookup {
  const { catalog } = useAppServices();
  const [byId, setById] = useState<ReadonlyMap<string, Card>>(() => new Map());

  useEffect(() => {
    let cancelled = false;
    catalog
      .getAllCards()
      .then(cards => {
        if (!cancelled) {
          setById(new Map(cards.map(card => [card.id, card])));
        }
      })
      .catch(() => {
        // Name display is optional; callers fall back to the cardId.
      });
    return () => {
      cancelled = true;
    };
  }, [catalog]);

  return (cardId: string) => byId.get(cardId);
}
