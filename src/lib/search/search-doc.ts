/** One song as the search index (/search-index.json) carries it, and its parser for the browser. */
import * as z from 'zod/mini';
import { parseData } from '../data.ts';
import { DIFFICULTY } from '../lyrics/lyrics.ts';

/** The index's text fields: a match in one of these is in the song itself. */
export const TEXT_FIELDS = ['title', 'alt', 'hook', 'lyrics', 'translation'] as const;
/** The index's facet fields, with how a match through one is labelled. */
export const FACET_LABELS = { themes: 'Theme', people: 'People', places: 'Place' } as const;
export type FacetField = keyof typeof FACET_LABELS;
const FACET_FIELDS = Object.keys(FACET_LABELS) as FacetField[];

const strings = <K extends string>(keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, z.string()])) as Record<K, z.ZodMiniString>;

const searchDoc = z.strictObject({
  id: z.string(),
  ...strings(TEXT_FIELDS),
  ...strings(FACET_FIELDS),
  level: z.literal(DIFFICULTY.map((d) => d.level)),
  levelLabel: z.string(),
  /** every distinct lyric and translation line, for the result's snippet */
  lines: z.array(z.string()),
  /** e.g. { icon: '▶', label: 'watch' } when the song has recordings */
  media: z.optional(z.strictObject({ icon: z.string(), label: z.string() })),
});

export type SearchDoc = z.infer<typeof searchDoc>;

/** The index's songs; throws, naming the bad field, when it isn't a list of them (a stale or broken index). */
export const parseSearchDocs = (data: unknown) => parseData(z.array(searchDoc), data, 'The search index');
