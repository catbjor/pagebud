< !--Load the compat SDKs * before * firebase.js on each page-- >
< !--
< script src = "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js" ></script >
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-storage-compat.js"></script>  <!--optional, only if you upload files-- >
  -->

< !-- 🔧 Inline config MUST be present on each page that loads firebase.js-- >
< !--
< script id = "pb-firebase-config" type = "application/json" >
{
  "apiKey": "AIzaSyCEV-dncbsQPn79p9AvF2_Re93L-VHN-2Cg",
  "authDomain": "pagebud-cb6d9.firebaseapp.com",
  "projectId": "pagebud-cb6d9",
  "storageBucket": "pagebud-cb6d9.appspot.com",
  "messagingSenderId": "974455288174",
  "appId": "1:974455288174:web:84d8a2e424ca193391d17f",
  "measurementId": "G-TK4VCBT1V9"
}
</script >
  -->

  <script>
/* firebase.js — bootstrap Firebase compat + helpers
    Requires:
    - compat SDKs loaded before this file
    - <script id="pb-firebase-config" type="application/json"> on the page
      Exposes:
      - window.fb = {app, auth, db, storage ? }
      - window.requireAuth(callback)
      - dispatches: document event "pb:fbReady" with {app, auth, db, storage}
      */

      (function () {
        "use strict";

      // Prevent double-initialize if included twice
      if (window.fb && window.fb.__ready) {
    // Already initialized; still emit ready event for late listeners
    try {
        document.dispatchEvent(new CustomEvent("pb:fbReady", { detail: { ...window.fb } }));
    } catch { }
      return;
  }

      // Compat SDK guard
      if (!window.firebase || !firebase.app) {
        console.error("[firebase.js] Firebase compat SDKs not loaded before firebase.js.");
      return;
  }

      // Read inline config
      let cfg = null;
      try {
    const node = document.getElementById("pb-firebase-config");
      if (!node) throw new Error("Missing <script id='pb-firebase-config' type='application/json'> on page.");
        cfg = JSON.parse(node.textContent.trim() || "{ }");
  } catch (e) {
          console.error("[firebase.js] Failed to parse pb-firebase-config:", e);
        return;
  }

        // Initialize app (no-op if already initialized elsewhere)
        try {
    if (!firebase.apps.length) {
          firebase.initializeApp(cfg);
    }
  } catch (e) {
          console.error("[firebase.js] initializeApp failed:", e);
        return;
  }

        // Build helpers (storage is optional — only if SDK present)
        const app = firebase.app();
        const auth = firebase.auth();
        const db = firebase.firestore();
        const storage = (firebase.storage ? firebase.storage() : undefined);

        // Lightweight gate for authed pages (redirects to auth.html if not signed in)
        function requireAuth(onReady) {
    if (!auth || typeof auth.onAuthStateChanged !== "function") {
          console.error("[firebase.js] Auth not available.");
      return () => { };
    }
    return auth.onAuthStateChanged((user) => {
      if (user) {
        try {onReady(user); } catch (e) {console.error("[requireAuth] callback error:", e); }
      } else {
          // Redirect to sign-in
          location.href = "auth.html";
      }
    });
  }

        // Publish fb global
        window.fb = {
          app,
          auth,
          db,
          storage,
          requireAuth,
          __ready: true
  };

        // Signal ready (for pages that wait for fb)
        try {
          document.dispatchEvent(new CustomEvent("pb:fbReady", {
            detail: { app, auth, db, storage }
          }));
  } catch { }

  // Optional: log minimal info in dev
  // console.log("[firebase.js] Ready:", app.name, app.options.projectId);
})();
      </script>
