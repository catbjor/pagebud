/* ===========================================================
  PageBud – push.js
  Purpose: Handle client-side push (Firebase Cloud Messaging)
  - Requests permission
  - Retrieves + stores FCM token
  - Listens for foreground messages
=========================================================== */

(function () {
  "use strict";

  // Expose helper globally
  window.pbEnablePush = async function () {
    if (!("Notification" in window)) {
      return "This browser does not support notifications.";
    }

    // 1) Ask user permission
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      return "Notifications denied.";
    }

    // 2) Init Messaging
    let messaging;
    try {
      messaging = firebase.messaging();
    } catch (e) {
      console.error("[Push] Messaging not supported", e);
      return "Messaging not supported.";
    }

    // 3) Get registration of SW (must be /firebase-messaging-sw.js)
    const reg = await navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js");
    if (!reg) {
      return "Service worker not registered (firebase-messaging-sw.js missing).";
    }

    // 4) Attach messaging to SW registration
    messaging.useServiceWorker(reg);

    // 5) Retrieve token
    let token;
    try {
      token = await messaging.getToken({
        vapidKey: "<BKB8Xl6_atfLTsLlo1lzN6wNj6jq8HFCusSEs92Z6WHDrSyC-F8ovQyATvOTjn1d1CDvpmi8nnSNZlqxFAM1nvA>" // 🔧 optional; set if you configured in Firebase console
      });
    } catch (e) {
      console.error("[Push] getToken failed", e);
      return "Failed to get token.";
    }

    if (!token) {
      return "No push token.";
    }

    console.log("[Push] Token:", token);

    // 6) Save token to Firestore under user doc
    const user = fb.auth.currentUser;
    if (user) {
      await fb.db.collection("users").doc(user.uid).set({
        pushToken: token,
        pushEnabled: true,
        updated: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    return "Push enabled ✓";
  };

  // Foreground handler: show simple notification banner
  document.addEventListener("DOMContentLoaded", () => {
    try {
      const messaging = firebase.messaging();
      messaging.onMessage((payload) => {
        console.log("[Push] Foreground message", payload);
        const n = payload?.notification || {};
        const title = n.title || "PageBud";
        const body = n.body || "Update received.";
        // Simple toast fallback
        if (window.pbToast) {
          pbToast(`${title}: ${body}`);
        } else {
          alert(`${title}\n${body}`);
        }
      });
    } catch (e) {
      console.warn("[Push] Foreground handler skipped:", e);
    }
  });
})();
