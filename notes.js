(function () {
    "use strict";

    const exportBtn = document.getElementById("export-notes");
    const importBtn = document.getElementById("import-notes");

    exportBtn?.addEventListener("click", async () => {
        const u = fb.auth.currentUser;
        if (!u) return alert("Not signed in");

        const snap = await fb.db.collection("users").doc(u.uid).collection("books").get();
        const notes = [];
        snap.forEach(doc => {
            const d = doc.data();
            if (d.notes?.trim()) notes.push({ id: doc.id, title: d.title, notes: d.notes });
        });

        const blob = new Blob([JSON.stringify(notes, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "notes-export.json";
        a.click();
        URL.revokeObjectURL(url);
    });

    importBtn?.addEventListener("click", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.addEventListener("change", async () => {
            const u = fb.auth.currentUser;
            if (!u || !input.files.length) return;

            const file = input.files[0];
            const text = await file.text();
            const data = JSON.parse(text);

            for (const item of data) {
                await fb.db.collection("users").doc(u.uid).collection("books").doc(item.id).set(
                    { notes: item.notes }, { merge: true }
                );
            }

            alert("Import complete");
        });
        input.click();
    });
})();
