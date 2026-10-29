import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
import {
  audioUrl,
  dataIds,
  isSlug,
  localDate,
  parseIdList,
  slugify,
  songMarkdown,
  unescapeDroppedPath,
  unknownIds,
} from './song-scaffold.ts';

test('slugify folds accents and joins words with single dashes', () => {
  assert.equal(slugify('São Bento Grande'), 'sao-bento-grande');
  assert.equal(slugify('  Iê, viva meu Deus!  '), 'ie-viva-meu-deus');
  assert.equal(slugify('日本'), '');
});

test('isSlug takes lower-case words joined by dashes, and nothing else', () => {
  assert.ok(isSlug('sao-bento-grande'));
  assert.ok(isSlug('a1'));
  for (const bad of ['', '-a', 'a-', 'a--b', 'São', 'a b', '../a']) assert.ok(!isSlug(bad), bad);
});

test('unescapeDroppedPath undoes the quoting a terminal adds to a dropped file', () => {
  assert.equal(unescapeDroppedPath("'/Users/me/my song.m4a' "), '/Users/me/my song.m4a');
  assert.equal(unescapeDroppedPath('"/tmp/a.mp3"'), '/tmp/a.mp3');
  assert.equal(unescapeDroppedPath('/Users/me/my\\ song.m4a'), '/Users/me/my song.m4a');
});

test('audioUrl files the audio under the song, with a slugged name and lower-case extension', () => {
  assert.equal(audioUrl('meu-patua', '/x/Meu Patuá (roda).M4A'), '/audio/meu-patua/meu-patua-roda.m4a');
  assert.equal(audioUrl('meu-patua', '/x/日本.mp3'), '/audio/meu-patua/recording.mp3');
});

test('dataIds lists the ids of a data file, and refuses anything that is not a map', () => {
  assert.deepEqual(dataIds('the-sea:\n  name: The sea\nfreedom:\n  name: Freedom\n'), ['the-sea', 'freedom']);
  assert.throws(() => dataIds('- a\n- b\n'));
  assert.throws(() => dataIds(''));
});

test('parseIdList and unknownIds read a comma list and find the ids that do not exist', () => {
  assert.deepEqual(parseIdList(' a, b,,c '), ['a', 'b', 'c']);
  assert.deepEqual(parseIdList(''), []);
  assert.deepEqual(unknownIds(['a', 'x'], ['a', 'b']), ['x']);
});

const frontmatter = (md: string) => parse(md.split('---\n')[1] ?? '');

test('songMarkdown writes frontmatter that reads back as the song, with a lyrics template', () => {
  const md = songMarkdown({
    title: 'Iê: "viva"',
    themes: ['the-sea'],
    people: [],
    places: ['bahia'],
    audio: { file: '/audio/x/roda.m4a', performer: 'Ana' },
    youtube: { url: 'https://youtu.be/dQw4w9WgXcQ?t=1m30s', title: '' },
    added: '2026-10-29',
  });
  assert.deepEqual(frontmatter(md), {
    title: 'Iê: "viva"',
    themes: ['the-sea'],
    places: ['bahia'],
    summary: '',
    recordings: [{ file: '/audio/x/roda.m4a', performer: 'Ana' }, { youtube: 'https://youtu.be/dQw4w9WgXcQ?t=1m30s' }],
    added: '2026-10-29',
  });
  assert.match(md, /^themes: \[ the-sea \]$/m);
  assert.match(md, /\n---\n\n## Coro\n/);
});

test('songMarkdown leaves out empty lists and recordings', () => {
  const md = songMarkdown({ title: 'A', themes: [], people: [], places: [], added: '2026-10-29' });
  assert.deepEqual(frontmatter(md), { title: 'A', summary: '', added: '2026-10-29' });
});

test('localDate is the calendar date where the script runs, not in UTC', () => {
  assert.equal(localDate(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
  assert.equal(localDate(new Date(2026, 11, 31, 0, 5)), '2026-12-31');
});
