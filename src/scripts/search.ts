import MiniSearch, { type SearchResult } from 'minisearch';
import { escapeHtml as esc, highlight, queryTerms, searchTerm, snippet } from '../lib/search-text';
import { DIFFICULTY } from '../lib/lyrics';
import { parseSearchDocs, type SearchDoc } from '../lib/search-doc';
import { required } from './dom';

const TEXT_FIELDS = new Set(['title', 'alt', 'hook', 'lyrics', 'translation']);
const FACET_LABELS: Record<string, string> = {
  themes: 'Theme',
  people: 'People',
  places: 'Place',
};

type Level = (typeof DIFFICULTY)[number];
const levelById = (id: string | null | undefined): Level | undefined => DIFFICULTY.find((d) => d.id === id);

interface Index {
  mini: MiniSearch<SearchDoc>;
  docs: SearchDoc[];
  byId: Map<string, SearchDoc>;
}
let indexPromise: Promise<Index> | undefined;

function loadIndex() {
  indexPromise ??= fetch('/search-index.json')
    .then(async (r) => {
      if (!r.ok) throw new Error(`search index: HTTP ${r.status}`);
      return parseSearchDocs(await r.json());
    })
    .then((docs) => {
      const mini = new MiniSearch<SearchDoc>({
        fields: ['title', 'alt', 'hook', 'lyrics', 'translation', 'themes', 'people', 'places'],
        storeFields: ['id'],
        processTerm: searchTerm,
        searchOptions: {
          boost: { title: 5, alt: 3, hook: 2.5, lyrics: 1.5, people: 1.5, themes: 0.8 },
          prefix: true,
          // only forgive typos in longer words, so "love" doesn't also find "live"
          fuzzy: (t) => (t.length > 4 ? 0.2 : false),
        },
      });
      mini.addAll(docs);
      return { mini, docs, byId: new Map(docs.map((d) => [d.id, d])) };
    });
  indexPromise.catch(() => (indexPromise = undefined)); // allow a retry after a network failure
  return indexPromise;
}

function card(doc: SearchDoc, terms: string[], i: number, why?: string) {
  const line = snippet(doc, terms);
  return `<li style="--i:${i}"><a class="card" href="/songs/${doc.id}/">
    <div class="meta"><span class="dl" title="${esc(doc.levelLabel)}">${'●'.repeat(doc.level)}${'○'.repeat(DIFFICULTY.length - doc.level)} ${esc(doc.levelLabel)}</span>${
      doc.media ? `<span class="has-audio">${esc(doc.media.icon)} ${esc(doc.media.label)}</span>` : ''
    }</div>
    <h3>${highlight(doc.title, terms)}</h3>
    <p class="hook">${highlight(line, terms)}</p>
    ${why ? `<p class="why">${why}</p>` : ''}
  </a></li>`;
}

/** If a song matched (partly) through its theme/people/places, say so. */
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
  const input = required<HTMLInputElement>(root, 'input[type=search]');
  const results = required(root, '[data-results]');
  const status = required(root, '[data-status]');
  const levelButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-level]')];
  let level: Level | undefined;
  const browse = root.hasAttribute('data-inline') ? document.querySelector<HTMLElement>('[data-browse]') : null;
  const syncUrl = root.hasAttribute('data-sync-url');
  const showLevel = () =>
    levelButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.level === level?.id)));
  let runId = 0;

  const run = async () => {
    const id = ++runId;
    const q = input.value.trim();
    const terms = queryTerms(q);
    root.classList.toggle('has-text', !!q);
    if (syncUrl) {
      const url = new URL(location.href);
      if (q) url.searchParams.set('q', q);
      else url.searchParams.delete('q');
      // links shared before difficulty levels replaced the song-type filter
      url.searchParams.delete('type');
      if (level) url.searchParams.set('level', level.id);
      else url.searchParams.delete('level');
      history.replaceState(history.state, '', url);
    }
    if (!terms.length && !level) {
      results.innerHTML = '';
      status.textContent = q ? 'Keep typing…' : '';
      browse?.removeAttribute('hidden');
      return;
    }
    browse?.setAttribute('hidden', '');
    let index: Index;
    try {
      index = await loadIndex();
    } catch {
      if (id !== runId) return;
      results.innerHTML = '';
      status.textContent = "Couldn't load the songs to search — are you offline? Try again in a moment.";
      return;
    }
    if (id !== runId) return; // a newer keystroke won
    const { mini, byId } = index;
    const matches = (d?: SearchDoc) => !!d && (!level || d.level === level.level);
    const filter = level ? (r: SearchResult) => matches(byId.get(r.id)) : undefined;
    let hits: { doc: SearchDoc; r?: SearchResult }[];
    if (terms.length) {
      const query = terms.join(' ');
      let res = mini.search(query, { combineWith: 'AND', filter });
      if (!res.length) {
        res = mini.search(query, { combineWith: 'OR', filter });
        const top = res[0]?.score ?? 0;
        res = res.filter((r) => r.score >= top * 0.3);
      }
      hits = res.flatMap((r) => {
        const doc = byId.get(r.id);
        return doc ? [{ doc, r }] : [];
      });
    } else {
      hits = [...byId.values()].filter((d) => matches(d)).map((doc) => ({ doc }));
    }
    results.innerHTML = hits
      .map(({ doc, r }, i) => {
        // highlight the words the index actually matched too (covers typos and prefixes)
        const marks = r ? [...new Set([...terms, ...r.terms])] : terms;
        return card(doc, marks, i, r && explain(r, doc, marks));
      })
      .join('');
    const inLevel = level ? ` in ${esc(level.label)}` : '';
    status.innerHTML = hits.length
      ? `${hits.length} song${hits.length === 1 ? '' : 's'}${inLevel}`
      : `<span class="empty">Ninguém cantou essa ainda…<small>No songs match “${esc(q)}”${inLevel}. ${
          level ? 'Try clearing the filter, or' : 'Try'
        } fewer words — or just the coro.</small></span>`;
  };

  let timer: number | undefined;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = window.setTimeout(run, 80);
  });
  required(root, 'form').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearTimeout(timer);
    await run(); // never act on results from an older query
    const first = results.querySelector<HTMLAnchorElement>('a');
    if (first) location.href = first.href;
  });
  for (const btn of levelButtons) {
    btn.addEventListener('click', () => {
      level = level?.id === btn.dataset.level ? undefined : levelById(btn.dataset.level);
      showLevel();
      run();
    });
  }
  // Fetch the index early; a failure is shown when a search needs it.
  input.addEventListener('focus', () => loadIndex().catch(() => undefined), { once: true });

  if (syncUrl) {
    const params = new URLSearchParams(location.search);
    input.value = params.get('q') ?? '';
    level = levelById(params.get('level'));
    showLevel();
    if (input.value || level) run();
  }
}

document.querySelectorAll<HTMLElement>('[data-search]').forEach(init);

// "/" or ⌘K anywhere opens search
const dialog = document.querySelector<HTMLDialogElement>('#search-dialog');
let opener: HTMLElement | null = null;
function openSearch() {
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
