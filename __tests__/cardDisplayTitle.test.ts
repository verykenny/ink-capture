/**
 * cardDisplayTitle / formatCardMeta — the single sources of truth for a card's
 * display title (`name — version`) and its meta line (`set · #number · rarity`).
 * Pure; the UI routes through them so the joins live in one place. formatCardMeta
 * suppresses empty segments so a name-only manual card renders cleanly (no stray
 * separators / `#`).
 *
 * @format
 */

import { cardDisplayTitle, formatCardMeta } from '@domain';
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

describe('formatCardMeta', () => {
  test('joins set · #number · rarity for a full catalog card', () => {
    expect(formatCardMeta(CARD_ELSA)).toBe('TFC · #042 · Legendary');
  });

  test('returns an empty string when every segment is empty (name-only manual card)', () => {
    expect(
      formatCardMeta({ setCode: '', collectorNumber: '', rarity: '' }),
    ).toBe('');
  });

  test('keeps only the present segments (no stray separators / #)', () => {
    expect(
      formatCardMeta({ setCode: 'XXX', collectorNumber: '', rarity: '' }),
    ).toBe('XXX');
    expect(
      formatCardMeta({ setCode: '', collectorNumber: '7', rarity: '' }),
    ).toBe('#7');
    expect(
      formatCardMeta({ setCode: 'XXX', collectorNumber: '', rarity: 'Rare' }),
    ).toBe('XXX · Rare');
  });
});
