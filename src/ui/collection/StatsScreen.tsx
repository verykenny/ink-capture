/**
 * StatsScreen — collection completion at a glance (E3).
 *
 * A pure reader: it reads the saved entries from the collection store and the
 * catalog from `catalog.getAllCards()` (loaded once via `useEffect`, like
 * `useCardLookup`), then hands both to the pure `computeCollectionStats` reducer.
 * The startup gate guarantees the catalog is available, so a minimal loading
 * state suffices; a failed read shows a one-line message (rich error UX was E2).
 *
 * It renders an overall summary (completion %, distinct owned / catalog size,
 * total copies, and the separate off-catalog + unknown counts) plus one row per
 * catalog set (`setCode`, owned/size, %, copies). Set labels are the raw
 * `setCode` — human set names are deferred (the upstream `sets` object is
 * untyped/unconsumed). No `CatalogService` method is added; the denominator is
 * derived in-memory inside the reducer.
 *
 * @format
 */

import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useStore } from 'zustand';
import { computeCollectionStats } from '@domain';
import type { Card } from '@domain';
import { useAppServices } from '@state';

/** Render a percentage for display: the exact reducer value, rounded to a whole. */
const formatPct = (pct: number): string => `${Math.round(pct)}%`;

export function StatsScreen(): React.JSX.Element {
  const { catalog, collectionStore } = useAppServices();
  const entries = useStore(collectionStore, state => state.entries);
  const [catalogCards, setCatalogCards] = useState<Card[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    catalog
      .getAllCards()
      .then(cards => {
        if (!cancelled) {
          setCatalogCards(cards);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [catalog]);

  if (failed) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>Couldn’t load stats.</Text>
      </View>
    );
  }

  if (catalogCards === null) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>Loading stats…</Text>
      </View>
    );
  }

  const stats = computeCollectionStats(entries, catalogCards);
  const { overall } = stats;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>Overall</Text>
        <Text style={styles.summaryHeadline}>
          {overall.distinctCatalogOwned} / {overall.catalogTotal} cards ·{' '}
          {formatPct(overall.completionPct)}
        </Text>
        <Text style={styles.summaryLine}>
          Total copies: {overall.totalCopies}
        </Text>
        <Text style={styles.summaryLine}>
          Off-catalog: {overall.offCatalogDistinct}
        </Text>
        <Text style={styles.summaryLine}>
          Unknown: {overall.unknownDistinct}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>By set</Text>
      {stats.perSet.length === 0 ? (
        <Text style={styles.emptyLine}>No sets in the catalog yet.</Text>
      ) : (
        stats.perSet.map(set => (
          <View key={set.setCode} style={styles.row}>
            <Text style={styles.setCode}>{set.setCode}</Text>
            <View style={styles.rowMain}>
              <Text style={styles.rowProgress}>
                {set.ownedDistinct} / {set.setSize} ·{' '}
                {formatPct(set.completionPct)}
              </Text>
              <Text style={styles.rowCopies}>{set.ownedCopies} copies</Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  message: {
    fontSize: 16,
    opacity: 0.6,
  },
  content: {
    paddingVertical: 8,
  },
  summary: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.6,
    textTransform: 'uppercase',
  },
  summaryHeadline: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 4,
  },
  summaryLine: {
    fontSize: 14,
    opacity: 0.8,
    marginTop: 6,
  },
  emptyLine: {
    fontSize: 14,
    opacity: 0.6,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#00000022',
  },
  setCode: {
    fontSize: 16,
    fontWeight: '700',
    width: 56,
  },
  rowMain: {
    flex: 1,
    alignItems: 'flex-end',
  },
  rowProgress: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowCopies: {
    fontSize: 13,
    opacity: 0.6,
    marginTop: 2,
  },
});
