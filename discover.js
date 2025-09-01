/* discover.js — Discover rails + genres drawer + search + BOOK SHEET
   - Drawer for sjangre (Genres)
   - Rails: Because you read, New this week, Popular on BookTok + curated (inkl. nye rails)
   - Klikk på bok → detalj-sheet (blurb, rating, subjects, +Add)
   - Desktopvennlig horisontal scroll per seksjon (drag/wheel), uten å stjele klikk
*/
(() => {
    "use strict";

    /* ----------------- Utils ----------------- */
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const esc = (s) => String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const yearOf = (d) => (d && (d.first_publish_year || d.publish_year?.[0] || d.first_publish_date?.slice?.(0, 4))) || "";
    const uniq = (arr) => Array.from(new Set(arr));
    const take = (arr, n) => (Array.isArray(arr) ? arr.slice(0, n) : []);
    const nowYear = (new Date()).getFullYear();
    const cap = (s) => String(s || "").replace(/\b\w/g, m => m.toUpperCase());
    function randomId() { return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10); }
    const fmtInt = (n) => {
        n = Number(n || 0);
        if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "k";
        return String(n);
    };

    /* ----------------- Subjects (alfabetisk) ----------------- */
    const ALL_SUBJECTS = [
        "action", "adventure", "african literature", "american literature", "animals", "anthologies", "art",
        "autobiography", "banned books", "biology", "book club", "booktok", "business", "classics",
        "cozy mystery", "cozy fantasy", "contemporary", "crime", "dark academia", "dark romance", "dystopia",
        "economics", "epic fantasy", "essays", "fairy tales", "fantasy", "feminism", "folklore", "food",
        "graphic novels", "health", "historical fiction", "history", "horror", "humor", "inspirational",
        "lgbt", "literary fiction", "manga", "memoir", "mystery", "mythology", "new adult", "nonfiction",
        "norwegian", "philosophy", "poetry", "psychology", "religion", "retellings", "romance", "romantasy",
        "science", "science fiction", "self help", "short stories", "spirituality", "sports", "thriller",
        "time travel", "true crime", "urban fantasy", "war", "western", "women", "ya", "young adult", "zombies"
    ].sort((a, b) => a.localeCompare(b));

    /* ----------------- Firebase helpers (robust) ----------------- */
    const hasFB = () => !!(window.fb && window.fb.db && window.fb.auth);
    const me = () => hasFB() ? window.fb.auth.currentUser : null;
    let LIB_CACHE = null; // fylles ved boot

    async function myLibraryMap() {
        const out = { work: new Set(), title: new Set(), subjects: [] };
        if (!hasFB() || !me()) return out;
        try {
            const col = window.fb.db.collection("users").doc(me().uid).collection("books");
            const snap = await col.limit(500).get();
            snap.forEach(d => {
                const x = d.data() || {};
                if (x.workKey) out.work.add(String(x.workKey).toLowerCase());
                if (x.title) out.title.add(String(x.title).toLowerCase());
                if (Array.isArray(x.subjects)) out.subjects.push(...x.subjects.map(s => String(s).toLowerCase()));
            });
        } catch { }
        return out;
    }

    async function addToLibrary(normal) {
        if (!hasFB() || !me()) throw new Error("Not signed in");
        const payload = {
            id: normal.id || randomId(),
            title: normal.title || "Untitled",
            author: normal.author || "",
            coverUrl: normal.cover || "",
            status: "want",
            rating: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            workKey: normal.workKey || null,
            subjects: take(normal.subjects || [], 6)
        };
        if (window.PBSync?.saveBook) {
            await PBSync.saveBook(payload);
        } else {
            await window.fb.db.collection("users").doc(me().uid).collection("books")
                .doc(payload.id).set(payload, { merge: true });
        }
        // hold LIB_CACHE ajour lokalt
        LIB_CACHE?.title?.add(String(payload.title).toLowerCase());
        if (payload.workKey) LIB_CACHE?.work?.add(String(payload.workKey).toLowerCase());
        return payload.id;
    }

    /* ----------------- Open Library ----------------- */
    const OL = {
        coverURL(doc) {
            const id = doc.cover_i || doc.cover_edition_key || null;
            if (!id) return "";
            return doc.cover_i
                ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
                : `https://covers.openlibrary.org/b/olid/${doc.cover_edition_key}-M.jpg`;
        },
        normalize(doc) {
            const subs =
                (Array.isArray(doc.subject) ? doc.subject :
                    Array.isArray(doc.subject_key) ? doc.subject_key : [])
                    .map(x => String(x).toLowerCase().replace(/_/g, " "));
            return {
                id: undefined,
                title: doc.title || "Untitled",
                author: Array.isArray(doc.author_name) ? doc.author_name[0] : (doc.author_name || "Unknown"),
                year: yearOf(doc) || "",
                cover: OL.coverURL(doc),
                workKey: doc.key || doc.work_key?.[0] || null, // "/works/OLxxxxxW"
                subjects: take(uniq(subs), 6),
                pages: doc.number_of_pages_median || null,
                editionCount: doc.edition_count || 0
            };
        },
        async search(q, page = 1, limit = 24) {
            const url = new URL("https://openlibrary.org/search.json");
            url.searchParams.set("q", q);
            url.searchParams.set("page", String(page));
            url.searchParams.set("limit", String(limit));
            const r = await fetch(url); if (!r.ok) throw new Error("search failed");
            return await r.json();
        },
        async trendingWeekly(limit = 24) {
            const url = new URL("https://openlibrary.org/trending/weekly.json");
            url.searchParams.set("limit", String(limit));
            const r = await fetch(url); if (!r.ok) throw new Error("weekly failed");
            return await r.json();
        },
        async workExtras(workKey) {
            if (!workKey) return {};
            const key = workKey.startsWith("/works/") ? workKey : `/works/${String(workKey).replace(/^\/?works\//, '')}`;
            let description = "", avg = null, count = null, subjects = [];
            try {
                const r = await fetch(`https://openlibrary.org${key}.json`);
                if (r.ok) {
                    const w = await r.json();
                    if (w.description) description = typeof w.description === "string" ? w.description : (w.description.value || "");
                    if (Array.isArray(w.subjects)) subjects = w.subjects.map(s => String(s).toLowerCase());
                }
            } catch { }
            try {
                const rr = await fetch(`https://openlibrary.org${key}/ratings.json`);
                if (rr.ok) {
                    const j = await rr.json();
                    avg = j?.summary?.average ?? null;
                    count = j?.summary?.count ?? null;
                }
            } catch { }
            return { description, avg, count, subjects };
        }
    };

    /* ----------------- Drawer (Genres) ----------------- */
    function ensureDrawer() {
        let drawer = $("#discDrawer");
        if (drawer) return drawer;

        drawer = document.createElement("div");
        drawer.id = "discDrawer";
        drawer.className = "disc-drawer";
        drawer.innerHTML = `
      <div class="disc-drawer__scrim" data-close></div>
      <aside class="disc-drawer__panel">
        <div class="disc-drawer__head">
          <b>Genres</b>
          <button class="btn btn-secondary small" data-close>Close</button>
        </div>
        <div class="disc-drawer__search row" style="margin:8px 0 12px">
          <input class="form-control" id="drawerFilter" placeholder="Filter genres…" />
        </div>
        <div class="disc-drawer__list" id="drawerList"></div>
      </aside>
    `;
        document.body.appendChild(drawer);

        const list = $("#drawerList", drawer);
        list.innerHTML = ALL_SUBJECTS.map(sub =>
            `<div class="side-link" data-sub="${esc(sub)}">${esc(cap(sub))}</div>`
        ).join("");

        $("#drawerFilter", drawer)?.addEventListener("input", (e) => {
            const q = (e.target.value || "").toLowerCase().trim();
            $$(".side-link", list).forEach(el => {
                const hit = el.textContent.toLowerCase().includes(q);
                el.style.display = hit ? "" : "none";
            });
        });

        list.addEventListener("click", (e) => {
            const link = e.target.closest(".side-link");
            if (!link) return;
            drawer.classList.remove("show");
            showSubjectSeeAll(link.getAttribute("data-sub"));
        });

        drawer.addEventListener("click", (e) => { if (e.target.hasAttribute("data-close")) drawer.classList.remove("show"); });

        return drawer;
    }

    function ensureActionbarButton() {
        if ($("#discMenuBtn")) return;
        const searchRow = $(".search-row");
        const card = document.createElement("div");
        card.className = "card disc-actionbar";
        card.innerHTML = `
      <button class="btn btn-secondary small" id="discMenuBtn">
        <i class="fa-solid fa-bars"></i> Genres
      </button>`;
        if (searchRow && searchRow.parentNode) {
            searchRow.parentNode.insertBefore(card, searchRow.nextSibling);
        } else {
            const main = $(".disc-main") || document.body;
            main.prepend(card);
        }
    }

    /* ----------------- Sheet (Book details) ----------------- */
    function ensureSheet() {
        let el = $("#bookSheet");
        if (el) return el;
        el = document.createElement("div");
        el.id = "bookSheet";
        el.className = "sheet";
        el.innerHTML = `
      <div class="sheet__scrim" data-close></div>
      <div class="sheet__panel">
        <div id="sheetBody">Loading…</div>
      </div>
    `;
        document.body.appendChild(el);
        el.addEventListener("click", (e) => { if (e.target.hasAttribute("data-close")) el.classList.remove("show"); });
        return el;
    }

    function renderSheetHTML(basic, extras, inLib) {
        const subs = uniq([...(basic.subjects || []), ...(extras.subjects || [])]).slice(0, 8);
        const desc = String(extras.description || "").trim();
        const hasDesc = !!desc;
        const ratingLine = (extras.avg != null)
            ? `<div class="muted-small">★ ${Number(extras.avg).toFixed(1)} (${fmtInt(extras.count)} ratings)</div>`
            : ``;

        return `
      <div class="card" style="margin:0">
        <div class="row">
          <img src="${esc(basic.cover || "")}" alt="" style="width:110px;height:150px;object-fit:cover;border-radius:10px;border:1px solid var(--border);background:#eee" onerror="this.src='';this.style.background='#eee'" draggable="false"/>
          <div class="row-grow">
            <h2 style="margin:0 0 4px 0">${esc(basic.title)}</h2>
            <div class="muted">${esc(basic.author)} ${basic.year ? "· " + esc(basic.year) : ""}</div>
            <div class="row" style="margin:8px 0 0">
              ${ratingLine}
            </div>
          </div>
        </div>

        ${subs.length ? `<div class="chips" style="margin:12px 0 6px">
          ${subs.map(g => `<span class="chip muted-small" data-subj="${esc(g)}">${esc(cap(g))}</span>`).join("")}
        </div>`: ``}

        ${hasDesc ? `
          <div class="muted" id="sheetDesc" style="margin-top:8px; max-height: 10.5em; overflow: hidden;">
            ${esc(desc)}
          </div>
          <div class="row" style="justify-content:flex-end;margin-top:6px">
            <button class="btn btn-secondary small" id="descToggle">Show more</button>
          </div>
        ` : `<div class="muted-small" style="margin-top:8px">No description available.</div>`}

        <div class="row" style="justify-content:flex-end;margin-top:12px">
          ${inLib
                ? `<span class="muted-small" aria-label="In library">Already in your library ✓</span>`
                : `<button class="btn btn-secondary" id="sheetAdd">+ Add to Library</button>`}
          <button class="btn" data-close>Close</button>
        </div>
      </div>
    `;
    }

    async function openBookSheet(basic) {
        const sheet = ensureSheet();
        const body = $("#sheetBody", sheet);
        body.innerHTML = `<div class="muted">Loading details…</div>`;
        sheet.classList.add("show");

        let extras = {};
        try { extras = await OL.workExtras(basic.workKey); } catch { }
        const inLib = markInLib(basic, LIB_CACHE);

        body.innerHTML = renderSheetHTML(basic, extras, inLib);

        body.onclick = async (e) => {
            const t = e.target;

            if (t.id === "sheetAdd") {
                t.disabled = true;
                try {
                    await addToLibrary(basic);
                    t.replaceWith(document.createRange().createContextualFragment(`<span class="muted-small">Already in your library ✓</span>`));
                    toast("Added to your library ✓");
                } catch { t.disabled = false; alert("Could not add this book."); }
            }

            if (t.id === "descToggle") {
                const d = $("#sheetDesc", body);
                const expanded = d?.dataset?.x === "1";
                if (d) {
                    d.style.maxHeight = expanded ? "10.5em" : "100vh";
                    d.dataset.x = expanded ? "0" : "1";
                }
                t.textContent = expanded ? "Show more" : "Show less";
            }

            const chip = t.closest("[data-subj]");
            if (chip) {
                sheet.classList.remove("show");
                showSubjectSeeAll(chip.getAttribute("data-subj"));
            }
        };
    }

    /* ----------------- Rendering helpers ----------------- */
    function railSkeleton(n = 10) {
        return `<div class="rail-list">
      ${Array.from({ length: n }).map(() => `
        <div class="tile is-skel" style="width:160px">
          <div class="cover" style="background:#e9e9ef"></div>
          <div class="muted" style="height:14px;background:#eee;border-radius:6px;margin:6px 0"></div>
          <div class="muted" style="height:12px;background:#eee;border-radius:6px;width:60%"></div>
        </div>`).join("")}
    </div>`;
    }

    function railsHost() {
        let host = $("#railsHost");
        if (!host) {
            host = document.createElement("div");
            host.id = "railsHost";
            const main = $(".disc-main") || document.body;
            main.appendChild(host);
        }
        return host;
    }

    function makeSection(id, title, tags = []) {
        const host = railsHost();
        const sec = document.createElement("section");
        sec.className = "card";
        sec.dataset.rail = id;
        sec.innerHTML = `
      <div class="card-head">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <h3 style="margin:0">${esc(title)}</h3>
          <div class="chips muted-small" data-tags>
            ${tags.map(t => `<span class="chip muted-small">${esc(t)}</span>`).join("")}
          </div>
        </div>
        <div><a class="btn btn-secondary small" data-seeall>See all</a></div>
      </div>
      ${railSkeleton(8)}
    `;
        host.appendChild(sec);
        sec.querySelector("[data-seeall]")?.addEventListener("click", () => openSeeAllFor(id));
        return sec;
    }

    function tileHTML(b, inLib = false) {
        const genres = (b.subjects || []).slice(0, 3);
        return `
      <div class="tile" data-book='${encodeURIComponent(JSON.stringify(b))}' style="width:160px;scroll-snap-align:start">
        <img class="cover" src="${esc(b.cover || "")}" alt="" onerror="this.src='';this.style.background='#eee'" draggable="false"/>
        <div class="t">${esc(b.title)}</div>
        <div class="a">${esc(b.author)} ${b.year ? "· " + esc(b.year) : ""}</div>
        ${genres.length ? `<div class="chips" style="margin-top:6px">
          ${genres.map(g => `<span class="chip muted-small">${esc(cap(g))}</span>`).join("")}
        </div>`: ``}
        <div class="row" style="justify-content:flex-end;margin-top:8px">
          ${inLib
                ? `<span class="muted-small" aria-label="In library">Already in ✓</span>`
                : `<button class="btn btn-secondary small" data-add='${encodeURIComponent(JSON.stringify(b))}'>+ Add</button>`}
        </div>
      </div>
    `;
    }

    function toast(msg = "Done") {
        let el = $("#pb-toast"); if (!el) { el = document.createElement("div"); el.id = "pb-toast"; el.className = "toast"; document.body.appendChild(el); }
        el.textContent = msg;
        el.classList.add("show");
        setTimeout(() => el.classList.remove("show"), 1600);
    }

    // Desktop-vennlig rail-scroll – men la klikk slippe gjennom ved små bevegelser.
    function enhanceRailScroll(root) {
        if (!root || root.__pbEnhanced) return;
        root.__pbEnhanced = true;

        // Wheel → horisontal
        root.addEventListener("wheel", (e) => {
            if (root.scrollWidth > root.clientWidth && !e.shiftKey) {
                root.scrollLeft += (e.deltaY || 0) + (e.deltaX || 0);
                e.preventDefault();
            }
        }, { passive: false });

        // Pointer-drag (med terskel). Svelger kun klikk hvis vi faktisk dro.
        let down = false, startX = 0, startLeft = 0, dragged = false;
        root.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return; // kun venstre
            down = true; dragged = false;
            startX = e.clientX; startLeft = root.scrollLeft;
            root.classList.add("dragging");
        });
        root.addEventListener("pointermove", (e) => {
            if (!down) return;
            const dx = e.clientX - startX;
            if (Math.abs(dx) > 4) dragged = true;
            root.scrollLeft = startLeft - dx;
        });
        const end = (e) => {
            if (!down) return;
            down = false;
            if (dragged) {
                const kill = (ev) => { ev.stopPropagation(); ev.preventDefault(); root.removeEventListener("click", kill, true); };
                root.addEventListener("click", kill, true);
            }
            root.classList.remove("dragging");
        };
        root.addEventListener("pointerup", end);
        root.addEventListener("pointercancel", end);
    }

    function markInLib(b, map) {
        if (!map) return false;
        if (b.workKey && map.work.has(String(b.workKey).toLowerCase())) return true;
        if (b.title && map.title.has(String(b.title).toLowerCase())) return true;
        return false;
    }

    function bindSectionClicks(sec) {
        sec.addEventListener("click", async (e) => {
            // Add-knapp?
            const add = e.target.closest("[data-add]");
            if (add) {
                add.disabled = true;
                try {
                    const book = JSON.parse(decodeURIComponent(add.getAttribute("data-add")));
                    await addToLibrary(book);
                    const wrap = add.closest(".row");
                    if (wrap) wrap.innerHTML = `<span class="muted-small">Already in ✓</span>`;
                    toast("Added to your library ✓");
                } catch (err) {
                    console.warn(err);
                    add.disabled = false;
                    alert("Could not add this book.");
                }
                return;
            }
            // Klikk på tile for sheet (unngå chip/add)
            const tile = e.target.closest(".tile");
            if (!tile || e.target.closest(".chip,[data-add]")) return;
            try {
                const book = JSON.parse(decodeURIComponent(tile.getAttribute("data-book")));
                openBookSheet(book);
            } catch { }
        });
    }

    /* ----------------- Rails: data builders ----------------- */
    async function buildBecauseYouRead(libMap) {
        const sec = makeSection("because", "Because you read …", []);
        bindSectionClicks(sec);

        const counts = {};
        (libMap.subjects || []).forEach(s => {
            const k = String(s || "").toLowerCase();
            if (!k) return;
            counts[k] = (counts[k] || 0) + 1;
        });
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
        if (!top.length) top.push("romance", "fantasy", "mystery");

        const tagsHost = sec.querySelector("[data-tags]");
        if (tagsHost) tagsHost.innerHTML = top.map(t => `<span class="chip muted-small">${esc(cap(t))}</span>`).join("");

        let docs = [];
        for (const s of top) {
            try {
                const { docs: part } = await OL.search(`subject:${JSON.stringify(s)}`, 1, 24);
                docs = docs.concat(part || []);
            } catch { }
            await sleep(80);
        }
        const items = docs.map(OL.normalize);
        const html = items.map(b => tileHTML(b, markInLib(b, libMap))).join("");
        const rail = document.createElement("div");
        rail.className = "rail-list";
        rail.innerHTML = html;
        sec.querySelector(".rail-list")?.replaceWith(rail);
        enhanceRailScroll(rail);
    }

    async function buildNewThisWeek(libMap) {
        const sec = makeSection("newweek", "Trending this week", []);
        bindSectionClicks(sec);
        let docs = [];
        try {
            const w = await OL.trendingWeekly(32);
            docs = Array.isArray(w?.works) ? w.works : [];
        } catch { }
        if (!docs.length) {
            try {
                const res = await OL.search(`first_publish_year:[${nowYear - 1} TO ${nowYear}]`, 1, 40);
                docs = res.docs || [];
                docs.sort((a, b) => (yearOf(b) || 0) - (yearOf(a) || 0));
            } catch { }
        }
        const items = (docs || []).map(OL.normalize).slice(0, 24);
        const html = items.map(b => tileHTML(b, markInLib(b, libMap))).join("");
        const rail = document.createElement("div");
        rail.className = "rail-list";
        rail.innerHTML = html || `<div class="muted">Could not load “New this week”.</div>`;
        sec.querySelector(".rail-list")?.replaceWith(rail);
        enhanceRailScroll(rail);
    }

    async function buildBookTok(libMap) {
        const sec = makeSection("booktok", "Popular on BookTok", []);
        bindSectionClicks(sec);
        let docs = [];
        try {
            const r1 = await OL.search(`subject:booktok`, 1, 40);
            docs = r1.docs || [];
        } catch { }
        if (!docs.length) {
            try {
                const r2 = await OL.search(`"tiktok made me buy it"`, 1, 40);
                docs = r2.docs || [];
            } catch { }
        }
        const items = (docs || []).map(OL.normalize).slice(0, 24);
        const html = items.map(b => tileHTML(b, markInLib(b, libMap))).join("");
        const rail = document.createElement("div");
        rail.className = "rail-list";
        rail.innerHTML = html || `<div class="muted">Could not load “Popular on BookTok”.</div>`;
        sec.querySelector(".rail-list")?.replaceWith(rail);
        enhanceRailScroll(rail);
    }

    async function buildCuratedRail(id, title, query, libMap, { filter = null, tags = [] } = {}) {
        const sec = makeSection(id, title, tags);
        bindSectionClicks(sec);
        try {
            const res = await OL.search(query, 1, 50);
            let docs = res.docs || [];
            if (typeof filter === "function") docs = docs.filter(filter);
            docs.sort((a, b) => (b.edition_count || 0) - (a.edition_count || 0));
            const items = docs.map(OL.normalize).slice(0, 24);
            const rail = document.createElement("div");
            rail.className = "rail-list";
            rail.innerHTML = items.map(b => tileHTML(b, markInLib(b, libMap))).join("");
            sec.querySelector(".rail-list")?.replaceWith(rail);
            enhanceRailScroll(rail);
        } catch (e) {
            console.warn(id, e);
            sec.querySelector(".rail-list").innerHTML = `<div class="muted">Could not load “${esc(title)}”.</div>`;
        }
    }

    /* ----------------- Search / See all ----------------- */
    function wireUI() {
        ensureActionbarButton();
        $("#discMenuBtn")?.addEventListener("click", () => ensureDrawer().classList.add("show"));
        $("#qBtn")?.addEventListener("click", () => doSearch());
        $("#q")?.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });
    }

    async function doSearch() {
        const q = ($("#q")?.value || "").trim();
        const host = $("#results");
        if (!host) return;
        if (!q) { host.innerHTML = ""; return; }

        host.innerHTML = `<div class="muted" style="padding:10px">Searching…</div>`;
        try {
            const res = await OL.search(q, 1, 40);
            const items = (res.docs || []).map(OL.normalize);
            host.innerHTML = `
        <div class="list">
          ${items.map(b => `
            <div class="tile" data-book='${encodeURIComponent(JSON.stringify(b))}' style="grid-template-columns:92px 1fr auto">
              <img class="cover" src="${esc(b.cover || "")}" alt="" onerror="this.src='';this.style.background='#eee'" draggable="false"/>
              <div>
                <div class="t">${esc(b.title)}</div>
                <div class="a">${esc(b.author)} ${b.year ? "· " + esc(b.year) : ""}</div>
                ${(b.subjects || []).slice(0, 4).map(g => `<span class="chip muted-small">${esc(cap(g))}</span>`).join(" ")}
              </div>
              <div class="row" style="justify-content:flex-end">
                ${(markInLib(b, LIB_CACHE) ? `<span class="muted-small">Already in ✓</span>`
                    : `<button class="btn btn-secondary small" data-add='${encodeURIComponent(JSON.stringify(b))}'>+ Add</button>`)}
              </div>
            </div>
          `).join("")}
        </div>
      `;
            host.onclick = async (e) => {
                const add = e.target.closest("[data-add]");
                if (add) {
                    add.disabled = true;
                    try {
                        const book = JSON.parse(decodeURIComponent(add.getAttribute("data-add")));
                        await addToLibrary(book);
                        add.parentElement.innerHTML = `<span class="muted-small">Already in ✓</span>`;
                        toast("Added to your library ✓");
                    } catch { add.disabled = false; alert("Could not add this book."); }
                    return;
                }
                const tile = e.target.closest(".tile");
                if (tile && !e.target.closest(".chip")) {
                    try { openBookSheet(JSON.parse(decodeURIComponent(tile.getAttribute("data-book")))); } catch { }
                }
            };
        } catch (e) {
            console.warn(e);
            host.innerHTML = `<div class="muted" style="padding:10px">Search failed.</div>`;
        }
    }

    async function showSubjectSeeAll(subject) {
        const host = $("#results");
        if (!host) return;
        host.innerHTML = `<div class="muted" style="padding:10px">Loading “${esc(cap(subject))}”…</div>`;
        try {
            const res = await OL.search(`subject:${JSON.stringify(subject)}`, 1, 60);
            const items = (res.docs || []).map(OL.normalize);
            host.innerHTML = `
        <div class="card">
          <div class="card-head"><h3 style="margin:0">${esc(cap(subject))}</h3></div>
          <div class="list">
          ${items.map(b => `
            <div class="tile" data-book='${encodeURIComponent(JSON.stringify(b))}' style="grid-template-columns:92px 1fr auto">
              <img class="cover" src="${esc(b.cover || "")}" alt="" onerror="this.src='';this.style.background='#eee'" draggable="false"/>
              <div>
                <div class="t">${esc(b.title)}</div>
                <div class="a">${esc(b.author)} ${b.year ? "· " + esc(b.year) : ""}</div>
                ${(b.subjects || []).slice(0, 6).map(g => `<span class="chip muted-small">${esc(cap(g))}</span>`).join(" ")}
              </div>
              <div class="row" style="justify-content:flex-end">
                ${markInLib(b, LIB_CACHE) ? `<span class="muted-small">Already in ✓</span>`
                    : `<button class="btn btn-secondary small" data-add='${encodeURIComponent(JSON.stringify(b))}'>+ Add</button>`}
              </div>
            </div>
          `).join("")}
          </div>
        </div>
      `;
            host.onclick = async (e) => {
                const add = e.target.closest("[data-add]");
                if (add) {
                    add.disabled = true;
                    try {
                        const book = JSON.parse(decodeURIComponent(add.getAttribute("data-add")));
                        await addToLibrary(book);
                        add.parentElement.innerHTML = `<span class="muted-small">Already in ✓</span>`;
                        toast("Added to your library ✓");
                    } catch { add.disabled = false; alert("Could not add this book."); }
                    return;
                }
                const tile = e.target.closest(".tile");
                if (tile && !e.target.closest(".chip")) {
                    try { openBookSheet(JSON.parse(decodeURIComponent(tile.getAttribute("data-book")))); } catch { }
                }
            };
            host.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (e) {
            console.warn(e);
            host.innerHTML = `<div class="muted" style="padding:10px">Could not load “${esc(cap(subject))}”.</div>`;
        }
    }

    function openSeeAllFor(railId) {
        const map = {
            because: () => showSubjectSeeAll("romance"),
            booktok: () => showSubjectSeeAll("booktok"),
            newweek: () => showSubjectSeeAll(String(nowYear)),
            romance: () => showSubjectSeeAll("romance"),
            modern: () => doSearchSeeAll(`first_publish_year:[1980 TO ${nowYear}]`),
            banned: () => doSearchSeeAll(`subject:"banned books" OR subject:censorship OR "challenged books"`),
            ya: () => showSubjectSeeAll("young adult fiction"),
            newadult: () => showSubjectSeeAll("new adult fiction"),
            darkacad: () => doSearchSeeAll(`"dark academia" OR subject:"dark academia"`),
            cozyaut: () => doSearchSeeAll(`subject:"cozy mystery" OR subject:autumn`),
            beach: () => doSearchSeeAll(`"beach read" OR subject:summer`),
            twisty: () => doSearchSeeAll(`subject:mystery OR subject:thriller`),
            norsk: () => doSearchSeeAll(`language:nor OR subject:norway`),
            movies: () => doSearchSeeAll(`subject:"film adaptations" OR subject:"motion pictures" OR subject:"television adaptations"`),
            holiday: () => doSearchSeeAll(`subject:christmas AND subject:romance`),
            short: () => doSearchSeeAll(`number_of_pages_median:[1 TO 300]`),
            debut: () => showSubjectSeeAll("debut"),
            // --- nye:
            darkrom: () => doSearchSeeAll(`"dark romance" OR subject:"dark romance" OR subject:"adult romance" OR subject:romantasy OR subject:romance`),
            smut: () => doSearchSeeAll(`subject:erotica OR "spicy romance" OR subject:"adult romance" OR subject:"erotic fiction"`),
            splatter: () => doSearchSeeAll(`"splatterpunk" OR subject:"splatterpunk" OR subject:"extreme horror" OR subject:gore OR subject:"body horror" OR subject:horror`),
            xmas: () => doSearchSeeAll(`subject:christmas OR subject:"christmas stories" OR subject:"holiday fiction" OR "christmas romance"`),
            forb: () => doSearchSeeAll(`subject:"banned books" OR subject:censorship OR "challenged books"`),
            found: () => doSearchSeeAll(`"found family" OR subject:"friendship" OR subject:"families"`),
            enemies: () => doSearchSeeAll(`"enemies to lovers" OR subject:rivals OR (subject:romance AND "enemies")`)
        };
        (map[railId] || (() => { }))();
    }

    async function doSearchSeeAll(query) {
        const host = $("#results");
        if (!host) return;
        host.innerHTML = `<div class="muted" style="padding:10px">Loading…</div>`;
        try {
            const res = await OL.search(query, 1, 60);
            const items = (res.docs || []).map(OL.normalize);
            host.innerHTML = `
        <div class="card">
          <div class="card-head"><h3 style="margin:0">Results</h3></div>
          <div class="list">
            ${items.map(b => `
              <div class="tile" data-book='${encodeURIComponent(JSON.stringify(b))}' style="grid-template-columns:92px 1fr auto">
                <img class="cover" src="${esc(b.cover || "")}" alt="" onerror="this.src='';this.style.background='#eee'" draggable="false"/>
                <div>
                  <div class="t">${esc(b.title)}</div>
                  <div class="a">${esc(b.author)} ${b.year ? "· " + esc(b.year) : ""}</div>
                  ${(b.subjects || []).slice(0, 6).map(g => `<span class="chip muted-small">${esc(cap(g))}</span>`).join(" ")}
                </div>
                <div class="row" style="justify-content:flex-end">
                  ${markInLib(b, LIB_CACHE) ? `<span class="muted-small">Already in ✓</span>`
                    : `<button class="btn btn-secondary small" data-add='${encodeURIComponent(JSON.stringify(b))}'>+ Add</button>`}
                </div>
              </div>
            `).join("")}
          </div>
        </div>`;
            host.onclick = async (e) => {
                const add = e.target.closest("[data-add]");
                if (add) {
                    add.disabled = true;
                    try {
                        const book = JSON.parse(decodeURIComponent(add.getAttribute("data-add")));
                        await addToLibrary(book);
                        add.parentElement.innerHTML = `<span class="muted-small">Already in ✓</span>`;
                        toast("Added to your library ✓");
                    } catch { add.disabled = false; alert("Could not add this book."); }
                    return;
                }
                const tile = e.target.closest(".tile");
                if (tile && !e.target.closest(".chip")) {
                    try { openBookSheet(JSON.parse(decodeURIComponent(tile.getAttribute("data-book")))); } catch { }
                }
            };
            host.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (e) {
            console.warn(e);
            host.innerHTML = `<div class="muted" style="padding:10px">Could not load.</div>`;
        }
    }

    /* ----------------- Home rails boot ----------------- */
    async function buildHomeRails() {
        try { LIB_CACHE = await myLibraryMap(); } catch { LIB_CACHE = { work: new Set(), title: new Set(), subjects: [] }; }

        await buildBecauseYouRead(LIB_CACHE);
        await buildNewThisWeek(LIB_CACHE);
        await buildBookTok(LIB_CACHE);

        const defs = [
            { id: "romance", title: "Romance Reads", query: `subject:romance`, tags: ["HEA", "Spice varies"] },
            { id: "modern", title: "Modern Classics (1980–now)", query: `first_publish_year:[1980 TO ${nowYear}]`, tags: ["Popular", "Iconic"] },
            { id: "banned", title: "Banned & Forbidden Books", query: `subject:"banned books" OR subject:censorship OR "challenged books"`, tags: ["Controversial"] },
            { id: "ya", title: "Young Adult Favorites", query: `subject:"young adult fiction"`, tags: ["YA"] },
            { id: "newadult", title: "New Adult Romance", query: `subject:"new adult" OR subject:"new adult fiction"`, tags: ["Romance"] },
            { id: "darkacad", title: "Dark Academia", query: `"dark academia" OR subject:"dark academia"`, tags: ["Aesthetic"] },
            { id: "cozyaut", title: "Cozy Autumn Reads", query: `subject:"cozy mystery" OR subject:autumn`, tags: ["Cozy"] },
            { id: "beach", title: "Beach & Summer Vibes", query: `"beach read" OR subject:summer`, tags: ["Light"] },
            { id: "twisty", title: "Twisty Mysteries & Thrillers", query: `subject:mystery OR subject:thriller`, tags: ["Plot twists"] },
            { id: "norsk", title: "Norwegian picks", query: `language:nor OR subject:norway`, tags: ["NO"] },
            { id: "movies", title: "Books → Movies/Series", query: `subject:"film adaptations" OR subject:"motion pictures" OR subject:"television adaptations"`, tags: ["Adapted"] },
            { id: "holiday", title: "Holiday Romance", query: `subject:christmas AND subject:romance`, tags: ["Seasonal"] },
            {
                id: "short", title: "Books under 300 pages", query: `number_of_pages_median:[1 TO 300]`, tags: ["Short"],
                filter: (d) => (d.number_of_pages_median || 999) <= 300
            },
            { id: "debut", title: "Debut Authors to Watch", query: `subject:debut`, tags: ["Debut"] },

            // --- NYE RAILS ---
            {
                id: "darkrom",
                title: "Dark Romance",
                query: `"dark romance" OR subject:"dark romance" OR subject:"adult romance" OR subject:romantasy OR subject:romance`,
                tags: ["18+", "Angst"],
                filter: (d) => !((d.subject || []).some(s => /young adult/i.test(String(s))))
            },
            {
                id: "smut",
                title: "Smut / Erotica",
                query: `subject:erotica OR "spicy romance" OR subject:"adult romance" OR subject:"erotic fiction"`,
                tags: ["18+"],
                filter: (d) => !((d.subject || []).some(s => /young adult/i.test(String(s))))
            },
            {
                id: "splatter",
                title: "Splatterpunk & Extreme Horror",
                query: `"splatterpunk" OR subject:"splatterpunk" OR subject:"extreme horror" OR subject:gore OR subject:"body horror" OR subject:horror`,
                tags: ["Graphic"]
            },
            {
                id: "xmas",
                title: "Christmas Books",
                query: `subject:christmas OR subject:"christmas stories" OR subject:"holiday fiction" OR "christmas romance"`,
                tags: ["Seasonal"]
            },
            {
                id: "forb",
                title: "Forbidden / Challenged",
                query: `subject:"banned books" OR subject:censorship OR "challenged books"`,
                tags: ["Controversial"]
            },
            {
                id: "found",
                title: "Found Family",
                query: `"found family" OR subject:"friendship" OR subject:"families"`,
                tags: ["Wholesome"]
            },
            {
                id: "enemies",
                title: "Enemies to Lovers",
                query: `"enemies to lovers" OR subject:rivals OR (subject:romance AND "enemies")`,
                tags: ["Trope"]
            },
        ];

        for (const d of defs) {
            await buildCuratedRail(d.id, d.title, d.query, LIB_CACHE, { filter: d.filter, tags: d.tags });
            await sleep(60);
        }
    }

    /* ----------------- BOOT ----------------- */
    function bootDiscover() {
        // Fjern gamle sidebaren helt, og bruk drawer i stedet
        document.querySelector(".disc-side")?.remove();
        document.querySelector(".disc-shell")?.classList.add("disc-shell--drawer");

        ensureActionbarButton();
        wireUI();
        buildHomeRails();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bootDiscover, { once: true });
    } else {
        bootDiscover();
    }
})();
