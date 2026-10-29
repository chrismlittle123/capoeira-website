import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brokenReferences, type Ref } from './references.ts';

test('brokenReferences returns each reference to an unknown entry, and only those', () => {
  const known = new Set(['songs:paranaue', 'themes:sea']);
  const refs: Ref[] = [
    { collection: 'themes', id: 'see' },
    { collection: 'songs', id: 'paranaue' },
    { collection: 'people', id: 'bimba' },
  ];
  const songs = [
    { id: 'paranaue', refs: [{ collection: 'themes', id: 'sea' } as Ref] },
    { id: 'marinheiro', refs },
  ];
  assert.deepEqual(brokenReferences(songs, known), [
    { song: 'marinheiro', collection: 'themes', id: 'see' },
    { song: 'marinheiro', collection: 'people', id: 'bimba' },
  ]);
  assert.deepEqual(brokenReferences([], known), []);
});
