import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPEEDS, clampTime, lineAt, nextSpeed, progress } from './playback.ts';

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
