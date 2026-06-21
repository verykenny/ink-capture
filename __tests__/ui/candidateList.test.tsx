/**
 * CandidateList — the small reusable, tappable list of ranked candidates used by
 * CardSearchScreen for both the ambiguous-scan top-N and manual-search results.
 * Rendered directly (no provider needed — it is pure presentation): covers the
 * empty label (custom + default) and that tapping a row calls onPick with that
 * card.
 *
 * @format
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CandidateList } from '@ui/scan/CandidateList';
import { CARD_BOUN, CARD_MICKEY } from '../fixtures/cards';

test('renders a custom empty label when there are no candidates', () => {
  render(
    <CandidateList candidates={[]} onPick={jest.fn()} emptyLabel="Nothing." />,
  );
  expect(screen.getByText('Nothing.')).toBeOnTheScreen();
});

test('falls back to a default empty label', () => {
  render(<CandidateList candidates={[]} onPick={jest.fn()} />);
  expect(screen.getByText('No matches yet.')).toBeOnTheScreen();
});

test('renders each candidate and calls onPick with the tapped card', () => {
  const onPick = jest.fn();
  render(
    <CandidateList
      candidates={[
        { card: CARD_MICKEY, confidence: 0.9 },
        { card: CARD_BOUN, confidence: 0.26 },
      ]}
      onPick={onPick}
    />,
  );

  expect(
    screen.getByText('Mickey Mouse — Brave Little Tailor'),
  ).toBeOnTheScreen();
  expect(screen.getByText('Boun — Tireless Boatman')).toBeOnTheScreen();

  fireEvent.press(screen.getByText('Boun — Tireless Boatman'));
  expect(onPick).toHaveBeenCalledWith(CARD_BOUN);
});
