/**
 * CardSearchScreen — the unified manual-pick / search screen, rendered over a
 * fake AppServicesProvider whose catalog returns the committed fixtures, with
 * mocked navigation/route. Covers: an ambiguous scan's seed renders its top-N
 * (the Boun case) without typing; tapping a seeded candidate navigates to Confirm
 * with that card; typing a name runs the (reused) matcher over the catalog and
 * renders ranked results, tapping which navigates to Confirm; and the empty
 * prompt when there is neither a seed nor a query.
 *
 * No A3 change: search reuses createCardMatcher(catalog).match({ name }). IP
 * guardrail: fixture catalog only, no bulk data.
 *
 * @format
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CardSearchScreen } from '@ui/scan/CardSearchScreen';
import type { RootStackParamList } from '@ui/navigationTypes';
import { AppServicesProvider } from '@state';
import type { AppServices } from '@state';
import type { CatalogService } from '@services';
import type { Card, RecognitionCandidate } from '@domain';
import {
  CARD_BILLY_BONES,
  CARD_BOUN,
  CARD_ELSA,
  CARD_ELSA_ENCHANTED,
  CARD_MICKEY,
} from '../fixtures/cards';

type Props = NativeStackScreenProps<RootStackParamList, 'CardSearch'>;

const CATALOG: Card[] = [
  CARD_ELSA,
  CARD_ELSA_ENCHANTED,
  CARD_MICKEY,
  CARD_BOUN,
  CARD_BILLY_BONES,
];

// CardSearchScreen only consumes `catalog`.
const buildServices = (cards: Card[] = CATALOG): AppServices => {
  const catalog: CatalogService = {
    sync: async () => ({ updated: false }),
    getAllCards: async () => cards,
    findByCollectorNumber: async () => null,
  };
  return { catalog } as unknown as AppServices;
};

const navigation = { navigate: jest.fn() } as unknown as Props['navigation'];

const routeWith = (seed?: RecognitionCandidate[]) =>
  ({
    key: 'CardSearch-1',
    name: 'CardSearch',
    params: seed ? { seed } : {},
  } as unknown as Props['route']);

const renderScreen = (services: AppServices, route: Props['route']) =>
  render(
    <AppServicesProvider services={services}>
      <CardSearchScreen navigation={navigation} route={route} />
    </AppServicesProvider>,
  );

afterEach(() => {
  jest.clearAllMocks();
});

test('seeds the list with the ambiguous scan top-N (the Boun case) before any typing', () => {
  const seed: RecognitionCandidate[] = [
    { card: CARD_BILLY_BONES, confidence: 0.26 },
    { card: CARD_BOUN, confidence: 0.24 },
  ];
  renderScreen(buildServices(), routeWith(seed));

  // Both same-number cards are offered so the user can pick the right one.
  expect(screen.getByText('Billy Bones — Ship Steward')).toBeOnTheScreen();
  expect(screen.getByText('Boun — Tireless Boatman')).toBeOnTheScreen();
});

test('picking a seeded candidate navigates to Confirm with that card', () => {
  const seed: RecognitionCandidate[] = [
    { card: CARD_BILLY_BONES, confidence: 0.26 },
    { card: CARD_BOUN, confidence: 0.24 },
  ];
  renderScreen(buildServices(), routeWith(seed));

  fireEvent.press(screen.getByText('Boun — Tireless Boatman'));
  expect(navigation.navigate).toHaveBeenCalledWith('Confirm', {
    card: CARD_BOUN,
  });
});

test('typing a name searches the catalog (matcher reuse) and a pick navigates to Confirm', async () => {
  renderScreen(buildServices(), routeWith());

  fireEvent.changeText(
    screen.getByPlaceholderText('Search cards by name'),
    'Mickey Mouse Brave Little Tailor',
  );

  // Debounced match over the fixture catalog resolves Mickey via the fuzzy tier.
  const row = await screen.findByText('Mickey Mouse — Brave Little Tailor');
  fireEvent.press(row);

  expect(navigation.navigate).toHaveBeenCalledWith('Confirm', {
    card: CARD_MICKEY,
  });
});

test('shows the search prompt when there is neither a seed nor a query', () => {
  renderScreen(buildServices(), routeWith());
  expect(screen.getByText('Search for a card by name.')).toBeOnTheScreen();
});
