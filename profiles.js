// profiles.js
(function () {
    "use strict";

    // Liten SHA-256 helper (hash av email som nøkkel i "directory")
    async function sha256(str) {
        const enc = new TextEncoder().encode(str);
        const buf = await crypto.subtle.digest("SHA-256", enc);
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
    }

    async function ensureProfile(user) {
        const p = {
            uid: user.uid,
            email: user.email || "",
            name: user.displayName || (user.email ? user.email.split("@")[0] : "User"),
            photoURL: user.photoURL || "",
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            // venneliste som array (enkel å lese)
            friends: []
        };
        const ref = fb.db.collection("users").doc(user.uid);
        const snap = await ref.get();
        if (!snap.exists) {
            await ref.set(p, { merge: true });
        } else {
            await ref.set({ updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }

        // Public directory: directory/{emailHash} -> { uid }
        if (user.email) {
            const key = (await sha256(user.email.trim().toLowerCase()));
            await fb.db.collection("directory").doc(key).set({
                uid: user.uid,
                email: user.email,
                at: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }
    }

    // Kjør når auth er klart
    document.addEventListener("firebase-ready", async () => {
        const u = fb.auth.currentUser || await new Promise(res => {
            const off = fb.auth.onAuthStateChanged(x => { off(); res(x); });
        });
        if (u) ensureProfile(u).catch(console.warn);
    });

    window.PBProfile = { ensureProfile };
})();
