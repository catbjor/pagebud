// profile.js – photo + name editor
(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);

    async function run(user) {
        const nameInput = $("#profileName");
        const photoInput = $("#profilePhoto");
        const photoPreview = $("#photoPreview");
        const saveBtn = $("#saveProfile");

        // If the elements for this script don't exist, do nothing.
        // This makes the script safe to include on pages that don't have a profile form.
        if (!nameInput && !photoInput && !photoPreview && !saveBtn) {
            return;
        }

        const snap = await fb.db.collection("users").doc(user.uid).get();
        const data = snap.data();
        if (nameInput) nameInput.value = user.displayName || data?.displayName || "";
        if (photoPreview && (user.photoURL || data?.photoURL)) {
            photoPreview.src = user.photoURL || data.photoURL;
        }

        saveBtn?.addEventListener("click", async () => {
            const newName = nameInput.value.trim();
            const file = photoInput.files?.[0];
            const updates = { displayName: newName, displayName_lower: newName.toLowerCase(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() };

            if (file) {
                const path = `users/${user.uid}/profile.jpg`;
                const ref = fb.storage.ref(path);
                await ref.put(file);
                const url = await ref.getDownloadURL();
                updates.photoURL = url;
                if (photoPreview) photoPreview.src = url;
            }

            try {
                await user.updateProfile({ displayName: newName, photoURL: updates.photoURL || user.photoURL });
            } catch { }

            await fb.db.collection("users").doc(user.uid).set(updates, { merge: true });
            alert("Profile updated!");
        });
    }

    // Use requireAuth to safely run the page logic
    window.requireAuth(run);
})();
