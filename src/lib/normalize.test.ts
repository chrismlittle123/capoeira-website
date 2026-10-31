import { test } from 'vitest';
import assert from 'node:assert/strict';
import { fold, compareText } from './normalize.ts';

test('fold lower-cases and strips accents, so plain typing finds accented words', () => {
  assert.equal(fold('São Bento'), 'sao bento');
  assert.equal(fold('Iê'), 'ie');
  assert.equal(fold('Refrão'), 'refrao');
});

test('compareText sorts accented words with their plain letter', () => {
  assert.deepEqual(['Zum', 'Água', 'Ai', 'É São Bento', 'Eu'].sort(compareText), ['Água', 'Ai', 'É São Bento', 'Eu', 'Zum']);
});
