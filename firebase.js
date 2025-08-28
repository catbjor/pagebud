< !--firebase.js -->
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
<script>
  const firebaseConfig = {
    apiKey: "AIzaSyCEV-dncbQSnP7q9AvF2_Re93l-VHN-2cg",
    authDomain: "pagebud-cb6d9.firebaseapp.com",
    projectId: "pagebud-cb6d9",
    storageBucket: "pagebud-cb6d9.firebasestorage.app",
    messagingSenderId: "974455288174",
    appId: "1:974455288174:web:84d8a2e442ca193391d17f",
    measurementId: "G-TK4VCBT1V9"
  };

  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

  window.fb = {
    auth: firebase.auth(),
    db: firebase.firestore()
  };

  // Krev innlogging + skriv profil + email->uid index
  window.requireAuth = (onReady) => {
    fb.auth.onAuthStateChanged(async (u) => {
      if (!u) { location.href = "auth.html"; return; }
      try {
        await fb.db.collection("users").doc(u.uid).set({
          uid: u.uid,
          email: u.email || "",
          displayName: u.displayName || "",
          photoURL: u.photoURL || "",
          updatedAt: firebase.firestore.Timestamp.now()
        }, { merge: true });
        if (u.email) {
          await fb.db.collection("usersByEmail").doc(u.email.toLowerCase())
            .set({ uid: u.uid }, { merge: true });
        }
      } catch(e){ console.warn(e); }
      onReady && onReady(u);
    });
  };
</script>
