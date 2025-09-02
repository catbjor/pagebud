/* =========================================================
 PageBud – add-book.js (fiks for boklagring på plass, backend–klar)
========================================================= */
(function () {
    "use strict";

    // --- Query & Firebase-hjelpere ---
    const byId = id => document.getElementById(id);
    const FB = window.fb || window;

    function authSvc() {
        try {
            if (FB.auth && typeof FB.auth === "object" && "currentUser" in FB.auth) return FB.auth;
            if (typeof FB.auth === "function") return FB.auth();
            if (FB.firebase?.auth) return FB.firebase.auth();
            return firebase.auth();
        } catch { return firebase.auth(); }
    }

    function dbSvc() {
        try {
            if (FB.db?.collection) return FB.db;
            if (typeof FB.firestore === "function") return FB.firestore();
            if (FB.firestore?.collection) return FB.firestore;
            return firebase.firestore();
        } catch { return firebase.firestore(); }
    }

    async function requireUser() {
        const auth = authSvc();
        if (auth.currentUser) return auth.currentUser;
        return new Promise((res, rej) => {
            const unsub = auth.onAuthStateChanged(u => { unsub(); u ? res(u) : rej(new Error("Not signed in")); });
        });
    }

    // --- Elementer fra DOM---
    const form = byId("bookForm");
    const titleEl = byId("title");
    const authorEl = byId("author");
    const saveBtn = byId("saveBtn");
    const fileInput = byId("bookFile");
    const fileNameEl = byId("fileName");
    const coverPreview = byId("coverPreview");

    // --- State ---
    let createdBookId = null;
    let saving = false;
    let fileMeta = null;
    let coverBlob = null;

    // --- read-knapp-funksjonalitet ---
    function ensureReadButton() {
        const host = fileNameEl.parentElement || document.body;
        let btn = document.getElementById("readNowBtn");
        if (!btn) {
            btn = document.createElement("button");
            btn.id = "readNowBtn";
            btn.className = "btn";
            btn.textContent = "Read";
            btn.style.marginLeft = "8px";
            host.appendChild(btn);
        }
        btn.onclick = async () => {
            if (!createdBookId) {
                const ok = await handleSave({ silent: true });
                if (!ok) return;
            }
            location.href = `reader.html?id=${createdBookId}`;
        };
    }

    fileInput?.addEventListener("change", async () => {
        const f = fileInput.files?.[0];
        fileNameEl.textContent = f?.name || "";
        if (!f) return;
        fileMeta = {
            name: f.name,
            type: /\.pdf$/i.test(f.name) ? "pdf" : /\.epub$/i.test(f.name) ? "epub" : "unknown",
            size: f.size
        };
        coverBlob = await tryExtractCover(f);
        if (coverBlob) coverPreview.src = URL.createObjectURL(coverBlob);
        ensureReadButton();
    });

    // add-book.js — handles form save
    (function () {
        "use strict";
        const $ = (s, r = document) => r.querySelector(s);

        async function saveBook() {
            const u = fb.auth.currentUser;
            if (!u) return alert("Not signed in");

            const data = {
                title: $("#title")?.value.trim() || "",
                author: $("#author")?.value.trim() || "",
                notes: $("#notes")?.value.trim() || "",
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            };

            if (!data.title) return alert("Title is required");

            try {
                await fb.db.collection("users").doc(u.uid).collection("books").add(data);
                alert("Book added");
                location.href = "index.html";
            } catch (e) {
                alert("Error: " + (e.message || e));
            }
        }

        document.addEventListener("DOMContentLoaded", () => {
            $("#save-book")?.addEventListener("click", saveBook);
        });
    })();


    // --- Filbehandling og cover extract —
    async function tryExtractCover(file) {
        try {
            if (!file) return null;
            if (/\.pdf$/i.test(file.name) && window.pdfjsLib) {
                const ab = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
                const page = await pdf.getPage(1);
                const vp = page.getViewport({ scale: 1.4 });
                const canvas = document.createElement("canvas");
                canvas.width = vp.width; canvas.height = vp.height;
                await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
                return new Promise(res => canvas.toBlob(res, "image/jpeg", 0.9));
            }
            if (/\.epub$/i.test(file.name) && window.ePub) {
                const book = ePub(file);
                const coverUrl = await book.loaded.cover;
                if (coverUrl) {
                    const blobUrl = await book.archive.createUrl(coverUrl);
                    const resp = await fetch(blobUrl);
                    return await resp.blob();
                }
            }
        } catch (e) {
            console.error("Cover extraction failed", e);
        }
        return null;
    }

    // --- Last opp filer til Firebase Storage ---
    async function uploadToStorage(uid, bookId, file, cover) {
        const storage = FB.storage?.ref ? FB.storage : firebase.storage();
        let fileUrl = null;
        let coverUrl = null;

        if (file) {
            const ref = storage.ref(`users/${uid}/books/${bookId}/${file.name}`);
            await ref.put(file);
            fileUrl = await ref.getDownloadURL();
        }

        if (cover) {
            const cref = storage.ref(`users/${uid}/books/${bookId}/cover.jpg`);
            await cref.put(cover, { contentType: "image/jpeg" });
            coverUrl = await cref.getDownloadURL();
        }

        return { fileUrl, coverUrl };
    }

    // --- Opprett bok i Firestore (første lagring) ---
    async function firstSave(user) {
        const col = dbSvc().collection("users").doc(user.uid).collection("books");
        const docRef = await col.add({
            title: titleEl.value.trim(),
            author: authorEl.value.trim(),
            createdAt: new Date(),
            updatedAt: new Date()
        });
        createdBookId = docRef.id;
        const { fileUrl, coverUrl } = await uploadToStorage(user.uid, createdBookId, fileInput.files?.[0], coverBlob);

        await docRef.set({
            fileUrl,
            fileType: fileMeta?.type || null,
            fileName: fileMeta?.name || null,
            coverUrl
        }, { merge: true });
    }

    // --- Oppdater eksisterende bok ---
    async function updateSave(user) {
        const ref = dbSvc().collection("users").doc(user.uid).collection("books").doc(createdBookId);
        const patch = {
            title: titleEl.value.trim(),
            author: authorEl.value.trim(),
            updatedAt: new Date()
        };
        const { fileUrl, coverUrl } = await uploadToStorage(user.uid, createdBookId, fileInput.files?.[0], coverBlob);
        if (fileUrl) patch.fileUrl = fileUrl;
        if (fileMeta?.type) patch.fileType = fileMeta.type;
        if (fileMeta?.name) patch.fileName = fileMeta.name;
        if (coverUrl) patch.coverUrl = coverUrl;

        await ref.set(patch, { merge: true });
    }

    // --- Save-protokoll ---
    async function handleSave(opts = {}) {
        if (saving) return false;
        if (!titleEl.value.trim() || !authorEl.value.trim()) {
            if (!opts.silent) alert("Title and Author are required.");
            return false;
        }
        saving = true;
        saveBtn.disabled = true;

        try {
            const user = await requireUser();
            if (!createdBookId) await firstSave(user);
            else await updateSave(user);
            if (!opts.silent) alert("Saved ✓");
            return true;
        } catch (e) {
            console.error("Save failed", e);
            if (!opts.silent) alert(e.message || "Failed to save the book.");
            return false;
        } finally {
            saving = false;
            saveBtn.disabled = false;
        }
    }

    // --- Init bind på Submit og knapp ---
    document.addEventListener("DOMContentLoaded", () => {
        form?.addEventListener("submit", e => { e.preventDefault(); handleSave(); });
        saveBtn?.addEventListener("click", e => { e.preventDefault(); handleSave(); });
    });

    // --- Eksponering for testing eller ekstern calls ---
    window.firstSave = firstSave;
    window.updateSave = updateSave;
    window.handleSave = handleSave;

})();
