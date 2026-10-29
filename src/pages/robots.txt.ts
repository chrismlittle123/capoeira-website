import type { APIRoute } from 'astro';
import { SITEMAP_URL } from '../lib/urls';

export const GET: APIRoute = ({ site }) =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${new URL(SITEMAP_URL, site).href}\n`, {
    headers: { 'Content-Type': 'text/plain' },
  });
