/* ===========================================================
 PageBud – engagement.js
 Purpose: Manage optional web push notifications
 =========================================================== */

(function () {
    "use strict";

    // Guard if Firebase Messaging isn’t available
    if (!window.firebase?.messaging) {
        console.info("[Engagement] Firebase messaging not loaded on this page.");
        return;
    }

    // Reference to Firebase Messaging
    const messaging = firebase.messaging();

    /**
     * Ask permission from the user and get a token
     */
    async function requestPermission() {
        try {
            console.log("[Engagement] Requesting notification permission...");
            const status = await Notification.requestPermission();
            if (status !== "granted") throw new Error("Permission not granted for Notifications");

            const token = await messaging.getToken({
                vapidKey: "YOUR_PUBLIC_VAPID_KEY" // replace with your own if set up
            });

            if (!token) throw new Error("No registration token received");

            console.log("[Engagement] Token received:", token);

            // Save to Firestore under user profile if logged in
            if (window.fb?.auth?.currentUser) {
                const uid = fb.auth.currentUser.uid;
                await fb.db.collection("users").doc(uid).set(
                    { fcmToken: token, fcmUpdated: Date.now() },
                    { merge: true }
                );
                console.log("[Engagement] Token saved to Firestore.");
            }

            return token;
        } catch (err) {
            console.error("[Engagement] Error getting permission or token:", err);
            throw err;
        }
    }

    /**
     * Hook up to global window for settings.js to call
     */
    window.pbEnablePush = async function () {
        try {
            const token = await requestPermission();
            return "Push enabled ✓";
        } catch (e) {
            return "Push failed: " + (e.message || e);
        }
    };

    // Foreground message handler
    messaging.onMessage((payload) => {
        console.log("[Engagement] Message received in foreground:", payload);

        // Show a toast if available
        if (window.pbToast) {
            pbToast(payload?.notification?.title || "New message!");
        } else {
            alert(payload?.notification?.title || "New message!");
        }
    });
})();
