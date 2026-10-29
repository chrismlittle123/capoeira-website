import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, plural } from './text.ts';

test('plural uses the singular for exactly one', () => {
  assert.equal(plural(1, 'song', 'songs'), '1 song');
  assert.equal(plural(0, 'song', 'songs'), '0 songs');
  assert.equal(plural(49, 'song', 'songs'), '49 songs');
});

test('escapeHtml escapes the five HTML-special characters', () => {
  assert.equal(escapeHtml(`<a href="x">Tom & Jerry's</a>`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
});
