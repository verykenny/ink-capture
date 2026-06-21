/**
 * CollectionListScreen — the initial route: the persisted collection, browsable.
 *
 * A pure reader of the collection store (loaded once at startup; kept fresh by
 * ConfirmSheet's add → re-list). Each row shows the card's name/version (resolved
 * via the catalog, falling back to the cardId), its finish/condition, and the
 * stack quantity. A Scan CTA pushes the Scan route; an empty collection shows a
 * minimal empty state with the same CTA. Rich empty/error UX is E2.
 *
 * @format
 */

import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useStore } from 'zustand';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { cardDisplayTitle } from '@domain';
import type { CollectionEntry } from '@domain';
import { useAppServices } from '@state';
import type { RootStackParamList } from '../navigationTypes';
import { useCardLookup, type CardLookup } from './useCardLookup';

type Props = NativeStackScreenProps<RootStackParamList, 'Collection'>;

const titleFor = (entry: CollectionEntry, lookup: CardLookup): string => {
  const card = lookup(entry.cardId);
  if (!card) {
    return entry.cardId;
  }
  return cardDisplayTitle(card);
};

export function CollectionListScreen({ navigation }: Props): React.JSX.Element {
  const { collectionStore } = useAppServices();
  const entries = useStore(collectionStore, state => state.entries);
  const lookup = useCardLookup();

  const goToScan = () => navigation.navigate('Scan');

  return (
    <View style={styles.container}>
      {entries.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No cards yet.</Text>
          <Text style={styles.emptyHint}>
            Scan a card to start your collection.
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={entry => entry.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>{titleFor(item, lookup)}</Text>
                <Text style={styles.rowMeta}>
                  {item.finish} · {item.condition}
                </Text>
              </View>
              <Text style={styles.qty}>×{item.quantity}</Text>
            </View>
          )}
        />
      )}

      <TouchableOpacity
        style={styles.scanButton}
        onPress={goToScan}
        accessibilityRole="button"
      >
        <Text style={styles.scanButtonText}>Scan a card</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
  },
  emptyHint: {
    fontSize: 14,
    opacity: 0.6,
    marginTop: 6,
    textAlign: 'center',
  },
  listContent: {
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#00000022',
  },
  rowMain: {
    flex: 1,
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
  qty: {
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 12,
  },
  scanButton: {
    margin: 16,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#3b5bfd',
    alignItems: 'center',
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
