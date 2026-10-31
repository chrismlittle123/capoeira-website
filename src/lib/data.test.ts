import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as z from 'zod/mini';
import { parseData } from './data.ts';

test('parseData returns data that fits, and otherwise throws naming what it was and the bad field', () => {
  const schema = z.array(z.strictObject({ id: z.string() }));
  assert.deepEqual(parseData(schema, [{ id: 'a' }], 'the list'), [{ id: 'a' }]);
  assert.throws(() => parseData(schema, [{ id: 'a' }, { id: 1 }], 'the list'), /the list.*\n[^]*\[1\]\.id/);
  assert.throws(() => parseData(schema, [{ id: 'a', extra: true }], 'the list'), /the list/);
});
