import MiniSearch, { type SearchResult } from 'minisearch';
import { fold } from '../lib/normalize';
import type { SearchDoc } from '../pages/search-index.json';

// Filler words that would otherwise make every song match an English query.
const STOP = new Set(['i', 'a', 'the', 'to', 'of', 'and', 'my', 'is', 'it', 'in', 'on', 'me', 'you', 'im']);
const term = (t: string) => {
  const f = fold(t);
  return f.length < 2 || STOP.has(f) ? null : f;
};

let indexPromise: Promise<{ ms: MiniSearch<SearchDoc>; docs: SearchDoc[] }> | undefined;

function loadIndex() {
  indexPromise ??= fetch('/search-index.json')
    .then((r) => r.json() as Promise<SearchDoc[]>)
    .then((docs) => {
      const ms = new MiniSearch<SearchDoc>({
        fields: ['title', 'alt', 'hook', 'lyrics', 'translation', 'typeName', 'toques', 'themes', 'people', 'places'],
        storeFields: ['id'],
        processTerm: term,
        searchOptions: {
          boost: { title: 5, alt: 3, hook: 2.5, lyrics: 1.5, people: 1.5 },
          prefix: true,
          fuzzy: (term) => (term.length > 3 ? 0.2 : false),
        },
      });
      ms.addAll(docs);
      return { ms, docs };
    });
  return indexPromise;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Highlight query terms in `text`, matching accent-insensitively. */
function highlight(text: string, terms: string[]) {
  if (!terms.length) return esc(text);
  // fold char-by-char so indices line up with the original string
  const chars = [...text];
  const map: number[] = [];
  let folded = '';
  chars.forEach((c, i) => {
    const f = fold(c);
    for (let k = 0; k < f.length; k++) map.push(i);
    folded += f;
  });
  const hits = new Array(chars.length).fill(false);
  for (const t of terms) {
    let from = 0;
    let at: number;
    while ((at = folded.indexOf(t, from)) !== -1) {
      for (let k = at; k < at + t.length; k++) hits[map[k]] = true;
      from = at + t.length;
    }
  }
  let out = '';
  let open = false;
  chars.forEach((c, i) => {
    if (hits[i] && !open) (out += '<mark>'), (open = true);
    if (!hits[i] && open) (out += '</mark>'), (open = false);
    out += esc(c);
  });
  return open ? out + '</mark>' : out;
}

/** The lyric line that matches the most query terms (ties go to the earliest line). */
function snippet(doc: SearchDoc, terms: string[]) {
  const hits = (s: string) => terms.filter((t) => fold(s).includes(t)).length;
  let best = doc.hook;
  let max = 0;
  for (const line of doc.lines) {
    const n = hits(line);
    if (n > max) (best = line), (max = n);
  }
  return max >= hits(doc.title) || max === terms.length ? best : doc.hook;
}

function card(doc: SearchDoc, terms: string[], i: number) {
  const line = snippet(doc, terms);
  return `<li style="--i:${i}"><a class="card" href="/songs/${doc.id}/">
    <div class="meta"><span class="chip chip-type">${esc(doc.typeName)}</span>${
      doc.audio ? '<span class="has-audio" title="Has audio">♪ audio</span>' : ''
    }</div>
    <h3>${highlight(doc.title, terms)}</h3>
    <p class="hook">${highlight(line, terms)}</p>
  </a></li>`;
}

function init(root: HTMLElement) {
  if (root.dataset.ready) return;
  root.dataset.ready = '1';
  const input = root.querySelector<HTMLInputElement>('input[type=search]')!;
  const results = root.querySelector<HTMLElement>('[data-results]')!;
  const status = root.querySelector<HTMLElement>('[data-status]')!;
  const filters = [...root.querySelectorAll<HTMLButtonElement>('[data-filter]')];
  const browse = document.querySelector<HTMLElement>('[data-browse]');
  const syncUrl = root.hasAttribute('data-sync-url');
  let active = '';

  const run = async () => {
    const q = input.value.trim();
    if (syncUrl) {
      const url = new URL(location.href);
      q ? url.searchParams.set('q', q) : url.searchParams.delete('q');
      active ? url.searchParams.set('type', active) : url.searchParams.delete('type');
      history.replaceState(history.state, '', url);
    }
    if (!q && !active) {
      results.innerHTML = '';
      status.textContent = '';
      browse?.removeAttribute('hidden');
      root.classList.remove('has-query');
      return;
    }
    browse?.setAttribute('hidden', '');
    root.classList.add('has-query');
    const { ms, docs } = await loadIndex();
    if (input.value.trim() !== q) return; // a newer keystroke won
    const filter = active ? (r: SearchResult) => docs.find((d) => d.id === r.id)?.type === active : undefined;
    let hits: SearchDoc[];
    if (q) {
      let res = ms.search(q, { combineWith: 'AND', filter });
      if (!res.length) {
        res = ms.search(q, { combineWith: 'OR', filter });
        res = res.filter((r) => r.score >= res[0].score * 0.3);
      }
      hits = res.map((r) => docs.find((d) => d.id === r.id)!);
    } else {
      hits = docs.filter((d) => d.type === active);
    }
    const terms = q.split(/[^\p{L}\p{N}]+/u).map(term).filter((t): t is string => !!t);
    results.innerHTML = hits.map((d, i) => card(d, terms, i)).join('');
    status.innerHTML = hits.length
      ? `${hits.length} song${hits.length === 1 ? '' : 's'}`
      : `<span class="empty">Ninguém cantou essa ainda… <br><small>No songs match “${esc(q)}”. Try fewer words, or just the coro.</small></span>`;
  };

  let t: number | undefined;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = window.setTimeout(run, 80);
  });
  root.querySelector('form')!.addEventListener('submit', (e) => {
    e.preventDefault();
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
    active = params.get('type') ?? '';
    filters.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === active)));
    if (input.value || active) run();
  }
}

document.querySelectorAll<HTMLElement>('[data-search]').forEach(init);

// "/" or ⌘K anywhere opens search
const dialog = document.querySelector<HTMLDialogElement>('#search-dialog');
export function openSearch() {
  const inline = document.querySelector<HTMLInputElement>('[data-search][data-inline] input');
  if (inline) {
    inline.focus();
    inline.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }
  if (!dialog) return;
  dialog.showModal();
  dialog.querySelector('input')?.focus();
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
