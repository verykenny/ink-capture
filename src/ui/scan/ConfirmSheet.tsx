/**
 * ConfirmSheet — the modal that turns a recognition result into a saved stack.
 *
 * Shows the top candidate (the recognizer returns best-first) with its
 * confidence as a *hint only* — never a gate or threshold; the user always
 * confirms. Finish and condition are picked with an OptionSelector built from the
 * domain value sets (FINISHES / CONDITIONS); the finish defaults to the card's
 * first available finish, condition to 'NM', quantity to 1. "Add to collection"
 * builds a NewCollectionEntry and saves through the store (→ repository
 * merge-on-insert), then pops back to the refreshed list.
 *
 * Empty candidates get a minimal no-match message (rich no-match/error UX is E2).
 *
 * @format
 */

import { useCallback, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CONDITIONS, FINISHES } from '@domain';
import type { Condition, Finish } from '@domain';
import { useAppServices } from '@state';
import type { RootStackParamList } from '../navigationTypes';
import { OptionSelector } from '../components/OptionSelector';

type Props = NativeStackScreenProps<RootStackParamList, 'Confirm'>;

export function ConfirmSheet({ route, navigation }: Props): React.JSX.Element {
  const { collectionStore } = useAppServices();
  const candidate = route.params.result.candidates[0];
  const card = candidate?.card;

  // Hooks must run unconditionally — compute safe defaults even when there is no
  // candidate (the early return below renders the no-match branch).
  const [finish, setFinish] = useState<Finish>(
    card?.availableFinishes[0] ?? FINISHES[0],
  );
  const [condition, setCondition] = useState<Condition>('NM');
  const [quantity, setQuantity] = useState(1);
  const [saving, setSaving] = useState(false);

  const onAdd = useCallback(async () => {
    if (!card) {
      return;
    }
    setSaving(true);
    try {
      await collectionStore
        .getState()
        .add({ cardId: card.id, quantity, finish, condition });
      navigation.popToTop();
    } catch {
      // Minimal: surface nothing rich here (E2 owns error UX); let the user retry.
      setSaving(false);
    }
  }, [card, collectionStore, quantity, finish, condition, navigation]);

  if (!candidate || !card) {
    return (
      <View style={styles.center}>
        <Text style={styles.noMatchTitle}>No match found.</Text>
        <Text style={styles.noMatchHint}>Try scanning the card again.</Text>
      </View>
    );
  }

  const confidencePct = Math.round(candidate.confidence * 100);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.cardTitle}>
        {card.version ? `${card.name} — ${card.version}` : card.name}
      </Text>
      <Text style={styles.cardMeta}>
        {card.setCode} · #{card.collectorNumber} · {card.rarity}
      </Text>
      <Text style={styles.confidence}>{confidencePct}% match</Text>

      <Text style={styles.label}>Finish</Text>
      <OptionSelector
        options={FINISHES}
        value={finish}
        onChange={setFinish}
        accessibilityLabel="Finish"
      />

      <Text style={styles.label}>Condition</Text>
      <OptionSelector
        options={CONDITIONS}
        value={condition}
        onChange={setCondition}
        accessibilityLabel="Condition"
      />

      <Text style={styles.label}>Quantity</Text>
      <View style={styles.qtyRow}>
        <TouchableOpacity
          style={styles.qtyButton}
          onPress={() => setQuantity(q => Math.max(1, q - 1))}
          accessibilityRole="button"
          accessibilityLabel="Decrease quantity"
        >
          <Text style={styles.qtyButtonText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.qtyValue}>{quantity}</Text>
        <TouchableOpacity
          style={styles.qtyButton}
          onPress={() => setQuantity(q => q + 1)}
          accessibilityRole="button"
          accessibilityLabel="Increase quantity"
        >
          <Text style={styles.qtyButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.addButton, saving && styles.addButtonDisabled]}
        onPress={() => {
          // eslint-disable-next-line no-void -- fire-and-forget the async save
          void onAdd();
        }}
        disabled={saving}
        accessibilityRole="button"
      >
        <Text style={styles.addButtonText}>Add to collection</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  noMatchTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  noMatchHint: {
    fontSize: 14,
    opacity: 0.6,
    marginTop: 6,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  cardMeta: {
    fontSize: 14,
    opacity: 0.6,
    marginTop: 4,
  },
  confidence: {
    fontSize: 13,
    opacity: 0.5,
    marginTop: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    opacity: 0.6,
    marginTop: 24,
    marginBottom: 8,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  qtyButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#3b5bfd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyButtonText: {
    fontSize: 22,
    color: '#3b5bfd',
    fontWeight: '700',
  },
  qtyValue: {
    fontSize: 18,
    fontWeight: '700',
    minWidth: 24,
    textAlign: 'center',
  },
  addButton: {
    marginTop: 32,
    paddingVertical: 16,
    borderRadius: 10,
    backgroundColor: '#3b5bfd',
    alignItems: 'center',
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
