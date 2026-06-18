/**
 * normalizeCardName — the shared name-normalization B2's cache and C1's query
 * side both run, so a catalog `normalized_name` and a normalized OCR string are
 * comparable. Rule: NFD strip diacritics → lowercase → strip punctuation →
 * collapse whitespace → trim.
 *
 * @format
 */

import { normalizeCardName } from '@services/catalog/normalizeName';

describe('normalizeCardName', () => {
  test('lowercases', () => {
    expect(normalizeCardName('ELSA')).toBe('elsa');
  });

  test('strips diacritics (NFD)', () => {
    expect(normalizeCardName('Café Crème')).toBe('cafe creme');
    expect(normalizeCardName('Tëst Ñame')).toBe('test name');
  });

  test('strips punctuation and special characters', () => {
    expect(normalizeCardName('Elsa - Snow Queen')).toBe('elsa snow queen');
    expect(normalizeCardName('Lilo & Stitch')).toBe('lilo stitch');
    expect(normalizeCardName("Maui's Hook!")).toBe('maui s hook');
  });

  test('collapses internal whitespace runs to a single space', () => {
    expect(normalizeCardName('Mickey   Mouse')).toBe('mickey mouse');
    expect(normalizeCardName('a\t\nb')).toBe('a b');
  });

  test('trims leading and trailing whitespace', () => {
    expect(normalizeCardName('   Stitch   ')).toBe('stitch');
  });

  test('keeps digits', () => {
    expect(normalizeCardName('Agent 1')).toBe('agent 1');
  });

  test('a " - " separated full name and a space-joined name+version agree', () => {
    // The cache derives normalized_name from name+version; this proves it equals
    // normalizing the upstream " - " fullName, so the column is source-agnostic.
    expect(normalizeCardName('Elsa - Snow Queen')).toBe(
      normalizeCardName('Elsa Snow Queen'),
    );
  });

  test('is idempotent: normalizing an already-normalized string is a no-op', () => {
    const once = normalizeCardName("Maui's Café - Brave Little Tailor!");
    expect(normalizeCardName(once)).toBe(once);
  });

  test('an all-punctuation input normalizes to the empty string', () => {
    expect(normalizeCardName('---')).toBe('');
  });
});
