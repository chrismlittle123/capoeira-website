import { test } from 'vitest';
import assert from 'node:assert/strict';
import { parseSearchDocs, type SearchDoc } from './search-doc.ts';

const doc: SearchDoc = {
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

test('parseSearchDocs refuses anything else, naming the bad entry and field', () => {
  assert.throws(() => parseSearchDocs({}), /search index/);
  assert.throws(() => parseSearchDocs([doc, { ...doc, level: '1' }]), /\[1\]\.level/);
  assert.throws(() => parseSearchDocs([{ ...doc, level: 4 }]), /\[0\]\.level/);
  assert.throws(() => parseSearchDocs([{ ...doc, lines: 'l' }]), /\[0\]\.lines/);
  assert.throws(() => parseSearchDocs([{ ...doc, media: { icon: '▶' } }]), /\[0\]\.media\.label/);
  assert.throws(() => parseSearchDocs([{ ...doc, stale: true }]), /search index/);
});
