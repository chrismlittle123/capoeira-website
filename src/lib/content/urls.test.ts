import { test } from 'node:test';
import assert from 'node:assert/strict';
import { facetUrl, glossaryUrl, songUrl } from './urls.ts';

test('URLs end in a slash, and a glossary word is an anchor on the glossary page', () => {
  assert.equal(songUrl('sao-bento'), '/songs/sao-bento/');
  assert.equal(facetUrl('themes'), '/themes/');
  assert.equal(facetUrl('people', 'mestre-bimba'), '/people/mestre-bimba/');
  assert.equal(glossaryUrl(), '/glossary/');
  assert.equal(glossaryUrl('ginga'), '/glossary/#ginga');
});
