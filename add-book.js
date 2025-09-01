/* =========================================================
 PageBud – add-book.js (stabil)
 - Binder Save-knappen trygt (funksjon i samme scope som handleSave)
 - Lagrer bok, laster opp fil/cover via FB.storage.ref(...)
 - Viser "Read"-knapp etter første lagring hvis fil finnes
 - Rører IKKE stjerne-/chili-widgeter eller layouten din
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
    const fileChip = byId("btnPickFile"); // hvis du har en chip-knapp i HTML
    const fileName = byId("fileName");    // label for filnavn
    const coverPreview = byId("coverPreview");

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

    let ratingValue = 0;
    let spiceValue = 0;

    let activeStatus = null;
    let activeFormat = null;
    let pickedGenres = new Set();
    let pickedMoods = new Set();
    let pickedTropes = new Set();

    let fileMeta = null;  // {name,type,size}
    let coverBlob = null;  // blob for cover (om vi klarer å trekke ut)

    // ---------- Lister (bruker dine hvis definert) ----------
    const CONST = window.PB_CONST || {};
    const GENRES = CONST.GENRES || [];
    const MOODS = (CONST.MOODS || []).map(x => (typeof x === "string" ? x : x.name || ""));
    const TROPES = CONST.TROPES || [];

    // ---------- Rating / Spice (IKKE endre UI; les verdier fra data-attrib om ønskelig) ----------
    function initRatings() {
        // Hvis du bruker PB_Rating i HTML, lar vi det tegne som før.
        // Vi leser verdiene fra data-attributtene ved klikk, ellers fallback ved lagring.
        ratingBar?.addEventListener("click", () => {
            ratingValue = Number(ratingBar?.dataset.value || 0);
        });
        spiceBar?.addEventListener("click", () => {
            spiceValue = Number(spiceBar?.dataset.value || 0);
        });
    }

    // ---------- Pickers ----------
    function buildMulti(container, items, picked) {
        if (!container) return;
        container.innerHTML = "";
        items.forEach(txt => {
            if (!txt) return;
            const el = document.createElement("span");
            el.className = "category";
            el.textContent = txt;
            el.dataset.val = txt;
            el.addEventListener("click", () => {
                const v = el.dataset.val;
                if (picked.has(v)) { picked.delete(v); el.classList.remove("active"); }
                else { picked.add(v); el.classList.add("active"); }
            });
            container.appendChild(el);
        });
    }
    function buildSingle(container, onPick) {
        if (!container) return;
        container.addEventListener("click", (e) => {
            const btn = e.target.closest(".category");
            if (!btn) return;
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

        // lagrede (med delete)
        savedQuotes.forEach(q => {
            const row = document.createElement("div");
            row.className = "card";
            row.style.padding = "10px";
            row.style.display = "grid";
            row.style.gridTemplateColumns = "1fr auto";
            row.style.gap = "8px";

            const txt = document.createElement("div");
            txt.textContent = q.text;

            const del = document.createElement("button");
            del.className = "btn";
            del.style.background = "#e23a3a";
            del.style.color = "#fff";
            del.textContent = "Delete";
            del.addEventListener("click", () => deleteSavedQuote(q.id));

            row.appendChild(txt);
            row.appendChild(del);
            quotesList.appendChild(row);
        });

        // pending (uten delete)
        pendingQuotes.forEach(q => {
            const row = document.createElement("div");
            row.className = "card";
            row.style.padding = "10px";
            row.textContent = q.text;
            quotesList.appendChild(row);
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

    async function deleteSavedQuote(quoteId) {
        if (!createdBookId) return;
        const u = FB.auth?.currentUser || FB.auth().currentUser;
        if (!u) return;

        const db = FB.db || FB.firestore();
        const ref = db.collection("users").doc(u.uid).collection("books").doc(createdBookId);

        await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists) return;
            const arr = Array.isArray(snap.data().quotes) ? snap.data().quotes : [];
            tx.update(ref, { quotes: arr.filter(q => q.id !== quoteId) });
        });

        savedQuotes = savedQuotes.filter(q => q.id !== quoteId);
        renderQuotes();
    }

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
    });

    // ---------- Cover extraction (best-effort) ----------
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

    // ---------- Read-knapp ----------
    function ensureReadButton(bookId) {
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
        btn.onclick = () => location.href = `reader.html?id=${bookId}`;
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
            // Les rating/spice fra data-attributtene hvis de er satt
            rating: Number(ratingBar?.dataset.value || ratingValue || 0),
            spice: Number(spiceBar?.dataset.value || spiceValue || 0),
            review: (reviewEl?.value || "").trim(),
            favorite: false,
            createdAt: new Date(),
            updatedAt: new Date()
        };
    }

    // *** STORAGE v9 compat: bruk FB.storage.ref(...) – IKKE FB.storage() ***
    async function uploadToStorage(uid, bookId, file, cover) {
        const storage = FB.storage; // compat-objekt med .ref()
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

        if ((up.fileUrl || f) && createdBookId) ensureReadButton(createdBookId);
        alert("Book saved ✓");
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

        if ((up.fileUrl || fileMeta) && createdBookId) ensureReadButton(createdBookId);
        alert("Changes saved ✓");
    }

    async function handleSave() {
        const t = (titleEl?.value || "").trim();
        const a = (authorEl?.value || "").trim();
        if (!t || !a) { alert("Title and Author are required."); return; }

        // lås knapp
        saveBtn && (saveBtn.disabled = true);
        try {
            // sørg for bruker
            const u = FB.auth?.currentUser || (await new Promise((res, rej) => {
                const unsub = (FB.auth ? FB.auth() : FB.firebase.auth()).onAuthStateChanged((x) => { unsub(); x ? res(x) : rej(new Error("Not signed in")); });
            }));

            if (!createdBookId) await firstSave(u);
            else await updateSave(u);
        } catch (e) {
            console.error(e);
            alert("Failed to save the book. See console for details.");
        } finally {
            saveBtn && (saveBtn.disabled = false);
        }
    }

    // ---------- Bind Save (viktig: i samme scope som handleSave) ----------
    function bindSave() {
        form?.addEventListener("submit", (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSave();
        });
        saveBtn?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSave();
        });
    }

    // ---------- Init ----------
    document.addEventListener("DOMContentLoaded", () => {
        populatePickers();
        initRatings();   // rører ikke UI – kun leser klikk
        bindSave();      // <— binder save trygt
        if (coverPreview) coverPreview.src = coverPreview.src || "";
    });
})();
