import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPEEDS, clampTime, lineAt, nextSpeed, numberRepeats, parseTakes, progress, takesFor } from './playback.ts';

test('nextSpeed steps through the speeds and wraps; an unknown rate restarts', () => {
  assert.deepEqual(
    SPEEDS.map((s) => nextSpeed(s)),
    [0.75, 0.5, 1.25, 1],
  );
  assert.equal(nextSpeed(2), 1);
});

test('progress is the fraction through the window, held to 0–1, and 0 with no end', () => {
  assert.equal(progress(15, 10, 20), 0.5);
  assert.equal(progress(5, 10, 20), 0);
  assert.equal(progress(25, 10, 20), 1);
  assert.equal(progress(15, 10, NaN), 0);
  assert.equal(progress(15, 20, 20), 0);
});

test('clampTime keeps a time inside the window, and only above the start with no end', () => {
  assert.equal(clampTime(5, 10, 20), 10);
  assert.equal(clampTime(25, 10, 20), 20);
  assert.equal(clampTime(15, 10, 20), 15);
  assert.equal(clampTime(500, 10, NaN), 500);
});

test('lineAt finds the line being sung, lighting it slightly early', () => {
  const times = [0, 5, 10];
  assert.equal(lineAt(times, 7), 1);
  assert.equal(lineAt(times, 4.9), 1);
  assert.equal(lineAt(times, 4.8), 0);
  assert.equal(lineAt(times, 99), 2);
  assert.equal(lineAt([3, 6], 1), -1);
  assert.equal(lineAt([], 1), -1);
});

test('parseTakes accepts the takes MediaPlayer writes, and refuses anything else', () => {
  const takes = [
    { kind: 'youtube', src: 'https://youtu.be/dQw4w9WgXcQ', videoId: 'dQw4w9WgXcQ', start: 0, label: 'Video' },
    { kind: 'audio', src: '/audio/a/b.m4a', start: 5, end: 30, label: 'Roda', performer: 'Ana' },
  ];
  assert.deepEqual(parseTakes(JSON.parse(JSON.stringify(takes))), takes);
  assert.deepEqual(parseTakes([]), []);
  assert.throws(() => parseTakes({}), /data-takes/);
  assert.throws(() => parseTakes([{ kind: 'youtube', src: 'x', start: 0, label: 'no id' }]), /\[0\]\.videoId/);
  assert.throws(() => parseTakes([{ kind: 'audio', src: '/a.m4a', start: '0', label: 'x' }]), /\[0\]\.start/);
  assert.throws(() => parseTakes([{ kind: 'vimeo', src: 'x', start: 0, label: 'x' }]), /data-takes/);
  assert.throws(() => parseTakes([{ kind: 'audio', src: '/a.m4a', start: 0, label: 'x', extra: 1 }]), /data-takes/);
});

test('numberRepeats numbers only the labels that repeat, in order', () => {
  assert.deepEqual(numberRepeats(['Roda', 'Ana', 'Roda']), ['Roda 1', 'Ana', 'Roda 2']);
  assert.deepEqual(numberRepeats(['A', 'B']), ['A', 'B']);
});

test('takesFor labels each take by title, performer, date or position, and keeps the rest', () => {
  const audio = { kind: 'audio', videoId: undefined } as const;
  const takes = takesFor([
    { kind: 'youtube', src: 'https://youtu.be/dQw4w9WgXcQ', videoId: 'dQw4w9WgXcQ', start: 0 },
    { ...audio, src: '/audio/a/b.m4a', start: 3, end: 9, performer: 'Ana' },
    // the schema reads a YAML date as UTC midnight: the first of the month mustn't slip back a month
    { ...audio, src: '/audio/a/c.m4a', start: 0, recordedAt: new Date(Date.UTC(2024, 3, 1)) },
    { ...audio, src: 'https://cdn.example/d.m4a', start: 0, title: 'Roda' },
    { ...audio, src: '/audio/a/e.m4a', start: 0, title: 'Roda' },
    { ...audio, src: '/audio/a/f.m4a', start: 0 },
  ]);
  assert.deepEqual(
    takes.map((t) => t.label),
    ['Video 1', 'Ana', 'Apr 2024', 'Roda 1', 'Roda 2', 'Recording 6'],
  );
  assert.deepEqual(takes[0], { kind: 'youtube', videoId: 'dQw4w9WgXcQ', src: 'https://youtu.be/dQw4w9WgXcQ', start: 0, end: undefined, label: 'Video 1', performer: undefined });
  assert.equal(takes[1]?.end, 9);
  assert.deepEqual(parseTakes(JSON.parse(JSON.stringify(takes))), JSON.parse(JSON.stringify(takes)));
});
