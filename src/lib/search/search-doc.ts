/** One song as the search index (/search-index.json) carries it, and its parser for the browser. */
export interface SearchDoc {
  id: string;
  title: string;
  alt: string;
  /** 1 easy · 2 medium · 3 hard */
  level: number;
  levelLabel: string;
  themes: string;
  people: string;
  places: string;
  hook: string;
  lyrics: string;
  translation: string;
  lines: string[];
  /** e.g. { icon: '▶', label: 'watch' } when the song has recordings */
  media?: { icon: string; label: string };
}

const TEXT_KEYS = ['id', 'title', 'alt', 'levelLabel', 'themes', 'people', 'places', 'hook', 'lyrics', 'translation'] as const;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function isSearchDoc(v: unknown): v is SearchDoc {
  if (!isRecord(v)) return false;
  const { level, lines, media } = v;
  return (
    TEXT_KEYS.every((k) => typeof v[k] === 'string') &&
    typeof level === 'number' &&
    Array.isArray(lines) &&
    lines.every((l) => typeof l === 'string') &&
    (media === undefined || (isRecord(media) && typeof media.icon === 'string' && typeof media.label === 'string'))
  );
}

/** The index's songs; throws when the data isn't a list of them (a stale or broken index). */
export function parseSearchDocs(data: unknown): SearchDoc[] {
  if (!Array.isArray(data)) throw new Error('search index: expected a list of songs');
  const bad = data.findIndex((d) => !isSearchDoc(d));
  if (bad !== -1) throw new Error(`search index: entry ${bad} isn't a song`);
  return data as SearchDoc[];
}
