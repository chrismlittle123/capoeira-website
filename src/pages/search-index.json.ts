import type { APIRoute } from 'astro';
import { getSongs, getNames, lyricsOf } from '../lib/content/songs';
import { mediaBadge } from '../lib/player/media';
import { allLines, difficulty, hookLine } from '../lib/lyrics/lyrics';
import type { SearchDoc } from '../lib/search/search-doc';

export const GET: APIRoute = async () => {
  const [songs, names] = await Promise.all([getSongs(), getNames()]);
  const docs: SearchDoc[] = songs.map((song) => {
    const sections = lyricsOf(song);
    const lines = allLines(sections);
    const d = song.data;
    const namesOf = (key: keyof typeof names, refs: { id: string }[]) => refs.map((r) => names[key][r.id]).join(' · ');
    const level = difficulty(sections);
    return {
      id: song.id,
      title: d.title,
      alt: d.alternateTitles.join(' · '),
      level: level.level,
      levelLabel: level.label,
      themes: namesOf('themes', d.themes),
      people: namesOf('people', d.people),
      places: namesOf('places', d.places),
      hook: hookLine(sections),
      // de-duplicate repeated coro lines so they don't dominate ranking
      lyrics: [...new Set(lines.map((l) => l.text))].join('\n'),
      translation: [...new Set(lines.map((l) => l.translation).filter(Boolean))].join('\n'),
      lines: [...new Set(lines.flatMap((l) => [l.text, l.translation ?? '']).filter(Boolean))],
      media: mediaBadge(song.data.recordings),
    };
  });
  return new Response(JSON.stringify(docs), { headers: { 'Content-Type': 'application/json' } });
};
