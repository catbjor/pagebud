/* ============================================================
   PageBud – add-book.js
   - Creates users/{uid}/books/{bookId}
   - Optional file upload (PDF/EPUB) + cover extraction
   - Half-star + chili widgets
   - Status / Format = single-select chips
   - Genres / Moods / Tropes = multi-select chips
   - Quotes: one Save/Add button (collected locally first), then
     persisted to subcollection after the book is created.
============================================================ */
"use strict";

/* ---------- tiny utils ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const db = (window.fb && fb.db) ? fb.db :
    (window.firebase && firebase.firestore ? firebase.firestore() : null);

/* Placeholder cover */
const PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="240">
     <rect width="100%" height="100%" rx="12" fill="#e5e7eb"/>
     <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
           font-size="14" fill="#9aa3af" font-family="system-ui,-apple-system,Segoe UI,Roboto">
           Cover image
     </text>
   </svg>`
);

function toast(msg) {
    let t = $("#pb-toast");
    if (!t) { t = document.createElement("div"); t.id = "pb-toast"; t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 1600);
}

/* ---------- chips helpers ---------- */
function renderChips(list, el, { multi = false, value = [], onChange } = {}) {
    if (!el || !Array.isArray(list)) return;
    const set = new Set(Array.isArray(value) ? value : (value ? [value] : []));
    el.innerHTML = list.map(x => `
    <button type="button"
            class="chip ${set.has(x) ? "active" : ""}"
            data-val="${x}">${x}</button>`).join("");

    el.addEventListener("click", (e) => {
        const b = e.target.closest(".chip"); if (!b) return;
        const v = b.dataset.val;
        if (multi) {
            if (b.classList.contains("active")) { b.classList.remove("active"); set.delete(v); }
            else { b.classList.add("active"); set.add(v); }
            onChange?.(Array.from(set));
        } else {
            // single select
            el.querySelectorAll(".chip").forEach(n => n.classList.remove("active"));
            b.classList.add("active");
            onChange?.(v);
        }
    });
}

/* ---------- rating widgets mount ---------- */
function mountWidgets() {
    PB_Rating.renderStars($("#ratingBar"), 0, 6);
    PB_Rating.renderChilis($("#spiceBar"), 0, 5);
}

/* ---------- PDF & EPUB cover extraction ---------- */
async function ensurePdfJs() {
    if (window.pdfjsLib) return;
    await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
    // worker
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
}
async function extractFromPDF(file) {
    try {
        await ensurePdfJs();
        const url = URL.createObjectURL(file);
        const doc = await pdfjsLib.getDocument({ url }).promise;
        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
        URL.revokeObjectURL(url);
        return canvas.toDataURL("image/jpeg", 0.92);
    } catch (e) { console.warn("PDF cover extract failed", e); return null; }
}

async function ensureEpubJs() {
    if (window.ePub) return;
    await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/epub.js/0.3.92/epub.min.js";
        s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
}
async function extractFromEPUB(file) {
    try {
        await ensureEpubJs();
        const book = ePub(file);
        const coverHref = await book.loaded.cover;
        if (!coverHref) return null;
        const url = await book.archive.createUrl(coverHref, { base64: false });
        // Convert to dataURL
        const blob = await (await fetch(url)).blob();
        return await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
    } catch (e) { console.warn("EPUB cover extract failed", e); return null; }
}

/* ---------- upload to Storage ---------- */
async function uploadFileFor(uid, bookId, file) {
    if (!file || !fb?.storage) return { fileType: null, fileUrl: null };
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const path = `users/${uid}/books/${bookId}/book.${ext || 'bin'}`;
    const ref = fb.storage.ref().child(path);
    await ref.put(file);
    const url = await ref.getDownloadURL();
    return { fileType: ext, fileUrl: url };
}

/* ---------- page boot ---------- */
document.addEventListener("DOMContentLoaded", () => {
    // default cover
    const coverPreview = $("#coverPreview");
    coverPreview.src = PLACEHOLDER;

    // mount rating
    mountWidgets();

    // render chips from constants
    const C = window.PB_CONST || {};
    renderChips(["tbr", "reading", "finished", "dnf"], $("#statusChips"), {
        multi: false, value: "tbr",
        onChange: (v) => { $("#statusChips").dataset.value = v; }
    });
    renderChips(["ebook", "paperback", "hardcover", "audiobook"], $("#formatChips"), {
        multi: false, value: "",
        onChange: (v) => { $("#formatChips").dataset.value = v; }
    });
    renderChips(C.GENRES, $("#genres"), { multi: true, value: [], onChange: (a) => { $("#genres").dataset.value = JSON.stringify(a); } });
    renderChips(C.MOODS, $("#moods"), { multi: true, value: [], onChange: (a) => { $("#moods").dataset.value = JSON.stringify(a); } });
    renderChips(C.TROPES, $("#tropes"), { multi: true, value: [], onChange: (a) => { $("#tropes").dataset.value = JSON.stringify(a); } });

    // quotes (collect locally; persisted after book created)
    const pendingQuotes = [];
    const qInput = $("#quoteInput");
    const qList = $("#quotesList");
    function renderPending() {
        qList.innerHTML = pendingQuotes.length
            ? pendingQuotes.map((t, i) => `<div class="quote-row"><span class="q">${escapeHtml(t)}</span></div>`).join("")
            : `<div class="muted" style="padding:8px 0">No quotes yet.</div>`;
    }
    $("#addQuoteBtn")?.addEventListener("click", () => {
        const txt = (qInput.value || "").trim();
        if (!txt) return;
        pendingQuotes.push(txt);
        qInput.value = "";
        renderPending();
        toast("Quote saved (will be added with the book)");
    });
    qInput?.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); $("#addQuoteBtn").click(); }
    });
    renderPending();

    // clicking cover opens file picker
    $("#coverPreview")?.addEventListener("click", () => $("#bookFile")?.click());

    // file → try to extract cover
    $("#bookFile")?.addEventListener("change", async (e) => {
        const f = e.target.files?.[0]; if (!f) return;
        let dataUrl = null;
        if (/^application\/pdf/.test(f.type)) dataUrl = await extractFromPDF(f);
        else if (/epub/i.test(f.name) || /epub/i.test(f.type)) dataUrl = await extractFromEPUB(f);
        else if (/^image\//.test(f.type)) {
            // direct image selected
            dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
        }
        if (dataUrl) {
            coverPreview.src = dataUrl;
            coverPreview.dataset.dataUrl = dataUrl; // keep to save in Firestore
            toast("Cover extracted ✓");
        } else {
            toast("Could not extract a cover (file will still be uploaded)");
        }
    });

    // SAVE BOOK
    $("#saveBtn")?.addEventListener("click", async () => {
        const u = fb?.auth?.currentUser || firebase?.auth?.().currentUser;
        if (!u || !db) { alert("Please sign in."); return; }

        const title = ($("#title")?.value || "").trim();
        const author = ($("#author")?.value || "").trim();
        const started = $("#started")?.value || null;
        const finished = $("#finished")?.value || null;
        const review = $("#review")?.value || "";

        if (!title || !author) { alert("Title and Author are required."); return; }

        const rating = Number($("#ratingBar")?.dataset.value || 0);
        const spice = Number($("#spiceBar")?.dataset.value || 0);

        const status = $("#statusChips")?.dataset.value || "tbr";
        const format = $("#formatChips")?.dataset.value || "";

        const genres = JSON.parse($("#genres")?.dataset.value || "[]");
        const moods = JSON.parse($("#moods")?.dataset.value || "[]");
        const tropes = JSON.parse($("#tropes")?.dataset.value || "[]");

        const file = $("#bookFile")?.files?.[0] || null;
        const coverDataUrl = $("#coverPreview")?.dataset?.dataUrl || null;

        try {
            // first create doc id
            const booksCol = db.collection("users").doc(u.uid).collection("books");
            const ref = booksCol.doc(); // premake id

            // upload file (if any)
            let fileMeta = { fileType: null, fileUrl: null };
            if (file) { fileMeta = await uploadFileFor(u.uid, ref.id, file); }

            const baseDoc = {
                id: ref.id,
                title, author,
                status, format,
                started, finished,
                review, rating, spice,
                genres, moods, tropes,
                coverUrl: null,
                coverDataUrl: coverDataUrl || null,
                ...fileMeta,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            await ref.set(baseDoc, { merge: true });

            // persist quotes (subcollection)
            if (pendingQuotes.length) {
                const batch = db.batch();
                pendingQuotes.forEach(q => {
                    const qRef = ref.collection("quotes").doc();
                    batch.set(qRef, { text: q, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
                });
                await batch.commit();
            }

            toast("Book saved ✓");
            location.href = "index.html";
        } catch (err) {
            console.error(err);
            alert("Save failed.");
        }
    });
});

/* ---------- helpers ---------- */
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[s]));
}
