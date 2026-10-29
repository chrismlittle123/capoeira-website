/** Lookups the page scripts share: markup they rely on, and the page's query string. */
/** The element matching `selector` inside `parent`; throws when the markup it relies on is missing. */
export function required<T extends Element = HTMLElement>(parent: ParentNode, selector: string): T {
  const el = parent.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

/** The nearest ancestor of `el` (or `el` itself) matching `selector`; throws when there's none. */
export function requiredClosest<T extends Element = HTMLElement>(el: Element, selector: string): T {
  const found = el.closest<T>(selector);
  if (!found) throw new Error(`missing ${selector} around the element`);
  return found;
}

/** Set each of `params` in the page's URL, or remove it when undefined, without a new history entry. */
export function setQueryParams(params: Record<string, string | undefined>): void {
  const url = new URL(location.href);
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined) url.searchParams.delete(name);
    else url.searchParams.set(name, value);
  }
  history.replaceState(history.state, '', url);
}
