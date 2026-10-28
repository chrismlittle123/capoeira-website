// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  // Set this to your real domain once deployed (used for canonical URLs, sitemap, JSON-LD).
  site: 'https://example.com',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
});
