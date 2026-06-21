/**
 * StatsHeaderButton — the Collection screen's `headerRight`, the app's first
 * header button (E3). Pressing it pushes the Stats route. Kept as its own small,
 * presentational component so the navigation can be asserted in isolation without
 * a full navigator render (native-stack headers don't render in Jest).
 *
 * @format
 */

import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigationTypes';

type CollectionNavigation = NativeStackNavigationProp<
  RootStackParamList,
  'Collection'
>;

export function StatsHeaderButton({
  navigation,
}: {
  navigation: CollectionNavigation;
}): React.JSX.Element {
  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('Stats')}
      accessibilityRole="button"
      accessibilityLabel="View collection stats"
    >
      <Text style={styles.label}>Stats</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 16,
    color: '#3b5bfd',
    fontWeight: '600',
  },
});
