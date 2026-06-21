/**
 * CandidateList — a small, reusable, tappable list of ranked RecognitionCandidates.
 *
 * Renders each candidate's name/version, its set · # · rarity, and its confidence
 * as a hint, and calls `onPick(card)` when a row is tapped. CardSearchScreen uses
 * it for both the ambiguous-scan top-N (seeded) and manual-search results; it is
 * kept generic so any top-N display can reuse it. At MVP scale the list is small
 * (the matcher caps the fuzzy tier and the top-N is capped too), so a plain mapped
 * ScrollView — not a virtualized FlatList — keeps it simple and test-friendly.
 *
 * Pure presentation: no store, no catalog, no navigation — the parent wires those.
 *
 * @format
 */

import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { cardDisplayTitle } from '@domain';
import type { Card, RecognitionCandidate } from '@domain';

export function CandidateList({
  candidates,
  onPick,
  emptyLabel = 'No matches yet.',
}: {
  candidates: readonly RecognitionCandidate[];
  onPick: (card: Card) => void;
  emptyLabel?: string;
}): React.JSX.Element {
  if (candidates.length === 0) {
    return <Text style={styles.empty}>{emptyLabel}</Text>;
  }

  return (
    <ScrollView
      style={styles.list}
      contentContainerStyle={styles.listContent}
      keyboardShouldPersistTaps="handled"
    >
      {candidates.map(({ card, confidence }) => (
        <TouchableOpacity
          key={card.id}
          style={styles.row}
          onPress={() => onPick(card)}
          accessibilityRole="button"
        >
          <Text style={styles.rowTitle}>{cardDisplayTitle(card)}</Text>
          <Text style={styles.rowMeta}>
            {card.setCode} · #{card.collectorNumber} · {card.rarity} ·{' '}
            {Math.round(confidence * 100)}%
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  empty: {
    fontSize: 14,
    opacity: 0.6,
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 24,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 8,
  },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#00000022',
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  rowMeta: {
    fontSize: 13,
    opacity: 0.6,
    marginTop: 2,
  },
});
