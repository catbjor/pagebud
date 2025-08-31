// firebase-init.js (merged, single source of truth)
(function () {
  "use strict";
  if (window.fb?.app) return; // guard double init

  const cfg = window.__PB_FIREBASE || window.PB_FIREBASE_CONFIG;
  if (!cfg) { console.error("[fb] Missing firebase-config"); return; }

  firebase.initializeApp(cfg);
  const auth = firebase.auth();
  const db = firebase.firestore();
  const storage = firebase.storage?.();

  // Global shim
  window.fb = { app: firebase.app(), auth, db, storage };

  // Helper: requireAuth(cb)
  window.requireAuth = function (cb) {
    const u = auth.currentUser;
    if (u) { try { cb(u); } catch { } return; }
    const off = auth.onAuthStateChanged(x => {
      off();
      if (x) { try { cb(x); } catch { } }
      else location.href = "auth.html";
    });
  };

  // Signal once
  document.dispatchEvent(new CustomEvent("firebase-ready"));
})();
