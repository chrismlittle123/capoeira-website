/** Facts the song page derives from a song's data: who wrote it, and which songs to sing next. */
import type { TaxonomyKey } from './songs';

export interface Origin {
  origin: 'traditional' | 'composed' | 'unknown';
  composer?: string;
}

/** "Traditional", "By Mestre X", "Composed (author unknown)" or "Origin unknown". */
export function originText({ origin, composer }: Origin): string {
  if (origin === 'traditional') return 'Traditional';
  if (composer) return `By ${composer}`;
  return origin === 'composed' ? 'Composed (author unknown)' : 'Origin unknown';
}

/** What relatedness is judged on: the songs it links to, and its ids per facet. */
export interface Relatable {
  id: string;
  related: string[];
  facets: Record<TaxonomyKey, string[]>;
}

// A link either way counts most, then each shared theme or person, then each shared place.
const LINKED = 10;
const WEIGHTS = { themes: 3, people: 3, places: 2 } as const satisfies Record<TaxonomyKey, number>;
const FACET_KEYS = ['themes', 'people', 'places'] as const satisfies readonly TaxonomyKey[];
const MIN_SCORE = 2;
const MAX_RELATED = 4;

const score = (song: Relatable, other: Relatable) =>
  (song.related.includes(other.id) || other.related.includes(song.id) ? LINKED : 0) +
  FACET_KEYS.reduce(
    (n, key) => n + WEIGHTS[key] * other.facets[key].filter((id) => song.facets[key].includes(id)).length,
    0,
  );

/** The ids of up to four songs to sing after `song`, most related first (ties keep `all`'s order). */
export function relatedIds(song: Relatable, all: Relatable[]): string[] {
  return all
    .filter((s) => s.id !== song.id)
    .map((s) => ({ id: s.id, n: score(song, s) }))
    .filter((x) => x.n >= MIN_SCORE)
    .sort((a, b) => b.n - a.n)
    .slice(0, MAX_RELATED)
    .map((x) => x.id);
}
