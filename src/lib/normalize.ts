/** The songs' language, for sorting, case-folding and lang="" attributes. */
export const LOCALE = 'pt-BR';

/** Portuguese alphabetical order: "Água" sorts with the a's, not after "Z". */
export const compareText = (a: string, b: string) => a.localeCompare(b, LOCALE);

/** Lower-case and strip accents so "sao bento" finds "São Bento" and "ie" finds "Iê". */
export const fold = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
