import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLyrics, allLines, hasTranslation, hookLine, plainText, difficulty, levelDots } from './lyrics.ts';

test('sections: a coro heading is sung by everyone, any other by the lead; lines before a heading are solo', () => {
  const sections = parseLyrics('Eu não sou daqui\n\n## Coro\nParanauê\n\n## Verse\nMarinheiro só');
  assert.deepEqual(sections.map((s) => [s.role, s.label]), [['solo', 'Solo'], ['coro', 'Coro'], ['solo', 'Verse']]);
});

test('a blank line starts a new stanza; empty sections are dropped', () => {
  const [section] = parseLyrics('## Solo\na b\nc d\n\ne f\n\n## Empty\n');
  assert.deepEqual(section.stanzas.map((st) => st.map((l) => l.text)), [['a b', 'c d'], ['e f']]);
  assert.equal(parseLyrics('## Empty\n').length, 0);
});

test('a "+ " line is the coro answering inside a solo section', () => {
  const lines = allLines(parseLyrics('## Solo\nEu não sou daqui\n+ Marinheiro só'));
  assert.deepEqual(lines.map((l) => [l.text, l.role]), [['Eu não sou daqui', 'solo'], ['Marinheiro só', 'coro']]);
});

test('a [m:ss] timestamp is read as seconds and taken off the text', () => {
  const [line] = allLines(parseLyrics('[1:05.5] Paranauê'));
  assert.deepEqual([line.text, line.time], ['Paranauê', 65.5]);
});

test('"> " lines translate the line above, joined when there are several', () => {
  const sections = parseLyrics('## Coro\nParanauê\n> Paranauê,\n> Paraná');
  assert.equal(allLines(sections)[0].translation, 'Paranauê, Paraná');
  assert.equal(hasTranslation(sections), true);
  assert.equal(hasTranslation(parseLyrics('Paranauê')), false);
});

test('a "> " translation with no line above it in its stanza fails, rather than being lost', () => {
  assert.throws(() => parseLyrics('Paranauê\n\n> Paraná'), /needs a sung line above it/);
});

test('Windows line endings read the same', () => {
  assert.deepEqual(parseLyrics('## Coro\r\nParanauê\r\n> Paraná'), parseLyrics('## Coro\nParanauê\n> Paraná'));
});

test('the hook is the first coro line, else the first line, else nothing', () => {
  assert.equal(hookLine(parseLyrics('Solo line\n\n## Coro\nCoro line')), 'Coro line');
  assert.equal(hookLine(parseLyrics('Only solo')), 'Only solo');
  assert.equal(hookLine([]), '');
});

test('plain text: a line per sung line, stanzas and sections a blank line apart', () => {
  assert.equal(plainText(parseLyrics('a\nb\n\nc\n\n## Coro\nd\n> tr')), 'a\nb\n\nc\n\nd');
});

test('difficulty counts the words of distinct lines, ignoring repeats and (x2)', () => {
  const easy = difficulty(parseLyrics('Paranauê paraná (x2)\nParanauê paraná'));
  assert.deepEqual([easy.id, easy.words], ['easy', 2]);
  const sixteen = Array.from({ length: 16 }, (_, i) => `w${i}`).join(' ');
  assert.equal(difficulty(parseLyrics(sixteen)).id, 'medium');
  const many = Array.from({ length: 36 }, (_, i) => `w${i}`).join(' ');
  assert.deepEqual([difficulty(parseLyrics(many)).id, difficulty([]).id], ['hard', 'easy']);
});

test('levelDots fills one dot per level up to the given one', () => {
  assert.deepEqual([levelDots(1), levelDots(3)], [[true, false, false], [true, true, true]]);
});
