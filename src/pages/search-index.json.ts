import type { APIRoute } from 'astro';
import { getSongs, getNames, lyricsOf } from '../lib/songs';
import { allLines, hookLine } from '../lib/lyrics';

export interface SearchDoc {
  id: string;
  title: string;
  alt: string;
  type: string;
  typeName: string;
  toques: string;
  themes: string;
  people: string;
  places: string;
  hook: string;
  lyrics: string;
  translation: string;
  lines: string[];
  audio: boolean;
}

export const GET: APIRoute = async () => {
  const [songs, names] = await Promise.all([getSongs(), getNames()]);
  const docs: SearchDoc[] = songs.map((song) => {
    const sections = lyricsOf(song);
    const lines = allLines(sections);
    const d = song.data;
    const join = (key: keyof typeof names, refs: { id: string }[]) =>
      refs.map((r) => names[key][r.id]).join(' · ');
    return {
      id: song.id,
      title: d.title,
      alt: d.alternateTitles.join(' · '),
      type: d.type.id,
      typeName: names.songTypes[d.type.id],
      toques: join('toques', d.toques),
      themes: join('themes', d.themes),
      people: join('people', d.people),
      places: join('places', d.places),
      hook: hookLine(sections),
      // de-duplicate repeated coro lines so they don't dominate ranking
      lyrics: [...new Set(lines.map((l) => l.text))].join('\n'),
      translation: [...new Set(lines.map((l) => l.translation).filter(Boolean))].join('\n'),
      lines: [...new Set(lines.flatMap((l) => [l.text, l.translation ?? '']).filter(Boolean))],
      audio: d.recordings.length > 0,
    };
  });
  return new Response(JSON.stringify(docs), { headers: { 'Content-Type': 'application/json' } });
};
