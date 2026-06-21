/**
 * CardSearchScreen — the unified manual-pick / search screen.
 *
 * One UI serves both D2 fallback paths: an ambiguous scan seeds it with the
 * scan's top-N candidates (`route.params.seed`), and the search box finds any
 * card by name. Typing debounces a `createCardMatcher(catalog).match({ name })`
 * over the cached catalog — direct reuse of the C1 matcher + the shared
 * `normalizeCardName`, so there is no A3 change and no new CatalogService method.
 * Picking a card hands it to the one ConfirmSheet (the Confirm route) to set
 * finish/condition/quantity and save.
 *
 * The fuzzy tier ranks whole normalized name+version keys (a normalized_name
 * prefilter is deferred), so search works best on a full-ish name; a near-miss
 * still ranks. When the box is empty the seed shows; with no seed, a scan that
 * read nothing (`reason: 'no-match'`) explains the arrival, otherwise the generic
 * prompt shows.
 *
 * @format
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Card, RecognitionCandidate } from '@domain';
import { createCardMatcher } from '@services';
import { useAppServices } from '@state';
import type { RootStackParamList } from '../navigationTypes';
import { CandidateList } from './CandidateList';

type Props = NativeStackScreenProps<RootStackParamList, 'CardSearch'>;

/** Debounce so each keystroke doesn't rescan the whole catalog. */
const SEARCH_DEBOUNCE_MS = 250;

export function CardSearchScreen({
  route,
  navigation,
}: Props): React.JSX.Element {
  const { catalog } = useAppServices();
  const matcher = useMemo(() => createCardMatcher(catalog), [catalog]);

  const seed = route.params?.seed;
  const isNoMatch = route.params?.reason === 'no-match';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RecognitionCandidate[]>(seed ?? []);

  useEffect(() => {
    const name = query.trim();
    if (name === '') {
      // Empty box: fall back to the seed (the ambiguous top-N) or nothing.
      setResults(seed ?? []);
      return undefined;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      matcher
        .match({ name })
        .then(result => {
          if (!cancelled) {
            setResults(result.candidates);
          }
        })
        .catch(() => {
          // A failed catalog read just yields no results (rich error UX is E2).
          if (!cancelled) {
            setResults([]);
          }
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, matcher, seed]);

  const onPick = useCallback(
    (card: Card) => {
      navigation.navigate('Confirm', { card });
    },
    [navigation],
  );

  const emptyLabel =
    query.trim() === ''
      ? isNoMatch
        ? 'We couldn’t read that card — search for it by name.'
        : 'Search for a card by name.'
      : 'No matches — try the card’s full name.';

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder="Search cards by name"
        autoCorrect={false}
        autoCapitalize="none"
        accessibilityLabel="Search cards by name"
      />
      <CandidateList
        candidates={results}
        onPick={onPick}
        emptyLabel={emptyLabel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  input: {
    margin: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#3b5bfd',
    fontSize: 16,
  },
});
