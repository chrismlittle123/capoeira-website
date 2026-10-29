import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glossaryLinker, parseGlossaryData } from './glossary-links.ts';

const span = (id: string, text: string) =>
  `<span class="gloss" role="button" tabindex="0" aria-expanded="false" aria-controls="gloss-pop" data-term="${id}">${text}</span>`;

test('links each glossary word once, where it first appears, keeping its case', () => {
  const { link, used } = glossaryLinker([{ id: 'roda', forms: ['roda', 'rodas'] }]);
  assert.equal(link('Na Roda, na roda'), `Na ${span('roda', 'Roda')}, na roda`);
  assert.equal(link('rodas'), 'rodas');
  assert.deepEqual([...used], ['roda']);
});

test('prefers the longest form, and only matches whole words', () => {
  const { link } = glossaryLinker([
    { id: 'mundo', forms: ['mundo'] },
    { id: 'volta-do-mundo', forms: ['volta do mundo'] },
  ]);
  assert.equal(link('a volta do mundo'), `a ${span('volta-do-mundo', 'volta do mundo')}`);
  assert.equal(link('mundão'), 'mundão');
});

test('escapes the lyric text, and copes with no glossary at all', () => {
  const { link } = glossaryLinker([{ id: 'ie', forms: ['iê'] }]);
  assert.equal(link('<b> & iê'), `&lt;b&gt; &amp; ${span('ie', 'iê')}`);
  assert.equal(glossaryLinker([]).link('a < b'), 'a &lt; b');
});

test('parseGlossaryData reads the embedded entries, keeping only term and definition', () => {
  const data = parseGlossaryData({ ginga: { term: 'ginga', definition: 'the basic sway', forms: ['gingar'] } });
  assert.deepEqual([...data], [['ginga', { term: 'ginga', definition: 'the basic sway' }]]);
  assert.deepEqual([...parseGlossaryData({})], []);
});

test('parseGlossaryData refuses anything else, naming the bad entry', () => {
  assert.throws(() => parseGlossaryData([]), /glossary data/);
  assert.throws(() => parseGlossaryData({ ginga: { term: 'ginga' } }), /ginga\.definition/);
});
