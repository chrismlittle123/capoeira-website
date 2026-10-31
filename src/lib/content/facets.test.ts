import { test } from 'vitest';
import assert from 'node:assert/strict';
import { entryFacts } from './facets.ts';

test("entryFacts lists a person's kind and dates, and a place's region; it leaves out what's missing", () => {
  assert.deepEqual(entryFacts({ name: 'Bimba', kind: 'mestre', aka: [], lived: '1899–1974' }), ['Mestre', '1899–1974']);
  assert.deepEqual(entryFacts({ name: 'Someone', kind: 'other', aka: [] }), []);
  assert.deepEqual(entryFacts({ name: 'Salvador', region: 'Bahia' }), ['Bahia']);
  assert.deepEqual(entryFacts({ name: 'The sea', emoji: '🌊' }), []);
});
