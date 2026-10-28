// @ts-check
import { defineConfig } from 'astro/config';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Fill in the service worker's precache list and version after the build. */
function serviceWorker() {
  return {
    name: 'songbook-service-worker',
    hooks: {
      /** @param {{ dir: URL }} options */
      'astro:build:done': async ({ dir }) => {
        const root = fileURLToPath(dir);
        /** @type {string[]} */
        const files = [];
        const walk = async (/** @type {string} */ d) => {
          for (const entry of await readdir(d, { withFileTypes: true })) {
            const p = join(d, entry.name);
            if (entry.isDirectory()) await walk(p);
            else files.push(p);
          }
        };
        await walk(root);

        const wanted = (/** @type {string} */ rel) =>
          !rel.startsWith('audio/') &&
          !rel.startsWith('api/') &&
          rel !== 'sw.js' &&
          rel !== '404.html' &&
          // fonts: only the latin subsets the songbook actually uses
          (!rel.endsWith('.woff2') || /-latin-(?!ext)/.test(rel)) &&
          /\.(html|css|js|json|woff2|svg|png|webmanifest)$/.test(rel);

        const hash = createHash('sha256');
        /** @type {string[]} */
        const urls = [];
        for (const file of files.sort()) {
          const rel = relative(root, file).split(sep).join('/');
          if (!wanted(rel)) continue;
          hash.update(rel).update(await readFile(file));
          urls.push('/' + rel.replace(/(^|\/)index\.html$/, '$1'));
        }

        const swPath = join(root, 'sw.js');
        const sw = await readFile(swPath, 'utf8');
        await writeFile(
          swPath,
          sw
            .replace("const VERSION = '__VERSION__';", `const VERSION = '${hash.digest('hex').slice(0, 12)}';`)
            .replace('const PRECACHE = __PRECACHE__;', `const PRECACHE = ${JSON.stringify(urls)};`),
        );
      },
    },
  };
}

export default defineConfig({
  // Set this to your real domain once deployed (used for canonical URLs, sitemap, JSON-LD).
  site: 'https://example.com',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  integrations: [serviceWorker()],
});
