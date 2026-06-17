/**
 * @format
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import App from '../src/app/App';

test('renders the Ink Capture title', () => {
  render(<App />);
  expect(screen.getByText('Ink Capture')).toBeOnTheScreen();
});
