// firebase-init.js
(function () {
  // If already initialized, skip
  if (window.fb?.auth) return;

  const config = window.__PB_FIREBASE;
  if (!config) {
    console.warn("⚠️ Firebase config missing (window.__PB_FIREBASE)");
    return;
  }

  // Initialize
  const app = firebase.initializeApp(config);
  const auth = firebase.auth();
  const db = firebase.firestore();
  const storage = firebase.storage();

  // Optional: emulator support for localhost
  if (location.hostname === "localhost") {
    try {
      db.useEmulator("localhost", 8080);
      auth.useEmulator("http://localhost:9099");
      storage.useEmulator("localhost", 9199);
    } catch { }
  }

  // Expose globally
  window.fb = { app, auth, db, storage };

  // 🛠️ Safe requireAuth for protected pages
  window.requireAuth = function (cb) {
    const u = auth.currentUser;
    if (u) {
      try { cb(u); } catch { }
      return;
    }

    const off = auth.onAuthStateChanged(user => {
      off();
      if (user) {
        try { cb(user); } catch { }
      } else {
        const isAuthPage = location.pathname.endsWith("auth.html");
        if (!isAuthPage) {
          console.warn("🚪 Not signed in — redirecting to auth.html");
          location.href = "auth.html";
        } else {
          console.log("🟡 Not signed in — but already on auth.html");
        }
      }
    });
  };

})();
