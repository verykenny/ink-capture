/**
 * OpSqliteDatabase — production adapter open() param construction.
 *
 * op-sqlite is mocked (jest.setup.ts), so this can't exercise the native engine.
 * It pins the one bit of pure logic the native binding is picky about: how the
 * open() params are built. op-sqlite's native open() rejects `location: undefined`
 * ("Value is undefined, expected a String"), which crashed the app on the iOS
 * simulator — so the key must be OMITTED when no location is given. This guards
 * that regression.
 *
 * @format
 */

import { open } from '@op-engineering/op-sqlite';
import {
  DATABASE_NAME,
  OpSqliteDatabase,
} from '@services/persistence/sqlite/OpSqliteDatabase';

const openMock = open as unknown as jest.Mock;

beforeEach(() => {
  openMock.mockClear();
});

describe('OpSqliteDatabase open() params', () => {
  test('omits the location key entirely when none is provided', () => {
    const db = new OpSqliteDatabase();
    expect(db).toBeInstanceOf(OpSqliteDatabase);

    expect(openMock).toHaveBeenCalledTimes(1);
    const params = openMock.mock.calls[0][0];
    expect(params.name).toBe(DATABASE_NAME);
    // Must NOT pass `location: undefined` — op-sqlite's native open() rejects it.
    expect('location' in params).toBe(false);
  });

  test('passes name + location through when both are provided', () => {
    const db = new OpSqliteDatabase({ name: 'custom.db', location: '/tmp/db' });
    expect(db).toBeInstanceOf(OpSqliteDatabase);

    expect(openMock.mock.calls[0][0]).toEqual({
      name: 'custom.db',
      location: '/tmp/db',
    });
  });
});
