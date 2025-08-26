const CACHE_NAME = "pagebud-cache-v1";

// Install: pre-cache important files if you want (optional)
self.addEventListener("install", (event) => {
  self.skipWaiting(); // activate immediately
});

// Activate: clean up old caches if needed
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  clients.claim(); // take control right away
});

// Fetch: try network first, fallback to cache
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Listen for skipWaiting message
self.addEventListener("message", (event) => {
  if (event.data.action === "skipWaiting") {
    self.skipWaiting();
  }
});
