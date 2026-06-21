/**
 * ManualAddScreen — add an off-catalog card by hand.
 *
 * The no-match fallback: when a scan/search finds nothing in LorcanaJSON, the
 * user can name the card themselves. `name` is required (validated via the domain
 * `validateCustomCard`); version/set/number are optional. On submit it mints a
 * custom card (`customCards.create` → `manual:<rowid>`) and routes to the
 * existing Confirm sheet to set finish/condition/quantity and save — reusing the
 * one Confirm→save flow, never a parallel save path.
 *
 * @format
 */

import { useCallback, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { validateCustomCard } from '@domain';
import { useAppServices } from '@state';
import type { RootStackParamList } from '../navigationTypes';

type Props = NativeStackScreenProps<RootStackParamList, 'ManualAdd'>;

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function ManualAddScreen({ navigation }: Props): React.JSX.Element {
  const { customCards } = useAppServices();
  const [name, setName] = useState('');
  const [version, setVersion] = useState('');
  const [setCode, setSetCode] = useState('');
  const [collectorNumber, setCollectorNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onCreate = useCallback(async () => {
    const trimmedName = name.trim();
    const issues = validateCustomCard({ name: trimmedName });
    if (issues.length > 0) {
      setError(issues[0].message);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const card = await customCards.create({
        name: trimmedName,
        version: version.trim() || undefined,
        setCode: setCode.trim() || undefined,
        collectorNumber: collectorNumber.trim() || undefined,
      });
      // Re-enable before handing off: this screen navigates FORWARD and stays in
      // the stack, so backing out of Confirm must not leave a dead 'Add card'
      // button (to fix the name or add another off-catalog card).
      setSaving(false);
      // Hand off to the one Confirm→save flow (finish/condition/quantity).
      navigation.navigate('Confirm', { card });
    } catch (caught) {
      setError(messageOf(caught));
      setSaving(false);
    }
  }, [name, version, setCode, collectorNumber, customCards, navigation]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        Not in the catalog? Add it by hand — only the name is required.
      </Text>

      <Text style={styles.label}>Card name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Elsa"
        autoCapitalize="words"
        accessibilityLabel="Card name"
      />

      <Text style={styles.label}>Version (optional)</Text>
      <TextInput
        style={styles.input}
        value={version}
        onChangeText={setVersion}
        placeholder="e.g. Snow Queen"
        accessibilityLabel="Version"
      />

      <Text style={styles.label}>Set (optional)</Text>
      <TextInput
        style={styles.input}
        value={setCode}
        onChangeText={setSetCode}
        placeholder="e.g. TFC"
        autoCapitalize="characters"
        autoCorrect={false}
        accessibilityLabel="Set"
      />

      <Text style={styles.label}>Collector number (optional)</Text>
      <TextInput
        style={styles.input}
        value={collectorNumber}
        onChangeText={setCollectorNumber}
        placeholder="e.g. 42"
        autoCorrect={false}
        accessibilityLabel="Collector number"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.addButton, saving && styles.addButtonDisabled]}
        onPress={() => {
          // eslint-disable-next-line no-void -- fire-and-forget the async create
          void onCreate();
        }}
        disabled={saving}
        accessibilityRole="button"
        accessibilityLabel="Add card"
        accessibilityState={{ disabled: saving }}
      >
        <Text style={styles.addButtonText}>Add card</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 24,
  },
  intro: {
    fontSize: 14,
    opacity: 0.6,
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    opacity: 0.6,
    marginTop: 20,
    marginBottom: 8,
  },
  input: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#3b5bfd',
    fontSize: 16,
  },
  error: {
    marginTop: 16,
    color: '#c2371f',
    fontSize: 14,
    fontWeight: '600',
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
