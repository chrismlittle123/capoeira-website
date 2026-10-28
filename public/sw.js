// Offline support: the whole songbook (pages, styles, scripts, fonts, search index) is
// cached on install, so lyrics load in the roda even without signal. Audio isn't cached.
//
// __VERSION__ and __PRECACHE__ are filled in at build time (see astro.config.mjs): the
// version is a hash of every cached file, so any new or edited song triggers a refresh.
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = `songbook-${VERSION}`;
const OFFLINE = '/offline/';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

/**
 * Network first, so lyrics are always fresh when online. If the network is slow we answer
 * from the cache after `timeout` ms, but still let the network response update the cache.
 */
function networkFirst(e, { timeout, fallback }) {
  const req = e.request;
  const network = fetch(req).then(async (res) => {
    if (res.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(req, res.clone());
    }
    return res;
  });
  e.waitUntil(network.catch(() => {}));

  return new Promise((resolve) => {
    let done = false;
    const finish = (res) => !done && ((done = true), resolve(res));
    const fromCache = () => caches.match(req, { ignoreSearch: true });

    const timer = setTimeout(async () => {
      const hit = await fromCache();
      if (hit) finish(hit); // otherwise keep waiting for the network
    }, timeout);

    network.then(
      (res) => {
        clearTimeout(timer);
        finish(res);
      },
      async () => {
        clearTimeout(timer);
        finish((await fromCache()) ?? (await fallback()));
      },
    );
  });
}

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/audio/')) return; // let the browser stream it (range requests)

  if (req.mode === 'navigate') {
    e.respondWith(
      networkFirst(e, {
        timeout: 3000,
        fallback: async () => (await caches.match(OFFLINE)) ?? Response.error(),
      }),
    );
  } else if (url.pathname.startsWith('/_astro/')) {
    e.respondWith(cacheFirst(req)); // content-hashed, never changes
  } else if (url.pathname.endsWith('.json')) {
    e.respondWith(networkFirst(e, { timeout: 2500, fallback: async () => Response.error() }));
  } else if (/\.(png|svg|webmanifest)$/.test(url.pathname)) {
    e.respondWith(cacheFirst(req));
  }
});
