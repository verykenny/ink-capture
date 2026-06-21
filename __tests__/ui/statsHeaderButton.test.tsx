/**
 * StatsHeaderButton — the Collection header's "Stats" button. Native-stack
 * headers don't render in Jest, so the button is its own component and its
 * navigation is asserted directly: pressing it pushes the Stats route.
 *
 * @format
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StatsHeaderButton } from '@ui/collection/StatsHeaderButton';

type Navigation = React.ComponentProps<typeof StatsHeaderButton>['navigation'];

test('pressing the header button navigates to the Stats route', () => {
  const navigation = { navigate: jest.fn() } as unknown as Navigation;
  render(<StatsHeaderButton navigation={navigation} />);

  fireEvent.press(screen.getByText('Stats'));

  expect(navigation.navigate).toHaveBeenCalledWith('Stats');
});
