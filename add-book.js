/* =========================================================
 PageBud – add-book.js (stabil, chips-fix + Read lagrer først)
========================================================= */

(function () {
    "use strict";

    // ---------- Helpers ----------
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const byId = (id) => document.getElementById(id);
    const FB = (window.fb || window); // fra firebase-init

    // ---------- Elements ----------
    const form = byId("bookForm");
    const titleEl = byId("title");
    const authorEl = byId("author");
    const startedEl = byId("started");
    const finishedEl = byId("finished");

    const statusWrap = byId("statusChips");
    const formatWrap = byId("formatChips");
    const genresWrap = byId("genres");
    const moodsWrap = byId("moods");
    const tropesWrap = byId("tropes");

    const fileInput = byId("bookFile");
    const fileChip = byId("btnPickFile");
    const fileName = byId("fileName");
    const coverPreview = byId("coverPreview");

    // rating/chili – UI styres av rating-controls.js. Vi leser KUN dataset.value.
    const ratingBar = byId("ratingBar");
    const spiceBar = byId("spiceBar");

    const reviewEl = byId("review");
    const quoteInput = byId("quoteInput");
    const addQuoteBtn = byId("addQuoteBtn");
    const quotesList = byId("quotesList");

    const saveBtn = byId("saveBtn");

    // ---------- State ----------
    let createdBookId = null;
    let pendingQuotes = [];
    let savedQuotes = [];

    let activeStatus = null;
    let activeFormat = null;
    let pickedGenres = new Set();
    let pickedMoods = new Set();
    let pickedTropes = new Set();

    let fileMeta = null;  // {name,type,size}
    let coverBlob = null;  // Blob (fra pdf/epub om vi klarer)

    // ---------- Lister ----------
    const CONST = window.PB_CONST || {};
    const GENRES = CONST.GENRES || [];
    const MOODS = (CONST.MOODS || []).map(x => (typeof x === "string" ? x : x.name || ""));
    const TROPES = CONST.TROPES || [];

    // ---------- Chips ----------
    function buildMulti(container, items, picked) {
        if (!container) return;
        container.innerHTML = "";
        items.forEach(txt => {
            if (!txt) return;
            const el = document.createElement("span");
            el.className = "category";
            el.textContent = txt;
            el.dataset.val = txt;
            if (picked.has(txt)) el.classList.add("active");
            container.appendChild(el);
        });
        // solid delegasjon – stopp bubbling så <details> ikke spiser klikk
        container.addEventListener("click", (e) => {
            const btn = e.target.closest(".category");
            if (!btn || !container.contains(btn)) return;
            e.preventDefault(); e.stopPropagation();
            const v = btn.dataset.val;
            if (picked.has(v)) { picked.delete(v); btn.classList.remove("active"); }
            else { picked.add(v); btn.classList.add("active"); }
        });
    }
    function buildSingle(container, onPick) {
        if (!container) return;
        container.addEventListener("click", (e) => {
            const btn = e.target.closest(".category");
            if (!btn || !container.contains(btn)) return;
            e.preventDefault(); e.stopPropagation();
            $$(".category", container).forEach(n => n.classList.remove("active"));
            btn.classList.add("active");
            onPick(btn.dataset.val);
        });
    }
    function populatePickers() {
        buildMulti(genresWrap, GENRES, pickedGenres);
        buildMulti(moodsWrap, MOODS, pickedMoods);
        buildMulti(tropesWrap, TROPES, pickedTropes);
        buildSingle(statusWrap, (v) => activeStatus = v);
        buildSingle(formatWrap, (v) => activeFormat = v);
    }

    // ---------- Quotes ----------
    function renderQuotes() {
        if (!quotesList) return;
        quotesList.innerHTML = "";

        savedQuotes.forEach(q => {
            const row = document.createElement("div");
            row.className = "card";
            row.style.padding = "10px";
            row.style.display = "grid";
            row.style.gridTemplateColumns = "1fr auto";
            row.style.gap = "8px";
            const txt = document.createElement("div"); txt.textContent = q.text;
            const del = document.createElement("button");
            del.className = "btn"; del.style.background = "#e23a3a"; del.style.color = "#fff"; del.textContent = "Delete";
            del.addEventListener("click", () => { savedQuotes = savedQuotes.filter(x => x.id !== q.id); renderQuotes(); });
            row.appendChild(txt); row.appendChild(del); quotesList.appendChild(row);
        });

        pendingQuotes.forEach(q => {
            const row = document.createElement("div");
            row.className = "card"; row.style.padding = "10px";
            row.textContent = q.text; quotesList.appendChild(row);
        });
    }

    addQuoteBtn?.addEventListener("click", () => {
        const t = (quoteInput.value || "").trim();
        if (!t) return;
        pendingQuotes.push({ text: t, createdAt: Date.now() });
        quoteInput.value = "";
        renderQuotes();
    });
    quoteInput?.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") addQuoteBtn?.click();
    });

    // ---------- File UI ----------
    fileChip?.addEventListener("click", () => fileInput?.click());
    fileInput?.addEventListener("change", async () => {
        const f = fileInput.files && fileInput.files[0];
        if (fileName) fileName.textContent = f ? f.name : "";
        if (!f) return;
        fileMeta = {
            name: f.name,
            type: /\.pdf$/i.test(f.name) ? "pdf" : (/\.epub$/i.test(f.name) ? "epub" : "unknown"),
            size: f.size
        };
        coverBlob = await tryExtractCover(f);
        if (coverBlob && coverPreview) {
            const url = URL.createObjectURL(coverBlob);
            coverPreview.src = url;
        }
        ensureReadButton(); // vis med én gang – klikker lagrer først
    });

    // ---------- Cover extraction ----------
    async function tryExtractCover(file) {
        try {
            if (!file) return null;
            if (/\.pdf$/i.test(file.name) && window.pdfjsLib) {
                const ab = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
                const page = await pdf.getPage(1);
                const vp = page.getViewport({ scale: 1.4 });
                const c = document.createElement("canvas");
                c.width = vp.width; c.height = vp.height;
                await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
                return await new Promise(res => c.toBlob(res, "image/jpeg", 0.9));
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
        } catch (e) { console.warn("cover extract failed", e); }
        return null;
    }

    // ---------- Read-knapp (lagrer alltid først) ----------
    function ensureReadButton() {
        const container = fileName?.parentElement || document.body;
        let btn = document.getElementById("readNowBtn");
        if (!btn) {
            btn = document.createElement("button");
            btn.id = "readNowBtn";
            btn.className = "btn";
            btn.style.marginLeft = "8px";
            btn.textContent = "Read";
            container.appendChild(btn);
        }
        btn.onclick = async () => {
            try {
                const id = await handleSave(); // lagrer (eller oppdaterer) først
                if (id) location.href = `reader.html?id=${id}`;
            } catch (e) {
                console.error(e);
                alert("Could not open the reader yet. Try saving again.");
            }
        };
    }

    // ---------- Save pipeline ----------
    function collectBaseDoc() {
        return {
            title: (titleEl?.value || "").trim(),
            author: (authorEl?.value || "").trim(),
            started: startedEl?.value || null,
            finished: finishedEl?.value || null,
            status: activeStatus || null,
            format: activeFormat || null,
            genres: Array.from(pickedGenres),
            moods: Array.from(pickedMoods),
            tropes: Array.from(pickedTropes),
            rating: Number(ratingBar?.dataset.value || 0),
            spice: Number(spiceBar?.dataset.value || 0),
            review: (reviewEl?.value || "").trim(),
            favorite: false,
            createdAt: new Date(),
            updatedAt: new Date()
        };
    }

    // Storage (compat): FB.storage.ref(...)
    async function uploadToStorage(uid, bookId, file, cover) {
        const storage = FB.storage;
        let fileUrl = null, coverUrl = null;

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

    async function firstSave(u) {
        const db = FB.db || FB.firestore();
        const col = db.collection("users").doc(u.uid).collection("books");

        const docRef = await col.add(collectBaseDoc());
        createdBookId = docRef.id;

        const f = (fileInput?.files && fileInput.files[0]) || null;
        const up = await uploadToStorage(u.uid, createdBookId, f, coverBlob);

        const quotesToSave = pendingQuotes.map(q => ({
            id: db.collection("_").doc().id,
            text: q.text,
            createdAt: new Date()
        }));

        await docRef.set({
            fileUrl: up.fileUrl || null,
            fileType: fileMeta?.type || null,
            fileName: fileMeta?.name || null,
            coverUrl: up.coverUrl || null,
            quotes: quotesToSave
        }, { merge: true });

        savedQuotes = quotesToSave.map(q => ({ id: q.id, text: q.text }));
        pendingQuotes = [];
        renderQuotes();

        if ((up.fileUrl || f) && createdBookId) ensureReadButton();
        return createdBookId;
    }

    async function updateSave(u) {
        const db = FB.db || FB.firestore();
        const ref = db.collection("users").doc(u.uid).collection("books").doc(createdBookId);

        const base = collectBaseDoc();
        base.updatedAt = new Date();

        const f = (fileInput?.files && fileInput.files[0]) || null;
        const up = await uploadToStorage(u.uid, createdBookId, f, coverBlob);

        const patch = { ...base };
        if (up.fileUrl) patch.fileUrl = up.fileUrl;
        if (fileMeta?.type) patch.fileType = fileMeta.type;
        if (fileMeta?.name) patch.fileName = fileMeta.name;
        if (up.coverUrl) patch.coverUrl = up.coverUrl;

        if (pendingQuotes.length) {
            const more = pendingQuotes.map(q => ({
                id: db.collection("_").doc().id,
                text: q.text,
                createdAt: new Date()
            }));
            if (FB.firebase?.firestore?.FieldValue?.arrayUnion) {
                patch.quotes = FB.firebase.firestore.FieldValue.arrayUnion(...more);
            } else {
                const snap = await ref.get();
                const existing = (snap.exists && Array.isArray(snap.data().quotes)) ? snap.data().quotes : [];
                patch.quotes = existing.concat(more);
            }
            savedQuotes = savedQuotes.concat(more.map(q => ({ id: q.id, text: q.text })));
            pendingQuotes = [];
        }

        await ref.set(patch, { merge: true });
        renderQuotes();

        if ((up.fileUrl || fileMeta) && createdBookId) ensureReadButton();
        return createdBookId;
    }

    // Robust auth
    async function getAuthUser() {
        const auth =
            (FB && FB.auth) ||
            (FB && FB.firebase && FB.firebase.auth && FB.firebase.auth()) ||
            (firebase && firebase.auth && firebase.auth());
        const cur = auth && auth.currentUser;
        if (cur) return cur;
        return await new Promise((res, rej) => {
            const unsub = auth.onAuthStateChanged(u => { unsub(); u ? res(u) : rej(new Error("Not signed in")); });
        });
    }

    async function handleSave() {
        const t = (titleEl?.value || "").trim();
        const a = (authorEl?.value || "").trim();
        if (!t || !a) { alert("Title and Author are required."); throw new Error("missing fields"); }

        saveBtn && (saveBtn.disabled = true);
        try {
            const u = await getAuthUser();
            if (!createdBookId) return await firstSave(u);
            return await updateSave(u);
        } catch (e) {
            console.error(e);
            alert(e?.message || "Failed to save the book. See console for details.");
            throw e;
        } finally {
            saveBtn && (saveBtn.disabled = false);
        }
    }

    // ---------- Bind ----------
    function bindSave() {
        form?.addEventListener("submit", (e) => {
            e.preventDefault(); e.stopPropagation();
            handleSave().catch(() => { });
        });
        saveBtn?.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            handleSave().catch(() => { });
        });
    }

    // ---------- Init ----------
    document.addEventListener("DOMContentLoaded", () => {
        populatePickers();
        bindSave();
        if (coverPreview) coverPreview.src = coverPreview.src || "";
    });
})();
