/** The media player's data and arithmetic (src/scripts/player.ts): takes, progress, speeds, lyric sync. */

/** One recording the player can switch to, as MediaPlayer.astro hands it over. */
export interface Take {
  kind: 'audio' | 'youtube';
  src: string;
  videoId?: string;
  start: number;
  end?: number;
  label: string;
  performer?: string;
}

/** A song's recording as the content schema gives it (src/content.config.ts). */
export interface Recording {
  kind: Take['kind'];
  src: string;
  videoId?: string;
  start: number;
  end?: number;
  title?: string;
  performer?: string;
  recordedAt?: Date;
}

/** What a recording is called: its title, else who sings it, else when it was made, else its place in the list. */
function rawLabel(r: Recording, i: number) {
  const fallback = r.kind === 'youtube' ? `Video ${i + 1}` : `Recording ${i + 1}`;
  return r.title ?? r.performer ?? r.recordedAt?.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) ?? fallback;
}

/** Number labels that repeat: "Roda", "Roda" → "Roda 1", "Roda 2". */
export function numberRepeats(labels: string[]): string[] {
  return labels.map((l, i) => {
    const total = labels.filter((x) => x === l).length;
    return total > 1 ? `${l} ${labels.slice(0, i + 1).filter((x) => x === l).length}` : l;
  });
}

/** The player's takes for a song's recordings; a relative audio path is served from the site root. */
export function takesFor(recordings: Recording[]): Take[] {
  const labels = numberRepeats(recordings.map(rawLabel));
  return recordings.map((r, i) => ({
    kind: r.kind,
    src: r.kind === 'audio' && !/^https?:/.test(r.src) && !r.src.startsWith('/') ? `/${r.src}` : r.src,
    videoId: r.videoId,
    start: r.start,
    end: r.end,
    label: labels[i] ?? '',
    performer: r.performer,
  }));
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const optional = (v: unknown, type: 'string' | 'number') => v === undefined || typeof v === type;

function isTake(v: unknown): v is Take {
  if (!isRecord(v)) return false;
  return (
    (v.kind === 'audio' || (v.kind === 'youtube' && typeof v.videoId === 'string')) &&
    typeof v.src === 'string' &&
    typeof v.start === 'number' &&
    typeof v.label === 'string' &&
    optional(v.videoId, 'string') &&
    optional(v.end, 'number') &&
    optional(v.performer, 'string')
  );
}

/** The player's takes from its JSON; throws when they aren't a list of takes. */
export function parseTakes(data: unknown): Take[] {
  if (!Array.isArray(data) || !data.every(isTake)) throw new Error('player: [data-takes] is not a list of takes');
  return data;
}

/** Playback speeds, in the order the speed button steps through them. */
export const SPEEDS = [1, 0.75, 0.5, 1.25];

/** The speed after `rate`; an unknown rate goes back to the first. */
export const nextSpeed = (rate: number) => SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length] ?? 1;

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
