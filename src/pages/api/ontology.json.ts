import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

const KEYS = ['songTypes', 'toques', 'themes', 'people', 'places', 'glossary'] as const;

export const GET: APIRoute = async () => {
  const out: Record<string, Record<string, unknown>> = {};
  for (const key of KEYS) {
    out[key] = Object.fromEntries((await getCollection(key)).map((e) => [e.id, e.data]));
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { 'Content-Type': 'application/json' } });
};
