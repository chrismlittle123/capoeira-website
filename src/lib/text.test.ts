import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plural } from './text.ts';

test('plural uses the singular for exactly one', () => {
  assert.equal(plural(1, 'song', 'songs'), '1 song');
  assert.equal(plural(0, 'song', 'songs'), '0 songs');
  assert.equal(plural(49, 'song', 'songs'), '49 songs');
});
