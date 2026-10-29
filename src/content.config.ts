import { defineCollection, reference } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { existsSync } from 'node:fs';
import { toSeconds, youtubeId, youtubeStart } from './lib/media';
import { LOCALE } from './lib/normalize';
import { PUBLIC_DIR, SONGS_DIR, dataFile } from './lib/paths';
import { STYLES } from './lib/song-facts';

/*
 * The songbook ontology.
 *
 *   Song ──themes────▶ Theme         (the sea, resistance, malandragem, …)
 *        ──people────▶ Person        (mestres & figures sung about / composers)
 *        ──places────▶ Place
 *        ──related───▶ Song
 *        ──recordings  (audio files or YouTube videos, optionally time-synced to lyric lines)
 *   GlossaryTerm  (Portuguese words explained inline in lyrics)
 *
 * Every reference is checked at build time: a typo in an id fails the build
 * instead of shipping a broken link.
 */

const taxonomy = <T extends z.ZodRawShape>(path: string, extra: T = {} as T) =>
  defineCollection({
    loader: file(path),
    schema: z.object({
      name: z.string(),
      description: z.string().optional(),
      ...extra,
    }),
  });

const themes = taxonomy(dataFile('themes'), { emoji: z.string().optional() });

const people = taxonomy(dataFile('people'), {
  kind: z.enum(['mestre', 'historical', 'legendary', 'religious', 'other']),
  aka: z.array(z.string()).default([]),
  lived: z.string().optional(),
});

const places = taxonomy(dataFile('places'), { region: z.string().optional() });

const glossary = defineCollection({
  loader: file(dataFile('glossary')),
  schema: z.object({
    term: z.string(),
    // Other spellings/inflections that should also be linked in lyrics.
    forms: z.array(z.string()).default([]),
    definition: z.string(),
  }),
});

const audioPath = z
  .string()
  .refine(
    (p) => /^https?:\/\//.test(p) || existsSync(`${PUBLIC_DIR}${p.startsWith('/') ? '' : '/'}${p}`),
    { error: (iss) => `audio file not found in public/: ${String(iss.input)}` },
  );

const time = z
  .union([z.number().nonnegative(), z.string()])
  .transform((v, ctx) => {
    const t = toSeconds(v);
    if (Number.isNaN(t)) ctx.addIssue({ code: 'custom', message: `can't read "${v}" as a time — use 90, 1:30 or 1m30s` });
    return t;
  });

/*
 * A recording is either an audio file (`file:`) or a YouTube video (`youtube:`).
 * Both are normalised to { kind, src, videoId?, start, end?, … } for the pages.
 */
const recording = z
  .object({
    file: audioPath.optional(),
    youtube: z
      .string()
      .refine((u) => !!youtubeId(u), { error: (iss) => `not a YouTube video link: ${String(iss.input)}` })
      .refine((u) => !Number.isNaN(youtubeStart(u) ?? 0), {
        error: (iss) => `can't read the start time in this YouTube link — use ?t=90 or ?t=1m30s: ${String(iss.input)}`,
      })
      .optional(),
    // Play only part of the media, e.g. a song inside a long roda video.
    start: time.optional(),
    end: time.optional(),
    title: z.string().optional(),
    performer: z.string().optional(),
    recordedAt: z.coerce.date().optional(),
    source: z.string().optional(),
    notes: z.string().optional(),
    // Line timestamps written as [m:ss] in the lyrics refer to the recording with sync: true.
    sync: z.boolean().default(false),
  })
  .transform(({ file, youtube, start, ...r }, ctx) => {
    // The youtube field's own check guarantees an id whenever a link is given.
    const videoId = youtube ? youtubeId(youtube) : undefined;
    if (youtube && videoId && !file) {
      return { ...r, kind: 'youtube' as const, src: youtube, videoId, start: start ?? youtubeStart(youtube) ?? 0 };
    }
    if (file && !youtube) return { ...r, kind: 'audio' as const, src: file, videoId: undefined, start: start ?? 0 };
    ctx.addIssue({ code: 'custom', message: 'each recording needs exactly one of `file:` or `youtube:`' });
    return z.NEVER;
  });

const songs = defineCollection({
  loader: glob({ pattern: '**/*.md', base: SONGS_DIR }),
  schema: z.object({
    title: z.string(),
    alternateTitles: z.array(z.string()).default([]),
    styles: z.array(z.enum(STYLES)).default([]),
    themes: z.array(reference('themes')).default([]),
    people: z.array(reference('people')).default([]),
    places: z.array(reference('places')).default([]),
    related: z.array(reference('songs')).default([]),
    origin: z.enum(['traditional', 'composed', 'unknown']).default('traditional'),
    composer: z.string().optional(),
    language: z.string().default(LOCALE),
    summary: z.string().optional(),
    about: z.string().optional(),
    // false = machine/rough translation, shown with a "draft" note until someone checks it
    translationReviewed: z.boolean().default(true),
    // reference pages for the lyrics (YouTube links go in recordings instead)
    sources: z.array(z.url()).default([]),
    recordings: z
      .array(recording)
      .default([])
      .refine((rs) => rs.filter((r) => r.kind === 'youtube').length <= 1, {
        error: 'only one YouTube video per song — keep the best one',
      })
      // the YouTube video always comes first, whatever order the file lists them in
      .transform((rs) => [...rs.filter((r) => r.kind === 'youtube'), ...rs.filter((r) => r.kind !== 'youtube')]),
    added: z.coerce.date(),
    updated: z.coerce.date().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { songs, themes, people, places, glossary };
