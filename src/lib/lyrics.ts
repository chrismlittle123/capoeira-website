/*
 * Lyrics are written in the song's Markdown body:
 *
 *   ## Coro                 ← starts a section; "Coro"/"Chorus"/"Resposta" = everyone answers
 *   [0:12] Paranauê, paraná ← optional [m:ss] timestamp syncs the line to the recording
 *   > Paranauê, Paraná      ← "> " gives the translation of the line above
 *                           ← blank line = new stanza
 *   ## Solo                 ← any other heading is sung by the lead singer
 */

export type Role = 'solo' | 'coro';

export interface LyricLine {
  text: string;
  translation?: string;
  /** seconds into the synced recording */
  time?: number;
}

export interface LyricSection {
  role: Role;
  label: string;
  stanzas: LyricLine[][];
}

const CORO = /^(coro|chorus|resposta|response|refr[aã]o)\b/i;
const TIME = /^\[(\d+):(\d{1,2}(?:\.\d+)?)\]\s*/;

export function parseLyrics(body: string): LyricSection[] {
  const sections: LyricSection[] = [];
  let section: LyricSection | undefined;
  let stanza: LyricLine[] = [];

  const flushStanza = () => {
    if (stanza.length && section) section.stanzas.push(stanza);
    stanza = [];
  };
  const ensureSection = () => {
    if (!section) {
      section = { role: 'solo', label: 'Solo', stanzas: [] };
      sections.push(section);
    }
    return section;
  };

  for (const raw of body.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('## ')) {
      flushStanza();
      const label = line.slice(3).trim();
      section = { role: CORO.test(label) ? 'coro' : 'solo', label, stanzas: [] };
      sections.push(section);
    } else if (!line) {
      flushStanza();
    } else if (line.startsWith('>')) {
      const prev = stanza.at(-1);
      const t = line.replace(/^>\s?/, '');
      if (prev) prev.translation = prev.translation ? `${prev.translation} ${t}` : t;
    } else {
      ensureSection();
      const m = line.match(TIME);
      stanza.push({
        text: m ? line.slice(m[0].length) : line,
        time: m ? Number(m[1]) * 60 + Number(m[2]) : undefined,
      });
    }
  }
  flushStanza();
  return sections.filter((s) => s.stanzas.length);
}

export const allLines = (sections: LyricSection[]) =>
  sections.flatMap((s) => s.stanzas.flat().map((l) => ({ ...l, role: s.role })));

export const hasTranslation = (sections: LyricSection[]) =>
  allLines(sections).some((l) => l.translation);

export const isSynced = (sections: LyricSection[]) => allLines(sections).some((l) => l.time != null);

/** The first line of the coro, else the first line — what people actually remember. */
export function hookLine(sections: LyricSection[]): string {
  const coro = sections.find((s) => s.role === 'coro');
  return (coro ?? sections[0])?.stanzas[0]?.[0]?.text ?? '';
}
