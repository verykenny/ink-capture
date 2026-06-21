/**
 * cardDisplayTitle — the single source of truth for a card's display title
 * (`name — version`, or just `name` when version-less). Pure; the UI and the dev
 * diagnostics all route through it so the em-dash join lives in one place.
 *
 * @format
 */

import { cardDisplayTitle } from '@domain';
import { CARD_ELSA, CARD_MICKEY } from './fixtures/cards';

test('joins name and version with an em-dash', () => {
  expect(cardDisplayTitle(CARD_ELSA)).toBe('Elsa — Snow Queen');
  expect(cardDisplayTitle(CARD_MICKEY)).toBe(
    'Mickey Mouse — Brave Little Tailor',
  );
});

test('returns just the name when there is no version', () => {
  expect(cardDisplayTitle({ name: 'Stitch' })).toBe('Stitch');
});

test('treats an empty version as no version', () => {
  // An empty string is falsy, so the join is skipped (no trailing em-dash).
  expect(cardDisplayTitle({ name: 'Stitch', version: '' })).toBe('Stitch');
});
