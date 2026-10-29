/** The popover explaining a glossary word linked in the lyrics (src/components/Lyrics.astro). */
import { parseGlossaryData, type GlossaryEntry } from '../lib/lyrics/glossary-links';
import { glossaryUrl } from '../lib/content/urls';
import { required } from './dom';

// id → { term, definition } for the glossary words on this page; none when no word is linked
const dataEl = document.querySelector('#glossary-data');
const entries = dataEl ? parseGlossaryData(JSON.parse(dataEl.textContent || '{}')) : new Map<string, GlossaryEntry>();
const pop = required(document, '.gloss-pop');
let current: HTMLElement | null = null;
const hide = () => {
  pop.hidden = true;
  current?.setAttribute('aria-expanded', 'false');
  current = null;
};
document.addEventListener('click', (e) => {
  if (!(e.target instanceof Element) || e.target.closest('.gloss-pop')) return;
  const btn = e.target.closest<HTMLElement>('.gloss');
  if (!btn) return hide();
  if (btn === current) return hide();
  const id = btn.dataset.term;
  const g = id ? entries.get(id) : undefined;
  // Lyrics.astro embeds every word it links, so a miss means the two have drifted apart.
  if (!id || !g) throw new Error(`glossary: no entry for the linked word "${id ?? ''}"`);
  pop.innerHTML = '';
  const b = document.createElement('strong');
  b.textContent = g.term;
  const p = document.createElement('span');
  p.textContent = g.definition;
  const more = document.createElement('a');
  more.href = glossaryUrl(id);
  more.textContent = 'All words →';
  pop.append(b, p, more);
  pop.hidden = false;
  const r = btn.getBoundingClientRect();
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;
  const vw = document.documentElement.clientWidth; // excludes the scrollbar
  pop.style.left = `${Math.max(12, Math.min(vw - w - 12, r.left + r.width / 2 - w / 2)) + scrollX}px`;
  // open above the word when there isn't room below
  const below = r.bottom + 8 + h < innerHeight || r.top - 8 - h < 0;
  pop.style.top = `${(below ? r.bottom + 8 : r.top - 8 - h) + scrollY}px`;
  current?.setAttribute('aria-expanded', 'false');
  current = btn;
  btn.setAttribute('aria-expanded', 'true');
});
addEventListener('resize', hide);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hide();
  const el = e.target;
  if ((e.key === 'Enter' || e.key === ' ') && el instanceof HTMLElement && el.classList.contains('gloss')) {
    e.preventDefault();
    el.click();
  }
});
