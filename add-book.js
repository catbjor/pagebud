/* =========================================================
 PageBud – add-book.js
 - Multiselect `statuses` (+ legacy `status` = første valgt)
 - Chips bygges automatisk hvis HTML mangler dem
 - Bevarer eksisterende design/layout
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
        } catch { alert(msg); }
    }

    // ------- Firebase handles -------
    function auth() { return (window.fb?.auth) || (window.firebase?.auth?.()) || firebase.auth(); }
    function db() { return (window.fb?.db) || (window.firebase?.firestore?.()) || firebase.firestore(); }
    async function requireUser() {
        const a = auth();
        if (a.currentUser) return a.currentUser;
        return new Promise((res, rej) => {
            const off = a.onAuthStateChanged(u => { off(); u ? res(u) : rej(new Error("Not signed in")); });
        });
    }

    // ------- lists from constants -------
    function getLists() {
        const C = (window.PB_CONST) || (window.CONSTANTS) || (window.PB && {
            GENRES: window.PB.GENRES, MOODS: window.PB.MOODS, TROPES: window.PB.TROPES,
            STATUSES: window.PB.STATUSES, FORMATS: window.PB.FORMATS
        }) || {};
        return {
            genres: C.GENRES || window.GENRES || [],
            moods: C.MOODS || window.MOODS || [],
            tropes: C.TROPES || window.TROPES || [],
            statuses: C.STATUSES || window.STATUSES || ["To Read", "Reading", "Finished", "DNF", "Owned", "Wishlist"],
            formats: C.FORMATS || window.FORMATS || ["eBook", "Audiobook", "Paperback", "Hardcover"]
        };
    }

    // ------- hidden inputs -------
    function ensureHidden(form, name) {
        let el = form.querySelector(`input[name="${name}"]`);
        if (!el) { el = document.createElement("input"); el.type = "hidden"; el.name = name; form.appendChild(el); }
        return el;
    }

    // ------- chips helpers -------
    function chipRaw(el) { return (el.dataset.value || el.dataset.val || el.textContent || "").trim(); }
    function safeParse(v, d) { try { return JSON.parse(v); } catch { return d; } }

    function buildChipsIfMissing(container, items) {
        if (!container || !Array.isArray(items) || !items.length) return;
        if (container.querySelector(".category")) return;
        const frag = document.createDocumentFragment();
        items.forEach(label => {
            const el = document.createElement("span");
            el.className = "category";
            el.dataset.value = String(label);
            el.textContent = String(label);
            el.tabIndex = 0;
            el.setAttribute("role", "button");
            frag.appendChild(el);
        });
        container.appendChild(frag);
    }

    function hydrateMulti(container, items, hiddenInput) {
        if (!container) return;
        buildChipsIfMissing(container, items);
        const picked = new Set(safeParse(hiddenInput.value || "[]", []));
        $$(".category", container).forEach(ch => {
            ch.classList.toggle("active", picked.has(chipRaw(ch)));
            ch.tabIndex = 0; ch.setAttribute("role", "button");
        });
        function commit() {
            const vals = $$(".category.active", container).map(c => chipRaw(c));
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
        buildChipsIfMissing(container, items);
        const active = hiddenInput.value || "";
        const chips = $$(".category", container);
        chips.forEach(ch => { ch.tabIndex = 0; ch.setAttribute("role", "button"); ch.classList.toggle("active", chipRaw(ch) === active); });
        container.addEventListener("click", (e) => {
            const chip = e.target.closest(".category"); if (!chip) return;
            chips.forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            hiddenInput.value = chipRaw(chip);
        });
        container.addEventListener("keydown", (e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            const chip = e.target.closest(".category"); if (!chip) return;
            e.preventDefault();
            chips.forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            hiddenInput.value = chipRaw(chip);
        });
    }

    // ------- cover extraction (optional; unchanged) -------
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

    // ------- state -------
    let createdBookId = null;
    let coverBlob = null;

    // ------- main -------
    function init() {
        const form = byId("bookForm") || $("form");
        if (!form) return;

        const saveBtn = byId("saveBtn") || byId("save-book") || $('[data-action="save"]') || $('[data-role="save-book"]');
        const fileInput = byId("bookFile");
        const pickBtn = byId("btnPickFile");
        const fileNameEl = byId("fileName");

        // hidden inputs
        const inpGenres = ensureHidden(form, "genres"); if (!inpGenres.value) inpGenres.value = "[]";
        const inpMoods = ensureHidden(form, "moods"); if (!inpMoods.value) inpMoods.value = "[]";
        const inpTropes = ensureHidden(form, "tropes"); if (!inpTropes.value) inpTropes.value = "[]";
        const inpStatus = ensureHidden(form, "status");   // legacy single
        const inpStatuses = ensureHidden(form, "statuses"); if (!inpStatuses.value) inpStatuses.value = "[]";
        const inpFormat = ensureHidden(form, "format");

        const { genres, moods, tropes, statuses, formats } = getLists();

        // containers
        const genresBox = $('#genresBox .categories') || $('[data-chips="genres"]');
        const moodsBox = $('#moodsBox .categories') || $('[data-chips="moods"]');
        const tropesBox = $('#tropesBox .categories') || $('[data-chips="tropes"]');
        const statusBox = $('#statusChips') || $('[data-chips="status"]');
        const formatBox = $('#formatChips') || $('[data-chips="format"]');

        // chips
        hydrateMulti(genresBox, genres, inpGenres);
        hydrateMulti(moodsBox, moods, inpMoods);
        hydrateMulti(tropesBox, tropes, inpTropes);

        hydrateMulti(statusBox, statuses, inpStatuses);
        try {
            const arr = JSON.parse(inpStatuses.value || "[]");
            inpStatus.value = arr[0] || "";
        } catch { inpStatus.value = ""; }

        hydrateSingle(formatBox, formats, inpFormat);

        // file picker UI
        if (pickBtn && fileInput && fileNameEl) {
            if (!pickBtn.getAttribute("type")) pickBtn.setAttribute("type", "button");
            pickBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); fileInput.click(); });
            fileInput.addEventListener("change", () => {
                const f = fileInput.files?.[0]; fileNameEl.textContent = f ? f.name : "";
            });
        }

        async function handleSave() {
            const title = (byId("title")?.value || "").trim();
            const author = (byId("author")?.value || "").trim();
            if (!title) { alert("Title is required."); return; }

            const user = await requireUser();
            const database = db();
            const col = database.collection("users").doc(user.uid).collection("books");

            // reserve id
            const ref = createdBookId ? col.doc(createdBookId) : col.doc();
            createdBookId = ref.id;
            form.setAttribute("data-id", createdBookId);

            const rating = $('input[name="rating"]')?.value;
            const spice = $('input[name="spice"]')?.value;

            let statusesArr = [];
            try { statusesArr = JSON.parse(inpStatuses.value || "[]"); } catch { statusesArr = []; }
            const primaryStatus = statusesArr[0] || (inpStatus.value || "") || null;

            const payload = {
                title, author,
                started: byId("started")?.value || null,
                finished: byId("finished")?.value || null,
                review: byId("review")?.value || "",
                status: primaryStatus,            // legacy
                statuses: statusesArr,              // multiselect
                format: inpFormat.value || null,
                genres: safeParse(inpGenres.value, []),
                moods: safeParse(inpMoods.value, []),
                tropes: safeParse(inpTropes.value, []),
                ...(rating ? { rating: Number(rating) || 0 } : {}),
                ...(spice ? { spice: Number(spice) || 0 } : {}),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            // cover extract (optional)
            const f = fileInput?.files?.[0] || null;
            if (f && !coverBlob) { try { coverBlob = await tryExtractCover(f); } catch { } }
            if (coverBlob && !payload.coverUrl && !payload.coverDataUrl) {
                try { payload.coverDataUrl = URL.createObjectURL(coverBlob); } catch { }
            }

            await ref.set(payload, { merge: true });

            // local file save (optional PBFileStore / LocalFiles)
            if (f && (window.PBFileStore?.save || window.LocalFiles?.save)) {
                const saveFn = window.PBFileStore?.save
                    ? (args) => window.PBFileStore.save(args)
                    : ({ file, uid, bookId, coverBlob }) => window.LocalFiles.save(uid, bookId, file, coverBlob);

                let coverBlob2 = coverBlob || null;
                if (!coverBlob2 && byId("coverPreview")?.src?.startsWith("blob:")) {
                    try { const resp = await fetch(byId("coverPreview").src); coverBlob2 = await resp.blob(); } catch { }
                }
                const fileMeta = await saveFn({ file: f, uid: user.uid, bookId: createdBookId, coverBlob: coverBlob2 });
                await ref.set({
                    hasFile: true,
                    fileName: fileMeta?.name || f.name,
                    fileSize: fileMeta?.size || f.size || null,
                    fileType: fileMeta?.type || f.type || null,
                    storagePath: fileMeta?.path || null,
                    downloadURL: fileMeta?.url || null,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                try { window.PB?.logActivity?.({ action: "file_attached", targetId: createdBookId, meta: { name: f.name } }); } catch { }
            }

            showToast("Saved ✓");
            try { window.PB?.logActivity?.({ action: "book_saved", targetId: createdBookId, meta: { title } }); } catch { }
            setTimeout(() => { location.href = "index.html"; }, 150);
        }

        if (saveBtn) {
            if (!saveBtn.getAttribute("type")) saveBtn.setAttribute("type", "button");
            if (saveBtn.dataset.wiredSave !== "1") {
                saveBtn.dataset.wiredSave = "1";
                saveBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); handleSave(); });
            }
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
