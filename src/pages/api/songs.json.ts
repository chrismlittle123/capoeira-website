import type { APIRoute } from 'astro';
import { getSongs, lyricsOf } from '../../lib/songs';
import { songUrl } from '../../lib/urls';
import { difficulty } from '../../lib/lyrics';
import { SITE } from '../../site.config';

export const GET: APIRoute = async ({ site }) => {
  const songs = await getSongs();
  const absoluteUrl = (path: string) => new URL(path, site).href;
  const body = {
    name: SITE.title,
    license: SITE.license,
    licenseUrl: SITE.licenseUrl,
    generated: new Date().toISOString(),
    count: songs.length,
    songs: songs.map((song) => {
      const { id, data: d } = song;
      const lyrics = lyricsOf(song);
      const { id: level, label, words } = difficulty(lyrics);
      return {
        id,
        url: absoluteUrl(songUrl(id)),
        title: d.title,
        alternateTitles: d.alternateTitles,
        styles: d.styles,
        themes: d.themes.map((r) => r.id),
        people: d.people.map((r) => r.id),
        places: d.places.map((r) => r.id),
        related: d.related.map((r) => r.id),
        origin: d.origin,
        composer: d.composer,
        language: d.language,
        summary: d.summary,
        about: d.about,
        translationReviewed: d.translationReviewed,
        sources: d.sources,
        difficulty: { level, label, words },
        lyrics,
        recordings: d.recordings.map(({ src, videoId, ...r }) =>
          r.kind === 'youtube' ? { ...r, url: src, youtubeId: videoId } : { ...r, url: absoluteUrl(src) },
        ),
        added: d.added,
        updated: d.updated,
      };
    }),
  };
  return new Response(JSON.stringify(body, null, 2), { headers: { 'Content-Type': 'application/json' } });
};
