import { defineCollection, reference } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { existsSync } from 'node:fs';
import { toSeconds, youtubeId, youtubeStart } from './lib/media';

/*
 * The songbook ontology.
 *
 *   Song ──type──────▶ SongType      (ladainha, corrido, …)
 *        ──toques────▶ Toque         (berimbau rhythms it is sung over)
 *        ──themes────▶ Theme         (the sea, resistance, malandragem, …)
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

const songTypes = taxonomy('src/data/song-types.yaml', {
  plural: z.string(),
  order: z.number(),
  // tag colour, like the instrument colours in Brasil Seis
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
});

const toques = taxonomy('src/data/toques.yaml', {
  order: z.number().optional(),
  tempo: z.enum(['slow', 'medium', 'fast']).optional(),
  associatedWith: z.array(z.enum(['angola', 'regional', 'contemporanea'])).default([]),
});

const themes = taxonomy('src/data/themes.yaml', { emoji: z.string().optional() });

const people = taxonomy('src/data/people.yaml', {
  kind: z.enum(['mestre', 'historical', 'legendary', 'religious', 'other']),
  aka: z.array(z.string()).default([]),
  lived: z.string().optional(),
});

const places = taxonomy('src/data/places.yaml', { region: z.string().optional() });

const glossary = defineCollection({
  loader: file('src/data/glossary.yaml'),
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
    (p) => /^https?:\/\//.test(p) || existsSync(`public${p.startsWith('/') ? '' : '/'}${p}`),
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
  .refine((r) => !r.file !== !r.youtube, { error: 'each recording needs exactly one of `file:` or `youtube:`' })
  .transform(({ file, youtube, start, ...r }) =>
    youtube
      ? {
          ...r,
          kind: 'youtube' as const,
          src: youtube,
          videoId: youtubeId(youtube)!,
          start: start ?? youtubeStart(youtube) ?? 0,
        }
      : { ...r, kind: 'audio' as const, src: file!, videoId: undefined, start: start ?? 0 },
  );

const songs = defineCollection({
  loader: glob({ pattern: '**/*.md', base: 'src/content/songs' }),
  schema: z.object({
    title: z.string(),
    alternateTitles: z.array(z.string()).default([]),
    type: reference('songTypes'),
    styles: z.array(z.enum(['angola', 'regional', 'contemporanea'])).default([]),
    toques: z.array(reference('toques')).default([]),
    themes: z.array(reference('themes')).default([]),
    people: z.array(reference('people')).default([]),
    places: z.array(reference('places')).default([]),
    related: z.array(reference('songs')).default([]),
    origin: z.enum(['traditional', 'composed', 'unknown']).default('traditional'),
    composer: z.string().optional(),
    language: z.string().default('pt-BR'),
    summary: z.string().optional(),
    about: z.string().optional(),
    recordings: z.array(recording).default([]),
    added: z.coerce.date(),
    updated: z.coerce.date().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { songs, songTypes, toques, themes, people, places, glossary };
