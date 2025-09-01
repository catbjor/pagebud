// push.js (merged)
(function () {
  "use strict";

  const PERM_KEY = "pb:push:permission";

  async function ensureSW() {
    if (!("serviceWorker" in navigator)) throw new Error("no-sw");
    const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    return reg;
  }

  async function askPermission() {
    if (!("Notification" in window)) throw new Error("no-notif");
    const p = await Notification.requestPermission();
    localStorage.setItem(PERM_KEY, p);
    if (p !== "granted") throw new Error("denied");
    return p;
  }

  async function getTokenCompat(reg) {
    // Use compat messaging
    if (!firebase.messaging) throw new Error("no-messaging");
    const messaging = firebase.messaging();
    const token = await messaging.getToken({ serviceWorkerRegistration: reg });
    if (!token) throw new Error("no-token");
    return token;
  }

  async function saveToken(uid, token) {
    await fb.db.collection("users").doc(uid).set({ fcmToken: token }, { merge: true });
  }

  async function enable() {
    await new Promise(r => document.addEventListener("firebase-ready", r, { once: true }));
    const u = fb.auth.currentUser || await new Promise(res => fb.auth.onAuthStateChanged(res));
    if (!u) { location.href = "auth.html"; return; }

    const reg = await ensureSW();
    await askPermission();
    const token = await getTokenCompat(reg);
    await saveToken(u.uid, token);

    // Foreground handler
    try {
      const messaging = firebase.messaging();
      messaging.onMessage(payload => {
        (window.toast ? toast(payload.notification?.title || "New message")
          : alert(payload.notification?.title || "New message"));
      });
    } catch { }

    return token;
  }

  window.pbEnablePush = function () {
    enable().then(() => window.toast?.("Push enabled ✓"))
      .catch(e => window.toast?.(`Push error: ${e?.message || e}`));
  };
})();

// når ny hendelse kommer inn:
window.pbFriendsBadge?.bump();
