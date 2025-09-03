/* =========================================================
 PageBud – add-book.js
 - Keeps existing chips markup intact (only builds if empty)
 - Save uploads optional file + cover, writes Firestore doc
 - Save/Cancel/Choose-file are reliably clickable
 - Redirects to homepage after save
========================================================= */
(function () {
    "use strict";

    // ------- tiny utils -------
    const byId = (id) => document.getElementById(id);
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    const goHomeFresh = () => window.location.replace(`index.html?refresh=${Date.now()}`);

    // ------- Firebase helpers (compat-friendly) -------
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
    function storageSvc() {
        try {
            if (FB.storage?.ref) return FB.storage;
            return firebase.storage();
        } catch { return null; }
    }
    async function requireUser() {
        const auth = authSvc();
        if (auth.currentUser) return auth.currentUser;
        return new Promise((res, rej) => {
            const off = auth.onAuthStateChanged(u => { off(); u ? res(u) : rej(new Error("Not signed in")); });
        });
    }

    // ------- constants lookups (used only if chip containers are empty) -------
    function getLists() {
        const C =
            (window.PB_CONST) ||
            (window.CONSTANTS) ||
            (window.PB && {
                GENRES: window.PB.GENRES,
                MOODS: window.PB.MOODS,
                TROPES: window.PB.TROPES,
                STATUSES: window.PB.STATUSES,
                FORMATS: window.PB.FORMATS
            }) || {};

        const genres = C.GENRES || window.GENRES || ["Romance", "Mystery", "Thriller", "Fantasy", "Sci-Fi", "Horror", "Non-fiction", "Historical", "YA"];
        const moods = C.MOODS || window.MOODS || ["Cozy", "Dark", "Funny", "Steamy", "Heartwarming", "Gritty"];
        const tropes = C.TROPES || window.TROPES || ["Enemies to Lovers", "Friends to Lovers", "Forced Proximity", "Found Family", "Love Triangle", "Second Chance", "Grumpy / Sunshine"];
        const statuses = C.STATUSES || window.STATUSES || ["To Read", "Reading", "Finished", "DNF"];
        const formats = C.FORMATS || window.FORMATS || ["eBook", "Audiobook", "Paperback", "Hardcover"];
        return { genres, moods, tropes, statuses, formats };
    }

    // ------- hidden inputs for chips -------
    function ensureHidden(form, name) {
        let el = form.querySelector(`input[name="${name}"]`);
        if (!el) {
            el = document.createElement("input");
            el.type = "hidden";
            el.name = name;
            form.appendChild(el);
        }
        return el;
    }

    // ------- chip hydrator (uses existing .category; builds only if empty) -------
    function hydrateChipGroup({ container, items, multi, initial = [], onChange }) {
        if (!container) return;

        let chips = $$(".category", container);
        if (!chips.length && Array.isArray(items)) {
            items.forEach((label) => {
                const el = document.createElement("span");
                el.className = "category";
                el.textContent = label;
                el.dataset.value = String(label);
                container.appendChild(el);
            });
            chips = $$(".category", container);
        }

        const initialSet = new Set(Array.isArray(initial) ? initial.map(String) : [String(initial)].filter(Boolean));
        chips.forEach(ch => {
            const val = ch.dataset.value || ch.textContent.trim();
            ch.dataset.value = val;
            if (initialSet.size) ch.classList.toggle("active", initialSet.has(val));
            ch.tabIndex = 0;
            ch.setAttribute("role", "button");
        });

        function commit() {
            const picked = $$(".category.active", container).map(c => c.dataset.value || c.textContent.trim());
            onChange?.(multi ? picked : (picked[0] || ""));
        }
        function toggleChip(chip) {
            if (multi) chip.classList.toggle("active");
            else {
                chips.forEach(c => c.classList.remove("active"));
                chip.classList.add("active");
            }
            commit();
        }

        container.addEventListener("click", (e) => {
            const chip = e.target.closest(".category");
            if (!chip || !container.contains(chip)) return;
            toggleChip(chip);
        });
        container.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                const chip = e.target.closest(".category");
                if (!chip || !container.contains(chip)) return;
                e.preventDefault();
                toggleChip(chip);
            }
        });

        commit();
    }

    // ------- cover extraction (best-effort) -------
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
                const coverPath = await book.loaded.cover;
                if (coverPath) {
                    const blobUrl = await book.archive.createUrl(coverPath);
                    const resp = await fetch(blobUrl);
                    return await resp.blob();
                }
            }
        } catch (e) {
            console.warn("Cover extraction failed (non-fatal):", e);
        }
        return null;
    }

    // ------- storage upload -------
    async function uploadToStorage(uid, bookId, file, cover) {
        const storage = storageSvc();
        if (!storage) return {};

        let fileUrl = null, coverUrl = null, storagePath = null, fileExt = null;

        if (file) {
            const ext = (file.name.split(".").pop() || "").toLowerCase();
            fileExt = ext === "pdf" ? "pdf" : (ext === "epub" ? "epub" : "bin");
            storagePath = `users/${uid}/books/${bookId}/book.${fileExt}`;
            const ref = storage.ref(storagePath);
            await ref.put(file, {
                contentType:
                    file.type ||
                    (fileExt === "pdf" ? "application/pdf" :
                        fileExt === "epub" ? "application/epub+zip" : "application/octet-stream"),
                customMetadata: { originalName: file.name }
            });
            fileUrl = await ref.getDownloadURL();
        }

        if (cover) {
            const cref = storage.ref(`users/${uid}/books/${bookId}/cover.jpg`);
            await cref.put(cover, { contentType: "image/jpeg" });
            coverUrl = await cref.getDownloadURL();
        }

        const meta = { fileUrl, coverUrl, storagePath, fileExt, hasFile: !!fileUrl };
        if (fileExt === "pdf" && fileUrl) meta.pdfUrl = fileUrl;
        if (fileExt === "epub" && fileUrl) meta.epubUrl = fileUrl;
        return meta;
    }

    // ------- state -------
    let createdBookId = null;
    let saving = false;
    let fileMeta = null;
    let coverBlob = null;

    // ------- main init -------
    function init() {
        const form = byId("bookForm") || $("form");
        if (!form) return;

        const titleEl = byId("title");
        const authorEl = byId("author");
        const startedEl = byId("started");
        const finishedEl = byId("finished");
        const reviewEl = byId("review");

        const saveBtn = byId("saveBtn") || byId("save-book") || $('[data-action="save"]') || $('[data-role="save-book"]');
        const cancelBtn = byId("cancelBtn") || $('.form-actions-fixed .btn.btn-secondary');

        const fileInput = byId("bookFile");
        const pickBtn = byId("btnPickFile");
        const fileNameEl = byId("fileName");
        const coverPrev = byId("coverPreview");

        // hidden inputs for chips
        const inpGenres = ensureHidden(form, "genres");
        const inpMoods = ensureHidden(form, "moods");
        const inpTropes = ensureHidden(form, "tropes");
        const inpStatus = ensureHidden(form, "status");
        const inpFormat = ensureHidden(form, "format");
        if (!inpGenres.value) inpGenres.value = "[]";
        if (!inpMoods.value) inpMoods.value = "[]";
        if (!inpTropes.value) inpTropes.value = "[]";

        // CHIP HYDRATION (build ONLY if empty)
        const { genres, moods, tropes, statuses, formats } = getLists();
        const genresBox = $("#genresBox .categories") || $("#genresBox") || $("#genres") || $('[data-chips="genres"]');
        const moodsBox = $("#moodsBox .categories") || $("#moodsBox") || $("#moods") || $('[data-chips="moods"]');
        const tropesBox = $("#tropesBox .categories") || $("#tropesBox") || $("#tropes") || $('[data-chips="tropes"]');
        const statusBox = $("#statusChips") || $('[data-chips="status"]');
        const formatBox = $("#formatChips") || $('[data-chips="format"]');

        hydrateChipGroup({
            container: genresBox, items: $$(".category", genresBox || document.createElement("div")).length ? null : genres, multi: true, initial: [],
            onChange: (vals) => { try { inpGenres.value = JSON.stringify(vals); } catch { inpGenres.value = "[]"; } }
        });
        hydrateChipGroup({
            container: moodsBox, items: $$(".category", moodsBox || document.createElement("div")).length ? null : moods, multi: true, initial: [],
            onChange: (vals) => { try { inpMoods.value = JSON.stringify(vals); } catch { inpMoods.value = "[]"; } }
        });
        hydrateChipGroup({
            container: tropesBox, items: $$(".category", tropesBox || document.createElement("div")).length ? null : tropes, multi: true, initial: [],
            onChange: (vals) => { try { inpTropes.value = JSON.stringify(vals); } catch { inpTropes.value = "[]"; } }
        });
        hydrateChipGroup({
            container: statusBox, items: $$(".category", statusBox || document.createElement("div")).length ? null : statuses, multi: false, initial: "",
            onChange: (val) => { inpStatus.value = val || ""; }
        });
        hydrateChipGroup({
            container: formatBox, items: $$(".category", formatBox || document.createElement("div")).length ? null : formats, multi: false, initial: "",
            onChange: (val) => { inpFormat.value = val || ""; }
        });

        // CHOOSE FILE wiring
        if (pickBtn && !pickBtn.getAttribute("type")) pickBtn.setAttribute("type", "button");
        pickBtn?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); fileInput?.click(); });
        fileInput?.addEventListener("change", async () => {
            const f = fileInput.files?.[0];
            if (fileNameEl) fileNameEl.textContent = f?.name || "";
            if (!f) return;
            fileMeta = {
                name: f.name,
                type: /\.pdf$/i.test(f.name) ? "pdf" : /\.epub$/i.test(f.name) ? "epub" : "unknown",
                size: f.size
            };
            coverBlob = await tryExtractCover(f);
            if (coverBlob && coverPrev) coverPrev.src = URL.createObjectURL(coverBlob);
        });

        // CANCEL wiring (non-submit)
        if (cancelBtn && !cancelBtn.getAttribute("type")) cancelBtn.setAttribute("type", "button");
        cancelBtn?.addEventListener("click", (e) => { e.preventDefault(); history.back(); });

        // SAVE logic
        async function firstSave(user) {
            const db = dbSvc();
            const col = db.collection("users").doc(user.uid).collection("books");
            const ref = col.doc(); // pre-create id for deterministic storage path
            createdBookId = ref.id;

            let genresV = [], moodsV = [], tropesV = [];
            try { genresV = JSON.parse(inpGenres.value || "[]"); } catch { }
            try { moodsV = JSON.parse(inpMoods.value || "[]"); } catch { }
            try { tropesV = JSON.parse(inpTropes.value || "[]"); } catch { }

            const payload = {
                title: (titleEl?.value || "").trim(),
                author: (authorEl?.value || "").trim(),
                started: startedEl?.value || null,
                finished: finishedEl?.value || null,
                review: reviewEl?.value || "",
                status: inpStatus.value || null,
                format: inpFormat.value || null,
                genres: Array.isArray(genresV) ? genresV : [],
                moods: Array.isArray(moodsV) ? moodsV : [],
                tropes: Array.isArray(tropesV) ? tropesV : [],
                // optional rating/spice if present as hidden inputs
                ...($('input[name="rating"]')?.value ? { rating: Number($('input[name="rating"]').value) || 0 } : {}),
                ...($('input[name="spice"]')?.value ? { spice: Number($('input[name="spice"]').value) || 0 } : {}),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (!payload.title || !payload.author) throw new Error("Title and Author are required.");

            await ref.set(payload, { merge: true });

            const f = fileInput?.files?.[0] || null;
            const meta = await uploadToStorage(user.uid, createdBookId, f, coverBlob);
            if (meta && (meta.fileUrl || meta.coverUrl)) {
                await ref.set({ ...meta, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
            }
        }

        async function updateSave(user) {
            const db = dbSvc();
            const ref = db.collection("users").doc(user.uid).collection("books").doc(createdBookId);

            let genresV = [], moodsV = [], tropesV = [];
            try { genresV = JSON.parse(inpGenres.value || "[]"); } catch { }
            try { moodsV = JSON.parse(inpMoods.value || "[]"); } catch { }
            try { tropesV = JSON.parse(inpTropes.value || "[]"); } catch { }

            const patch = {
                title: (titleEl?.value || "").trim(),
                author: (authorEl?.value || "").trim(),
                started: startedEl?.value || null,
                finished: finishedEl?.value || null,
                review: reviewEl?.value || "",
                status: inpStatus.value || null,
                format: inpFormat.value || null,
                genres: Array.isArray(genresV) ? genresV : [],
                moods: Array.isArray(moodsV) ? moodsV : [],
                tropes: Array.isArray(tropesV) ? tropesV : [],
                ...($('input[name="rating"]')?.value ? { rating: Number($('input[name="rating"]').value) || 0 } : {}),
                ...($('input[name="spice"]')?.value ? { spice: Number($('input[name="spice"]').value) || 0 } : {}),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            const f = fileInput?.files?.[0] || null;
            const meta = await uploadToStorage(user.uid, createdBookId, f, coverBlob);
            if (meta && meta.fileUrl) patch.fileUrl = meta.fileUrl;
            if (meta && meta.coverUrl) patch.coverUrl = meta.coverUrl;
            if (meta && meta.storagePath) patch.storagePath = meta.storagePath;
            if (meta && meta.fileExt) patch.fileExt = meta.fileExt;
            if (meta && typeof meta.hasFile === "boolean") patch.hasFile = meta.hasFile;
            if (meta && meta.pdfUrl) patch.pdfUrl = meta.pdfUrl;
            if (meta && meta.epubUrl) patch.epubUrl = meta.epubUrl;

            if (fileMeta?.type) patch.fileType = fileMeta.type;
            if (fileMeta?.name) patch.fileName = fileMeta.name;

            await ref.set(patch, { merge: true });
        }

        async function handleSave() {
            if (saving) return;
            if (!titleEl?.value?.trim() || !authorEl?.value?.trim()) return alert("Title and Author are required.");
            saving = true;
            if (saveBtn) saveBtn.disabled = true;
            try {
                const user = await requireUser();
                if (!createdBookId) await firstSave(user);
                else await updateSave(user);
                goHomeFresh();
            } catch (e) {
                console.error("Save failed:", e);
                alert(e?.message || "Failed to save.");
            } finally {
                saving = false;
                if (saveBtn) saveBtn.disabled = false;
            }
        }

        // SAVE wiring
        if (form.dataset.wiredSave !== "1") {
            form.dataset.wiredSave = "1";
            form.addEventListener("submit", (e) => { e.preventDefault(); handleSave(); });
        }
        if (saveBtn) {
            if (!saveBtn.getAttribute("type")) saveBtn.setAttribute("type", "button");
            if (saveBtn.dataset.wiredSave !== "1") {
                saveBtn.dataset.wiredSave = "1";
                saveBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); handleSave(); });
            }
        }
        // delegated safety-net (handles late/renamed buttons)
        if (!document.__pbAddDelegatedSave) {
            document.__pbAddDelegatedSave = true;
            document.addEventListener("click", (e) => {
                const btn = e.target.closest("#saveBtn, #save-book, [data-action='save'], [data-role='save-book']");
                if (!btn) return;
                e.preventDefault();
                handleSave();
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
