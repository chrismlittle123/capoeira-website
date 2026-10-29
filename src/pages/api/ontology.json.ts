import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { TAXONOMY_KEYS } from '../../lib/facets';
import { facetUrl, glossaryUrl } from '../../lib/urls';
import { SITE } from '../../site.config';

export const GET: APIRoute = async ({ site }) => {
  const out: Record<string, Record<string, unknown>> = {};
  for (const key of TAXONOMY_KEYS) {
    out[key] = Object.fromEntries(
      (await getCollection(key)).map((e) => [e.id, { ...e.data, url: new URL(facetUrl(key, e.id), site).href }]),
    );
  }
  out.glossary = Object.fromEntries(
    (await getCollection('glossary')).map((e) => [e.id, { ...e.data, url: new URL(glossaryUrl(e.id), site).href }]),
  );
  const body = {
    name: `${SITE.title} — ontology`,
    license: SITE.license,
    licenseUrl: SITE.licenseUrl,
    generated: new Date().toISOString(),
    ...out,
  };
  return new Response(JSON.stringify(body, null, 2), { headers: { 'Content-Type': 'application/json' } });
};
