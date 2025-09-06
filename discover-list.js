// discover-list.js — full listevisning for rails/subject/q
(() => {
    "use strict";
    const $ = (s, r = document) => r.querySelector(s);
    const esc = (s) => String(s || "").replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[m]));
    const short = (s, max = 20) => (s || "").length > max ? (s.slice(0, max - 1) + "…") : (s || "");
    const nk = (t, a) => `${(t || "").toLowerCase().trim()}::${(a || "").toLowerCase().trim()}`;
    const randomId = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
    const take = (arr, n) => (Array.isArray(arr) ? arr.slice(0, n) : []);

    function qs() {
        const p = new URLSearchParams(location.search);
        return { rail: p.get("rail") || "", subject: p.get("subject") || "", q: p.get("q") || "" };
    }

    const coverURLFrom = (doc) => {
        const id = doc.cover_i || doc.cover_id || doc.cover_edition_key;
        if (!id) return "";
        if (doc.cover_i || doc.cover_id) return `https://covers.openlibrary.org/b/id/${id}-M.jpg`;
        return `https://covers.openlibrary.org/b/olid/${id}-M.jpg`;
    };
    const normFromSearch = (doc) => ({
        workKey: doc.key || doc.work_key || (Array.isArray(doc.key) ? doc.key[0] : null),
        title: doc.title || "Untitled",
        author: Array.isArray(doc.author_name) ? doc.author_name[0] :
            (doc.author_name || (Array.isArray(doc.authors) ? doc.authors[0]?.name : doc.author) || "Unknown"),
        year: doc.first_publish_year || doc.first_publish_date || doc.publish_year?.[0] || "",
        cover: coverURLFrom(doc),
        pages: doc.number_of_pages_median || null,
        subjects: doc.subject ? (Array.isArray(doc.subject) ? doc.subject.slice(0, 8) : [doc.subject]) : []
    });
    const normFromSubject = (work) => ({
        workKey: work.key || null,
        title: work.title || "Untitled",
        author: Array.isArray(work.authors) ? (work.authors[0]?.name || "Unknown") : (work.author_name || "Unknown"),
        year: work.first_publish_year || "",
        cover: work.cover_id ? `https://covers.openlibrary.org/b/id/${work.cover_id}-M.jpg` :
            (work.cover_edition_key ? `https://covers.openlibrary.org/b/olid/${work.cover_edition_key}-M.jpg` : ""),
        subjects: Array.isArray(work.subject) ? work.subject.slice(0, 8) : []
    });

    async function olJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error(url); return r.json(); }
    async function fetchSearch(q, page = 1, limit = 120) {
        const u = new URL("https://openlibrary.org/search.json");
        u.searchParams.set("q", q || ""); u.searchParams.set("page", String(page)); u.searchParams.set("limit", String(limit));
        const data = await olJSON(u.toString()); const docs = Array.isArray(data.docs) ? data.docs : [];
        return docs.map(normFromSearch);
    }
    async function fetchSubject(slug, limit = 120) {
        try {
            const data = await olJSON(`https://openlibrary.org/subjects/${encodeURIComponent(slug)}.json?limit=${limit}`);
            const w = Array.isArray(data?.works) ? data.works : []; if (w.length) return w.map(normFromSubject);
        } catch { }
        return fetchSearch(`subject:${slug}`, 1, limit);
    }
    async function fetchRail(railId) {
        const railDef = window.PB_RAILS?.[railId];
        if (!railDef) {
            console.warn(`Rail definition for "${railId}" not found.`);
            return fetchSearch("", 1, 120); // Fallback
        }

        if (railDef.type === 'search') {
            return fetchSearch(railDef.query, 1, 120);
        }
        if (railDef.type === 'subject') {
            return fetchSubject(railDef.query, 120);
        }
        // Fallback for any other type or if type is missing
        return fetchSearch(railDef.query || "", 1, 120);
    }

    /* --- Library membership (for badges) --- */
    let libCache = { work: new Set(), title: new Set() };
    async function loadLib(user) {
        if (!user || !window.fb?.db) return;
        try {
            const col = window.fb.db.collection("users").doc(user.uid).collection("books");
            const snap = await col.limit(500).get();
            snap.forEach(d => {
                const x = d.data() || {};
                if (x.workKey) libCache.work.add(String(x.workKey).toLowerCase());
                if (x.title) libCache.title.add(String(x.title).toLowerCase());
            });
        } catch (e) {
            console.warn("Could not build library map for list page:", e);
        }
    }
    const inLib = (b) => {
        if (!b) return false;
        if (b.workKey && libCache.work.has(String(b.workKey).toLowerCase())) return true;
        if (b.title && libCache.title.has(String(b.title).toLowerCase())) return true;
        return false;
    };

    async function fbAddToLibrary(book) {
        const user = window.fb?.auth?.currentUser;
        if (!user) throw new Error("Not signed in");

        const payload = {
            id: book.id || randomId(),
            title: book.title || "Untitled",
            author: book.author || "",
            coverUrl: book.cover || "",
            status: "tbr",
            statuses: ["tbr"],
            rating: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            workKey: book.workKey || null,
            subjects: take(book.subjects || [], 6)
        };
        await window.fb.db.collection("users").doc(user.uid).collection("books").doc(payload.id).set(payload);
    }

    function card(b) {
        const meta = b.year ? `<div class="muted">${esc(String(b.year))}</div>` : ``;
        const chips = (b.subjects || []).slice(0, 2).map(s => `<span class="chip">${esc(short(s, 18))}</span>`).join("");
        const act = inLib(b) ? `<span class="chip">✓ In library</span>` :
            `<button class="btn btn-secondary small" data-add='${encodeURIComponent(JSON.stringify({
                title: b.title, author: b.author, cover: b.cover, year: b.year, subjects: b.subjects || [], workKey: b.workKey || ""
            }))}'>+ Add</button>`;
        return `
      <div class="book-card">
        <div class="thumb-wrap">
          ${b.cover ? `<img class="thumb" src="${b.cover}" alt="">` : ``}
        </div>
        <div class="title">${esc(b.title)}</div>
        <div class="author">${esc(b.author || "")}</div>
        ${meta}
        <div class="chips" style="margin-top:6px">${chips}</div>
        <div class="actions" style="margin-top:8px">${act}</div>
      </div>`;
    }

    function render(items) { $("#grid").innerHTML = items.map(card).join(""); }

    function sortBy(items, mode) {
        if (mode === "new") return [...items].sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
        return items;
    }

    async function boot() {
        const user = await window.onAuthReady;
        if (user) {
            await loadLib(user);
        }

        const { rail, subject, q } = qs();
        let items = [];
        $("#grid").innerHTML = `<div class="muted">Loading…</div>`;
        try {
            if (subject) items = await fetchSubject(subject, 120);
            else if (q) items = await fetchSearch(q, 1, 120);
            else if (rail) items = await fetchRail(rail);
            else { $("#grid").innerHTML = `<div class="muted">No collection specified.</div>`; return; }
        } catch { $("#grid").innerHTML = `<div class="muted">Failed to load.</div>`; return; }

        let view = items;
        render(view);

        // Filter i denne lista
        $("#q")?.addEventListener("input", (e) => {
            const f = (e.target.value || "").toLowerCase().trim();
            view = items.filter(x =>
                (x.title || "").toLowerCase().includes(f) ||
                (x.author || "").toLowerCase().includes(f) ||
                (x.subjects || []).some(s => String(s).toLowerCase().includes(f))
            );
            render(view);
        });

        // Sort-pills
        const pills = document.querySelectorAll('.seg .seg-btn');
        pills.forEach(btn => btn.addEventListener('click', () => {
            pills.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const mode = btn.getAttribute('data-sort') || "popular";
            render(sortBy(view, mode));
        }));

        // + Add
        document.body.addEventListener("click", async (e) => {
            const b = e.target.closest("[data-add]"); if (!b) return;
            b.disabled = true;
            try {
                if (!window.fb?.auth?.currentUser) { alert("Please sign in to add books."); b.disabled = false; return; }
                const data = JSON.parse(decodeURIComponent(b.getAttribute("data-add")));
                await fbAddToLibrary(data);
                b.replaceWith(`<span class="chip">✓ In library</span>`);
            } catch (err) {
                console.warn("Failed to add book from list page:", err);
                alert("Could not add book. Please try again.");
                b.disabled = false;
            }
        });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();
})();
