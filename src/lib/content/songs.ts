/** Reading the songbook's content collections at build time: songs, taxonomies, and the reference check. */
import { getCollection, type CollectionEntry } from 'astro:content';
import { parseLyrics, hookLine, type LyricSection } from '../lyrics/lyrics.ts';
import { TAXONOMY_KEYS, type TaxonomyKey } from './facets.ts';
import { compareText } from '../normalize.ts';
import { brokenReferences, oncePerBuild, type Ref } from './references.ts';

export type Song = CollectionEntry<'songs'>;

/**
 * Fail on a reference to an unknown song, theme, person or place: Astro only warns about a
 * dangling one. Checked once per build, and on every page in `astro dev`.
 */
export const checkReferences = oncePerBuild(failOnBrokenReferences, () => import.meta.env.PROD);

async function failOnBrokenReferences(): Promise<void> {
  const songs = await getCollection('songs');
  const known = new Set<string>(songs.map((s) => `songs:${s.id}`));
  for (const key of TAXONOMY_KEYS) for (const e of await getCollection(key)) known.add(`${key}:${e.id}`);
  const broken = brokenReferences(
    songs.map((s) => ({ id: s.id, refs: [...TAXONOMY_KEYS.flatMap((key): Ref[] => s.data[key]), ...s.data.related] })),
    known,
  );
  if (broken.length) {
    const lines = broken.map((b) => `  ${b.song}: unknown ${b.collection} "${b.id}"`);
    throw new Error(`Broken references in songs:\n${lines.join('\n')}`);
  }
}

/** The published songs (drafts too outside production), by title. */
export async function getSongs(): Promise<Song[]> {
  const songs = await getCollection('songs', ({ data }) => !(import.meta.env.PROD && data.draft));
  return songs.sort((a, b) => compareText(a.data.title, b.data.title));
}

/** Ids a song references for a given facet. */
export function facetIds(song: Song, key: TaxonomyKey): string[] {
  return song.data[key].map((r) => r.id);
}

/** The songs that reference one entry of a facet. */
export function songsWith(songs: Song[], key: TaxonomyKey, id: string): Song[] {
  return songs.filter((s) => facetIds(s, key).includes(id));
}

/** How many recordings the songs have between them. */
export function recordingCount(songs: Song[]): number {
  return songs.reduce((n, s) => n + s.data.recordings.length, 0);
}

/** A taxonomy's entries, by name. */
export async function getTaxonomy<K extends TaxonomyKey>(key: K): Promise<CollectionEntry<K>[]> {
  const entries = (await getCollection(key)) as CollectionEntry<K>[];
  return entries.sort((a, b) => compareText(a.data.name, b.data.name));
}

/** id → name lookup for every taxonomy, for cheap rendering of chips. */
export async function getNames(): Promise<Record<TaxonomyKey, Record<string, string>>> {
  const out = {} as Record<TaxonomyKey, Record<string, string>>;
  for (const key of TAXONOMY_KEYS) {
    out[key] = Object.fromEntries((await getCollection(key)).map((e) => [e.id, e.data.name]));
  }
  return out;
}

/** A song's lyrics, parsed. */
export function lyricsOf(song: Song): LyricSection[] {
  return parseLyrics(song.body ?? '');
}

/** The line a song is known by (see hookLine). */
export function hookOf(song: Song): string {
  return hookLine(lyricsOf(song));
}
