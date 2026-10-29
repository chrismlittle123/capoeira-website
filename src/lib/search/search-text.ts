/**
 * Matching typed text for the song search (src/scripts/search.ts: query terms, highlighting,
 * snippets, why a song matched) and the glossary filter (src/scripts/glossary-filter.ts).
 */
import { fold } from '../normalize.ts';
import { escapeHtml } from '../text.ts';
import { FACET_LABELS, TEXT_FIELDS, type FacetField } from './search-doc.ts';

// Filler words that would otherwise make every song match an English query.
const STOP = new Set(['i', 'a', 'the', 'to', 'of', 'and', 'my', 'is', 'it', 'in', 'on', 'me', 'you', 'im']);

/** A word as the index stores it (folded), or null when it's too short or a filler word. */
export const searchTerm = (word: string) => {
  const f = fold(word);
  return f.length < 2 || STOP.has(f) ? null : f;
};

// Typed text splits into words at anything that isn't a letter or digit: "ginga," is "ginga".
const words = (s: string) => fold(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** The words of a search query worth matching on, folded. */
export const queryTerms = (q: string) => words(q).map(searchTerm).filter((t): t is string => !!t);

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

/** Does `folded` (already folded text) contain every word of `query`, accents optional? An empty query matches. */
export function containsAllWords(folded: string, query: string) {
  return words(query).every((w) => folded.includes(w));
}

const isTextField = (f: string) => (TEXT_FIELDS as readonly string[]).includes(f);
const isFacetField = (f: string): f is FacetField => f in FACET_LABELS;

/**
 * HTML saying which theme, person or place a song matched through, when some word of the
 * query was found nowhere in its title or lyrics; undefined when every word was.
 * `match` is MiniSearch's: each matched term → the fields it was found in.
 */
export function whyMatchedHtml(match: Record<string, string[]>, doc: Record<FacetField, string>, terms: string[]): string | undefined {
  const facetOnly = Object.values(match).filter((fields) => !fields.some(isTextField));
  if (!facetOnly.length) return undefined;
  const fields = new Set(facetOnly.flat());
  const parts = [...fields].filter(isFacetField).map((f) => `${FACET_LABELS[f]}: ${highlight(doc[f], terms)}`);
  return parts.join(' · ') || undefined;
}
