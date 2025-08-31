// add-book.js — hardened save (never sends undefined into Firestore)
(function () {
    "use strict";
    const $ = (s, r = document) => r.querySelector(s);

    // ----- catalogs -----
    const GENRES = ["Adventure", "Biography", "Classics", "Contemporary", "Crime", "Dystopian", "Fantasy", "Historical", "Horror", "Humor", "LGBTQ+", "Literary", "Memoir", "Mystery", "Mythology", "Non-fiction", "Paranormal", "Philosophy", "Poetry", "Romance", "Sci-Fi", "Self-help", "Thriller", "Travel", "YA"];
    const MOODS = ["📖 Page-turner", "🌀 Weird", "🌑 Dark", "🌧 Moody", "👨‍👩‍👧 Found Family", "💗 Heartwarming", "🔥 Slow burn", "🎀 Whimsical", "🧣 Cozy", "🐣 Cute"];
    const TROPES = ["Enemies→Lovers", "Found family", "Slow burn", "Grumpy/Sunshine", "Secret Identity", "Small Town", "Time Travel", "Workplace"];

    // ----- state -----
    let selectedGenres = new Set();
    let selectedMoods = new Set();
    let selectedTropes = new Set();
    let rating = 0;  // 0..6
    let spice = 0;  // 0..5

    // ----- helpers -----
    function chipify(list, root, setRef) {
        if (!root) return;
        root.innerHTML = "";
        list.forEach(val => {
            const el = document.createElement("span");
            el.className = "category";
            el.textContent = val;
            el.addEventListener("click", () => {
                if (setRef.has(val)) { setRef.delete(val); el.classList.remove("active"); }
                else { setRef.add(val); el.classList.add("active"); }
            });
            root.appendChild(el);
        });
    }

    function oneOf(root, def) {
        if (!root) return;
        const chips = root.querySelectorAll(".category");
        chips.forEach(ch => {
            if (ch.dataset.val === def) ch.classList.add("active");
            ch.addEventListener("click", () => {
                chips.forEach(x => x.classList.remove("active"));
                ch.classList.add("active");
            });
        });
    }
    function getActive(root) {
        const el = root?.querySelector(".category.active");
        return el ? el.dataset.val : "";
    }

    // Normalize + store a local file using PBFileStore if present
    async function storeLocalFile(file, scope) {
        if (!file) return null;

        // Preferred: PBFileStore
        if (window.PBFileStore?.save) {
            try {
                const meta = await PBFileStore.save({ file, scope });
                // meta can vary; normalize to {url, name, size, type}
                const url = meta?.url || meta?.blobUrl || meta?.href || null;
                if (url) {
                    return {
                        url,
                        name: file.name,
                        size: file.size ?? null,
                        type: file.type || (/\.(pdf)$/i.test(file.name) ? "application/pdf" : (/\.epub$/i.test(file.name) ? "application/epub+zip" : "")),
                    };
                }
            } catch (e) {
                console.warn("PBFileStore.save failed, using fallback", e);
            }
        }

        // Fallback: ephemeral ObjectURL (works for local reading)
        const url = URL.createObjectURL(file);
        return {
            url,
            name: file.name,
            size: file.size ?? null,
            type: file.type || (/\.(pdf)$/i.test(file.name) ? "application/pdf" : (/\.epub$/i.test(file.name) ? "application/epub+zip" : "")),
        };
    }

    // Remove undefined recursively so Firestore won’t complain
    function stripUndefined(obj) {
        if (obj == null || typeof obj !== "object") return obj;
        const out = Array.isArray(obj) ? [] : {};
        for (const [k, v] of Object.entries(obj)) {
            if (v === undefined) continue;
            out[k] = stripUndefined(v);
        }
        return out;
    }

    async function onSave() {
        const user = fb?.auth?.currentUser;
        if (!user) { alert("Please sign in again."); location.href = "auth.html"; return; }

        const title = $("#title")?.value?.trim() || "";
        const author = $("#author")?.value?.trim() || "";
        if (!title || !author) {
            alert("Title and Author are required");
            return;
        }

        const status = getActive($("#statusChips")) || "reading";
        const format = getActive($("#formatChips")) || "ebook";
        const startedAt = $("#started")?.value ? new Date($("#started").value) : null;
        const finishedAt = $("#finished")?.value ? new Date($("#finished").value) : null;

        // Optional file
        let fileMeta = null;
        const file = $("#bookFile")?.files?.[0];
        if (file) fileMeta = await storeLocalFile(file, "books");

        // Only include cover if present
        const coverSrc = $("#coverPreview")?.src;
        const coverUrl = coverSrc && !/^\s*$/.test(coverSrc) ? coverSrc : null;

        // Build document
        const doc = {
            title, author,
            status, format,
            startedAt, finishedAt,
            genres: [...selectedGenres],
            moods: [...selectedMoods],
            tropes: [...selectedTropes],
            rating, spice,
            review: $("#review")?.value || "",
            coverUrl: coverUrl || null,
            // Only include file if we have a usable URL
            file: fileMeta && fileMeta.url ? {
                url: fileMeta.url,
                name: fileMeta.name || null,
                size: fileMeta.size ?? null,
                type: fileMeta.type || null
            } : null,
            updatedAt: new Date(),
            createdAt: new Date()
        };

        // Strip all undefined so Firestore accepts it
        const clean = stripUndefined(doc);

        await fb.db.collection("users").doc(user.uid).collection("books").add(clean);

        try {
            window.pbActivity?.post({ type: "book:add", text: `added “${title}”` });
        } catch { }

        alert("Saved!");
        location.href = "index.html";
    }

    function boot() {
        // chips
        chipify(GENRES, $("#genres"), selectedGenres);
        chipify(MOODS, $("#moods"), selectedMoods);
        chipify(TROPES, $("#tropes"), selectedTropes);
        oneOf($("#statusChips"), "reading");
        oneOf($("#formatChips"), "ebook");

        // rating + spice
        window.RatingControls?.mount({
            ratingEl: $("#ratingBar"),
            spiceEl: $("#spiceBar"),
            onChange({ rating: r, spice: s }) { rating = r; spice = s; }
        });

        // Save button
        $("#saveBtn")?.addEventListener("click", async () => {
            try { await onSave(); }
            catch (e) { console.error(e); alert(e.message || "Save failed"); }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }
})();
