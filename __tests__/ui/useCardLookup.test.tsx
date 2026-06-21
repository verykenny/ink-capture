/**
 * useCardLookup — resolves a cardId to its Card for display, merging the cached
 * catalog AND the off-catalog custom store (E1). A tiny probe component renders
 * the resolved name so we can assert that a `manual:<id>` entry resolves its real
 * name from the custom store (not just the raw id), alongside a catalog card.
 *
 * @format
 */

import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { AppServicesProvider } from '@state';
import type { AppServices } from '@state';
import type { CatalogService, CustomCardRepository } from '@services';
import type { Card } from '@domain';
import { useCardLookup } from '@ui/collection/useCardLookup';
import { CARD_ELSA } from '../fixtures/cards';

const MANUAL_CARD: Card = {
  id: 'manual:7',
  name: 'Homemade Hero',
  setCode: '',
  collectorNumber: '',
  rarity: '',
  availableFinishes: ['normal', 'foil'],
};

const buildServices = (): AppServices => {
  const catalog: CatalogService = {
    sync: async () => ({ updated: false }),
    getAllCards: async () => [CARD_ELSA],
    findByCollectorNumber: async () => null,
  };
  const customCards: CustomCardRepository = {
    create: async () => MANUAL_CARD,
    getAll: async () => [MANUAL_CARD],
    getById: async () => MANUAL_CARD,
  };
  return { catalog, customCards } as unknown as AppServices;
};

function Probe({ id }: { id: string }): React.JSX.Element {
  const lookup = useCardLookup();
  const card = lookup(id);
  return <Text>{card ? card.name : `unresolved:${id}`}</Text>;
}

const renderProbe = (id: string) =>
  render(
    <AppServicesProvider services={buildServices()}>
      <Probe id={id} />
    </AppServicesProvider>,
  );

test('resolves a manual:<id> entry to its custom-store name', async () => {
  renderProbe('manual:7');
  expect(await screen.findByText('Homemade Hero')).toBeOnTheScreen();
});

test('still resolves a catalog card from the merged map', async () => {
  renderProbe(CARD_ELSA.id);
  expect(await screen.findByText('Elsa')).toBeOnTheScreen();
});
