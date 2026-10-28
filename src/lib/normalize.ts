/** Lower-case and strip accents so "sao bento" finds "São Bento" and "ie" finds "Iê". */
export const fold = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
