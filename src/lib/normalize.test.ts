import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold } from './normalize.ts';

test('fold lower-cases and strips accents, so plain typing finds accented words', () => {
  assert.equal(fold('São Bento'), 'sao bento');
  assert.equal(fold('Iê'), 'ie');
  assert.equal(fold('Refrão'), 'refrao');
});
