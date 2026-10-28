import MiniSearch, { type SearchResult } from 'minisearch';
import { fold } from '../lib/normalize';
import type { SearchDoc } from '../pages/search-index.json';

// Filler words that would otherwise make every song match an English query.
const STOP = new Set(['i', 'a', 'the', 'to', 'of', 'and', 'my', 'is', 'it', 'in', 'on', 'me', 'you', 'im']);
const term = (t: string) => {
  const f = fold(t);
  return f.length < 2 || STOP.has(f) ? null : f;
};
const queryTerms = (q: string) =>
  q
    .split(/[^\p{L}\p{N}]+/u)
    .map(term)
    .filter((t): t is string => !!t);

const TEXT_FIELDS = new Set(['title', 'alt', 'hook', 'lyrics', 'translation']);
const FACET_LABELS: Record<string, string> = {
  typeName: 'Type',
  toques: 'Toque',
  themes: 'Theme',
  people: 'People',
  places: 'Place',
};

interface Index {
  ms: MiniSearch<SearchDoc>;
  docs: SearchDoc[];
  byId: Map<string, SearchDoc>;
}
let indexPromise: Promise<Index> | undefined;

function loadIndex() {
  indexPromise ??= fetch('/search-index.json')
    .then((r) => r.json() as Promise<SearchDoc[]>)
    .then((docs) => {
      const ms = new MiniSearch<SearchDoc>({
        fields: ['title', 'alt', 'hook', 'lyrics', 'translation', 'typeName', 'toques', 'themes', 'people', 'places'],
        storeFields: ['id'],
        processTerm: term,
        searchOptions: {
          boost: { title: 5, alt: 3, hook: 2.5, lyrics: 1.5, people: 1.5, toques: 0.8, themes: 0.8 },
          prefix: true,
          // only forgive typos in longer words, so "love" doesn't also find "live"
          fuzzy: (t) => (t.length > 4 ? 0.2 : false),
        },
      });
      ms.addAll(docs);
      return { ms, docs, byId: new Map(docs.map((d) => [d.id, d])) };
    });
  indexPromise.catch(() => (indexPromise = undefined)); // allow a retry after a network failure
  return indexPromise;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Fold `text` char-by-char, remembering which original char each folded char came from. */
function foldWithMap(text: string) {
  const chars = [...text];
  const map: number[] = [];
  let folded = '';
  chars.forEach((c, i) => {
    const f = fold(c);
    for (let k = 0; k < f.length; k++) map.push(i);
    folded += f;
  });
  return { chars, map, folded };
}

const isLetter = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

/** Start offsets (in folded text) where `t` begins a word. */
function wordStarts(folded: string, t: string) {
  const out: number[] = [];
  let at = folded.indexOf(t);
  while (at !== -1) {
    if (!isLetter(folded[at - 1])) out.push(at);
    at = folded.indexOf(t, at + 1);
  }
  return out;
}

/** Highlight words starting with any of `terms`, matching accent-insensitively. */
function highlight(text: string, terms: string[]) {
  if (!terms.length) return esc(text);
  const { chars, map, folded } = foldWithMap(text);
  const hits = new Array(chars.length).fill(false);
  for (const t of terms) for (const at of wordStarts(folded, t)) for (let k = at; k < at + t.length; k++) hits[map[k]] = true;
  let out = '';
  let open = false;
  chars.forEach((c, i) => {
    if (hits[i] && !open) (out += '<mark>'), (open = true);
    if (!hits[i] && open) (out += '</mark>'), (open = false);
    out += esc(c);
  });
  return open ? out + '</mark>' : out;
}

const countHits = (s: string, terms: string[]) => {
  const f = fold(s);
  return terms.filter((t) => wordStarts(f, t).length).length;
};

/** The lyric line that matches the most terms (ties go to the earliest line). */
function snippet(doc: SearchDoc, terms: string[]) {
  let best = doc.hook;
  let max = 0;
  for (const line of doc.lines) {
    const n = countHits(line, terms);
    if (n > max) (best = line), (max = n);
  }
  return max && (max >= countHits(doc.title, terms) || max === terms.length) ? best : doc.hook;
}

function card(doc: SearchDoc, terms: string[], i: number, why?: string) {
  const line = snippet(doc, terms);
  return `<li style="--i:${i}"><a class="card" href="/songs/${doc.id}/">
    <div class="meta"><span class="chip chip-type">${esc(doc.typeName)}</span>${
      doc.media ? `<span class="has-audio">${doc.media.icon} ${doc.media.label}</span>` : ''
    }</div>
    <h3>${highlight(doc.title, terms)}</h3>
    <p class="hook">${highlight(line, terms)}</p>
    ${why ? `<p class="why">${why}</p>` : ''}
  </a></li>`;
}

/** If a song matched (partly) through its toque/theme/etc., say so. */
function explain(r: SearchResult, doc: SearchDoc, terms: string[]) {
  // only when some part of the query was found nowhere in the title or lyrics
  const facetOnly = Object.values(r.match).filter((fields) => !fields.some((f) => TEXT_FIELDS.has(f)));
  if (!facetOnly.length) return undefined;
  const fields = new Set(facetOnly.flat());
  const parts = [...fields]
    .filter((f) => FACET_LABELS[f])
    .map((f) => `${FACET_LABELS[f]}: ${highlight(String(doc[f as keyof SearchDoc]), terms)}`);
  return parts.join(' · ') || undefined;
}

function init(root: HTMLElement) {
  if (root.dataset.ready) return;
  root.dataset.ready = '1';
  const input = root.querySelector<HTMLInputElement>('input[type=search]')!;
  const results = root.querySelector<HTMLElement>('[data-results]')!;
  const status = root.querySelector<HTMLElement>('[data-status]')!;
  const filters = [...root.querySelectorAll<HTMLButtonElement>('[data-filter]')];
  const filterNames = new Map(filters.map((b) => [b.dataset.filter!, b.dataset.label ?? b.dataset.filter!]));
  const browse = root.hasAttribute('data-inline') ? document.querySelector<HTMLElement>('[data-browse]') : null;
  const syncUrl = root.hasAttribute('data-sync-url');
  let active = '';
  let runId = 0;

  const run = async () => {
    const id = ++runId;
    const q = input.value.trim();
    const terms = queryTerms(q);
    root.classList.toggle('has-text', !!q);
    if (syncUrl) {
      const url = new URL(location.href);
      q ? url.searchParams.set('q', q) : url.searchParams.delete('q');
      active ? url.searchParams.set('type', active) : url.searchParams.delete('type');
      history.replaceState(history.state, '', url);
    }
    if (!terms.length && !active) {
      results.innerHTML = '';
      status.textContent = q ? 'Keep typing…' : '';
      browse?.removeAttribute('hidden');
      return;
    }
    browse?.setAttribute('hidden', '');
    const { ms, byId } = await loadIndex();
    if (id !== runId) return; // a newer keystroke won
    const filter = active ? (r: SearchResult) => byId.get(r.id)?.type === active : undefined;
    let hits: { doc: SearchDoc; r?: SearchResult }[];
    if (terms.length) {
      const query = terms.join(' ');
      let res = ms.search(query, { combineWith: 'AND', filter });
      if (!res.length) {
        res = ms.search(query, { combineWith: 'OR', filter });
        res = res.filter((r) => r.score >= res[0].score * 0.3);
      }
      hits = res.map((r) => ({ doc: byId.get(r.id)!, r }));
    } else {
      hits = [...byId.values()].filter((d) => d.type === active).map((doc) => ({ doc }));
    }
    results.innerHTML = hits
      .map(({ doc, r }, i) => {
        // highlight the words the index actually matched too (covers typos and prefixes)
        const marks = r ? [...new Set([...terms, ...r.terms])] : terms;
        return card(doc, marks, i, r && explain(r, doc, marks));
      })
      .join('');
    const inType = active ? ` in ${esc(filterNames.get(active)!)}` : '';
    status.innerHTML = hits.length
      ? `${hits.length} song${hits.length === 1 ? '' : 's'}${inType}`
      : `<span class="empty">Ninguém cantou essa ainda…<small>No songs match “${esc(q)}”${inType}. ${
          active ? 'Try clearing the filter, or' : 'Try'
        } fewer words — or just the coro.</small></span>`;
  };

  let timer: number | undefined;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = window.setTimeout(run, 80);
  });
  root.querySelector('form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearTimeout(timer);
    await run(); // never act on results from an older query
    const first = results.querySelector<HTMLAnchorElement>('a');
    if (first) location.href = first.href;
  });
  for (const btn of filters) {
    btn.addEventListener('click', () => {
      active = active === btn.dataset.filter ? '' : btn.dataset.filter!;
      filters.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === active)));
      run();
    });
  }
  input.addEventListener('focus', () => loadIndex(), { once: true });

  if (syncUrl) {
    const params = new URLSearchParams(location.search);
    input.value = params.get('q') ?? '';
    const type = params.get('type') ?? '';
    active = filterNames.has(type) ? type : '';
    filters.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === active)));
    if (input.value || active || type) run();
  }
}

document.querySelectorAll<HTMLElement>('[data-search]').forEach(init);

// "/" or ⌘K anywhere opens search
const dialog = document.querySelector<HTMLDialogElement>('#search-dialog');
let opener: HTMLElement | null = null;
export function openSearch() {
  const inline = document.querySelector<HTMLInputElement>('[data-search][data-inline] input');
  if (inline) {
    inline.focus();
    inline.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }
  if (!dialog || dialog.open) return;
  opener = document.activeElement as HTMLElement | null;
  dialog.showModal();
  const input = dialog.querySelector('input');
  input?.focus();
  input?.select();
}
document.querySelectorAll('[data-open-search]').forEach((b) => b.addEventListener('click', openSearch));
document.addEventListener('keydown', (e) => {
  const typing = (e.target as HTMLElement).closest('input, textarea, [contenteditable]');
  if ((e.key === '/' && !typing) || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
    e.preventDefault();
    openSearch();
  }
});
dialog?.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close();
});
dialog?.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());
// Escape closes the dialog in one press (instead of first clearing the input) and keeps the query.
dialog?.querySelector('input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    dialog.close();
  }
});
dialog?.addEventListener('close', () => opener?.focus?.());
