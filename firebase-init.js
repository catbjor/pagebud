// firebase-init.js
/* Firebase compat bootstrap (global window.fb) */
(function () {
    const firebaseConfig = {
        apiKey: "AIzaSyCEV-dncbQSnP7q9AvF2_Re93l-VHN-2cg",
        authDomain: "pagebud-cb6d9.firebaseapp.com",
        projectId: "pagebud-cb6d9",
        storageBucket: "pagebud-cb6d9.firebasestorage.app",
        messagingSenderId: "974455288174",
        appId: "1:974455288174:web:84d8a2e442ca193391d17f",
        measurementId: "G-TK4VCBT1V9"
    };

    if (!window.firebase) {
        console.error("[firebase-init] Firebase SDK not loaded (firebase-app-compat.js must be before this file).");
        return;
    }
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

    window.fb = {
        app: firebase.app(),
        auth: firebase.auth(),
        db: firebase.firestore(),
    };

    // Gate en side bak auth
    window.requireAuth = (onReady) =>
        fb.auth.onAuthStateChanged((u) => (u ? onReady(u) : (location.href = "auth.html")));
})();