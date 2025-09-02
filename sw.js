// sw.js
const CACHE_NAME = "pagebud-v46"; // 🆕 bump version to bust old cache
const OFFLINE_URL = "/offline.html";

// Only cache **safe static files**, never auth/index pages
const STATIC_ASSETS = [
  "/style.css",
  "/auth.css",
  "/theme-init.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/manifest.json",
  "/offline.html"
];

// ✅ Install: cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ✅ Activate: clear old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => key !== CACHE_NAME && caches.delete(key)))
    )
  );
  self.clients.claim();
});

// ✅ Fetch: try network, fallback to cache/offline
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 🔥 Never intercept auth.html or index.html
  if (
    url.pathname.includes("auth.html") ||
    url.pathname === "/" ||
    url.pathname === "/index.html"
  ) {
    return; // Let browser and Firebase handle these
  }

  // ✅ Try cache, then network, then offline fallback for navigations
  event.respondWith(
    caches.match(request).then((cached) => {
      return (
        cached ||
        fetch(request).catch(() => {
          if (request.mode === "navigate") {
            return caches.match(OFFLINE_URL);
          }
        })
      );
    })
  );
});

// navigator.serviceWorker.register("/sw.js");

