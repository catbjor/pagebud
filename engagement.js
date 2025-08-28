// engagement.js
// Web Push (FCM) – bruker din VAPID public key
const VAPID_PUBLIC_KEY = "BJuvG6f4DO9_FG-tk1h9gQ5Ry1yeU9CYcrnZ-qRcIAbn4BgNnG73dHur62WbtBu_t9-XqeTHuGmR7UsASZPe0_g";

async function enablePush() {
    try {
        if (!('Notification' in window)) return alert("Nettleseren støtter ikke Notifications.");
        if (!('serviceWorker' in navigator)) return alert("Service Worker ikke tilgjengelig.");

        // sørg for at sw.js er registrert (åpne via index.html først)
        let reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
            reg = await navigator.serviceWorker.register('./sw.js');
            await new Promise(r => setTimeout(r, 300)); // gi SW et lite øyeblikk
        }

        // be om tillatelse
        const perm = await Notification.requestPermission();
        if (perm !== "granted") return alert("Du må tillate varsler for å aktivere push.");

        // hent token fra FCM – vi gjenbruker din sw.js
        const messaging = firebase.messaging();
        const token = await messaging.getToken({
            vapidKey: VAPID_PUBLIC_KEY,
            serviceWorkerRegistration: reg
        });
        if (!token) throw new Error("Fikk ikke FCM token.");

        // lagre token under bruker
        const u = fb.auth.currentUser;
        if (u) {
            await fb.db.collection("users").doc(u.uid)
                .collection("webPushTokens").doc(token)
                .set({ token, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        }

        // foreground-meldinger
        messaging.onMessage(({ notification }) => {
            if (!notification) return;
            new Notification(notification.title || "PageBud", {
                body: notification.body || "",
                icon: "/icons/icon-192.png"
            });
        });

        alert("Push aktivert ✅");
        console.log("[FCM] token", token);
    } catch (e) {
        console.error("[FCM] error", e);
        alert("Push feilet – " + (e && e.message ? e.message : e));
    }
}