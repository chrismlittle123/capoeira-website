import { test } from 'node:test';
import assert from 'node:assert/strict';
import { originText, relatedIds, type Relatable } from './song-facts.ts';

test('originText names the composer when known, whatever the origin but traditional', () => {
  assert.equal(originText({ origin: 'traditional', composer: 'X' }), 'Traditional');
  assert.equal(originText({ origin: 'composed', composer: 'Mestre Toni Vargas' }), 'By Mestre Toni Vargas');
  assert.equal(originText({ origin: 'composed' }), 'Composed (author unknown)');
  assert.equal(originText({ origin: 'unknown', composer: 'Y' }), 'By Y');
  assert.equal(originText({ origin: 'unknown' }), 'Origin unknown');
});

const song = (id: string, facets: Partial<Relatable['facets']> = {}, related: string[] = []): Relatable => ({
  id,
  related,
  facets: { themes: [], people: [], places: [], ...facets },
});

test('relatedIds ranks links, then shared themes/people (3) and places (2), dropping weak matches', () => {
  const me = song('me', { themes: ['sea'], places: ['bahia'] }, ['linked']);
  const all = [
    me,
    song('linked'),
    song('links-back', {}, ['me']),
    song('same-theme', { themes: ['sea'] }),
    song('same-place', { places: ['bahia'] }),
    song('both', { themes: ['sea'], places: ['bahia'] }),
    song('nothing', { themes: ['love'] }),
  ];
  assert.deepEqual(relatedIds(me, all), ['linked', 'links-back', 'both', 'same-theme']);
});

test('relatedIds leaves out the song itself and songs scoring under 2', () => {
  const me = song('me', { people: ['bimba'] });
  assert.deepEqual(relatedIds(me, [me, song('x', { themes: ['other'] })]), []);
});
