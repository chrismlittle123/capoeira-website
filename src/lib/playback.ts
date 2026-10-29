/** The arithmetic behind the media player (src/scripts/player.ts): progress, speeds, lyric sync. */

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
