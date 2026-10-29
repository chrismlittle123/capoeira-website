/** The glossary page's filter box (src/pages/glossary.astro), kept in the URL as ?q=. */
import { containsAllWords } from '../lib/search-text';
import { required, setQueryParams } from './dom';

const form = required<HTMLFormElement>(document, '[data-glossary-search]');
const input = required<HTMLInputElement>(form, 'input');
const status = required(document, '[data-status]');
// each term's folded text (term, forms and definition) is in its data-text
const items = [...document.querySelectorAll<HTMLElement>('[data-terms] > div')];

function filter() {
  const query = input.value;
  let shown = 0;
  for (const el of items) {
    const hit = containsAllWords(el.dataset.text ?? '', query);
    el.hidden = !hit;
    if (hit) shown++;
  }
  const searching = query.trim() !== '';
  status.textContent = !searching ? '' : shown ? `${shown} of ${items.length} terms` : 'No terms match.';
  setQueryParams({ q: searching ? query : undefined });
}

input.value = new URLSearchParams(location.search).get('q') ?? '';
input.addEventListener('input', filter);
form.addEventListener('submit', (e) => e.preventDefault());
if (input.value) filter();
