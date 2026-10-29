import { test } from 'node:test';
import assert from 'node:assert/strict';
import { containsAllWords, escapeHtml, highlight, queryTerms, searchTerm, snippet, whyMatchedHtml } from './search-text.ts';

test('searchTerm folds a word, and drops one-letter and filler words', () => {
  assert.equal(searchTerm('Iê'), 'ie');
  assert.equal(searchTerm('São'), 'sao');
  assert.equal(searchTerm('a'), null);
  assert.equal(searchTerm('The'), null);
});

test('queryTerms splits on anything that is not a letter or digit', () => {
  assert.deepEqual(queryTerms('  São Bento, the  grande!'), ['sao', 'bento', 'grande']);
  assert.deepEqual(queryTerms(''), []);
});

test('escapeHtml escapes the five HTML-special characters', () => {
  assert.equal(escapeHtml(`<a href="x">Tom & Jerry's</a>`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
});

test('highlight marks words that start with a term, accent-insensitively, and escapes the rest', () => {
  assert.equal(highlight('São Bento grande', ['sao', 'ben']), '<mark>São</mark> <mark>Ben</mark>to grande');
  assert.equal(highlight('Iê, viva', ['ie']), '<mark>Iê</mark>, viva');
  // only at the start of a word: "ento" is inside "Bento"
  assert.equal(highlight('Bento', ['ento']), 'Bento');
  assert.equal(highlight('a<b', []), 'a&lt;b');
  assert.equal(highlight('mar & <mar>', ['mar']), '<mark>mar</mark> &amp; &lt;<mark>mar</mark>&gt;');
});

test('snippet picks the line matching the most terms, else the hook', () => {
  const doc = { title: 'Paranauê', hook: 'Paranauê, paraná', lines: ['Vou dizer a minha mãe', 'Minha mãe, minha mãe'] };
  assert.equal(snippet(doc, ['mae']), 'Vou dizer a minha mãe');
  assert.equal(snippet(doc, ['minha', 'mae']), 'Vou dizer a minha mãe');
  assert.equal(snippet(doc, ['nada']), doc.hook);
  // the title matches better than any line: show the hook
  assert.equal(snippet(doc, ['paranaue', 'mae']), 'Vou dizer a minha mãe');
  assert.equal(snippet({ ...doc, title: 'Paranauê minha mãe' }, ['paranaue', 'minha', 'mae', 'x']), doc.hook);
});

test('containsAllWords needs every word somewhere in the text, in any order, accents optional', () => {
  const text = 'ginga the basic swaying movement of capoeira';
  assert.ok(containsAllWords(text, 'Gínga  capoeira'));
  assert.ok(containsAllWords(text, 'sway'));
  assert.ok(!containsAllWords(text, 'ginga roda'));
  assert.ok(containsAllWords(text, '   '));
});

test('whyMatchedHtml names the facets a song matched through, only when some word is in no text field', () => {
  const doc = { themes: 'The sea', people: 'Besouro', places: 'Bahia' };
  assert.equal(whyMatchedHtml({ mar: ['lyrics'] }, doc, ['mar']), undefined);
  assert.equal(whyMatchedHtml({ mar: ['lyrics'], besouro: ['people'] }, doc, ['besouro']), 'People: <mark>Besouro</mark>');
  assert.equal(whyMatchedHtml({ bahia: ['places', 'themes'] }, doc, []), 'Place: Bahia · Theme: The sea');
});
