import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSearchDocs } from './search-doc.ts';

const doc = {
  id: 'a',
  title: 'A',
  alt: '',
  level: 1,
  levelLabel: 'Easy',
  themes: '',
  people: '',
  places: '',
  hook: 'h',
  lyrics: 'l',
  translation: '',
  lines: ['l'],
};

test('parseSearchDocs accepts the index the site builds', () => {
  const docs = [doc, { ...doc, id: 'b', media: { icon: '▶', label: 'watch' } }];
  assert.deepEqual(parseSearchDocs(JSON.parse(JSON.stringify(docs))), docs);
});

test('parseSearchDocs refuses data that is not a list of songs, naming the bad entry', () => {
  assert.throws(() => parseSearchDocs({}), /expected a list/);
  assert.throws(() => parseSearchDocs([doc, { ...doc, level: '1' }]), /entry 1/);
  assert.throws(() => parseSearchDocs([{ ...doc, lines: 'l' }]), /entry 0/);
  assert.throws(() => parseSearchDocs([{ ...doc, media: { icon: '▶' } }]), /entry 0/);
});
