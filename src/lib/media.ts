/** Shared helpers for recordings (audio files and YouTube videos). */

const YT_ID = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/;

export const youtubeId = (url: string) => url.match(YT_ID)?.[1];

/** "90", "1:30", "1m30s", "1h2m3s" → seconds */
export function toSeconds(v: string | number): number {
  if (typeof v === 'number') return v;
  const s = v.trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  if (/^\d+(:\d{1,2}){1,2}$/.test(s)) return s.split(':').reduce((acc, n) => acc * 60 + Number(n), 0);
  const m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (m && m[0]) return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return NaN;
}

/** Start time encoded in a YouTube link (?t=90, ?t=1m30s, &start=90): undefined when there's none, NaN when it can't be read. */
export function youtubeStart(url: string) {
  try {
    const p = new URL(url).searchParams;
    const t = p.get('t') ?? p.get('start');
    return t ? toSeconds(t) : undefined;
  } catch {
    return undefined;
  }
}

export const formatTime = (t: number) =>
  Number.isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : '–:––';
