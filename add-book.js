/* =========================================================
 PageBud – add-book.js (focused patch)
 - Leave Status/Format/File logic as-is
 - Make Genres/Moods/Tropes always clickable (even inside <details>)
 - Same save flow, progress text, toast, redirect, local fallback
========================================================= */
(function () {
    "use strict";

    // ------- tiny utils -------
    const byId = (id) => document.getElementById(id);
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const text = (el) => (el?.textContent || "").trim().toLowerCase();

    function showToast(msg = "Saved ✓", ms = 900) {
        try {
            const t = document.createElement("div");
            t.className = "toast";
            t.textContent = msg;
            document.body.appendChild(t);
            requestAnimationFrame(() => t.classList.add("show"));
            setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, ms);
        } catch { }
    }

    function goHomeFresh() {
        const url = `index.html?refresh=${Date.now()}`;
        try { window.location.assign(url); } catch { window.location.href = url; }
        setTimeout(() => { try { window.location.href = url; } catch { } }, 1500);
    }

    // ------- Firebase helpers (don’t run until save) -------
    const FB = window.fb || window;
    function authSvc() {
        try {
            if (FB.auth && typeof FB.auth === "object" && "currentUser" in FB.auth) return FB.auth;
            if (typeof FB.auth === "function") return FB.auth();
            if (FB.firebase?.auth) return FB.firebase.auth();
            if (typeof firebase !== "undefined" && firebase.auth) return firebase.auth();
        } catch { }
        throw new Error("Firebase SDK not loaded on this page.");
    }
    function dbSvc() {
        try {
            if (FB.db?.collection) return FB.db;
            if (typeof FB.firestore === "function") return FB.firestore();
            if (FB.firestore?.collection) return FB.firestore;
            if (typeof firebase !== "undefined" && firebase.firestore) return firebase.firestore();
        } catch { }
        throw new Error("Firebase SDK not loaded on this page.");
    }
    function storageSvc() {
        try {
            if (FB.storage?.ref) return FB.storage;
            if (typeof firebase !== "undefined" && firebase.storage) return firebase.storage();
        } catch { }
        return null;
    }
    async function requireUser() {
        const auth = authSvc();
        if (auth.currentUser) return auth.currentUser;
        return new Promise((res, rej) => {
            const off = auth.onAuthStateChanged(u => { off(); u ? res(u) : rej(new Error("Not signed in")); });
        });
    }

    // ------- lists (only if containers are empty) -------
    function getLists() {
        const C =
            window.PB_CONST ||
            window.CONSTANTS ||
            (window.PB && {
                GENRES: window.PB.GENRES, MOODS: window.PB.MOODS,
                TROPES: window.PB.TROPES, STATUSES: window.PB.STATUSES, FORMATS: window.PB.FORMATS
            }) || {};
        const genres = C.GENRES || window.GENRES || ["Romance", "Mystery", "Thriller", "Fantasy", "Sci-Fi", "Horror", "Non-fiction", "Historical", "YA"];
        const moods = C.MOODS || window.MOODS || ["Cozy", "Dark", "Funny", "Steamy", "Heartwarming", "Gritty"];
        const tropes = C.TROPES || window.TROPES || ["Enemies to Lovers", "Friends to Lovers", "Forced Proximity", "Found Family", "Love Triangle", "Second Chance", "Grumpy / Sunshine"];
        const statuses = C.STATUSES || window.STATUSES || ["To Read", "Reading", "Finished", "DNF"];
        const formats = C.FORMATS || window.FORMATS || ["eBook", "Audiobook", "Paperback", "Hardcover"];
        return { genres, moods, tropes, statuses, formats };
    }

    // ------- hidden inputs -------
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

    // ------- cover extraction (unchanged) -------
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
        } catch (e) { console.warn("Cover extraction failed (non-fatal):", e); }
        return null;
    }

    // ------- upload with progress (unchanged) -------
    function uploadWithProgress(ref, file, options, onProgress, maxMs = 120000) {
        return new Promise((resolve, reject) => {
            try {
                const task = ref.put(file, options);
                let done = false;
                const timer = setTimeout(() => { if (!done) { try { task.cancel?.(); } catch { } reject(new Error("Upload timed out")); } }, maxMs);

                task.on("state_changed",
                    (snap) => { if (onProgress && snap?.totalBytes) onProgress(Math.floor((snap.bytesTransferred / snap.totalBytes) * 100)); },
                    (err) => { clearTimeout(timer); if (!done) reject(err); },
                    async () => { clearTimeout(timer); done = true; try { resolve(await ref.getDownloadURL()); } catch (e) { reject(e); } }
                );
            } catch (e) { reject(e); }
        });
    }

    async function uploadToStorage(uid, bookId, file, cover, onProgress) {
        const storage = storageSvc();
        if (!storage) return {};
        let fileUrl = null, coverUrl = null, storagePath = null, fileExt = null;

        if (file) {
            const ext = (file.name.split(".").pop() || "").toLowerCase();
            fileExt = ext === "pdf" ? "pdf" : (ext === "epub" ? "epub" : "bin");
            storagePath = `users/${uid}/books/${bookId}/book.${fileExt}`;
            const ref = storage.ref(storagePath);
            fileUrl = await uploadWithProgress(ref, file, {
                contentType: file.type || (fileExt === "pdf" ? "application/pdf" : fileExt === "epub" ? "application/epub+zip" : "application/octet-stream"),
                customMetadata: { originalName: file.name }
            }, onProgress, 180000);
        }

        if (cover) {
            const cref = storage.ref(`users/${uid}/books/${bookId}/cover.jpg`);
            onProgress?.(100);
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

    // ------- MULTI-CHIP (Genres/Moods/Tropes ONLY) -------
    function safeParse(v, dflt) { try { return JSON.parse(v); } catch { return dflt; } }

    // Find a container by common ids OR <details><summary> label text
    function findGroupContainer(key) {
        const map = {
            genres: ['#genresBox .categories', '#genresBox', '#genres', '[data-chips="genres"]'],
            moods: ['#moodsBox .categories', '#moodsBox', '#moods', '[data-chips="moods"]'],
            tropes: ['#tropesBox .categories', '#tropesBox', '#tropes', '[data-chips="tropes"]']
        };
        for (const s of map[key]) { const el = $(s); if (el) return el; }

        // fallback: <details> with matching <summary> text
        const dets = document.querySelectorAll("details");
        for (const d of dets) {
            const lbl = text($("summary", d));
            if (!lbl) continue;
            if (key === "genres" && lbl.includes("genre")) return $(".categories", d) || d;
            if (key === "moods" && lbl.includes("mood")) return $(".categories", d) || d;
            if (key === "tropes" && (lbl.includes("trope") || lbl.includes("trop"))) return $(".categories", d) || d;
        }
        return null;
    }

    function hydrateMultiChips(container, initialArr, onChange, itemsIfEmpty) {
        if (!container) return;

        // build only if empty
        let chips = $$(".category", container);
        if (!chips.length && Array.isArray(itemsIfEmpty)) {
            itemsIfEmpty.forEach((label) => {
                const el = document.createElement("span");
                el.className = "category";
                el.textContent = label;
                el.dataset.value = String(label);
                container.appendChild(el);
            });
            chips = $$(".category", container);
        }

        const picked = new Set((Array.isArray(initialArr) ? initialArr : []).map(String));
        chips.forEach(ch => {
            const val = ch.dataset.value || ch.textContent.trim();
            ch.dataset.value = val;
            if (picked.size) ch.classList.toggle("active", picked.has(val));
            ch.tabIndex = 0;
            ch.setAttribute("role", "button");
        });

        function commit() {
            const vals = $$(".category.active", container).map(c => c.dataset.value || c.textContent.trim());
            onChange(vals);
        }
        function toggleChip(chip) { chip.classList.toggle("active"); commit(); }

        if (container.__pbWired !== "1") {
            container.__pbWired = "1";
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
        }
        commit();
    }

    // Delegated safety net: any .category inside the three labeled groups
    function installDelegatedFallback(inpMap) {
        if (document.__pbDelegatedMultiChips) return;
        document.__pbDelegatedMultiChips = true;

        document.addEventListener("click", (e) => {
            const chip = e.target.closest(".category");
            if (!chip) return;

            const group = chip.closest("details, #genresBox, #moodsBox, #tropesBox, [data-chips]");
            if (!group) return;

            const lbl = text($("summary", group));
            let key = null;
            if (group.matches('#genresBox, [data-chips="genres"], #genres')) key = "genres";
            else if (group.matches('#moodsBox, [data-chips="moods"], #moods')) key = "moods";
            else if (group.matches('#tropesBox, [data-chips="tropes"], #tropes')) key = "tropes";
            else if (lbl.includes("genre")) key = "genres";
            else if (lbl.includes("mood")) key = "moods";
            else if (lbl.includes("trop")) key = "tropes";
            if (!key) return;

            chip.classList.toggle("active");
            const cont = group.querySelector(".categories") || group;
            const vals = $$(".category.active", cont).map(c => c.dataset.value || c.textContent.trim());
            try { inpMap[key].value = JSON.stringify(vals); } catch { inpMap[key].value = "[]"; }
        });
    }

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

        // hidden inputs
        const inpGenres = ensureHidden(form, "genres");
        const inpMoods = ensureHidden(form, "moods");
        const inpTropes = ensureHidden(form, "tropes");
        const inpStatus = ensureHidden(form, "status"); // untouched
        const inpFormat = ensureHidden(form, "format"); // untouched
        if (!inpGenres.value) inpGenres.value = "[]";
        if (!inpMoods.value) inpMoods.value = "[]";
        if (!inpTropes.value) inpTropes.value = "[]";

        // lists
        const { genres, moods, tropes, statuses, formats } = getLists();

        // --- ONLY these three groups are modified/hardened ---
        const genresBox = findGroupContainer("genres");
        const moodsBox = findGroupContainer("moods");
        const tropesBox = findGroupContainer("tropes");

        hydrateMultiChips(genresBox, safeParse(inpGenres.value, []), (vals) => { try { inpGenres.value = JSON.stringify(vals); } catch { inpGenres.value = "[]"; } }, genres);
        hydrateMultiChips(moodsBox, safeParse(inpMoods.value, []), (vals) => { try { inpMoods.value = JSON.stringify(vals); } catch { inpMoods.value = "[]"; } }, moods);
        hydrateMultiChips(tropesBox, safeParse(inpTropes.value, []), (vals) => { try { inpTropes.value = JSON.stringify(vals); } catch { inpTropes.value = "[]"; } }, tropes);

        installDelegatedFallback({ genres: inpGenres, moods: inpMoods, tropes: inpTropes });

        // --- Status/Format single-select: leave behavior as before, just ensure click wires if empty ---
        function singleSelectHydrate(container, itemsIfEmpty, hiddenInput) {
            if (!container) return;
            let chips = $$(".category", container);
            if (!chips.length && Array.isArray(itemsIfEmpty)) {
                itemsIfEmpty.forEach((label) => {
                    const el = document.createElement("span");
                    el.className = "category";
                    el.textContent = label;
                    el.dataset.value = String(label);
                    container.appendChild(el);
                });
                chips = $$(".category", container);
            }
            chips.forEach(ch => {
                const val = ch.dataset.value || ch.textContent.trim();
                ch.dataset.value = val;
                ch.tabIndex = 0;
                ch.setAttribute("role", "button");
                if (hiddenInput.value && hiddenInput.value === val) ch.classList.add("active");
            });
            if (container.__pbSingleWired === "1") return;
            container.__pbSingleWired = "1";
            container.addEventListener("click", (e) => {
                const chip = e.target.closest(".category");
                if (!chip || !container.contains(chip)) return;
                $$(".category.active", container).forEach(c => c.classList.remove("active"));
                chip.classList.add("active");
                hiddenInput.value = chip.dataset.value || chip.textContent.trim();
            });
            container.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    const chip = e.target.closest(".category");
                    if (!chip || !container.contains(chip)) return;
                    e.preventDefault();
                    $$(".category.active", container).forEach(c => c.classList.remove("active"));
                    chip.classList.add("active");
                    hiddenInput.value = chip.dataset.value || chip.textContent.trim();
                }
            });
        }

        const statusBox = $("#statusChips") || $('[data-chips="status"]');
        const formatBox = $("#formatChips") || $('[data-chips="format"]');
        singleSelectHydrate(statusBox, statuses, inpStatus);
        singleSelectHydrate(formatBox, formats, inpFormat);

        // CHOOSE FILE (unchanged)
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

        // CANCEL (unchanged)
        if (cancelBtn && !cancelBtn.getAttribute("type")) cancelBtn.setAttribute("type", "button");
        cancelBtn?.addEventListener("click", (e) => { e.preventDefault(); history.back(); });

        // progress text helper
        const setSavingText = (txt) => { if (saveBtn) saveBtn.textContent = txt; };

        // SAVE (unchanged flow)
        async function firstSave(user) {
            const db = dbSvc();
            const col = db.collection("users").doc(user.uid).collection("books");
            const ref = col.doc();
            createdBookId = ref.id;
            (byId("bookForm") || document.querySelector("form"))?.setAttribute("data-id", createdBookId);

            const payload = {
                title: (byId("title")?.value || "").trim(),
                author: (byId("author")?.value || "").trim(),
                started: byId("started")?.value || null,
                finished: byId("finished")?.value || null,
                review: byId("review")?.value || "",
                status: byId("bookForm")?.querySelector('input[name="status"]')?.value || null,
                format: byId("bookForm")?.querySelector('input[name="format"]')?.value || null,
                genres: safeParse(byId("bookForm")?.querySelector('input[name="genres"]')?.value, []),
                moods: safeParse(byId("bookForm")?.querySelector('input[name="moods"]')?.value, []),
                tropes: safeParse(byId("bookForm")?.querySelector('input[name="tropes"]')?.value, []),
                ...($('input[name="rating"]')?.value ? { rating: Number($('input[name="rating"]').value) || 0 } : {}),
                ...($('input[name="spice"]')?.value ? { spice: Number($('input[name="spice"]').value) || 0 } : {}),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (!payload.title || !payload.author) throw new Error("Title and Author are required.");

            await ref.set(payload, { merge: true });

            const f = byId("bookFile")?.files?.[0] || null;
            if (f || coverBlob) setSavingText("Uploading… 0%");
            let meta = {}, sawUploadError = false;
            try {
                meta = await uploadToStorage(user.uid, createdBookId, f, coverBlob, (pct) => setSavingText(`Uploading… ${pct}%`));
            } catch (e) { console.warn("Cloud upload failed:", e); sawUploadError = true; }

            if ((!meta || (!meta.fileUrl && !meta.coverUrl)) && f && window.LocalFiles?.save) {
                try { meta = await LocalFiles.save(user.uid, createdBookId, f, coverBlob); } catch (e) { console.warn("Local save failed:", e); }
            }
            if (meta && (meta.fileUrl || meta.coverUrl || meta.coverDataUrl || meta.hasFile)) {
                setSavingText("Saving…");
                await ref.set({ ...meta, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
            }
            return { sawUploadError };
        }

        async function updateSave(user) {
            const db = dbSvc();
            const ref = db.collection("users").doc(user.uid).collection("books").doc(createdBookId);

            const patch = {
                title: (byId("title")?.value || "").trim(),
                author: (byId("author")?.value || "").trim(),
                started: byId("started")?.value || null,
                finished: byId("finished")?.value || null,
                review: byId("review")?.value || "",
                status: byId("bookForm")?.querySelector('input[name="status"]')?.value || null,
                format: byId("bookForm")?.querySelector('input[name="format"]')?.value || null,
                genres: safeParse(byId("bookForm")?.querySelector('input[name="genres"]')?.value, []),
                moods: safeParse(byId("bookForm")?.querySelector('input[name="moods"]')?.value, []),
                tropes: safeParse(byId("bookForm")?.querySelector('input[name="tropes"]')?.value, []),
                ...($('input[name="rating"]')?.value ? { rating: Number($('input[name="rating"]').value) || 0 } : {}),
                ...($('input[name="spice"]')?.value ? { spice: Number($('input[name="spice"]').value) || 0 } : {}),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            await ref.set(patch, { merge: true });

            const f = byId("bookFile")?.files?.[0] || null;
            if (f || coverBlob) setSavingText("Uploading… 0%");
            let meta = {}, sawUploadError = false;
            try {
                meta = await uploadToStorage(user.uid, createdBookId, f, coverBlob, (pct) => setSavingText(`Uploading… ${pct}%`));
            } catch (e) { console.warn("Cloud upload failed:", e); sawUploadError = true; }

            if ((!meta || (!meta.fileUrl && !meta.coverUrl)) && f && window.LocalFiles?.save) {
                try { meta = await LocalFiles.save(user.uid, createdBookId, f, coverBlob); } catch (e) { console.warn("Local save failed:", e); }
            }
            if (meta && (meta.fileUrl || meta.coverUrl || meta.coverDataUrl || meta.hasFile)) {
                setSavingText("Saving…");
                const extra = {};
                if (meta.fileUrl) extra.fileUrl = meta.fileUrl;
                if (meta.coverUrl) extra.coverUrl = meta.coverUrl;
                if (meta.storagePath) extra.storagePath = meta.storagePath;
                if (meta.fileExt) extra.fileExt = meta.fileExt;
                if (typeof meta.hasFile === "boolean") extra.hasFile = meta.hasFile;
                if (meta.pdfUrl) extra.pdfUrl = meta.pdfUrl;
                if (meta.epubUrl) extra.epubUrl = meta.epubUrl;
                if (meta.coverDataUrl) extra.coverDataUrl = meta.coverDataUrl;
                if (fileMeta?.type) extra.fileType = fileMeta.type;
                if (fileMeta?.name) extra.fileName = fileMeta.name;
                await ref.set({ ...extra, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
            }
            return { sawUploadError };
        }

        async function handleSave() {
            if (saving) return;
            if (!byId("title")?.value?.trim() || !byId("author")?.value?.trim()) return alert("Title and Author are required.");
            saving = true;

            const originalLabel = saveBtn?.textContent;
            if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }

            try {
                const user = await requireUser();
                const result = createdBookId ? await updateSave(user) : await firstSave(user);
                showToast(result?.sawUploadError ? "Saved (file upload skipped)" : "Saved ✓", 900);
                setTimeout(goHomeFresh, 400);
            } catch (e) {
                console.error("Save failed:", e);
                alert(e?.message || "Failed to save.");
            } finally {
                saving = false;
                if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = originalLabel || "Save"; }
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

    // --- Read Now button (unchanged) ---
    function ensureReadNowBtn() {
        const host = document.querySelector('.file-row') || document.getElementById('fileName')?.parentElement;
        if (!host) return;
        let btn = document.getElementById('readNowBtn');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'readNowBtn';
            btn.className = 'btn';
            btn.type = 'button';
            btn.textContent = 'Read';
            btn.style.marginLeft = '8px';
            host.appendChild(btn);
        }
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const form = document.getElementById('bookForm') || document.querySelector('form');
            const id = form?.dataset?.id;
            if (!id) { alert('Save the book first, then you can read it.'); return; }
            location.href = `reader.html?id=${encodeURIComponent(id)}`;
        });
    }

    // Boot
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => { init(); ensureReadNowBtn(); }, { once: true });
    } else {
        init();
        ensureReadNowBtn();
    }
})();
