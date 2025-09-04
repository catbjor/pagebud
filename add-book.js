/* =========================================================
 PageBud – add-book.js (OPPDATERT)
========================================================= */
(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const byId = id => document.getElementById(id);
    const safeParse = (v, d) => { try { return JSON.parse(v); } catch { return d; } };
    const chipRaw = el => (el.dataset.value || el.dataset.val || el.textContent || "").trim();

    function showToast(msg = "Saved ✓", ms = 900) {
        const t = document.createElement("div");
        t.className = "toast";
        t.textContent = msg;
        document.body.appendChild(t);
        requestAnimationFrame(() => t.classList.add("show"));
        setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, ms);
    }

    function auth() { return firebase.auth(); }
    function db() { return firebase.firestore(); }

    async function requireUser() {
        const a = auth();
        if (a.currentUser) return a.currentUser;
        return new Promise((res, rej) => {
            const off = a.onAuthStateChanged(u => { off(); u ? res(u) : rej(new Error("Not signed in")); });
        });
    }

    function getLists() {
        const C = window.PB_CONST || window.CONSTANTS || {};
        return {
            genres: C.GENRES || [],
            moods: C.MOODS || [],
            tropes: C.TROPES || [],
            statuses: C.STATUSES || ["To Read", "Reading", "Finished", "DNF", "Owned", "Wishlist"],
            formats: C.FORMATS || ["eBook", "Audiobook", "Paperback", "Hardcover"]
        };
    }

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

    function buildChipsIfMissing(container, items) {
        if (!container || container.querySelector(".category")) return;
        const frag = document.createDocumentFragment();
        items.forEach(label => {
            const el = document.createElement("span");
            el.className = "category";
            el.dataset.value = label;
            el.textContent = label;
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
        });
        function commit() {
            const vals = $$(".category.active", container).map(chipRaw);
            hiddenInput.value = JSON.stringify(vals);
        }
        container.addEventListener("click", e => {
            const chip = e.target.closest(".category");
            if (!chip) return;
            chip.classList.toggle("active");
            commit();
        });
        container.addEventListener("keydown", e => {
            if (e.key !== "Enter" && e.key !== " ") return;
            const chip = e.target.closest(".category");
            if (!chip) return;
            e.preventDefault();
            chip.classList.toggle("active");
            commit();
        });
        commit();
    }

    function hydrateSingle(container, items, hiddenInput) {
        if (!container) return;
        buildChipsIfMissing(container, items);
        const active = hiddenInput.value;
        const chips = $$(".category", container);
        chips.forEach(ch => {
            ch.classList.toggle("active", chipRaw(ch) === active);
        });
        container.addEventListener("click", e => {
            const chip = e.target.closest(".category");
            if (!chip) return;
            chips.forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            hiddenInput.value = chipRaw(chip);
        });
        container.addEventListener("keydown", e => {
            if (e.key !== "Enter" && e.key !== " ") return;
            const chip = e.target.closest(".category");
            if (!chip) return;
            e.preventDefault();
            chips.forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            hiddenInput.value = chipRaw(chip);
        });
    }

    async function tryExtractCover(file) {
        try {
            if (!file) return null;
            if (/\.pdf$/i.test(file.name) && window.pdfjsLib) {
                const ab = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
                const page = await pdf.getPage(1);
                const vp = page.getViewport({ scale: 1.4 });
                const canvas = document.createElement("canvas");
                canvas.width = vp.width;
                canvas.height = vp.height;
                await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
                return new Promise(res => canvas.toBlob(res, "image/jpeg", 0.9));
            }
            if (/\.epub$/i.test(file.name) && window.ePub) {
                const book = await ePub(file);
                const coverPath = await book.loaded.cover;
                if (coverPath) {
                    const blobUrl = await book.archive.createUrl(coverPath);
                    const resp = await fetch(blobUrl);
                    return await resp.blob();
                }
            }
        } catch (e) {
            console.warn("Cover extract failed:", e);
        }
        return null;
    }

    let createdBookId = null;
    let coverBlob = null;

    function updateCoverPreview(blobUrl) {
        const preview = byId("coverPreview");
        const placeholder = byId("coverPlaceholder");
        if (!preview || !placeholder) return;

        if (blobUrl) {
            preview.src = blobUrl;
            preview.style.display = "block";
            placeholder.style.display = "none";
        } else {
            preview.src = "";
            preview.style.display = "none";
            placeholder.style.display = "flex";
        }
    }

    function init() {
        const form = byId("bookForm");
        if (!form) return;

        const fileInput = byId("bookFile");
        const fileNameEl = byId("fileName");
        const pickBtn = byId("btnPickFile");
        const saveBtn = byId("saveBtn") || $('[data-role="save-book"]');

        const inpGenres = ensureHidden(form, "genres");
        const inpMoods = ensureHidden(form, "moods");
        const inpTropes = ensureHidden(form, "tropes");
        const inpStatus = ensureHidden(form, "status");
        const inpStatuses = ensureHidden(form, "statuses");
        const inpFormat = ensureHidden(form, "format");

        const { genres, moods, tropes, statuses, formats } = getLists();

        hydrateMulti($('#genresBox .categories'), genres, inpGenres);
        hydrateMulti($('#moodsBox .categories'), moods, inpMoods);
        hydrateMulti($('#tropesBox .categories'), tropes, inpTropes);
        hydrateMulti($('#statusChips'), statuses, inpStatuses);
        hydrateSingle($('#formatChips'), formats, inpFormat);

        if (pickBtn && fileInput) {
            pickBtn.setAttribute("type", "button");
            pickBtn.addEventListener("click", e => {
                e.preventDefault();
                fileInput.click();
            });

            fileInput.addEventListener("change", async () => {
                const f = fileInput.files?.[0];
                fileNameEl.textContent = f?.name || "";
                if (!f) return;

                coverBlob = await tryExtractCover(f);
                updateCoverPreview(coverBlob ? URL.createObjectURL(coverBlob) : null);

                if (/\.epub$/i.test(f.name) && window.ePub) {
                    try {
                        const book = await ePub(f);
                        const meta = await book.loaded.metadata;
                        if (meta?.title && !$("#title").value) $("#title").value = meta.title;
                        if (meta?.creator && !$("#author").value) $("#author").value = meta.creator;
                    } catch (e) { console.warn("EPUB metadata error", e); }
                }

                if (/\.pdf$/i.test(f.name) && window.pdfjsLib) {
                    try {
                        const ab = await f.arrayBuffer();
                        const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
                        const meta = await pdf.getMetadata();
                        if (meta?.info?.Title && !$("#title").value) $("#title").value = meta.info.Title;
                        if (meta?.info?.Author && !$("#author").value) $("#author").value = meta.info.Author;
                    } catch (e) { console.warn("PDF metadata error", e); }
                }
            });

            const uploadBtn = document.getElementById("btnUploadCover");
            const coverInput = document.getElementById("coverInput");
            const coverPreview = document.getElementById("coverPreview");
            const coverPlaceholder = document.getElementById("coverPlaceholder");

            if (uploadBtn && coverInput) {
                uploadBtn.addEventListener("click", () => {
                    coverInput.click();
                });

                coverInput.addEventListener("change", function (e) {
                    const file = e.target.files[0];
                    if (!file) return;

                    const reader = new FileReader();
                    reader.onload = function (event) {
                        if (coverPreview && coverPlaceholder) {
                            coverPreview.src = event.target.result;
                            coverPreview.style.display = "block";
                            coverPlaceholder.style.display = "none";
                        }
                        window.selectedCoverDataUrl = event.target.result;
                    };
                    reader.readAsDataURL(file);
                });
            }

        }

        async function handleSave() {
            const title = $("#title")?.value?.trim() || "";
            const author = $("#author")?.value?.trim() || "";
            if (!title) return alert("Title is required.");

            const user = await requireUser();
            const ref = createdBookId
                ? db().collection("users").doc(user.uid).collection("books").doc(createdBookId)
                : db().collection("users").doc(user.uid).collection("books").doc();
            createdBookId = ref.id;

            const statusesArr = safeParse(inpStatuses.value, []);
            const payload = {
                title, author,
                started: $("#started")?.value || null,
                finished: $("#finished")?.value || null,
                review: $("#review")?.value || "",
                status: statusesArr[0] || "",
                statuses: statusesArr,
                format: inpFormat.value || null,
                genres: safeParse(inpGenres.value, []),
                moods: safeParse(inpMoods.value, []),
                tropes: safeParse(inpTropes.value, []),
                rating: Number($('input[name="rating"]')?.value || 0),
                spice: Number($('input[name="spice"]')?.value || 0),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            };

            const file = fileInput?.files?.[0];
            if (file && !coverBlob) coverBlob = await tryExtractCover(file);

            if (coverBlob) {
                payload.coverDataUrl = URL.createObjectURL(coverBlob);
            }

            await ref.set(payload, { merge: true });

            if (file && (window.PBFileStore?.save || window.LocalFiles?.save)) {
                const saveFn = window.PBFileStore?.save
                    ? (args) => window.PBFileStore.save(args)
                    : ({ file, uid, bookId, coverBlob }) => window.LocalFiles.save(uid, bookId, file, coverBlob);

                const fileMeta = await saveFn({ file, uid: user.uid, bookId: createdBookId, coverBlob });
                await ref.set({
                    hasFile: true,
                    fileName: fileMeta?.name || file.name,
                    fileSize: fileMeta?.size || file.size,
                    fileType: fileMeta?.type || file.type,
                    storagePath: fileMeta?.path || null,
                    downloadURL: fileMeta?.url || null,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }

            showToast("Saved ✓");
            setTimeout(() => location.href = "index.html", 150);
        }

        if (saveBtn && !saveBtn.dataset.wired) {
            saveBtn.dataset.wired = "1";
            saveBtn.addEventListener("click", e => {
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

document.getElementById("coverInput")?.addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
        const preview = document.getElementById("coverPreview");
        if (preview) {
            preview.src = event.target.result;
        }

        // OPTIONAL: Store the result for saving later (depends on your existing logic)
        window.selectedCoverDataUrl = event.target.result;
    };
    reader.readAsDataURL(file);
});

