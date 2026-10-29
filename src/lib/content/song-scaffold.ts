/** The pure parts of `npm run new-song` (scripts/new-song.ts): naming, checking and the new file's text. */
import { basename, extname } from 'node:path';
import { Document, isScalar, isSeq, parse } from 'yaml';
import { fold } from '../normalize.ts';

/** "São Bento Grande" → "sao-bento-grande" */
export const slugify = (s: string) =>
  fold(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const isSlug = (s: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);

/**
 * A file dragged into a terminal arrives quoted ('/a b.mp3') or with escaped
 * spaces (/a\ b.mp3): turn either back into a plain path.
 */
export const unescapeDroppedPath = (input: string) =>
  input
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\\ /g, ' ');

/** Where a copied audio file is served from: /audio/<song>/<file-name>.<ext> */
export function audioUrl(slug: string, src: string) {
  const ext = extname(src);
  return `/audio/${slug}/${slugify(basename(src, ext)) || 'recording'}${ext.toLowerCase()}`;
}

/** The ids in a src/data YAML file, which maps each id to its entry. */
export function dataIds(yamlText: string): string[] {
  const data: unknown = parse(yamlText);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('expected a map of id → entry');
  return Object.keys(data);
}

/** "a, b,,c " → ["a", "b", "c"] */
export const parseIdList = (answer: string) =>
  answer
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const unknownIds = (picked: string[], known: string[]) => picked.filter((id) => !known.includes(id));

/** YYYY-MM-DD in the local time zone (toISOString would give the UTC date). */
export const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export interface NewSong {
  title: string;
  themes: string[];
  people: string[];
  places: string[];
  audio?: { file: string; performer?: string };
  youtube?: { url: string; title?: string };
  /** YYYY-MM-DD */
  added: string;
}

const LYRICS_TEMPLATE = `
## Coro
First line of the coro
> English translation

## Solo
First solo line
> English translation
`;

/** The markdown for a new song: its frontmatter, then a lyrics template to fill in. */
export function songMarkdown(song: NewSong): string {
  const recordings = [
    ...(song.audio ? [{ file: song.audio.file, performer: song.audio.performer || undefined }] : []),
    ...(song.youtube ? [{ youtube: song.youtube.url, title: song.youtube.title || undefined }] : []),
  ];
  const lists = { themes: song.themes, people: song.people, places: song.places };
  const doc = new Document({
    title: song.title,
    ...Object.fromEntries(Object.entries(lists).filter(([, ids]) => ids.length)),
    summary: '',
    ...(recordings.length ? { recordings } : {}),
    added: song.added,
  });
  // Match the hand-written songs: quoted text, id lists on one line.
  for (const key of ['title', 'summary']) {
    const node = doc.get(key, true);
    if (isScalar(node)) node.type = 'QUOTE_DOUBLE';
  }
  for (const key of Object.keys(lists)) {
    const node = doc.get(key, true);
    if (isSeq(node)) node.flow = true;
  }
  return `---\n${doc.toString()}---\n${LYRICS_TEMPLATE}`;
}
