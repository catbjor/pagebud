// discover.js — rails + søk + chips + drawer + sort + daily rotation + filter-chips + preview + see-all page
(() => {
    "use strict";
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const esc = (s) => String(s || "").replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[m]));
    const short = (s, max = 18) => (s || "").length > max ? (s.slice(0, max - 1) + "…") : (s || "");
    const nk = (t, a) => `${(t || "").toLowerCase().trim()}::${(a || "").toLowerCase().trim()}`;

    /* --- Skjul legacy sidepanel + 1-kol grid --- */
    (function removeLegacySidebar() {
        const shell = document.querySelector(".disc-shell");
        const oldAside = document.querySelector("aside.disc-side");
        if (shell) shell.classList.add("disc-shell--drawer");
        if (oldAside) oldAside.remove();
    })();

    /* --- Stor sjangerliste (alfabetisk) --- */
    const ALL_GENRES = {
        "Action & Adventure": "action_and_adventure",
        "Apocalyptic & Dystopian": "dystopian",
        "Art & Photography": "art",
        "Biography": "biography",
        "Booker & Prize Winners": "booker_prize",
        "Business & Finance": "business",
        "Christian Fiction": "christian_fiction",
        "Classics": "classics",
        "Comedy & Humor": "humor",
        "Comics & Graphic Novels": "graphic_novels",
        "Contemporary Romance": "contemporary_romance",
        "Cookbooks": "cookbooks",
        "Cozy Mystery": "cozy_mystery",
        "Crime": "crime",
        "Dark Academia": "dark_academia",
        "Dark Romance": "dark_romance",
        "Detective": "detective_and_mystery_stories",
        "Drama": "drama",
        "Essays": "essays",
        "Epic / High Fantasy": "high_fantasy",
        "Fairy Tales & Retellings": "retellings",
        "Fantasy": "fantasy",
        "Feel-Good": "feel_good",
        "Gothic": "gothic_fiction",
        "Health & Fitness": "health",
        "Historical Fiction": "historical_fiction",
        "History": "history",
        "Horror": "horror",
        "LGBTQ+": "lgbtq",
        "Literary Fiction": "literary_fiction",
        "Manga": "manga",
        "Mathematics": "mathematics",
        "Memoir": "memoir",
        "Middle Grade": "juvenile_fiction",
        "Mythology": "mythology",
        "New Adult": "new_adult",
        "Non-fiction": "nonfiction",
        "Paranormal Romance": "paranormal_romance",
        "Philosophy": "philosophy",
        "Poetry": "poetry",
        "Productivity & Self-help": "self-help",
        "Psychology": "psychology",
        "Religion & Spirituality": "religion",
        "Retellings": "retellings",
        "Romance": "romance",
        "Science": "science",
        "Science Fiction": "science_fiction",
        "Short Stories": "short_stories",
        "Space Opera": "space_opera",
        "Sports": "sports",
        "Thriller": "thriller",
        "True Crime": "true_crime",
        "Urban Fantasy": "urban_fantasy",
        "War & Military": "war_stories",
        "Women’s Fiction": "women_fiction",
        "Young Adult": "young_adult_fiction"
    };

    /* --- Kolleksjoner/rails --- */
    const RAILS = [
        { id: "because", title: "Because you read …", kind: "because", size: 20, sortable: false },

        { id: "new_week", title: "New this week", kind: "trending", period: "weekly", filterNew: true, size: 20, sortable: true, fallback: "new" },
        { id: "booktok", title: "Popular on BookTok", kind: "trending", period: "weekly", size: 20, sortable: true, fallback: "booktok" },

        { id: "romance", title: "Romance Reads", kind: "subject", subject: "romance", sortable: true },
        { id: "new_adult", title: "New Adult Romance", kind: "subjectLike", q: 'subject:"new adult" OR subject:"college romance"', sortable: true },
        { id: "ya_fav", title: "Young Adult Favorites", kind: "subject", subject: "young_adult_fiction", sortable: true },
        { id: "dark_romance", title: "Dark Romance", kind: "subjectLike", q: 'subject:"dark romance" OR subject:"erotic romance"', sortable: true },
        { id: "retellings", title: "Retellings & Mythology", kind: "subjectLike", q: 'subject:retellings OR subject:mythology', sortable: true },
        { id: "dark_acad", title: "Dark Academia", kind: "subjectLike", q: 'subject:"dark academia" OR subject:"campus fiction"', sortable: true },
        { id: "thrillers", title: "Twisty Mysteries & Thrillers", kind: "subjectLike", q: 'subject:thriller OR subject:"mystery fiction"', sortable: true },

        { id: "classics_modern", title: "Modern Classics (1980–)", kind: "subjectLike", q: 'subject:classics', modernOnly: true, sortable: true },
        { id: "banned", title: "Banned & Forbidden Books", kind: "subject", subject: "banned_books", sortable: true },

        { id: "short_sweet", title: "Books under 300 pages", kind: "pages", op: "<", pages: 300, sortable: false },
        { id: "chonkers", title: "Chunky But Worth It", kind: "pages", op: ">=", pages: 500, sortable: false },

        { id: "nonfic", title: "Non-fiction highlights", kind: "subject", subject: "nonfiction", sortable: true },
        { id: "nor", title: "Norwegian picks", kind: "subjectLike", q: 'language:nor OR subject:norway', sortable: true }
    ];

    /* --- Library snapshot --- */
    let libByKey = new Map(), libByWork = new Map();
    async function loadLibrarySnapshot() {
        libByKey = new Map(); libByWork = new Map();
        try {
            const u = fb?.auth?.currentUser;
            if (u && fb?.db) {
                const snap = await fb.db.collection("users").doc(u.uid).collection("books").limit(600).get();
                snap.forEach(d => {
                    const b = d.data() || {};
                    const rec = { id: d.id, rating: b.rating || 0, spice: b.spice || 0, workKey: b.workKey || "" };
                    libByKey.set(nk(b.title, b.author), rec);
                    if (b.workKey) libByWork.set(b.workKey, rec);
                });
                return;
            }
        } catch { }
        try {
            const arr = JSON.parse(localStorage.getItem("pb:books") || "[]");
            arr.forEach(b => {
                const rec = { id: b.id, rating: b.rating || 0, spice: b.spice || 0, workKey: b.workKey || "" };
                libByKey.set(nk(b.title, b.author), rec);
                if (b.workKey) libByWork.set(b.workKey, rec);
            });
        } catch { }
    }

    /* --- Open Library helpers --- */
    const coverURLFrom = (doc) => {
        if (!doc) return "";
        const id = doc.cover_i || doc.cover_id || (doc.cover_edition_key ? doc.cover_edition_key : null);
        if (!id) return "";
        if (doc.cover_i || doc.cover_id) return `https://covers.openlibrary.org/b/id/${id}-M.jpg`;
        if (doc.cover_edition_key) return `https://covers.openlibrary.org/b/olid/${doc.cover_edition_key}-M.jpg`;
        return "";
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
        year: work.first_publish_year || work.first_publish_date || "",
        cover: work.cover_id ? `https://covers.openlibrary.org/b/id/${work.cover_id}-M.jpg` :
            (work.cover_edition_key ? `https://covers.openlibrary.org/b/olid/${work.cover_edition_key}-M.jpg` : ""),
        pages: work.number_of_pages_median || null,
        subjects: Array.isArray(work.subject) ? work.subject.slice(0, 8) : []
    });
    const normFromTrending = (work) => ({
        workKey: work.key || null,
        title: work.title || "Untitled",
        author: Array.isArray(work.authors) ? (work.authors[0]?.name || "Unknown") : (work.author_name || "Unknown"),
        year: work.first_publish_year || "",
        cover: work.cover_i ? `https://covers.openlibrary.org/b/id/${work.cover_i}-M.jpg` : "",
        pages: work.number_of_pages_median || null,
        subjects: Array.isArray(work.subject) ? work.subject.slice(0, 8) : []
    });

    async function olJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error(url); return r.json(); }
    const fetchTrending = async (period = "daily", limit = 20) => {
        const data = await olJSON(`https://openlibrary.org/trending/${period}.json?limit=${limit}`);
        return (Array.isArray(data?.works) ? data.works : []).map(normFromTrending);
    };
    async function fetchSubject(slug, limit = 20) {
        try {
            const data = await olJSON(`https://openlibrary.org/subjects/${encodeURIComponent(slug)}.json?limit=${limit}`);
            const w = Array.isArray(data?.works) ? data.works : [];
            if (w.length) return w.map(normFromSubject);
        } catch { }
        return fetchSearch(`subject:${slug.replace(/\s+/g, "_")}`, 1, limit).then(x => x.items);
    }
    const fetchSubjectLike = async (q, limit = 20) => fetchSearch(q, 1, limit).then(x => x.items);
    async function fetchSearch(q, page = 1, limit = 40) {
        const url = new URL("https://openlibrary.org/search.json");
        url.searchParams.set("q", q || ""); url.searchParams.set("page", String(page));
        url.searchParams.set("limit", String(limit));
        const data = await olJSON(url.toString());
        const docs = Array.isArray(data.docs) ? data.docs : [];
        return { items: docs.map(normFromSearch), total: data.numFound || 0 };
    }

    /* --- Detaljer (cache) --- */
    const detailCache = new Map();
    async function fetchWorkDetail(workKey) {
        if (!workKey) return { description: "", average: 0, count: 0, subjects: [] };
        if (detailCache.has(workKey)) return detailCache.get(workKey);
        const base = `https://openlibrary.org${workKey}.json`;
        const rate = `https://openlibrary.org${workKey}/ratings.json`;
        const [meta, ratings] = await Promise.allSettled([olJSON(base), olJSON(rate)]);
        const desc = meta.status === "fulfilled"
            ? (typeof meta.value?.description === "string" ? meta.value.description : (meta.value?.description?.value || "")) : "";
        const subj = meta.status === "fulfilled" ? (Array.isArray(meta.value?.subjects) ? meta.value.subjects.slice(0, 10) : []) : [];
        const avg = ratings.status === "fulfilled" ? (ratings.value?.summary?.average || 0) : 0;
        const cnt = ratings.status === "fulfilled" ? (ratings.value?.summary?.count || 0) : 0;
        const out = { description: desc, subjects: subj, average: avg, count: cnt };
        detailCache.set(workKey, out);
        return out;
    }

    /* --- Because you read (subjects) --- */
    let becauseSubjectsToday = [];
    async function loadLibraryBooks() {
        try {
            const u = fb?.auth?.currentUser;
            if (u && fb?.db) {
                const snap = await fb.db.collection("users").doc(u.uid).collection("books").limit(300).get();
                const out = []; snap.forEach(d => out.push(d.data())); return out;
            }
        } catch { }
        try { return JSON.parse(localStorage.getItem("pb:books") || "[]"); } catch { return []; }
    }
    function topSubjectsFromLibrary(books = [], max = 6) {
        const counts = new Map();
        for (const b of books) {
            const arr = Array.isArray(b.subjects) ? b.subjects : [];
            for (const s of arr.slice(0, 6)) {
                const key = String(s).toLowerCase();
                counts.set(key, (counts.get(key) || 0) + 1);
            }
        }
        const blacklist = new Set(["fiction", "nonfiction", "novels", "literature", "history", "biography"]);
        return [...counts.entries()].filter(([s]) => s && !blacklist.has(s))
            .sort((a, b) => b[1] - a[1]).slice(0, max).map(([s]) => s);
    }
    const daySeed = () => Math.floor(Date.now() / 86400000);
    function pickDailySubset(arr, k) {
        if (!arr.length) return [];
        const start = daySeed() % arr.length;
        const out = []; for (let i = 0; i < Math.min(k, arr.length); i++) { out.push(arr[(start + i) % arr.length]); }
        return out;
    }
    async function fetchBecauseYouRead(limit = 20) {
        const lib = await loadLibraryBooks(); if (!lib.length) { becauseSubjectsToday = []; return []; }
        const subjectsAll = topSubjectsFromLibrary(lib, 6);
        const subjects = pickDailySubset(subjectsAll, Math.min(4, subjectsAll.length || 0));
        becauseSubjectsToday = subjects;
        if (!subjects.length) {
            const authors = []; for (const b of lib.slice(-30).reverse()) {
                const a = (b.author || "").trim(); if (a && !authors.includes(a)) authors.push(a);
                if (authors.length >= 4) break;
            }
            const all = []; for (const a of authors) {
                try {
                    const { items } = await fetchSearch(`author:"${a}"`, 1, Math.ceil(limit / authors.length) + 6);
                    const have = new Set(lib.map(x => nk(x.title, x.author)));
                    items.forEach(it => { if (!have.has(nk(it.title, it.author))) all.push(it); });
                } catch { }
            }
            return all.slice(0, limit);
        }
        const all = []; for (const s of subjects) {
            try {
                const { items } = await fetchSearch(`subject:"${s}"`, 1, Math.ceil(limit / subjects.length) + 8);
                const have = new Set(lib.map(x => nk(x.title, x.author)));
                items.forEach(it => { if (!have.has(nk(it.title, it.author))) all.push(it); });
            } catch { }
        }
        const seen = new Set();
        return all.filter(b => { const k = nk(b.title, b.author); if (seen.has(k)) return false; seen.add(k); return true; })
            .slice(0, limit);
    }

    /* --- UI utilities --- */
    function skeletonTiles(n = 6) {
        return Array.from({ length: n }).map(() => `
    <div class="tile skel">
      <div class="ph cover"></div>
      <div class="ph t"></div>
      <div class="ph a"></div>
    </div>`).join("");
    }
    function tileHTML(b) {
        const byWork = b.workKey ? libByWork.get(b.workKey) : null;
        const byKey = libByKey.get(nk(b.title, b.author)) || null;
        const hit = byWork || byKey;
        const r = hit?.rating || 0, sp = hit?.spice || 0;

        const badges = [
            r > 0 ? `<span class="badge">★ ${r}</span>` : ``,
            sp > 0 ? `<span class="badge">🌶️ ${sp}</span>` : ``
        ].filter(Boolean).join("");

        const subj = Array.isArray(b.subjects) ? b.subjects.slice(0, 2) : [];
        const chips = subj.length ? `<div class="chips" style="margin-top:4px">${subj.map(s => `<span class="chip">${esc(short(s, 16))}</span>`).join("")}</div>` : ``;

        const actions = hit
            ? `<span class="inlib">✓ In library</span> <a class="btn btn-primary small" href="reader.html?id=${encodeURIComponent(hit.id)}">Open</a>`
            : `<button class="btn btn-secondary small" data-add='${encodeURIComponent(JSON.stringify({
                title: b.title, author: b.author, cover: b.cover, year: b.year, subjects: b.subjects || [], workKey: b.workKey || ""
            }))}'>+ Add</button>`;

        return `
      <div class="tile card" data-work="${b.workKey || ""}">
        ${b.cover ? `<img class="cover" src="${b.cover}" alt="" onerror="this.style.background='#eee';this.src='';">` : `<div class="cover"></div>`}
        <div>
          <div class="t">${esc(b.title)}</div>
          <div class="a">${esc(b.author || "")}</div>
          <div class="meta">${b.year ? esc(String(b.year)) : ""}</div>
          ${chips}
          <div class="actions">${actions} ${badges}</div>
        </div>
      </div>`;
    }
    function headerHTML(r) {
        const pills = r.sortable ? `
      <div class="seg" role="tablist" aria-label="Sort">
        <button class="seg-btn active" data-sort="popular" role="tab" aria-selected="true">Popular</button>
        <button class="seg-btn" data-sort="new" role="tab" aria-selected="false">New</button>
      </div>` : ``;
        const becauseChips = r.id === "because" ? `<div class="chips" data-because-chips style="margin-top:4px"></div>` : ``;
        const railChips = `<div class="chips" data-rail-chips="${r.id}" style="margin-top:${r.id === "because" ? "6px" : "0"}"></div>`;
        return `
      <div class="rail-head">
        <div>
          <h2 style="margin:0;font-size:1.1rem">${esc(r.title)}</h2>
          ${becauseChips}
          ${railChips}
        </div>
        <div class="rail-actions">
          ${pills}
          <button class="btn btn-secondary small" data-more="${r.id}">See all</button>
        </div>
      </div>`;
    }
    function sectionHTML(r) {
        return `<section class="card" data-rail="${r.id}" style="margin-bottom:12px">${headerHTML(r)}<div class="rail-list">${skeletonTiles(6)}</div></section>`;
    }

    /* --- Drawer (hamburger) med søk --- */
    function ensureDrawer() {
        let dd = $("#disc-drawer");
        if (dd) return dd;
        dd = document.createElement("div");
        dd.id = "disc-drawer";
        dd.className = "drawer-backdrop";
        dd.innerHTML = `
      <div class="drawer-panel">
        <div class="drawer-head">
          <b>Browse genres</b>
          <button class="btn" id="disc-drawer-close">Close</button>
        </div>
        <div class="drawer-search">
          <input class="form-control" id="drawerFilter" placeholder="Filter genres…" />
        </div>
        <div class="drawer-list" id="drawerGenreList"></div>
      </div>`;
        document.body.appendChild(dd);
        dd.addEventListener("click", (e) => { if (e.target === dd) dd.classList.remove("show"); });
        $("#disc-drawer-close", dd)?.addEventListener("click", () => dd.classList.remove("show"));

        const list = $("#drawerGenreList", dd);
        const entries = Object.entries(ALL_GENRES).sort((a, b) => a[0].localeCompare(b[0]));
        function render(filter = "") {
            const f = filter.trim().toLowerCase();
            const rows = f ? entries.filter(([label]) => label.toLowerCase().includes(f)) : entries;
            list.innerHTML = rows.map(([label, slug]) => `<div class="side-link" data-subj="${slug}">${label}</div>`).join("");
        }
        render();
        $("#drawerFilter", dd)?.addEventListener("input", (e) => render(e.target.value || ""));

        list.addEventListener("click", (e) => {
            const node = e.target.closest(".side-link"); if (!node) return;
            const subj = node.getAttribute("data-subj"); if (!subj) return;
            dd.classList.remove("show");
            (async () => {
                await loadLibrarySnapshot();
                const h = $("#results"); if (!h) return;
                h.innerHTML = `<div class="muted">Loading…</div>`;
                try {
                    const items = await fetchSubject(subj, 60);
                    h.innerHTML = items.map(tileHTML).join("");
                    h.querySelectorAll(".tile").forEach((n, i) => n.__bookBasic = items[i]);
                    bindTiles(h);
                } catch { h.innerHTML = `<div class="muted">Could not load this category.</div>`; }
            })();
        });
        return dd;
    }
    function insertHamburger() {
        if ($("#discMenuBtn")) return;
        const bar = document.createElement("div");
        bar.className = "card";
        bar.style.display = "flex";
        bar.style.justifyContent = "flex-end";
        bar.style.marginBottom = "8px";
        bar.innerHTML = `<button class="btn btn-secondary small" id="discMenuBtn">☰ Genres</button>`;
        const results = $("#results");
        if (results) results.parentNode.insertBefore(bar, results);
        $("#discMenuBtn")?.addEventListener("click", () => ensureDrawer().classList.add("show"));
    }

    /* --- Toast & addToLibrary --- */
    function toast(msg = "Done") {
        let el = $("#pb-toast");
        if (!el) {
            el = document.createElement("div"); el.id = "pb-toast";
            el.style.position = "fixed"; el.style.left = "50%"; el.style.bottom = "16px"; el.style.transform = "translateX(-50%)";
            el.style.background = "var(--text)"; el.style.color = "var(--card)";
            el.style.padding = "10px 14px"; el.style.borderRadius = "10px"; el.style.zIndex = "9999"; document.body.appendChild(el);
        }
        el.textContent = msg; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 1600);
    }
    async function addToLibrary(basic, originBtn) {
        try {
            if (originBtn) { originBtn.disabled = true; originBtn.textContent = "Adding…"; }
            const book = {
                title: basic.title || "Untitled",
                author: basic.author || "",
                coverUrl: basic.cover || "",
                status: "want",
                rating: 0, spice: 0,
                year: basic.year || "",
                workKey: basic.workKey || "",
                subjects: Array.isArray(basic.subjects) ? basic.subjects.slice(0, 8) : [],
                createdAt: new Date().toISOString(),
                source: "discover"
            };
            if (window.PBSync?.saveBook) {
                await PBSync.saveBook(book);
            } else if (window.fb?.db && window.fb?.auth?.currentUser) {
                const u = fb.auth.currentUser;
                const id = fb.db.collection("_").doc().id;
                await fb.db.collection("users").doc(u.uid).collection("books").doc(id).set({ id, ...book }, { merge: true });
            } else {
                const id = "disc_" + Math.random().toString(36).slice(2);
                const all = JSON.parse(localStorage.getItem("pb:books") || "[]"); all.push({ id, ...book });
                localStorage.setItem("pb:books", JSON.stringify(all));
            }
            await loadLibrarySnapshot();
            if (originBtn) { originBtn.textContent = "Added ✓"; }
            document.querySelectorAll(`[data-add]`).forEach(btn => {
                try {
                    const data = JSON.parse(decodeURIComponent(btn.getAttribute("data-add")));
                    const libRec = (data.workKey && libByWork.get(data.workKey)) || libByKey.get(nk(data.title, data.author));
                    if (libRec) {
                        const wrap = btn.closest(".actions");
                        if (wrap) wrap.innerHTML = `<span class="inlib">✓ In library</span> <a class="btn btn-primary small" href="reader.html?id=${encodeURIComponent(libRec.id)}">Open</a>`;
                    }
                } catch { }
            });
            toast("Added to your library ✓");
        } catch (e) {
            console.warn(e);
            if (originBtn) { originBtn.disabled = false; originBtn.textContent = "+ Add"; }
            alert("Could not add this book.");
        }
    }

    /* --- Sort/filtrering per rail --- */
    function sortItems(items, mode) {
        if (mode === "new") return [...items].sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
        return items;
    }
    function topSubjectsFromItems(items, max = 6) {
        const counts = new Map();
        for (const it of items) {
            for (const s of (it.subjects || []).slice(0, 6)) {
                const k = String(s).toLowerCase(); if (!k) continue;
                counts.set(k, (counts.get(k) || 0) + 1);
            }
        }
        const ban = new Set(["fiction", "nonfiction", "novels", "literature", "history", "biography"]);
        return [...counts.entries()].filter(([s]) => !ban.has(s))
            .sort((a, b) => b[1] - a[1]).slice(0, max).map(([s]) => s);
    }

    /* --- Render --- */
    function skeletonTiles(n = 6) {
        return Array.from({ length: n }).map(() => `
    <div class="tile skel">
      <div class="ph cover"></div>
      <div class="ph t"></div>
      <div class="ph a"></div>
    </div>`).join("");
    }
    function renderRail(section, items) {
        const list = section.querySelector(".rail-list");
        if (!list) return;
        list.innerHTML = items.map(tileHTML).join("");
        list.querySelectorAll(".tile").forEach((node, i) => node.__bookBasic = items[i]);
        bindTiles(list);
    }

    function bindTiles(scope = document) {
        scope.addEventListener("click", async (e) => {
            const addBtn = e.target.closest("[data-add]");
            if (addBtn) { const data = JSON.parse(decodeURIComponent(addBtn.getAttribute("data-add"))); await addToLibrary(data, addBtn); return; }
        });
    }

    /* --- Preview (hover/long-press) --- */
    function ensurePreview() {
        let el = $("#disc-prev");
        if (!el) { el = document.createElement("div"); el.id = "disc-prev"; el.className = "preview-pop"; document.body.appendChild(el); }
        return el;
    }
    function hidePreview() { const el = $("#disc-prev"); if (el) el.classList.remove("show"); }
    function placePreview(el, nearRect) {
        const pad = 8, w = el.offsetWidth || 320, vw = window.innerWidth, vh = window.innerHeight;
        let x = nearRect.right + window.scrollX + pad;
        let y = nearRect.top + window.scrollY;
        if (x + w + 8 > window.scrollX + vw) x = nearRect.left + window.scrollX - w - pad;
        if (x < window.scrollX + 8) x = window.scrollX + 8;
        if (y + el.offsetHeight > window.scrollY + vh - 8) y = window.scrollY + vh - el.offsetHeight - 8;
        el.style.left = `${x}px`; el.style.top = `${y}px`;
    }
    async function showPreview(tile, basic) {
        const el = ensurePreview();
        el.innerHTML = `<div class="muted">Loading…</div>`;
        el.classList.add("show");
        const rect = tile.getBoundingClientRect();
        placePreview(el, rect);
        try {
            const det = await fetchWorkDetail(basic.workKey);
            const chips = (det.subjects || []).slice(0, 6).map(s => `<span class="chip">${esc(short(s, 16))}</span>`).join("");
            const txt = (det.description || "").toString();
            const blurb = txt.length > 260 ? txt.slice(0, 257) + "…" : txt || "No description.";
            el.innerHTML = `
        <div class="ttl">${esc(basic.title)}</div>
        <div class="muted" style="margin-bottom:4px">${esc(basic.author || "")}${basic.year ? " • " + esc(String(basic.year)) : ""}</div>
        <div class="chips" style="margin-bottom:6px">${chips}</div>
        <div style="line-height:1.35">${esc(blurb)}</div>
        <div class="muted" style="margin-top:6px">${det.average ? `${det.average.toFixed(1)}★ (${det.count})` : "No rating"}</div>`;
            placePreview(el, rect);
        } catch {
            el.innerHTML = `<div class="ttl">${esc(basic.title)}</div><div class="muted">Preview unavailable.</div>`;
            placePreview(el, rect);
        }
    }
    window.addEventListener("scroll", hidePreview, { passive: true, capture: true });

    /* --- Bygg rails --- */
    async function buildHomeRails() {
        insertHamburger();
        await loadLibrarySnapshot();
        const h = $("#results"); if (!h) return;
        h.innerHTML = RAILS.map(r => `<section class="card" data-rail="${r.id}" style="margin-bottom:12px">${headerHTML(r)}<div class="rail-list">${skeletonTiles(6)}</div></section>`).join("");

        for (const rail of RAILS) {
            const sec = $(`[data-rail="${rail.id}"]`); if (!sec) continue;
            const list = sec.querySelector(".rail-list");

            let sortMode = "popular";
            let items = [];
            let activeChip = "";

            const applyFilterAndSort = () => {
                const pool = activeChip
                    ? items.filter(it => (it.subjects || []).map(s => String(s).toLowerCase()).includes(activeChip))
                    : items;
                return sortItems(pool, sortMode);
            };
            const renderRailChips = () => {
                const host = sec.querySelector(`[data-rail-chips="${rail.id}"]`);
                if (!host) return;
                const top = topSubjectsFromItems(items, 6);
                if (!top.length) { host.innerHTML = ""; return; }
                host.innerHTML = top.map(s => `<button class="chip ${activeChip === s ? 'active' : ''}" data-chip="${s}">${esc(short(s, 16))}</button>`).join("") +
                    (activeChip ? ` <button class="chip" data-chip="">Clear</button>` : "");
                host.addEventListener("click", (e) => {
                    const c = e.target.closest("[data-chip]"); if (!c) return;
                    activeChip = (c.getAttribute("data-chip") || "").toLowerCase();
                    renderRailChips();
                    renderRail(sec, applyFilterAndSort());
                }, { once: true });
            };

            async function loadAndRender() {
                try {
                    if (rail.kind === "because") {
                        items = await fetchBecauseYouRead(rail.size || 20);
                        const chipHost = sec.querySelector("[data-because-chips]");
                        if (chipHost && becauseSubjectsToday?.length) {
                            chipHost.innerHTML = becauseSubjectsToday.slice(0, 4).map(s => `<span class="chip">${esc(short(s, 18))}</span>`).join("");
                        }
                    } else if (rail.kind === "trending") {
                        items = await fetchTrending(rail.period || "daily", rail.size || 20);
                        if (rail.filterNew) {
                            const y = new Date().getFullYear();
                            let filtered = items.filter(b => Number(b.year) >= (y - 1));
                            if (!filtered.length) filtered = items.filter(b => Number(b.year) >= (y - 2));
                            items = filtered.length ? filtered : items;
                        }
                        if (!items.length && rail.fallback === "new") {
                            const { items: docs } = await fetchSearch("", 1, 200);
                            items = docs.filter(d => {
                                const y = Number(d.year || d.first_publish_year || 0);
                                const now = new Date().getFullYear();
                                return y >= now - 1;
                            }).slice(0, rail.size || 20);
                        }
                        if (!items.length && rail.fallback === "booktok") {
                            const { items: docs } = await fetchSearch('subject:"booktok" OR "tiktok made me buy it"', 1, 120);
                            items = docs.slice(0, rail.size || 20);
                        }
                    } else if (rail.kind === "subject") {
                        items = await fetchSubject(rail.subject, rail.size || 20);
                    } else if (rail.kind === "subjectLike") {
                        items = await fetchSubjectLike(rail.q, rail.size || 20);
                        if (rail.modernOnly) items = items.filter(b => Number(b.year) >= 1980);
                    } else if (rail.kind === "pages") {
                        const { items: docs } = await fetchSearch("", 1, 220);
                        items = docs.filter(d => {
                            const p = Number(d.pages || d.number_of_pages_median || 0);
                            return rail.op === "<" ? p > 0 && p < (rail.pages || 300) : p >= (rail.pages || 500);
                        }).slice(0, rail.size || 20);
                    }
                    const seen = new Set();
                    items = items.filter(b => { const k = nk(b.title, b.author); if (seen.has(k)) return false; seen.add(k); return true; });

                    renderRailChips();
                    renderRail(sec, applyFilterAndSort());
                } catch (e) {
                    console.warn("Rail failed:", rail.id, e);
                    list.insertAdjacentHTML("beforeend", `<div class="muted small">Could not load "${rail.title}"</div>`);
                }
            }

            await loadAndRender();

            if (rail.sortable) {
                const pills = sec.querySelectorAll('.seg .seg-btn');
                pills.forEach(btn => btn.addEventListener('click', async () => {
                    pills.forEach(p => p.classList.remove('active'));
                    btn.classList.add('active');
                    sortMode = btn.getAttribute('data-sort') || "popular";
                    renderRail(sec, applyFilterAndSort());
                }));
            }

            // “See all” → egen side
            const btn = sec.querySelector('[data-more]');
            btn?.addEventListener("click", () => {
                location.href = `discover-list.html?rail=${encodeURIComponent(rail.id)}`;
            });
        }
    }

    /* --- Search mode --- */
    async function runSearch(q) {
        await loadLibrarySnapshot();
        if (!q) { await buildHomeRails(); return; }
        const h = $("#results"); if (!h) return;
        h.innerHTML = `<div class="muted">Searching…</div>`;
        try {
            const { items } = await fetchSearch(q, 1, 60);
            if (!items.length) { h.innerHTML = `<div class="muted">No results</div>`; return; }
            h.innerHTML = items.map(tileHTML).join("");
            h.querySelectorAll(".tile").forEach((node, i) => node.__bookBasic = items[i]);
            bindTiles(h);
        } catch { h.innerHTML = `<div class="muted">Could not load results.</div>`; }
    }

    /* --- Wire UI + boot --- */
    function wireUI() {
        const qEl = $("#q");
        $("#qBtn")?.addEventListener("click", () => runSearch((qEl?.value || "").trim()));
        qEl?.addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch((qEl.value || "").trim()); });
    }
    function boot() { wireUI(); insertHamburger(); buildHomeRails(); }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();

})();
