import { getCollection, type CollectionEntry } from 'astro:content';
import { parseLyrics, hookLine } from './lyrics';

export type Song = CollectionEntry<'songs'>;

/** Each browsable facet of the ontology: its key is its collection, its URL segment and the song field that references it. */
export const FACETS = {
  themes: { label: 'Themes', blurb: 'What the songs sing about.' },
  people: { label: 'People', blurb: 'Mestres, legends and figures named in the songs.' },
  places: { label: 'Places', blurb: 'Where the songs take us.' },
} as const;

export type TaxonomyKey = keyof typeof FACETS;
export const TAXONOMY_KEYS = Object.keys(FACETS) as TaxonomyKey[];

type PersonKind = CollectionEntry<'people'>['data']['kind'];
type TaxonomyData = CollectionEntry<TaxonomyKey>['data'];

const KIND_NAMES: Record<PersonKind, string> = {
  mestre: 'Mestre',
  historical: 'Historical figure',
  legendary: 'Legend',
  religious: 'Religious figure',
  other: '',
};

let checked: Promise<void> | undefined;

/**
 * Fail the build on a reference to an unknown song, theme, person or place:
 * Astro only warns about a dangling one. Runs once per build, however often it's called.
 */
export function checkReferences(): Promise<void> {
  checked ??= findBrokenReferences().then((problems) => {
    if (problems.length) throw new Error(`Broken references in songs:\n${problems.join('\n')}`);
  });
  return checked;
}

async function findBrokenReferences(): Promise<string[]> {
  const songs = await getCollection('songs');
  const known = new Set<string>(songs.map((s) => `songs:${s.id}`));
  for (const key of TAXONOMY_KEYS) for (const e of await getCollection(key)) known.add(`${key}:${e.id}`);
  return songs.flatMap((s) =>
    [...s.data.themes, ...s.data.people, ...s.data.places, ...s.data.related]
      .filter((r) => !known.has(`${r.collection}:${r.id}`))
      .map((r) => `  ${s.id}: unknown ${r.collection} "${r.id}"`),
  );
}

/** The published songs (drafts too outside production), by title. */
export async function getSongs(): Promise<Song[]> {
  const songs = await getCollection('songs', ({ data }) => !(import.meta.env.PROD && data.draft));
  return songs.sort((a, b) => a.data.title.localeCompare(b.data.title, 'pt'));
}

/** Ids a song references for a given facet. */
export function facetIds(song: Song, key: TaxonomyKey): string[] {
  return song.data[key].map((r) => r.id);
}

/** A taxonomy's entries, by name. */
export async function getTaxonomy<K extends TaxonomyKey>(key: K): Promise<CollectionEntry<K>[]> {
  const entries = (await getCollection(key)) as CollectionEntry<K>[];
  return entries.sort((a, b) => a.data.name.localeCompare(b.data.name, 'pt'));
}

/** id → name lookup for every taxonomy, for cheap rendering of chips. */
export async function getNames(): Promise<Record<TaxonomyKey, Record<string, string>>> {
  const out = {} as Record<TaxonomyKey, Record<string, string>>;
  for (const key of TAXONOMY_KEYS) {
    out[key] = Object.fromEntries((await getCollection(key)).map((e) => [e.id, e.data.name]));
  }
  return out;
}

export function lyricsOf(song: Song) {
  return parseLyrics(song.body ?? '');
}

export function hookOf(song: Song): string {
  return hookLine(lyricsOf(song));
}

/** Short facts about a taxonomy entry (kind, dates, region) for its cards and page. */
export function entryFacts(data: TaxonomyData): string[] {
  const out: string[] = [];
  if ('kind' in data && KIND_NAMES[data.kind]) out.push(KIND_NAMES[data.kind]);
  if ('lived' in data && data.lived) out.push(data.lived);
  if ('region' in data && data.region) out.push(data.region);
  return out;
}

/** "listen" / "watch" badge for a song, or undefined if it has no recordings. */
export function mediaBadge(song: Song): { icon: string; label: string } | undefined {
  const kinds = new Set(song.data.recordings.map((r) => r.kind));
  if (kinds.has('youtube')) return { icon: '▶', label: 'watch' };
  if (kinds.has('audio')) return { icon: '♪', label: 'listen' };
  return undefined;
}

export function songUrl(id: string): string {
  return `/songs/${id}/`;
}

export function facetUrl(key: TaxonomyKey, id?: string): string {
  return `/${key}/${id ? `${id}/` : ''}`;
}
