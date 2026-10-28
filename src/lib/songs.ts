import { getCollection, type CollectionEntry } from 'astro:content';
import { parseLyrics, hookLine } from './lyrics';

export type Song = CollectionEntry<'songs'>;
// Song type and toque are still accepted in song files but no longer shown or browsable.
export type TaxonomyKey = 'themes' | 'people' | 'places';

/** URL segment for each browsable facet of the ontology. */
export const FACETS = {
  themes: { path: 'themes', label: 'Themes', field: 'themes', blurb: 'What the songs sing about.' },
  people: { path: 'people', label: 'People', field: 'people', blurb: 'Mestres, legends and figures named in the songs.' },
  places: { path: 'places', label: 'Places', field: 'places', blurb: 'Where the songs take us.' },
} as const satisfies Record<TaxonomyKey, { path: string; label: string; field: string; blurb: string }>;

export const facetByPath = (path: string) =>
  (Object.entries(FACETS) as [TaxonomyKey, (typeof FACETS)[TaxonomyKey]][]).find(([, f]) => f.path === path);

let validated: Promise<void> | undefined;

/** Astro only warns about dangling references; we'd rather the build fail. */
async function validateReferences() {
  const songs = await getCollection('songs');
  const known = new Set<string>(songs.map((s) => `songs:${s.id}`));
  const keys = ['songTypes', 'toques', 'themes', 'people', 'places'] as const;
  for (const key of keys) for (const e of await getCollection(key)) known.add(`${key}:${e.id}`);
  const problems = songs.flatMap((s) =>
    [...(s.data.type ? [s.data.type] : []), ...s.data.toques, ...s.data.themes, ...s.data.people, ...s.data.places, ...s.data.related]
      .filter((r) => !known.has(`${r.collection}:${r.id}`))
      .map((r) => `  ${s.id}: unknown ${r.collection} "${r.id}"`),
  );
  if (problems.length) throw new Error(`Broken references in songs:\n${problems.join('\n')}`);
}

export async function getSongs() {
  await (validated ??= validateReferences());
  const songs = await getCollection('songs', ({ data }) => !(import.meta.env.PROD && data.draft));
  return songs.sort((a, b) => a.data.title.localeCompare(b.data.title, 'pt'));
}

/** Ids a song references for a given facet. */
export function facetIds(song: Song, key: TaxonomyKey): string[] {
  return song.data[FACETS[key].field].map((r) => r.id);
}

export async function getTaxonomy<K extends TaxonomyKey>(key: K): Promise<CollectionEntry<K>[]> {
  const entries = (await getCollection(key)) as CollectionEntry<K>[];
  const order = (e: CollectionEntry<K>) => (e.data as { order?: number }).order ?? 999;
  return entries.sort((a, b) => order(a) - order(b) || a.data.name.localeCompare(b.data.name, 'pt'));
}

/** id → name lookup for every taxonomy, for cheap rendering of chips. */
export async function getNames() {
  const out = {} as Record<TaxonomyKey, Record<string, string>>;
  for (const key of Object.keys(FACETS) as TaxonomyKey[]) {
    out[key] = Object.fromEntries((await getCollection(key)).map((e) => [e.id, e.data.name]));
  }
  return out;
}

export const lyricsOf = (song: Song) => parseLyrics(song.body ?? '');
export const hookOf = (song: Song) => hookLine(lyricsOf(song));
const STYLE_NAMES: Record<string, string> = { angola: 'Angola', regional: 'Regional', contemporanea: 'Contemporânea' };
const KIND_NAMES: Record<string, string> = {
  mestre: 'Mestre',
  historical: 'Historical figure',
  legendary: 'Legend',
  religious: 'Religious figure',
  other: '',
};

/** Short facts about a taxonomy entry (tempo, style, dates…) for its cards and page. */
export function entryFacts(data: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (typeof data.kind === 'string' && KIND_NAMES[data.kind]) out.push(KIND_NAMES[data.kind]);
  if (typeof data.lived === 'string') out.push(data.lived);
  if (typeof data.tempo === 'string') out.push(`${data.tempo} tempo`);
  if (Array.isArray(data.associatedWith) && data.associatedWith.length)
    out.push(data.associatedWith.map((s) => STYLE_NAMES[s] ?? s).join(' · '));
  if (typeof data.region === 'string') out.push(data.region);
  return out;
}

/** "listen" / "watch" badge for a song, or undefined if it has no recordings. */
export function mediaBadge(song: Song) {
  const kinds = new Set(song.data.recordings.map((r) => r.kind));
  if (kinds.has('youtube')) return { icon: '▶', label: 'watch' };
  if (kinds.has('audio')) return { icon: '♪', label: 'listen' };
}
export const songUrl = (id: string) => `/songs/${id}/`;
export const facetUrl = (key: TaxonomyKey, id?: string) => `/${FACETS[key].path}/${id ? `${id}/` : ''}`;
