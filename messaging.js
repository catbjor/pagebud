// messaging.js — registrer SW + hent token og lagre under /users/{uid}/pushTokens/{token}
(function () {
    "use strict";
    const VAPID_KEY = undefined; // valgfritt: legg inn egen Web Push key om du bruker den

    async function ensureToken() {
        if (!('serviceWorker' in navigator)) return;
        if (!window.firebase?.messaging) return;

        const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        const messaging = firebase.messaging();

        try {
            await Notification.requestPermission();
            const token = await messaging.getToken({ serviceWorkerRegistration: reg, vapidKey: VAPID_KEY });
            const u = firebase.auth().currentUser;
            if (!u || !token) return;

            await firebase.firestore()
                .collection('users').doc(u.uid)
                .collection('pushTokens').doc(token).set({
                    token, platform: 'web', updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
        } catch (e) { console.warn("[push] failed", e); }
    }

    window.PBPush = { ensureToken };
})();
