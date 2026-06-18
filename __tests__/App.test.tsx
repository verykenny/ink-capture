/**
 * @format
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import App from '../src/app/App';

test('boots to the Collection screen', async () => {
  render(<App />);
  expect(await screen.findByText('Collection')).toBeOnTheScreen();
});
