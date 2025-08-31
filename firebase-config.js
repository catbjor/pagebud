// firebase-config.js
// Firebase configuration for PageBud application

// Check if config is already defined to avoid duplicates
if (!window.__PB_FIREBASE) {
    window.__PB_FIREBASE = {
        apiKey: "AIzaSyCEV-dncbQSnP7q9AvF2_Re93l-VHN-2cg",
        authDomain: "pagebud-cb6d9.firebaseapp.com",
        projectId: "pagebud-cb6d9",
        storageBucket: "pagebud-cb6d9.appspot.com",
        messagingSenderId: "974455288174",
        appId: "1:974455288174:web:84d8a2e442ca193391d17f",
        measurementId: "G-TK4VCBT1V9"
    };
    console.log("Firebase configuration loaded");
}