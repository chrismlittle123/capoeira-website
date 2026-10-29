/** Shared helpers for recordings (audio files and YouTube videos). */

import type { CollectionEntry } from 'astro:content';

/** What a recording is played with, as the song schema normalises it. */
export type MediaKind = CollectionEntry<'songs'>['data']['recordings'][number]['kind'];

export const MEDIA_ICON: Record<MediaKind, string> = { youtube: '▶', audio: '♪' };

// Anchored to the start, so only YouTube's own hosts match (not e.g. notyoutube.com).
const YT_ID = /^(?:https?:\/\/)?(?:(?:www|m|music)\.)?(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/;

/** The 11-character video id in a YouTube link, or undefined when it isn't one. */
export const youtubeId = (url: string) => url.match(YT_ID)?.[1];

/** The privacy-enhanced embed for a video, without parameters. */
export const youtubeEmbedUrl = (videoId: string) => `https://www.youtube-nocookie.com/embed/${videoId}`;

/** A video's large thumbnail. */
export const youtubeThumbnailUrl = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

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

/**
 * Start time encoded in a YouTube link (?t=90, ?t=1m30s, &start=90): undefined when there's none,
 * NaN when it can't be read. The query is read straight off the text, so a link written
 * without https:// is checked the same way.
 */
export function youtubeStart(url: string): number | undefined {
  const p = new URLSearchParams(url.split('#')[0].split('?')[1] ?? '');
  const t = p.get('t') ?? p.get('start');
  return t ? toSeconds(t) : undefined;
}

/** "watch" / "listen" badge for a song's recordings, or undefined if it has none. */
export function mediaBadge(recordings: { kind: MediaKind }[]): { icon: string; label: string } | undefined {
  const kinds = new Set(recordings.map((r) => r.kind));
  if (kinds.has('youtube')) return { icon: MEDIA_ICON.youtube, label: 'watch' };
  if (kinds.has('audio')) return { icon: MEDIA_ICON.audio, label: 'listen' };
  return undefined;
}

/** A link to another site, rather than a file in public/. */
export const isRemoteUrl = (p: string) => /^https?:\/\//.test(p);

/** Where an audio file is served from: "audio/x.m4a" → "/audio/x.m4a"; links to other sites are kept as they are. */
export const audioSitePath = (p: string) => (isRemoteUrl(p) || p.startsWith('/') ? p : `/${p}`);

/** Seconds as m:ss for the player, or a dash when there's no time yet. */
export const formatTime = (t: number) =>
  Number.isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : '–:––';
