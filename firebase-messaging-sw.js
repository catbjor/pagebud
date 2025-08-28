// /firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyCEV-dncbQSnP7q9AvF2_Re93l-VHN-2cg",
    authDomain: "pagebud-cb6d9.firebaseapp.com",
    projectId: "pagebud-cb6d9",
    storageBucket: "pagebud-cb6d9.firebasestorage.app",
    messagingSenderId: "974455288174",
    appId: "1:974455288174:web:84d8a2e442ca193391d17f"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(({ notification = {}, data = {} }) => {
    self.registration.showNotification(notification.title || "PageBud", {
        body: notification.body || "",
        icon: "/icons/icon-192.png",
        data
    });
});