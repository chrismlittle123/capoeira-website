/** Small text helpers shared across the site. */

/** "1 song", "3 songs" */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const HTML_ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** `s` safe to put in HTML text or a quoted attribute. */
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => HTML_ENTITIES[c] ?? c);
