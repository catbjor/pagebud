// edit-page.js — update/delete existing book (no design changes)
(function () {
    "use strict";
    const $ = (s, r = document) => r.querySelector(s);
    const qs = (k) => new URL(location.href).searchParams.get(k);

    const GENRES = ["Adventure", "Biography", "Classics", "Contemporary", "Crime", "Dystopian", "Fantasy", "Historical", "Horror", "Humor", "LGBTQ+", "Literary", "Memoir", "Mystery", "Mythology", "Non-fiction", "Paranormal", "Philosophy", "Poetry", "Romance", "Sci-Fi", "Self-help", "Thriller", "Travel", "YA"];
    const MOODS = ["📖 Page-turner", "🌀 Weird", "🌑 Dark", "🌧 Moody", "👨‍👩‍👧 Found Family", "💗 Heartwarming", "🔥 Slow burn", "🎀 Whimsical", "🧣 Cozy", "🐣 Cute"];
    const TROPES = ["Enemies→Lovers", "Found family", "Slow burn", "Grumpy/Sunshine", "Secret Identity", "Small Town", "Time Travel", "Workplace"];

    let user = null, id = null;
    let rating = 0, spice = 0;
    let selectedGenres = new Set(), selectedMoods = new Set(), selectedTropes = new Set();
    let existingFile = null; // keep if user doesn’t replace

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
    function activateMulti(root, arr) {
        root?.querySelectorAll(".category")?.forEach(ch => {
            if (arr.includes(ch.textContent)) ch.classList.add("active");
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
    function getActive(root) { const el = root?.querySelector(".category.active"); return el ? el.dataset.val : ""; }

    async function storeLocalFile(file, scope) {
        if (!file) return null;
        try {
            if (window.PBFileStore?.save) {
                const meta = await PBFileStore.save({ file, scope });
                return {
                    blobUrl: meta.blobUrl || meta.url,
                    name: file.name,
                    size: file.size,
                    type: file.type || "",
                };
            }
        } catch (e) {
            console.warn("PBFileStore.save failed, falling back", e);
        }
        return {
            blobUrl: URL.createObjectURL(file),
            name: file.name,
            size: file.size,
            type: file.type || "",
        };
    }

    function setCover(url) { const img = $("#coverPreview"); if (img && url) img.src = url; }

    async function load() {
        user = fb?.auth?.currentUser;
        if (!user) { location.href = "auth.html"; return; }
        id = qs("id"); if (!id) { alert("Missing id"); history.back(); return; }

        const snap = await fb.db.collection("users").doc(user.uid).collection("books").doc(id).get();
        if (!snap.exists) { alert("Not found"); history.back(); return; }
        const b = snap.data() || {};

        $("#title").value = b.title || "";
        $("#author").value = b.author || "";
        $("#started").value = b.startedAt?.toDate ? b.startedAt.toDate().toISOString().slice(0, 10) : (b.startedAt ? new Date(b.startedAt).toISOString().slice(0, 10) : "");
        $("#finished").value = b.finishedAt?.toDate ? b.finishedAt.toDate().toISOString().slice(0, 10) : (b.finishedAt ? new Date(b.finishedAt).toISOString().slice(0, 10) : "");
        $("#review").value = b.review || "";
        setCover(b.coverUrl || "");
        existingFile = b.file || null;

        oneOf($("#statusChips"), b.status || "reading");
        oneOf($("#formatChips"), b.format || "ebook");

        chipify(GENRES, $("#genres"), selectedGenres);
        chipify(MOODS, $("#moods"), selectedMoods);
        chipify(TROPES, $("#tropes"), selectedTropes);
        activateMulti($("#genres"), b.genres || []);
        activateMulti($("#moods"), b.moods || []);
        activateMulti($("#tropes"), b.tropes || []);
        (b.genres || []).forEach(x => selectedGenres.add(x));
        (b.moods || []).forEach(x => selectedMoods.add(x));
        (b.tropes || []).forEach(x => selectedTropes.add(x));

        rating = Number(b.rating || 0);
        spice = Number(b.spice || 0);
        window.RatingControls?.mount({
            ratingEl: $("#ratingBar"),
            spiceEl: $("#spiceBar"),
            initialRating: rating,
            initialSpice: spice,
            onChange({ rating: r, spice: s }) { rating = r; spice = s; }
        });

        // live cover preview if you add an <input id="coverFile"> later
        $("#coverFile")?.addEventListener("change", (e) => {
            const f = e.target.files?.[0];
            if (f) setCover(URL.createObjectURL(f));
        });
    }

    async function onSave() {
        const title = $("#title")?.value?.trim() || "";
        const author = $("#author")?.value?.trim() || "";
        if (!title || !author) { alert("Title and Author are required"); return; }

        const payload = {
            title, author,
            status: getActive($("#statusChips")) || "reading",
            format: getActive($("#formatChips")) || "ebook",
            startedAt: $("#started")?.value ? new Date($("#started").value) : null,
            finishedAt: $("#finished")?.value ? new Date($("#finished").value) : null,
            genres: [...selectedGenres],
            moods: [...selectedMoods],
            tropes: [...selectedTropes],
            rating, spice,
            review: $("#review")?.value || "",
            updatedAt: new Date()
        };

        // optional book file replacement
        const bookFile = $("#bookFile")?.files?.[0];
        if (bookFile) {
            payload.file = await storeLocalFile(bookFile, "books");
        } else {
            payload.file = existingFile || null;
        }

        // optional cover replacement (if you add <input id="coverFile"> later)
        const coverSrc = $("#coverPreview")?.src || "";
        if (coverSrc) payload.coverUrl = coverSrc;

        await fb.db.collection("users").doc(user.uid).collection("books").doc(id).set(payload, { merge: true });
        alert("Updated!");
        location.href = "index.html";
    }

    async function onDelete() {
        if (!confirm("Delete this book?")) return;
        await fb.db.collection("users").doc(user.uid).collection("books").doc(id).delete();
        alert("Deleted");
        location.href = "index.html";
    }

    document.addEventListener("DOMContentLoaded", () => {
        load().catch(e => { console.error(e); alert(e.message || "Failed to load"); });
        $("#saveBtn")?.addEventListener("click", () => onSave().catch(e => { console.error(e); alert(e.message || "Save failed"); }));
        $("#deleteBtn")?.addEventListener("click", () => onDelete().catch(e => { console.error(e); alert(e.message || "Delete failed"); }));
    });
})();
