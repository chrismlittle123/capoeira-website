/** The media player's data and arithmetic (src/scripts/player.ts): takes, progress, speeds, lyric sync. */
import type { CollectionEntry } from 'astro:content';
import * as z from 'zod/mini';
import { parseData } from '../data.ts';

const takeFields = {
  src: z.string(),
  start: z.number(),
  end: z.optional(z.number()),
  label: z.string(),
  performer: z.optional(z.string()),
};
const take = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('audio'), ...takeFields }),
  z.strictObject({ kind: z.literal('youtube'), videoId: z.string(), ...takeFields }),
]);

/** One recording the player can switch to, as MediaPlayer.astro hands it over. */
export type Take = z.infer<typeof take>;

type SongRecording = CollectionEntry<'songs'>['data']['recordings'][number];
// Pick from each kind of recording separately, so a YouTube one keeps its videoId.
type PickEach<T, K extends keyof T> = T extends unknown ? Pick<T, K> : never;
/** The parts of a song's recording (src/content.config.ts) the player uses. */
export type Recording = PickEach<SongRecording, 'kind' | 'src' | 'videoId' | 'start' | 'end' | 'title' | 'performer' | 'recordedAt'>;

// A recording date is a calendar date, read as UTC midnight: label it in UTC so it's the
// same month on every machine that builds the site.
const monthYear = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** What a recording is called: its title, else who sings it, else when it was made, else its place in the list. */
function rawLabel(r: Recording, i: number) {
  const fallback = r.kind === 'youtube' ? `Video ${i + 1}` : `Recording ${i + 1}`;
  return r.title ?? r.performer ?? (r.recordedAt && monthYear(r.recordedAt)) ?? fallback;
}

/** Number labels that repeat: "Roda", "Roda" → "Roda 1", "Roda 2". */
export function numberRepeats(labels: string[]): string[] {
  return labels.map((l, i) => {
    const total = labels.filter((x) => x === l).length;
    return total > 1 ? `${l} ${labels.slice(0, i + 1).filter((x) => x === l).length}` : l;
  });
}

/** The player's takes for a song's recordings, each with a label of its own. */
export function takesFor(recordings: Recording[]): Take[] {
  const labels = numberRepeats(recordings.map(rawLabel));
  return recordings.map((r, i) => {
    const t = { src: r.src, start: r.start, end: r.end, label: labels[i] ?? '', performer: r.performer };
    return r.kind === 'youtube' ? { kind: 'youtube', videoId: r.videoId, ...t } : { kind: 'audio', ...t };
  });
}

/** The player's takes from its JSON; throws, naming the bad field, when they aren't a list of takes. */
export const parseTakes = (data: unknown) => parseData(z.array(take), data, "The player's [data-takes]");

/** Playback speeds, in the order the speed button steps through them. */
export const SPEEDS = [1, 0.75, 0.5, 1.25] as const;

/** The speed after `rate`; an unknown rate goes back to the first. */
export const nextSpeed = (rate: number): number => SPEEDS[(SPEEDS.findIndex((s) => s === rate) + 1) % SPEEDS.length] ?? SPEEDS[0];

/** How far `t` is through [start, end], from 0 to 1; 0 while the end isn't known. */
export const progress = (t: number, start: number, end: number) =>
  Number.isFinite(end) && end > start ? Math.min(1, Math.max(0, (t - start) / (end - start))) : 0;

/** `t` kept inside [start, end]; only above start while the end isn't known. */
export const clampTime = (t: number, start: number, end: number) =>
  Math.max(start, Number.isFinite(end) ? Math.min(end, t) : t);

// Light a line a moment early, so it's lit as the singer starts it.
const LEAD = 0.15;

/** Index of the lyric line being sung at `t`, given each line's start time in order; -1 before the first. */
export function lineAt(times: number[], t: number) {
  let found = -1;
  times.forEach((start, i) => {
    if (start <= t + LEAD) found = i;
  });
  return found;
}
