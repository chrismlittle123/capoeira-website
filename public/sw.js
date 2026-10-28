// Offline support: every page you visit (and, in the background, every song) is
// kept on the device so lyrics load in the roda even without signal.
const VERSION = 'v1';
const PAGES = `pages-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const CORE = ['/', '/songs/', '/search-index.json', '/glossary/'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(PAGES).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (![PAGES, ASSETS].includes(key)) await caches.delete(key);
      await self.clients.claim();
      // warm the cache with every song page
      try {
        const docs = await (await fetch('/search-index.json')).json();
        const cache = await caches.open(PAGES);
        for (const d of docs) {
          const url = `/songs/${d.id}/`;
          if (!(await cache.match(url))) await cache.add(url).catch(() => {});
        }
      } catch {}
    })(),
  );
});

const networkFirst = async (req, cacheName, timeout = 3500) => {
  const cache = await caches.open(cacheName);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout)),
    ]);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req, { ignoreSearch: true })) ?? (await cache.match('/')) ?? Response.error();
  }
};

const cacheFirst = async (req) => {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/audio/')) return; // let the browser stream (range requests)
  if (req.mode === 'navigate') return e.respondWith(networkFirst(req, PAGES));
  if (url.pathname.startsWith('/_astro/') || /\.(woff2?|svg|png)$/.test(url.pathname)) return e.respondWith(cacheFirst(req));
  if (url.pathname.endsWith('.json')) return e.respondWith(networkFirst(req, PAGES, 2500));
});
