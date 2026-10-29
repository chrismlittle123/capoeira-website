/** Text handling for the song search (src/scripts/search.ts): query terms, highlighting, snippets. */
import { fold } from './normalize.ts';

// Filler words that would otherwise make every song match an English query.
const STOP = new Set(['i', 'a', 'the', 'to', 'of', 'and', 'my', 'is', 'it', 'in', 'on', 'me', 'you', 'im']);

/** A word as the index stores it (folded), or null when it's too short or a filler word. */
export const searchTerm = (word: string) => {
  const f = fold(word);
  return f.length < 2 || STOP.has(f) ? null : f;
};

export const queryTerms = (q: string) =>
  q
    .split(/[^\p{L}\p{N}]+/u)
    .map(searchTerm)
    .filter((t): t is string => !!t);

const HTML_ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => HTML_ENTITIES[c] ?? c);

/** Fold `text` char-by-char, remembering which original char each folded char came from. */
function foldWithMap(text: string) {
  const chars = [...text];
  const map: number[] = [];
  let folded = '';
  chars.forEach((c, i) => {
    const f = fold(c);
    for (let k = 0; k < f.length; k++) map.push(i);
    folded += f;
  });
  return { chars, map, folded };
}

const isLetter = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

/** Start offsets (in folded text) where `t` begins a word. */
function wordStarts(folded: string, t: string) {
  const out: number[] = [];
  let at = folded.indexOf(t);
  while (at !== -1) {
    if (!isLetter(folded[at - 1])) out.push(at);
    at = folded.indexOf(t, at + 1);
  }
  return out;
}

/** HTML for `text` with the words starting with any of `terms` in <mark>, matching accent-insensitively. */
export function highlight(text: string, terms: string[]) {
  if (!terms.length) return escapeHtml(text);
  const { chars, map, folded } = foldWithMap(text);
  const hits = new Array<boolean>(chars.length).fill(false);
  for (const t of terms) {
    for (const at of wordStarts(folded, t)) {
      for (let k = at; k < at + t.length; k++) {
        const i = map[k];
        if (i !== undefined) hits[i] = true;
      }
    }
  }
  let out = '';
  let open = false;
  chars.forEach((c, i) => {
    if (hits[i] !== open) {
      out += open ? '</mark>' : '<mark>';
      open = !open;
    }
    out += escapeHtml(c);
  });
  return open ? out + '</mark>' : out;
}

/** How many of `terms` begin a word in `s`. */
const countHits = (s: string, terms: string[]) => {
  const f = fold(s);
  return terms.filter((t) => wordStarts(f, t).length).length;
};

/**
 * The line to show under a result: the lyric line matching the most terms (ties go to the
 * earliest), unless the title matches better, in which case the song's hook line.
 */
export function snippet(doc: { title: string; hook: string; lines: string[] }, terms: string[]) {
  let best = doc.hook;
  let max = 0;
  for (const line of doc.lines) {
    const n = countHits(line, terms);
    if (n > max) {
      best = line;
      max = n;
    }
  }
  return max && (max >= countHits(doc.title, terms) || max === terms.length) ? best : doc.hook;
}
