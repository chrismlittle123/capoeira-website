import { test } from 'vitest';
import assert from 'node:assert/strict';
import { brokenReferences, oncePerBuild, type Ref } from './references.ts';

test('brokenReferences returns each reference to an unknown entry, and only those', () => {
  const known = new Set(['songs:paranaue', 'themes:sea']);
  const refs: Ref[] = [
    { collection: 'themes', id: 'see' },
    { collection: 'songs', id: 'paranaue' },
    { collection: 'people', id: 'bimba' },
  ];
  const sea: Ref = { collection: 'themes', id: 'sea' };
  const songs = [
    { id: 'paranaue', refs: [sea] },
    { id: 'marinheiro', refs },
  ];
  assert.deepEqual(brokenReferences(songs, known), [
    { song: 'marinheiro', collection: 'themes', id: 'see' },
    { song: 'marinheiro', collection: 'people', id: 'bimba' },
  ]);
  assert.deepEqual(brokenReferences([], known), []);
});

test('oncePerBuild runs the check once in a build, failure included, and on every call in dev', async () => {
  let runs = 0;
  const failing = async () => {
    runs++;
    throw new Error('broken');
  };
  const build = oncePerBuild(failing, () => true);
  await assert.rejects(build(), /broken/);
  await assert.rejects(build(), /broken/);
  assert.equal(runs, 1);

  runs = 0;
  const dev = oncePerBuild(failing, () => false);
  await assert.rejects(dev(), /broken/);
  await assert.rejects(dev(), /broken/);
  assert.equal(runs, 2);
});
