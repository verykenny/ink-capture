/**
 * OptionSelector — a generic segmented single-choice control.
 *
 * Driven entirely by its `options` prop, so it stays a pure presentational
 * component with no hardcoded vocabulary: the Confirm sheet feeds it the domain
 * value sets (`FINISHES` / `CONDITIONS`) directly, keeping a single source of
 * truth and avoiding a picker native dependency.
 *
 * @format
 */

import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export function OptionSelector<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
}): React.JSX.Element {
  return (
    <View style={styles.row} accessibilityLabel={accessibilityLabel}>
      {options.map(option => {
        const selected = option === value;
        return (
          <TouchableOpacity
            key={option}
            style={[styles.segment, selected && styles.segmentSelected]}
            onPress={() => onChange(option)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text
              style={[
                styles.segmentText,
                selected && styles.segmentTextSelected,
              ]}
            >
              {option}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  segment: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#3b5bfd',
  },
  segmentSelected: {
    backgroundColor: '#3b5bfd',
  },
  segmentText: {
    fontSize: 15,
    color: '#3b5bfd',
    fontWeight: '600',
  },
  segmentTextSelected: {
    color: '#fff',
  },
});
