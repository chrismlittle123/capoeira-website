import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SCALE, MIN_SCALE, clampScale, rememberRecent } from './reading.ts';

test('clampScale keeps the scale in bounds and on 0.1 steps', () => {
  assert.equal(clampScale(1.1 + 0.1), 1.2);
  assert.equal(clampScale(0.1), MIN_SCALE);
  assert.equal(clampScale(5), MAX_SCALE);
});

test('rememberRecent puts the song first, once, and keeps the last 12', () => {
  assert.deepEqual(rememberRecent(null, 'a'), ['a']);
  assert.deepEqual(rememberRecent('["b","a","c"]', 'a'), ['a', 'b', 'c']);
  const many = JSON.stringify(Array.from({ length: 20 }, (_, i) => `s${i}`));
  assert.equal(rememberRecent(many, 'a').length, 12);
  assert.deepEqual(rememberRecent('not json', 'a'), ['a']);
  assert.deepEqual(rememberRecent('[1, "b", null]', 'a'), ['a', 'b']);
});
