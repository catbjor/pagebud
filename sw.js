// sw.js — PageBud (Cache + Firebase Messaging in one SW)

// -------- 1) Firebase Messaging (compat) --------
try {
  importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

  // Full config (SW kan ikke lese window.__PB_FIREBASE)
  firebase.initializeApp({
    apiKey: "AIzaSyCEV-dncbQSnP7q9AvF2_Re93l-VHN-2cg",
    authDomain: "pagebud-cb6d9.firebaseapp.com",
    projectId: "pagebud-cb6d9",
    storageBucket: "pagebud-cb6d9.firebasestorage.app",
    messagingSenderId: "974455288174",
    appId: "1:974455288174:web:84d8a2e442ca193391d17f",
    measurementId: "G-TK4VCBT1V9"
  });

  const messaging = firebase.messaging();

  messaging.onBackgroundMessage(({ notification, data }) => {
    const title = (notification && notification.title) || "PageBud";
    const body = (notification && notification.body) || "";
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      data: data || {}
    });
  });
} catch (e) {
  // Hvis messaging ikke er tilgjengelig er det helt ok
}

// Klikk på notifikasjon → fokusér/åpne
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/index.html";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(url) || c.url.endsWith("/index.html")) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});

// -------- 2) PWA Caching --------
// Bump denne når du endrer precache-lista
const PRECACHE_VERSION = "v3";
const RUNTIME_CACHE = `pagebud-runtime-${PRECACHE_VERSION}`;
const PRECACHE_CACHE = `pagebud-precache-${PRECACHE_VERSION}`;

// Viktigste assets for kjapp first-load
const PRECACHE_ASSETS = [
  "/",                // index
  "/index.html",
  "/stats.html",
  "/settings.html",
  "/buddy-read.html",
  "/add-book.html",
  "/edit-book.html",

  "/style.css",
  "/script.js",
  "/activity.js",
  "/social-feed.js",
  "/reset-utils.js",
  "/timer.js",
  "/stats.js",
  "/settings.js",
  "/settings-timer.js",

  "/firebase-config.js",
  "/firebase-init.js?v=dev-1",

  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",

  // CDN-er caches via runtime (ikke legg inn tredjeparts-URLer i precache-lista)
];

// Install → precache
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PRECACHE_CACHE).then((cache) => cache.addAll(PRECACHE_ASSETS)).catch(() => { })
  );
  self.skipWaiting();
});

// Activate → rydd gamle cacher
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) =>
          (k.startsWith("pagebud-runtime-") || k.startsWith("pagebud-precache-")) && k !== RUNTIME_CACHE && k !== PRECACHE_CACHE
            ? caches.delete(k)
            : null
        )
      )
    )
  );
  self.clients.claim();
});

// Hjelp: er dette en HTML-forespørsel?
const isHTMLRequest = (req) =>
  req.mode === "navigate" ||
  req.destination === "document" ||
  (req.headers.get("accept") || "").includes("text/html");

// Fetch-strategier:
// - HTML → network-first (så du ser nye sider), fallback til precache/runtime
// - Andre (css/js/img/fonts) → stale-while-revalidate
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  if (isHTMLRequest(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, clone));
          return res;
        })
        .catch(async () => {
          // Prøv runtime, så precache, så root
          return (await caches.match(req)) ||
            (await caches.match("/index.html")) ||
            Response.error();
        })
    );
    return;
  }

  // Non-HTML: stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, clone));
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// App → SW (skipWaiting uten å droppe auth)
self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
