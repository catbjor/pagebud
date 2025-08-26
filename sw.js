// sw.js
const CACHE = 'pb-v6'; // ⬅️ bump this on every release

const CORE = [
  './','index.html','add-book.html','edit-page.html','stats.html','buddy-read.html',
  'style.css','script.js','manifest.json','icons/192.png','icons/512.png',
  'icons/icon-192.png','icons/icon-512.png' // keep both if you have both
];

// Install: pre-cache core shell
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)));
  self.skipWaiting();
});

// Activate: clean old caches + claim + notify pages
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    // 🔔 tell all open tabs/apps that a new version is active
    const clients = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
    for (const client of clients) client.postMessage({ type:'SW_ACTIVATED', version:CACHE });
  })());
});

// Fetch: (same as you have)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const accept = req.headers.get('accept') || '';
  const isHTML = accept.includes('text/html');

  if (isHTML) {
    event.respondWith(
      fetch(req).then(res => { caches.open(CACHE).then(c=>c.put(req, res.clone())); return res; })
                .catch(()=> caches.match(req).then(r=> r || caches.match('index.html')))
    );
    return;
  }
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        caches.open(CACHE).then(c=>c.put(req, res.clone())); return res;
      }))
    );
  } else {
    event.respondWith(
      fetch(req).then(res => { caches.open(CACHE).then(c=>c.put(req, res.clone())); return res; })
                .catch(()=> caches.match(req))
    );
  }
});
