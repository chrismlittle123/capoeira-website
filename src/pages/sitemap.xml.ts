import type { APIRoute } from 'astro';
import { getSongs, getTaxonomy } from '../lib/content/songs';
import { TAXONOMY_KEYS } from '../lib/content/facets';
import { PAGES, facetUrl, songUrl } from '../lib/content/urls';

export const GET: APIRoute = async ({ site }) => {
  const songs = await getSongs();
  const paths: string[] = [...Object.values(PAGES), ...songs.map((s) => songUrl(s.id))];
  for (const key of TAXONOMY_KEYS) {
    paths.push(facetUrl(key));
    for (const e of await getTaxonomy(key)) paths.push(facetUrl(key, e.id));
  }
  const lastmod = new Map(songs.map((s) => [songUrl(s.id), (s.data.updated ?? s.data.added).toISOString().slice(0, 10)]));
  const urls = paths
    .map((p) => {
      const mod = lastmod.get(p);
      return `  <url><loc>${new URL(p, site).href}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ''}</url>`;
    })
    .join('\n');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml' } },
  );
};
