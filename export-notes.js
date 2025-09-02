// export-notes.js — Export/import book notes
(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);

    async function exportNotes(u) {
        const snap = await fb.db.collection("users").doc(u.uid).collection("books").get();
        const data = snap.docs.map(doc => ({
            id: doc.id,
            title: doc.data().title || "",
            notes: doc.data().notes || ""
        }));

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "pagebud-notes-backup.json";
        a.click();
        URL.revokeObjectURL(url);
    }

    async function importNotes(u, file) {
        const text = await file.text();
        const items = JSON.parse(text);
        if (!Array.isArray(items)) throw new Error("Invalid file");

        const batch = fb.db.batch();
        const col = fb.db.collection("users").doc(u.uid).collection("books");

        items.forEach(item => {
            if (!item.id || typeof item.notes !== "string") return;
            const ref = col.doc(item.id);
            batch.set(ref, { notes: item.notes }, { merge: true });
        });

        await batch.commit();
        alert("Notes imported.");
    }

    function setup() {
        const exp = $("#btnExport");
        const imp = $("#fileImport");

        if (exp) {
            exp.addEventListener("click", () => {
                const u = fb?.auth?.currentUser;
                if (!u) return alert("Not signed in");
                exportNotes(u);
            });
        }

        if (imp) {
            imp.addEventListener("change", async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const u = fb?.auth?.currentUser;
                if (!u) return alert("Not signed in");
                try {
                    await importNotes(u, file);
                } catch (e) {
                    alert("Failed to import notes.");
                    console.error(e);
                }
            });
        }
    }

    document.addEventListener("DOMContentLoaded", setup);
})();
