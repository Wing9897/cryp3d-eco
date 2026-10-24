const CACHE = 'cryp3d-eco-v2';

function underScope(path) {
  const scope = self.registration?.scope || new URL('./', self.location).href;
  return new URL(path, scope).href;
}

const CORE = [
  underScope('./'),
  underScope('index.html'),
  underScope('manifest.webmanifest'),
  underScope('icons/favicon-32.png'),
  underScope('icons/icon-192.png'),
  underScope('icons/icon-512.png'),
  underScope('icons/icon-maskable-512.png'),
  underScope('icons/apple-touch-icon.png'),
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.all(CORE.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function cachePage(response) {
  if (!response || !response.ok || response.type !== 'basic') return;
  const cache = await caches.open(CACHE);
  await cache.put(underScope('index.html'), response.clone());
}

async function cachedPage() {
  return (
    (await caches.match(underScope('index.html'), { ignoreSearch: true })) ||
    (await caches.match(underScope('./'), { ignoreSearch: true }))
  );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // The original navigation request uses redirect:manual. Passing it
          // straight through turns GitHub Pages' slash redirect into a failed launch.
          const response = await fetch(request.url, { credentials: 'same-origin' });
          await cachePage(response).catch(() => undefined);
          return response;
        } catch {
          const cached = await cachedPage();
          if (cached) return cached;
          return new Response('暫時打不開。請連上網路後再試一次。', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
      })(),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(() => cached || new Response('', { status: 504 }));
      return cached || fetched;
    }),
  );
});
