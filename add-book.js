
/* =========================================================
 PageBud – add-book.js (local-file first, no Firebase Storage)
 + Adds "Upload cover" button via #btnPickCover + #coverFile → coverDataUrl
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

    // ------- chip helpers (keep existing markup) -------
    function chipValue(el) { return el.dataset.value || el.dataset.val || el.textContent.trim(); }
    function safeParse(v, d) { try { return JSON.parse(v); } catch { return d; } }

    function hydrateMulti(container, items, hiddenInput, onChange) {
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
            if (onChange) onChange(vals);
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
        chips.forEach(ch => { ch.tabIndex = 0; ch.setAttribute("role", "button"); });
        const active = hiddenInput.value || "";
        chips.forEach(ch => ch.classList.toggle("active", chipValue(ch) === active));
        container.addEventListener("click", (e) => {
            const chip = e.target.closest(".category"); if (!chip) return;
            chips.forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            hiddenInput.value = chipValue(chip);
        });
    }

    // --- Quotes Section Logic (copied from edit-page.js) ---
    function renderQuotes(quotes = []) {
        const container = byId("quotesContainer");
        if (!container) return;
        container.innerHTML = quotes.map(quote => createQuoteEntry(quote)).join('');
    }

    function createQuoteEntry(quote = { text: '', imageUrl: '' }) {
        const textContent = quote.text ? `<textarea>${quote.text}</textarea>` : '<textarea placeholder="Type or paste quote..."></textarea>';
        const imageContent = quote.imageUrl ? `<img src="${quote.imageUrl}" alt="Quote image">` : '';

        return `
      <div class="quote-entry">
        <div class="quote-content">
          ${imageContent || textContent}
        </div>
        <button type="button" class="btn-remove-quote" title="Remove quote">&times;</button>
      </div>
    `;
    }

    function wireQuotesSection() {
        const container = byId("quotesContainer");
        if (!container) return;

        byId("addQuoteTextBtn")?.addEventListener('click', () => {
            container.insertAdjacentHTML('beforeend', createQuoteEntry());
        });

        const quotePhotoInput = byId("quotePhotoInput");
        byId("addQuotePhotoBtn")?.addEventListener('click', () => {
            quotePhotoInput.click();
        });

        quotePhotoInput?.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
                // Re-using the readAsDataURL function from the cover upload logic
                const dataUrl = await readAsDataURL(file);
                container.insertAdjacentHTML('beforeend', createQuoteEntry({ imageUrl: dataUrl }));
            } catch (err) {
                alert("Could not load image.");
            }
            e.target.value = ''; // Reset input
        });

        container.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-remove-quote')) {
                e.target.closest('.quote-entry').remove();
            }
        });
    }

    // ------- state -------
    let createdBookId = null;
    let coverBlob = null;          // extracted from book (optional)
    let coverDataUrl = "";         // uploaded by user via #coverFile

    // helper: read file → data URL
    function readAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result || ""));
            fr.onerror = reject;
            fr.readAsDataURL(file);
        });
    }

    // ------- main -------
    function init() {
        const form = byId("bookForm") || $("form");
        if (!form) return;

        const saveBtn = byId("saveBtn") || byId("save-book") || $('[data-action="save"]') || $('[data-role="save-book"]');
        const cancelBtn = byId("cancelBtn");

        const fileInput = byId("bookFile");
        const pickBtn = byId("btnPickFile");
        const fileNameEl = byId("fileName");

        const coverPrev = byId("coverPreview");
        const coverPickBtn = byId("btnPickCover");
        const coverFileInp = byId("coverFile");

        // hidden inputs
        const inpGenres = ensureHidden(form, "genres"); if (!inpGenres.value) inpGenres.value = "[]";
        const inpMoods = ensureHidden(form, "moods"); if (!inpMoods.value) inpMoods.value = "[]";
        const inpTropes = ensureHidden(form, "tropes"); if (!inpTropes.value) inpTropes.value = "[]";
        const inpStatus = ensureHidden(form, "status");     // legacy single
        const inpStatuses = ensureHidden(form, "statuses");   // NEW: array
        const inpFormat = ensureHidden(form, "format");

        // Ensure hidden inputs for new ratings exist
        ensureHidden(form, "plotRating");
        ensureHidden(form, "charRating");
        ensureHidden(form, "writingRating");
        ensureHidden(form, "impactRating");

        const { genres, moods, tropes, statuses, formats } = getLists();

        // chips
        hydrateMulti($('#genresBox .categories') || $('[data-chips="genres"]'), genres, inpGenres);
        hydrateMulti($('#moodsBox  .categories') || $('[data-chips="moods"]'), moods, inpMoods);
        hydrateMulti($('#tropesBox .categories') || $('[data-chips="tropes"]'), tropes, inpTropes);

        // Status: MULTI (writes JSON array to `statuses` and first item to `status`)
        hydrateMulti($('#statusChips') || $('[data-chips="status"]'), statuses, inpStatuses, (vals) => {
            // also update legacy single-value 'status' field
            inpStatus.value = vals[0] || "";
        });

        // Format (single)
        hydrateSingle($('#formatChips') || $('[data-chips="format"]'), formats, inpFormat);

        // file picker UI (book file)
        if (pickBtn && fileInput && fileNameEl) {
            if (!pickBtn.getAttribute("type")) pickBtn.setAttribute("type", "button");
            pickBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); fileInput.click(); });
            fileInput.addEventListener("change", async () => {
                const f = fileInput.files?.[0];
                fileNameEl.textContent = f ? f.name : "";
                if (!f) { coverBlob = null; return; }

                const extractor = window.PB?.extractBookMetadata;
                if (!extractor) {
                    console.warn("Metadata extractor not available.");
                    return;
                }

                const data = await extractor(f);

                if (data.title && !byId("title").value) {
                    byId("title").value = data.title;
                }
                if (data.author && !byId("author").value) {
                    byId("author").value = data.author;
                }

                coverBlob = data.coverBlob;
                if (coverBlob && !coverDataUrl && coverPrev) {
                    coverPrev.src = URL.createObjectURL(coverBlob);
                }
            });
        }

        // cover picker UI (NEW)
        if (coverPickBtn && coverFileInp) {
            if (!coverPickBtn.getAttribute("type")) coverPickBtn.setAttribute("type", "button");
            coverPickBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); coverFileInp.click(); });
            coverFileInp.addEventListener("change", async () => {
                const f = coverFileInp.files?.[0];
                if (!f) return;
                if (!/^image\//i.test(f.type)) { alert("Please choose an image file."); return; }
                try {
                    coverDataUrl = await readAsDataURL(f);
                    if (coverPrev) coverPrev.src = coverDataUrl;
                } catch (err) {
                    console.warn("Cover read failed", err);
                    alert("Could not read the cover image.");
                }
            });
        }

        // Wire up new rating controls
        window.PB_RatingControls?.init?.(byId("plotRatingBar"), ensureHidden(form, "plotRating"));
        window.PB_RatingControls?.init?.(byId("charRatingBar"), ensureHidden(form, "charRating"));
        window.PB_RatingControls?.init?.(byId("writingRatingBar"), ensureHidden(form, "writingRating"));
        window.PB_RatingControls?.init?.(byId("impactRatingBar"), ensureHidden(form, "impactRating"));
        wireQuotesSection();

        async function handleSave() {
            const title = (byId("title")?.value || "").trim();
            const author = (byId("author")?.value || "").trim();
            if (!title) { alert("Title is required."); return; }

            let user;
            try {
                user = await requireUser();
            } catch (err) {
                alert("You must be signed in to save a book.");
                return;
            }

            const database = db();
            const col = database.collection("users").doc(user.uid).collection("books");

            // reserve id
            const ref = createdBookId ? col.doc(createdBookId) : col.doc();
            createdBookId = ref.id;
            form.setAttribute("data-id", createdBookId);

            // rating/spice from hidden inputs if present
            const rating = $('input[name="rating"]')?.value;
            const spice = $('input[name="spice"]')?.value;
            const plotRating = $('input[name="plotRating"]')?.value;
            const charRating = $('input[name="charRating"]')?.value;
            const writingRating = $('input[name="writingRating"]')?.value;
            const impactRating = $('input[name="impactRating"]')?.value;

            // parse statuses
            let statusesArr = [];
            try { statusesArr = JSON.parse(inpStatuses.value || "[]"); } catch { statusesArr = []; }
            const primaryStatus = statusesArr[0] || (inpStatus.value || "") || null;

            const payload = {
                title,
                author,
                started: byId("started")?.value || null,
                pageCount: Number(byId("pageCount")?.value) || null,
                finished: byId("finished")?.value || null,
                review: byId("review")?.value || "",
                reviewHasSpoilers: byId("reviewHasSpoilers")?.checked || false,
                status: primaryStatus,                 // legacy
                quotesText: byId("quotesTextArea")?.value || "", // Save the new quotes text
                statuses: statusesArr,                 // array
                format: inpFormat.value || null,
                genres: JSON.parse(inpGenres.value || "[]"),
                moods: JSON.parse(inpMoods.value || "[]"),
                tropes: JSON.parse(inpTropes.value || "[]"),
                quotes: $$('#quotesContainer .quote-entry').map(entry => ({
                    text: entry.querySelector('textarea')?.value || '',
                    imageUrl: entry.querySelector('img')?.src || ''
                })).filter(q => q.text || q.imageUrl),
                ...(rating ? { rating: Number(rating) || 0 } : {}),
                ...(spice ? { spice: Number(spice) || 0 } : {}),
                rereadValue: byId("rereadValue")?.checked || false,
                ...(plotRating ? { plotRating: Number(plotRating) || 0 } : {}),
                plotNotes: byId("plotNotes")?.value || "",
                charNotes: byId("charNotes")?.value || "",
                writingNotes: byId("writingNotes")?.value || "",
                impactNotes: byId("impactNotes")?.value || "",
                ...(charRating ? { charRating: Number(charRating) || 0 } : {}),
                ...(writingRating ? { writingRating: Number(writingRating) || 0 } : {}),
                ...(impactRating ? { impactRating: Number(impactRating) || 0 } : {}),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            // Cover priority:
            // 1) User-chosen image (coverDataUrl)
            // 2) Extracted from book file (coverBlob) → store as data URL
            if (coverDataUrl) {
                payload.coverDataUrl = coverDataUrl;
            } else if (coverBlob) {
                try {
                    payload.coverDataUrl = await readAsDataURL(coverBlob);
                } catch (e) {
                    console.warn("Failed to convert extracted cover blob to data URL", e);
                }
            }

            // Save base doc
            await ref.set(payload, { merge: true });

            // If the book was marked as finished, check for challenge progress.
            if (payload.status === 'finished') {
                window.PBChallenges?.updateChallengeProgress?.(user.uid, { id: createdBookId, ...payload });
            }

            // If user also picked a book file, save it via local store (unchanged)
            const f = fileInput?.files?.[0] || null;
            if (f && (window.PBFileStore?.save || window.LocalFiles?.save)) {
                const saveFn = window.PBFileStore?.save
                    ? (args) => window.PBFileStore.save(args)
                    : ({ file, uid, bookId, coverBlob }) => window.LocalFiles.save(uid, bookId, file, coverBlob);

                let coverBlob2 = null;
                if (coverDataUrl) {
                    try { const resp = await fetch(coverDataUrl); coverBlob2 = await resp.blob(); } catch { }
                } else if (coverBlob) {
                    coverBlob2 = coverBlob;
                } else if (coverPrev?.src?.startsWith("blob:")) {
                    try { const resp = await fetch(coverPrev.src); coverBlob2 = await resp.blob(); } catch { }
                }

                const fileMeta = await saveFn({ file: f, uid: user.uid, bookId: createdBookId, coverBlob: coverBlob2 });
                const fileUpdatePayload = {
                    hasFile: true,
                    fileName: fileMeta?.name || f.name,
                    fileSize: fileMeta?.size || f.size || null,
                    fileType: fileMeta?.type || f.type || null,
                    filePath: fileMeta?.filePath || null, // Correct field for local files
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                // If the file metadata extraction returned a cover, ensure it's saved.
                // This is the key fix to make sure the extracted cover is persisted.
                if (fileMeta?.coverDataUrl) {
                    fileUpdatePayload.coverDataUrl = fileMeta.coverDataUrl;
                }

                await ref.set(fileUpdatePayload, { merge: true });
            }

            showToast("Saved ✓");
            try { window.PB?.logActivity?.({ action: "book_saved", targetId: createdBookId, meta: { title } }); } catch { }
            setTimeout(() => { location.replace(`index.html?refresh=${Date.now()}`); }, 150);
        }

        // actions
        if (saveBtn) {
            if (!saveBtn.getAttribute("type")) saveBtn.setAttribute("type", "button");
            if (saveBtn.dataset.wiredSave !== "1") {
                saveBtn.dataset.wiredSave = "1";
                saveBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); handleSave(); });
            }
        }
        if (cancelBtn) {
            cancelBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                history.back();
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
