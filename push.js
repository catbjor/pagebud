< !--push.js -->
  <script>
    const VAPID_PUBLIC_KEY = "BJuvG6f4DO9_FG-tk1h9gQ5Ry1yeU9CYcrnZ-qRcIAbn4BgNnG73dHur62WbtBu_t9-XqeTHuGmR7UsASZPe0_g";

    async function enablePush() {
  try {
    if (!('Notification' in window)) throw new Error("Browser mangler Notification API");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error("Bruker avslo varsel-tilgang");

    // Viktig: bruk compat, og IKKE pass serviceWorkerRegistration når du har firebase-messaging-sw.js i rot
    const messaging = firebase.messaging();
    const token = await messaging.getToken({vapidKey: VAPID_PUBLIC_KEY });
    if (!token) throw new Error("Kunne ikke hente FCM token");

    console.log("[FCM] token", token);

    // Lagre token under bruker (greit å ha til senere sending)
    const u = fb.auth.currentUser;
    if (u) {
      await fb.db.collection("users").doc(u.uid)
        .collection("webPushTokens").doc(token)
        .set({ token, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    }

    // Foreground-meldinger (app åpen)
    messaging.onMessage(({notification}) => {
      if (!notification) return;
    alert(`${notification.title}\n\n${notification.body || ""}`);
    });

    alert("Push skrudd på ✅");
  } catch (err) {
      console.error("[FCM] error", err);
    alert("Push feilet – se console");
  }
}
  </script>