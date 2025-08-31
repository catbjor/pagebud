// firebase-init.js — single source of truth for Firebase bootstrap
// Requires: firebase compat SDKs + firebase-config.js (defines window.__PB_FIREBASE)

(function () {
  "use strict";
  if (!window.firebase) { console.error("[fb-init] Firebase SDK missing"); return; }
  if (!window.__PB_FIREBASE) { console.error("[fb-init] window.__PB_FIREBASE config missing"); return; }

  // Init once
  if (firebase.apps.length === 0) {
    try { firebase.initializeApp(window.__PB_FIREBASE); }
    catch (e) { /* ignore "already exists" */ }
  }

  const auth = firebase.auth();
  const db = firebase.firestore();
  const st = firebase.storage && firebase.storage();

  // Persist session across tabs/pages
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => { });

  // Expose a tiny helper API
  window.fb = { auth, db, storage: st, firebase };

  // firebase-init.js (etter at firebase.initializeApp(...) er kalt)
  window.fb = window.fb || {};
  fb.auth = firebase.auth();
  fb.db = firebase.firestore();
  fb.storage = firebase.storage();

  // etter initializeApp(...)
  window.fb = window.fb || {};
  fb.auth = firebase.auth();
  fb.db = firebase.firestore();
  fb.storage = firebase.storage(); // ← viktig



  // requireAuth: run cb when signed in, else go to auth.html
  window.requireAuth = function (cb) {
    if (!auth) return location.href = "auth.html";
    const u = auth.currentUser;
    if (u) { cb && cb(u); return; }
    const unsub = auth.onAuthStateChanged(user => {
      unsub();
      if (user) cb && cb(user);
      else location.href = "auth.html";
    });
  };

  // Dispatch a single ready event (for scripts that prefer it)
  if (!window.__FB_READY_FIRED__) {
    window.__FB_READY_FIRED__ = true;
    document.dispatchEvent(new CustomEvent("firebase-ready"));
  }
})();
