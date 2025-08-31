// discover-list.js — full listevisning for rails/subject/q
(() => {
    "use strict";
    const $ = (s, r = document) => r.querySelector(s);
    const esc = (s) => String(s || "").replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[m]));
    const short = (s, max = 20) => (s || "").length > max ? (s.slice(0, max - 1) + "…") : (s || "");
    const nk = (t, a) => `${(t || "").toLowerCase().trim()}::${(a || "").toLowerCase().trim()}`;

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
    async function fetchRail(rail) {
        if (rail === "booktok") return fetchSearch('subject:"booktok" OR "tiktok made me buy it"', 1, 120);
        if (rail === "new_week") {
            const d = await fetchSearch("", 1, 220);
            const now = new Date().getFullYear();
            return d.filter(x => Number(x.year) >= now - 1).slice(0, 120);
        }
        if (rail === "romance") return fetchSubject("romance", 120);
        if (rail === "new_adult") return fetchSearch('subject:"new adult" OR subject:"college romance"', 1, 120);
        if (rail === "ya_fav") return fetchSubject("young_adult_fiction", 120);
        if (rail === "dark_romance") return fetchSearch('subject:"dark romance" OR subject:"erotic romance"', 1, 120);
        if (rail === "retellings") return fetchSearch('subject:retellings OR subject:mythology', 1, 120);
        if (rail === "dark_acad") return fetchSearch('subject:"dark academia" OR subject:"campus fiction"', 1, 120);
        if (rail === "thrillers") return fetchSearch('subject:thriller OR subject:"mystery fiction"', 1, 120);
        if (rail === "classics_modern") {
            const all = await fetchSearch("subject:classics", 1, 200);
            return all.filter(b => Number(b.year) >= 1980);
        }
        if (rail === "banned") return fetchSubject("banned_books", 120);
        if (rail === "short_sweet") {
            const all = await fetchSearch("", 1, 260);
            return all.filter(b => Number(b.number_of_pages_median || b.pages || 0) > 0 && Number(b.number_of_pages_median || b.pages || 0) < 300);
        }
        if (rail === "chonkers") {
            const all = await fetchSearch("", 1, 260);
            return all.filter(b => Number(b.number_of_pages_median || b.pages || 0) >= 500);
        }
        if (rail === "nonfic") return fetchSubject("nonfiction", 120);
        if (rail === "nor") return fetchSearch('language:nor OR subject:norway', 1, 120);
        return fetchSearch("", 1, 120);
    }

    /* --- Library membership (for badges) --- */
    let lib = new Map();
    function loadLib() {
        lib = new Map();
        try {
            const arr = JSON.parse(localStorage.getItem("pb:books") || "[]");
            arr.forEach(b => lib.set(nk(b.title, b.author), { id: b.id, rating: b.rating || 0, spice: b.spice || 0 }));
        } catch { }
    }

    function card(b) {
        const hit = lib.get(nk(b.title, b.author));
        const meta = b.year ? `<div class="muted">${esc(String(b.year))}</div>` : ``;
        const chips = (b.subjects || []).slice(0, 2).map(s => `<span class="chip">${esc(short(s, 18))}</span>`).join("");
        const act = hit ? `<span class="chip">✓ In library</span>` :
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
        loadLib();
        const { rail, subject, q } = qs();
        let items = [];
        $("#grid").innerHTML = `<div class="muted">Loading…</div>`;
        try {
            if (subject) items = await fetchSubject(subject, 120);
            else if (q) items = await fetchSearch(q, 1, 120);
            else items = await fetchRail(rail || "");
        } catch { $("#grid").innerHTML = `<div class="muted">Failed to load.</div>`; return; }

        let view = items;
        render(view);

        // Filter i denne lista
        $("#q")?.addEventListener("input", (e) => {
            const f = (e.target.value || "").toLowerCase();
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
            try {
                const data = JSON.parse(decodeURIComponent(b.getAttribute("data-add")));
                const id = "disc_" + Math.random().toString(36).slice(2);
                const all = JSON.parse(localStorage.getItem("pb:books") || "[]");
                all.push({ id, ...data, status: "want", rating: 0, spice: 0, createdAt: new Date().toISOString() });
                localStorage.setItem("pb:books", JSON.stringify(all));
                b.replaceWith(`<span class="chip">✓ In library</span>`);
            } catch { }
        });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();
})();
