/** Linking glossary words inside lyrics (src/components/Lyrics.astro). */
import { escapeHtml } from '../search/search-text.ts';
import { LOCALE } from '../normalize.ts';

export interface GlossaryWord {
  id: string;
  /** the headword and its other spellings/inflections */
  forms: string[];
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A function turning a lyric line into HTML with each glossary word wrapped in a
 * `.gloss` button. Each word is linked once, where it first appears across all the
 * lines it's given; longer forms win, so "volta do mundo" beats "mundo".
 * `used` collects the ids linked so far.
 */
export function glossaryLinker(words: GlossaryWord[]) {
  const forms = words.flatMap(({ id, forms }) => forms.map((f) => ({ f, id }))).sort((a, b) => b.f.length - a.f.length);
  const byForm = new Map(forms.map(({ f, id }) => [f.toLocaleLowerCase(LOCALE), id]));
  const re = forms.length
    ? new RegExp(`(?<![\\p{L}])(${forms.map(({ f }) => escapeRegExp(f)).join('|')})(?![\\p{L}])`, 'giu')
    : null;
  const used = new Set<string>();

  const link = (text: string) => {
    if (!re) return escapeHtml(text);
    let out = '';
    let last = 0;
    for (const m of text.matchAll(re)) {
      const id = byForm.get(m[0].toLocaleLowerCase(LOCALE));
      if (!id || used.has(id)) continue; // explain each word once, where it first appears
      used.add(id);
      out +=
        escapeHtml(text.slice(last, m.index)) +
        `<span class="gloss" role="button" tabindex="0" aria-expanded="false" aria-controls="gloss-pop" data-term="${escapeHtml(id)}">${escapeHtml(m[0])}</span>`;
      last = m.index + m[0].length;
    }
    return out + escapeHtml(text.slice(last));
  };
  return { link, used };
}

/** A glossary word as the lyrics page embeds it for its popover. */
export interface GlossaryEntry {
  term: string;
  definition: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The page's id → entry map (#glossary-data); throws when it isn't one. */
export function parseGlossaryData(data: unknown): Map<string, GlossaryEntry> {
  if (!isRecord(data)) throw new Error('glossary data: expected a map of id → entry');
  const entries = new Map<string, GlossaryEntry>();
  for (const [id, g] of Object.entries(data)) {
    if (!isRecord(g) || typeof g.term !== 'string' || typeof g.definition !== 'string') {
      throw new Error(`glossary data: "${id}" needs a term and a definition`);
    }
    entries.set(id, { term: g.term, definition: g.definition });
  }
  return entries;
}
