/**
 * EditEntryScreen — edit or remove one saved collection stack.
 *
 * Reached by tapping a Collection row. It reuses the Confirm sheet's controls (an
 * OptionSelector for finish/condition + a quantity stepper), prefilled from the
 * entry, and writes through `collectionStore.update` — so an edit that collides
 * with another stack MERGES via the repository, exactly as add() does, rather
 * than erroring. A two-step Remove affordance (tap → confirm) deletes the stack
 * via `collectionStore.remove`. Both actions re-list and pop back to the
 * refreshed Collection.
 *
 * The entry is read live from the store by id; if it disappears (e.g. it was the
 * source of a merge, or removed) while we're not mid-action, there is nothing to
 * edit, so we pop back.
 *
 * @format
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useStore } from 'zustand';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CONDITIONS, FINISHES, cardDisplayTitle } from '@domain';
import type { Condition, Finish } from '@domain';
import { useAppServices } from '@state';
import type { RootStackParamList } from '../navigationTypes';
import { OptionSelector } from '../components/OptionSelector';
import { useCardLookup } from './useCardLookup';

type Props = NativeStackScreenProps<RootStackParamList, 'EditEntry'>;

export function EditEntryScreen({
  route,
  navigation,
}: Props): React.JSX.Element {
  const { collectionStore } = useAppServices();
  const { entryId } = route.params;
  const entry = useStore(collectionStore, state =>
    state.entries.find(candidate => candidate.id === entryId),
  );
  const lookup = useCardLookup();

  const [finish, setFinish] = useState<Finish>(entry?.finish ?? FINISHES[0]);
  const [condition, setCondition] = useState<Condition>(
    entry?.condition ?? 'NM',
  );
  const [quantity, setQuantity] = useState(entry?.quantity ?? 1);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [busy, setBusy] = useState(false);

  // Once the entry is gone and we aren't mid-action, there's nothing to edit.
  useEffect(() => {
    if (!entry && !busy) {
      navigation.goBack();
    }
  }, [entry, busy, navigation]);

  const onSave = useCallback(async () => {
    setBusy(true);
    try {
      await collectionStore
        .getState()
        .update(entryId, { finish, condition, quantity });
      navigation.goBack();
    } catch {
      // The edit failed: stay on the screen and re-enable for a retry.
      setBusy(false);
    }
  }, [collectionStore, entryId, finish, condition, quantity, navigation]);

  const onRemove = useCallback(async () => {
    setBusy(true);
    try {
      await collectionStore.getState().remove(entryId);
      navigation.goBack();
    } catch {
      setBusy(false);
    }
  }, [collectionStore, entryId, navigation]);

  if (!entry) {
    return <View style={styles.content} />;
  }

  const card = lookup(entry.cardId);
  const title = card ? cardDisplayTitle(card) : entry.cardId;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.cardTitle}>{title}</Text>

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
        style={[styles.saveButton, busy && styles.disabled]}
        onPress={() => {
          // eslint-disable-next-line no-void -- fire-and-forget the async save
          void onSave();
        }}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Save changes"
        accessibilityState={{ disabled: busy }}
      >
        <Text style={styles.saveButtonText}>Save changes</Text>
      </TouchableOpacity>

      {confirmingRemove ? (
        <View style={styles.removeConfirm}>
          <Text style={styles.removePrompt}>
            Remove this card from your collection?
          </Text>
          <View style={styles.removeActions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setConfirmingRemove(false)}
              accessibilityRole="button"
              accessibilityLabel="Cancel remove"
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.removeButton, busy && styles.disabled]}
              onPress={() => {
                // eslint-disable-next-line no-void -- fire-and-forget the async remove
                void onRemove();
              }}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Confirm remove"
            >
              <Text style={styles.removeButtonText}>Yes, remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.removeLink}
          onPress={() => setConfirmingRemove(true)}
          accessibilityRole="button"
          accessibilityLabel="Remove from collection"
        >
          <Text style={styles.removeLinkText}>Remove from collection</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 24,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
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
  saveButton: {
    marginTop: 32,
    paddingVertical: 16,
    borderRadius: 10,
    backgroundColor: '#3b5bfd',
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.6,
  },
  removeLink: {
    marginTop: 28,
    alignSelf: 'center',
  },
  removeLinkText: {
    fontSize: 15,
    color: '#c2371f',
    fontWeight: '600',
  },
  removeConfirm: {
    marginTop: 28,
    alignItems: 'center',
  },
  removePrompt: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  removeActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#3b5bfd',
  },
  cancelButtonText: {
    color: '#3b5bfd',
    fontSize: 15,
    fontWeight: '700',
  },
  removeButton: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#c2371f',
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
