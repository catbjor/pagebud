// --- Firebase Messaging i sw.js (background) ---
try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

  // Du trenger bare senderId her for SW-init (resten plukkes ikke opp automatisk i SW)
  firebase.initializeApp({ messagingSenderId: '974455288174' });

  const messaging = firebase.messaging();
  messaging.onBackgroundMessage(({ notification }) => {
    const title = (notification && notification.title) || 'PageBud';
    const body = (notification && notification.body) || '';
    self.registration.showNotification(title, {
      body, icon: '/icons/icon-192.png'
    });
  });
} catch (e) {
  // stille – SW skal fortsatt fungere uten messaging
}


// sw.js — PageBud (precache + sane strategies)

// 1) Bump denne ved hvert deploy
const CACHE_NAME = "pagebud-cache-v24";

// --- FCM i samme SW ---
try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

  firebase.initializeApp({
    apiKey: "AIzaSyCEV-dncbQSnP7q9AvF2_Re93l-VHN-2cg",
    authDomain: "pagebud-cb6d9.firebaseapp.com",
    projectId: "pagebud-cb6d9",
    storageBucket: "pagebud-cb6d9.firebasestorage.app",
    messagingSenderId: "974455288174",
    appId: "1:974455288174:web:84d8a2e442ca193391d17f"
  });

  const messaging = firebase.messaging();
  messaging.onBackgroundMessage(({ notification, data }) => {
    const title = (notification && notification.title) || "PageBud";
    const body = (notification && notification.body) || "";
    self.registration.showNotification(title, {
      body, icon: '/icons/icon-192.png', data: data || {}
    });
  });
} catch (e) {
  // Hvis importScripts feiler (eldre nettleser), ignorer
}


// 2) Legg inn ALLE filer du vil være 100% sikre på lastes riktig.
//    Viktig: bruk samme query som i HTML!
const ASSETS = [
  "./",
  "./index.html",
  "./add-book.html",
  "./edit-page.html",
  "./buddy-read.html",
  "./stats.html",
  "./style.css?v=2025-08-26-20",
  "./script.js?v=2025-08-26-20",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];


// --- Install: pre-cache alt viktig ---
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).catch(() => { })
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
