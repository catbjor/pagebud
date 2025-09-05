// firebase-init.js
(function () {
  "use strict";

  // Already initialized? bail.
  if (window.fb?.auth) return;

  // Your config must be set on window.__PB_FIREBASE (auth.html does this)
  const config =
    window.__PB_FIREBASE ||
    window.firebaseConfig ||
    (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.default);

  if (!config) {
    console.warn("⚠️ Firebase config missing (window.__PB_FIREBASE)");
    return;
  }

  // ---- Initialize (Compat SDKs) ----
  let app;
  try {
    app = firebase.apps?.length ? firebase.app() : firebase.initializeApp(config);
  } catch (e) {
    console.error("Firebase init failed:", e);
    return;
  }

  const auth = firebase.auth();
  const db = firebase.firestore();

  // Storage is optional (we don't require it for chat). Only attach if available.
  const storage = (typeof firebase.storage === "function") ? firebase.storage() : null;

  // ---- Emulators (optional) ----
  if (location.hostname === "localhost") {
    try { db.useEmulator("localhost", 8080); } catch { }
    try { auth.useEmulator("http://localhost:9099"); } catch { }
    try { storage?.useEmulator?.("localhost", 9199); } catch { }
  }

  // Helpful: ignore undefined in set/update merges
  try { db.settings({ ignoreUndefinedProperties: true }); } catch { }

  // Expose
  window.fb = { app, auth, db, storage };

  // Guarded auth gate
  window.requireAuth = function (cb) {
    const u = auth.currentUser;
    if (u) {
      try { cb(u); } catch (e) {
        console.error("requireAuth callback failed:", e);
      }
      return;
    }
    const off = auth.onAuthStateChanged(user => {
      off();
      if (user) {
        try { cb(user); } catch (e) {
          console.error("requireAuth callback failed:", e);
        }
        return;
      }
      const here = (location.pathname || "").split("/").pop();
      // If not authenticated, redirect to auth page, passing the current
      // URL so we can be redirected back after successful login.
      if (here !== "auth.html") location.href = `auth.html?redirect=${encodeURIComponent(location.href)}`;
    });
  };

  // Promise if you prefer awaiting
  window.onAuthReady = new Promise(res => {
    // onAuthStateChanged is the only guaranteed way to get the initial auth state.
    // Checking currentUser immediately can lead to a race condition on page load.
    const unsubscribe = auth.onAuthStateChanged(user => { unsubscribe(); res(user || null); });
  });
})();
