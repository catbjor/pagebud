// sw.js — PageBud (precache + sane strategies)

// 1) Bump denne ved hvert deploy
const CACHE_NAME = "pagebud-cache-v17";

// 2) Legg inn ALLE filer du vil være 100% sikre på lastes riktig.
//    Viktig: bruk samme query som i HTML!
const ASSETS = [
  "./",
  "./index.html",
  "./add-book.html",
  "./edit-page.html",
  "./buddy-read.html",
  "./stats.html",
  "./style.css?v=2025-08-26-16",
  "./script.js?v=2025-08-26-16",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// --- Install: pre-cache alt viktig ---
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).catch(()=>{})
  );
  self.skipWaiting(); // aktiver ny SW med en gang
});

// --- Activate: rydde gamle cacher ---
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null))
    )
  );
  self.clients.claim();
});

// --- Fetch: network-first for HTML, cache-first for assets ---
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Bare håndter GET
  if (req.method !== "GET") return;

  // HTML dokumenter → network-first (så nye versjoner vises)
  const isHTML =
    req.destination === "document" ||
    (req.headers.get("accept") || "").includes("text/html");

  if (isHTML) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Alt annet (CSS/JS/ikon) → cache-first med nettverks-fallback
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
          return res;
        })
        .catch(() => {
          // Prøv å matche uten query (nyttig når ?v= endres)
          const noQuery = req.url.split("?")[0];
          return caches.match(noQuery);
        });
    })
  );
});

// --- Meldinger (skipWaiting) ---
self.addEventListener("message", (event) => {
  if (event.data && event.data.action === "skipWaiting") {
    self.skipWaiting();
  }
});
