// firebase-init.js  — compat setup (bruk denne overalt)

(function () {
    // --- DINE VERDIER ---
    const firebaseConfig = {
        apiKey: "AIzaSyCEV-dncbQSnP7q9AvF2_Re93l-VHN-2cg",
        authDomain: "pagebud-cb6d9.firebaseapp.com",
        projectId: "pagebud-cb6d9",
        storageBucket: "pagebud-cb6d9.firebasestorage.app",
        messagingSenderId: "974455288174",
        appId: "1:974455288174:web:84d8a2e442ca193391d17f",
        measurementId: "G-TK4VCBT1V9"
    };

    // Init bare én gang
    if (!firebase.apps || !firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    // Globale snarveier
    window.fb = {
        app: firebase.app(),
        auth: firebase.auth(),
        db: firebase.firestore(),
    };

    // Krev login
    window.requireAuth = (cb) =>
        window.fb.auth.onAuthStateChanged(u => u ? cb(u) : (location.href = "auth.html"));

    // ----- OPTIONAL: Web Push (FCM) -----
    const VAPID_PUBLIC_KEY = "BJuvG6f4DO9_FG-tk1h9gQ5Ry1yeU9CYcrnZ-qRcIAbn4BgNnG73dHur62WbtBu_t9-XqeTHuGmR7UsASZPe0_g";

    // Kall denne fra knappen på settings
    window.enablePush = async function enablePush() {
        try {
            if (!("Notification" in window)) throw new Error("Notifications not supported");
            if (!("serviceWorker" in navigator)) throw new Error("Service worker not supported");

            // Bruk eksisterende sw.js (som vi oppdaterer under)
            const reg = (await navigator.serviceWorker.getRegistration())
                || (await navigator.serviceWorker.register("/sw.js"));

            const perm = await Notification.requestPermission();
            if (perm !== "granted") throw new Error("Permission: " + perm);

            const messaging = firebase.messaging();
            const token = await messaging.getToken({
                vapidKey: VAPID_PUBLIC_KEY,
                serviceWorkerRegistration: reg,
            });
            console.log("[FCM] token", token);
            if (!token) throw new Error("No token");

            // Lagre token på bruker (valgfritt)
            const u = fb.auth.currentUser;
            if (u) {
                await fb.db.collection("users").doc(u.uid)
                    .collection("webPushTokens").doc(token).set({
                        token,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
            }

            alert("Push enabled ✓");
        } catch (e) {
            console.error(e);
            alert("Push feilet – " + (e?.message || e));
        }
    };

    // Foreground-meldinger (viser enkel alert)
    try {
        const messaging = firebase.messaging();
        messaging.onMessage(({ notification }) => {
            if (!notification) return;
            alert(`${notification.title}\n\n${notification.body || ""}`);
        });
    } catch { /* messaging-compat ikke lastet på alle sider – ok */ }
})();
