/** Reading preferences on the song page (src/scripts/song-page.ts), applied early by src/layouts/Base.astro. */

/** Where each preference is kept in localStorage. */
export const STORAGE_KEYS = { translation: 'translation', lyricScale: 'lyric-scale', recent: 'recent' } as const;

export const MIN_SCALE = 0.8;
export const MAX_SCALE = 1.8;

/** A lyric text scale kept within bounds, in steps of 0.1 (so repeated taps don't drift). */
export const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(s * 10) / 10));

const RECENT_MAX = 12;

/** The recently viewed song ids with `id` first, from what was stored (any junk there is dropped). */
export function rememberRecent(stored: string | null, id: string): string[] {
  let seen: unknown = [];
  try {
    seen = JSON.parse(stored ?? '[]');
  } catch {
    // unreadable: start a fresh list
  }
  const ids = Array.isArray(seen) ? seen.filter((x): x is string => typeof x === 'string' && x !== id) : [];
  return [id, ...ids].slice(0, RECENT_MAX);
}
