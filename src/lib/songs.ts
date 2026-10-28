import { getCollection, type CollectionEntry } from 'astro:content';
import { parseLyrics, hookLine } from './lyrics';

export type Song = CollectionEntry<'songs'>;
export type TaxonomyKey = 'songTypes' | 'toques' | 'themes' | 'people' | 'places';

/** URL segment for each browsable facet of the ontology. */
export const FACETS = {
  songTypes: { path: 'types', label: 'Song types', field: 'type', blurb: 'From the opening ladainha to the corridos that drive the game.' },
  toques: { path: 'toques', label: 'Toques', field: 'toques', blurb: 'The berimbau rhythms each song is sung over.' },
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
  for (const key of Object.keys(FACETS) as TaxonomyKey[])
    for (const e of await getCollection(key)) known.add(`${key}:${e.id}`);
  const problems = songs.flatMap((s) =>
    [s.data.type, ...s.data.toques, ...s.data.themes, ...s.data.people, ...s.data.places, ...s.data.related]
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

/** Ids a song references for a given facet (type is single-valued). */
export function facetIds(song: Song, key: TaxonomyKey): string[] {
  if (key === 'songTypes') return [song.data.type.id];
  return song.data[FACETS[key].field as 'toques'].map((r) => r.id);
}

export async function getTaxonomy<K extends TaxonomyKey>(key: K): Promise<CollectionEntry<K>[]> {
  const entries = (await getCollection(key)) as CollectionEntry<K>[];
  const order = (e: CollectionEntry<K>) => ('order' in e.data ? e.data.order : 0);
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
export const songUrl = (id: string) => `/songs/${id}/`;
export const facetUrl = (key: TaxonomyKey, id?: string) => `/${FACETS[key].path}/${id ? `${id}/` : ''}`;
