// sw.js
const CACHE = 'pb-v2'; // bump so the new cache is used
const CORE = [
  './',
  'index.html',
  'add-book.html',
  'edit-page.html',
  'stats.html',
  'buddy-read.html',
  'style.css',
  'script.js',
  'manifest.json',
  'icons/192.png',   // <- fixed
  'icons/512.png'    // <- fixed
];

// (rest of your SW can stay exactly as you had it)


// Install: pre-cache core shell
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)));
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for HTML, cache-first for assets, runtime for CDNs
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const accept = req.headers.get('accept') || '';
  const isHTML = accept.includes('text/html');

  if (isHTML) {
    // Network first (so you get latest pages), fallback to cache
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('index.html')))
    );
    return;
  }

  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // Same-origin assets: cache first
    event.respondWith(
      caches.match(req).then(hit => {
        if (hit) return hit;
        return fetch(req).then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        });
      })
    );
  } else {
    // Cross-origin (e.g., pdf.js/jszip/epub.js CDNs): runtime cache (opaque is fine)
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
        return res;
      }).catch(() => caches.match(req))
    );
  }
});
