/* =========================================================
 PageBud – add-book.js (local-file first, no Firebase Storage)
 - Reserve stable bookId før fil-lagring
 - Lagre fil lokalt (PBFileStore) og MERGE meta inn i Firestore-doc
 - Ingen layout-endringer, rating/chili/chips urørt
========================================================= */
(function () {
    "use strict";

    // ------- tiny utils -------
    const byId = (id) => document.getElementById(id);
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

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
    }

    // ------- Firebase helpers -------
    function auth() { return (window.fb?.auth) || (window.firebase?.auth?.()) || firebase.auth(); }
    function db() { return (window.fb?.db) || (window.firebase?.firestore?.()) || firebase.firestore(); }
    async function requireUser() {
        const a = auth();
        if (a.currentUser) return a.currentUser;
        return new Promise((res, rej) => {
            const off = a.onAuthStateChanged(u => { off(); u ? res(u) : rej(new Error("Not signed in")); });
        });
    }

    // ------- lists -------
    function getLists() {
        const C = window.PB_CONST || window.CONSTANTS || (window.PB && {
            GENRES: window.PB.GENRES, MOODS: window.PB.MOODS, TROPES: window.PB.TROPES, STATUSES: window.PB.STATUSES, FORMATS: window.PB.FORMATS
        }) || {};
        return {
            genres: C.GENRES || window.GENRES || [],
            moods: C.MOODS || window.MOODS || [],
            tropes: C.TROPES || window.TROPES || [],
            statuses: C.STATUSES || window.STATUSES || [],
            formats: C.FORMATS || window.FORMATS || []
        };
    }

    // ------- hidden inputs -------
    function ensureHidden(form, name) {
        let el = form.querySelector(`input[name="${name}"]`);
        if (!el) { el = document.createElement("input"); el.type = "hidden"; el.name = name; form.appendChild(el); }
        return el;
    }

    // ------- cover extraction (optional) -------
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
        } catch { }
        return null;
    }

    // ------- chip helpers (bevarer eksisterende markup) -------
    function chipValue(el) { return el.dataset.value || el.dataset.val || el.textContent.trim(); }
    function safeParse(v, d) { try { return JSON.parse(v); } catch { return d; } }

    function hydrateMulti(container, items, hiddenInput) {
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
        chips.forEach(ch => { ch.tabIndex = 0; ch.setAttribute("role", "button"); });
        const picked = new Set(safeParse(hiddenInput.value || "[]", []));
        chips.forEach(ch => ch.classList.toggle("active", picked.has(chipValue(ch))));
        function commit() {
            const vals = $$(".category.active", container).map(c => chipValue(c));
            try { hiddenInput.value = JSON.stringify(vals); } catch { hiddenInput.value = "[]"; }
        }
        container.addEventListener("click", (e) => {
            const chip = e.target.closest(".category"); if (!chip) return;
            chip.classList.toggle("active"); commit();
        });
        container.addEventListener("keydown", (e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            const chip = e.target.closest(".category"); if (!chip) return;
            e.preventDefault(); chip.classList.toggle("active"); commit();
        });
        commit();
    }

    function hydrateSingle(container, items, hiddenInput) {
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
        chips.forEach(ch => {
            ch.tabIndex = 0; ch.setAttribute("role", "button");
            if (hiddenInput.value && hiddenInput.value === chipValue(ch)) ch.classList.add("active");
        });
        container.addEventListener("click", (e) => {
            const chip = e.target.closest(".category"); if (!chip) return;
            $$(".category.active", container).forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            hiddenInput.value = chipValue(chip);
        });
        container.addEventListener("keydown", (e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            const chip = e.target.closest(".category"); if (!chip) return;
            e.preventDefault();
            $$(".category.active", container).forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            hiddenInput.value = chipValue(chip);
        });
    }

    // ------- state -------
    let createdBookId = null;
    let coverBlob = null;

    // ------- main -------
    function init() {
        const form = byId("bookForm") || $("form");
        if (!form) return;

        const saveBtn = byId("saveBtn") || byId("save-book") || $('[data-action="save"]') || $('[data-role="save-book"]');
        const cancelBtn = byId("cancelBtn") || $('.form-actions-fixed .btn.btn-secondary');

        const fileInput = byId("bookFile");
        const pickBtn = byId("btnPickFile");
        const fileNameEl = byId("fileName");
        const coverPrev = byId("coverPreview");

        // hidden inputs
        const inpGenres = ensureHidden(form, "genres"); if (!inpGenres.value) inpGenres.value = "[]";
        const inpMoods = ensureHidden(form, "moods"); if (!inpMoods.value) inpMoods.value = "[]";
        const inpTropes = ensureHidden(form, "tropes"); if (!inpTropes.value) inpTropes.value = "[]";
        const inpStatus = ensureHidden(form, "status");
        const inpFormat = ensureHidden(form, "format");

        const { genres, moods, tropes, statuses, formats } = getLists();

        hydrateMulti($('#genresBox .categories') || $('#genres') || $('[data-chips="genres"]'), genres, inpGenres);
        hydrateMulti($('#moodsBox .categories') || $('#moods') || $('[data-chips="moods"]'), moods, inpMoods);
        hydrateMulti($('#tropesBox .categories') || $('#tropes') || $('[data-chips="tropes"]'), tropes, inpTropes);
        hydrateSingle($('#statusChips') || $('[data-chips="status"]'), statuses, inpStatus);
        hydrateSingle($('#formatChips') || $('[data-chips="format"]'), formats, inpFormat);

        // file picker
        if (pickBtn && !pickBtn.getAttribute("type")) pickBtn.setAttribute("type", "button");
        pickBtn?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); fileInput?.click(); });

        fileInput?.addEventListener("change", async () => {
            const f = fileInput.files?.[0];
            if (fileNameEl) fileNameEl.textContent = f?.name || "";
            coverBlob = f ? await tryExtractCover(f) : null;
            if (coverBlob && coverPrev) coverPrev.src = URL.createObjectURL(coverBlob);
        });

        // cancel
        if (cancelBtn && !cancelBtn.getAttribute("type")) cancelBtn.setAttribute("type", "button");
        cancelBtn?.addEventListener("click", (e) => { e.preventDefault(); history.back(); });

        // save
        async function handleSave() {
            const title = ($("#title")?.value || "").trim();
            const author = ($("#author")?.value || "").trim();
            if (!title || !author) return alert("Title and Author are required.");

            const user = await requireUser();
            const database = db();
            const col = database.collection("users").doc(user.uid).collection("books");

            // reserve id
            const ref = createdBookId ? col.doc(createdBookId) : col.doc();
            createdBookId = ref.id;
            form.setAttribute("data-id", createdBookId);

            // rating/spice fra hidden inputs hvis de finnes
            const rating = $('input[name="rating"]')?.value;
            const spice = $('input[name="spice"]')?.value;

            const payload = {
                title, author,
                started: byId("started")?.value || null,
                finished: byId("finished")?.value || null,
                review: byId("review")?.value || "",
                status: inpStatus.value || null,
                format: inpFormat.value || null,
                genres: safeParse(inpGenres.value, []),
                moods: safeParse(inpMoods.value, []),
                tropes: safeParse(inpTropes.value, []),
                ...(rating ? { rating: Number(rating) || 0 } : {}),
                ...(spice ? { spice: Number(spice) || 0 } : {}),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            // 1) skriv boka først
            await ref.set(payload, { merge: true });

            // 2) hvis fil valgt => lagre lokalt og MERGE meta
            const f = fileInput?.files?.[0] || null;
            if (f && window.PBFileStore?.save) {
                const meta = await PBFileStore.save({ file: f, uid: user.uid, bookId: createdBookId, coverBlob });
                if (meta) {
                    await ref.set({ ...meta, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
                }
            }

            showToast("Saved ✓", 900);
            goHomeFresh();
        }

        if (form.dataset.wiredSave !== "1") {
            form.dataset.wiredSave = "1";
            form.addEventListener("submit", (e) => { e.preventDefault(); handleSave(); });
        }
        const saveBtnEl = saveBtn;
        if (saveBtnEl) {
            if (!saveBtnEl.getAttribute("type")) saveBtnEl.setAttribute("type", "button");
            if (saveBtnEl.dataset.wiredSave !== "1") {
                saveBtnEl.dataset.wiredSave = "1";
                saveBtnEl.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); handleSave(); });
            }
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
