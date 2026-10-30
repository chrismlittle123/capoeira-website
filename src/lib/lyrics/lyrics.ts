/*
 * Lyrics are written in the song's Markdown body:
 *
 *   ## Coro                 ← starts a section; "Coro"/"Chorus"/"Resposta"/"Response"/"Refrão" = everyone answers
 *   [0:12] Paranauê, paraná ← optional [m:ss] timestamp syncs the line to the recording
 *   > Paranauê, Paraná      ← "> " gives the translation of the line above
 *                           ← blank line = new stanza
 *   ## Solo                 ← any other "## " heading is sung by the lead singer;
 *                             any other "#" line is a typo and fails the build
 *   Eu não sou daqui
 *   + Marinheiro só         ← "+ " = the coro answers inside a solo section
 */

type Role = 'solo' | 'coro';

interface LyricLine {
  text: string;
  /** set when the coro answers inline ("+ " lines) */
  coro?: boolean;
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

/** The song's Markdown body as sections of stanzas of lines (format above). */
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
  };

  for (const raw of body.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('## ')) {
      flushStanza();
      const label = line.slice(3).trim();
      section = { role: CORO.test(label) ? 'coro' : 'solo', label, stanzas: [] };
      sections.push(section);
    } else if (line.startsWith('#')) {
      // "#Coro" or "### Coro" would otherwise be sung as a lyric line.
      throw new Error(`Lyrics: a section heading is "## " then its name: "${line}"`);
    } else if (!line) {
      flushStanza();
    } else if (line.startsWith('>')) {
      const prev = stanza.at(-1);
      const t = line.replace(/^>\s?/, '');
      // A translation of nothing would be lost: fail the build so it's fixed.
      if (!prev) throw new Error(`Lyrics: a "> " translation needs a sung line above it in the same stanza: "${line}"`);
      prev.translation = prev.translation ? `${prev.translation} ${t}` : t;
    } else {
      ensureSection();
      const coro = line.startsWith('+ ');
      const rest = coro ? line.slice(2).trim() : line;
      const m = rest.match(TIME);
      stanza.push({
        text: m ? rest.slice(m[0].length) : rest,
        ...(m && { time: Number(m[1]) * 60 + Number(m[2]) }),
        ...(coro && { coro: true }),
      });
    }
  }
  flushStanza();
  return sections.filter((s) => s.stanzas.length);
}

export const allLines = (sections: LyricSection[]) =>
  sections.flatMap((s) => s.stanzas.flat().map((l) => ({ ...l, role: l.coro ? 'coro' : s.role })));

export const hasTranslation = (sections: LyricSection[]) =>
  allLines(sections).some((l) => l.translation);

/** The first line of the coro, else the first line — what people actually remember. */
export function hookLine(sections: LyricSection[]): string {
  const lines = allLines(sections);
  return (lines.find((l) => l.role === 'coro') ?? lines[0])?.text ?? '';
}

/** Plain text of the lyrics, one line per sung line (for JSON-LD / exports). */
export const plainText = (sections: LyricSection[]) =>
  sections.map((s) => s.stanzas.map((st) => st.map((l) => l.text).join('\n')).join('\n\n')).join('\n\n');

/*
 * Difficulty = how much there is to learn: the number of words in the song's distinct
 * sung lines (repeats and "(x2)" don't add anything to memorise). Computed, never set.
 */
export const DIFFICULTY = [
  { level: 1, id: 'easy', label: 'Easy', max: 15 },
  { level: 2, id: 'medium', label: 'Medium', max: 35 },
  { level: 3, id: 'hard', label: 'Hard', max: Infinity },
] as const;
export type Difficulty = (typeof DIFFICULTY)[number] & { words: number };

/** A level as one dot per level, filled up to it: [true, true, false] for medium. */
export const levelDots = (level: number): boolean[] => DIFFICULTY.map((d) => d.level <= level);

export function difficulty(sections: LyricSection[]): Difficulty {
  const distinct = [...new Set(allLines(sections).map((l) => l.text.replace(/\s*\(x\d+\)/gi, '').trim()))];
  const words = distinct.reduce((n, l) => n + (l.match(/[\p{L}\p{N}']+/gu)?.length ?? 0), 0);
  // The last level's max is Infinity, so a level is always found.
  const level = DIFFICULTY.find((d) => words <= d.max) ?? DIFFICULTY[DIFFICULTY.length - 1];
  return { ...level, words };
}
