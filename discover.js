(() => {
    "use strict";

    // =================================================================================
    // UTILS & HELPERS
    // =================================================================================
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

    // =================================================================================
    // CONFIG & STATE
    // =================================================================================
    const ALL_SUBJECTS = [
        "action", "adventure", "african literature", "american literature", "animals", "anthologies", "art",
        "autobiography", "banned books", "biology", "book club", "booktok", "business", "classics",
        "cozy mystery", "cozy fantasy", "contemporary", "crime", "dark academia", "dark romance", "dystopia",
        "economics", "epic fantasy", "essays", "fairy tales", "fantasy", "feminism", "folklore", "food",
        "graphic novels", "health", "historical fiction", "history", "horror", "humor", "inspirational",
        "lgbt", "literary fiction", "manga", "memoir", "mystery", "mythology", "new adult", "nonfiction",
        "norwegian", "philosophy", "poetry", "psychology", "religion", "retellings", "romance", "romantasy",
        "science", "science fiction", "self help", "short stories", "spirituality", "sports", "thriller", "smut",
        "time travel", "true crime", "urban fantasy", "war", "western", "women", "ya", "young adult", "zombies"
    ].sort((a, b) => a.localeCompare(b));

    let LIB_CACHE = null;

    // =================================================================================
    // FIREBASE HELPERS
    // =================================================================================
    const hasFB = () => !!(window.fb && window.fb.db && window.fb.auth);

    async function myLibraryMap(user) {
        const out = { work: new Set(), title: new Set(), subjects: [], authors: new Set() };
        if (!hasFB() || !user) return out;
        try {
            const col = window.fb.db.collection("users").doc(user.uid).collection("books");
            const snap = await col.limit(500).get();
            snap.forEach(d => {
                const x = d.data() || {};
                if (x.author) out.authors.add(String(x.author));
                if (x.workKey) out.work.add(String(x.workKey).toLowerCase());
                if (x.title) out.title.add(String(x.title).toLowerCase());
                if (Array.isArray(x.subjects)) out.subjects.push(...x.subjects.map(s => String(s).toLowerCase()));
            });
        } catch (e) {
            console.warn("Could not build library map:", e);
        }
        return out;
    }

    async function getFriendsUids(user) {
        if (!user) return [];
        const out = new Set();
        try {
            const snap = await window.fb.db.collection("users").doc(user.uid).collection("friends").where("status", "==", "accepted").get();
            snap.forEach(d => out.add(d.id));
        } catch (e) {
            console.warn("Could not get friends UIDs:", e);
        }
        return Array.from(out);
    }

    async function addToLibrary(normal) {
        const user = window.fb?.auth?.currentUser;
        if (!hasFB() || !user) throw new Error("Not signed in");
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
        await window.fb.db.collection("users").doc(user.uid).collection("books")
            .doc(payload.id).set(payload, { merge: true });

        LIB_CACHE?.title?.add(String(payload.title).toLowerCase());
        if (payload.workKey) LIB_CACHE?.work?.add(String(payload.workKey).toLowerCase());
        return payload.id;
    }

    // =================================================================================
    // EXTERNAL API WRAPPERS (OPENLIBRARY, GOOGLE BOOKS)
    // =================================================================================
    const OL = {
        coverURL(doc) {
            const id = doc.cover_i || doc.cover_edition_key || null;
            if (!id) return "";
            return doc.cover_i
                ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
                : `https://covers.openlibrary.org/b/olid/${doc.cover_edition_key}-M.jpg`;
        },
        normalize(doc) {
            const subs = (Array.isArray(doc.subject) ? doc.subject : (Array.isArray(doc.subject_key) ? doc.subject_key : []))
                .map(x => String(x).toLowerCase().replace(/_/g, " "));
            return {
                id: undefined,
                title: doc.title || "Untitled",
                author: Array.isArray(doc.author_name) ? doc.author_name[0] : (doc.author_name || "Unknown"),
                year: yearOf(doc) || "",
                cover: OL.coverURL(doc),
                workKey: doc.key || doc.work_key?.[0] || null,
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
            const r = await fetch(url); if (!r.ok) throw new Error(`OpenLibrary search failed with status ${r.status}`);
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
            } catch (e) { console.warn("Failed to fetch OL work details", e); }
            try {
                const rr = await fetch(`https://openlibrary.org${key}/ratings.json`);
                if (rr.ok) {
                    const j = await rr.json();
                    avg = j?.summary?.average ?? null;
                    count = j?.summary?.count ?? null;
                }
            } catch (e) { console.warn("Failed to fetch OL ratings", e); }
            return { description, avg, count, subjects };
        }
    };

    function getGoogleApiKey() {
        // IMPORTANT: This API key is now public. For security, you should go to your
        // Google Cloud Console, create a NEW key, restrict it to your website's domain,
        // and then delete the old key.
        return "AIzaSyDO4ennyLK1qzHiWox_my5IpDTPX_YZOOs";
    }

    const GBOOKS = {
        normalize(item) {
            const vi = item.volumeInfo || {};
            const img = vi.imageLinks || {};
            return {
                id: item.id,
                title: vi.title || "Untitled",
                author: (vi.authors || ["Unknown"])[0],
                year: (vi.publishedDate || "").slice(0, 4),
                cover: (img.thumbnail || img.smallThumbnail || "").replace("http://", "https://"),
                workKey: `gbooks:${item.id}`,
                subjects: (vi.categories || []).map(c => c.toLowerCase()),
                pages: vi.pageCount || null,
                editionCount: 0
            };
        },
        async search(query, limit = 20) {
            const url = new URL("https://www.googleapis.com/books/v1/volumes");
            url.searchParams.set("q", query);
            url.searchParams.set("maxResults", String(limit));
            url.searchParams.set("key", getGoogleApiKey());
            const r = await fetch(url);
            if (!r.ok) throw new Error(`Google Books search failed with status ${r.status}`);
            const data = await r.json();
            return (data.items || []).map(this.normalize);
        }
    };

    // =================================================================================
    // UI COMPONENTS (DRAWER, SHEET)
    // =================================================================================
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
            showSeeAllPage(`subject:"${link.getAttribute("data-sub")}"`, cap(link.getAttribute("data-sub")));
        });

        drawer.addEventListener("click", (e) => { if (e.target.hasAttribute("data-close")) drawer.classList.remove("show"); });

        return drawer;
    }

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
                showSeeAllPage(`subject:"${chip.getAttribute("data-subj")}"`, cap(chip.getAttribute("data-subj")));
            }
        };
    }

    // =================================================================================
    // RENDERING HELPERS
    // =================================================================================
    function railSkeleton(n = 10) {
        return `<div class="rail-list">
            ${Array.from({ length: n }).map(() => `
                <div class="tile is-skel">
                    <div class="cover"></div>
                    <div class="skel-line skel-line--title"></div>
                    <div class="skel-line skel-line--author"></div>
                </div>`).join("")}
        </div>`;
    }

    function railsHost() {
        return $("#railsHost");
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

    function enhanceRailScroll(root) {
        if (!root || root.__pbEnhanced) return;
        root.__pbEnhanced = true;

        root.addEventListener("wheel", (e) => {
            if (root.scrollWidth > root.clientWidth && !e.shiftKey) {
                root.scrollLeft += (e.deltaY || 0) + (e.deltaX || 0);
                e.preventDefault();
            }
        }, { passive: false });

        let down = false, startX = 0, startLeft = 0, dragged = false;
        root.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
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
            const tile = e.target.closest(".tile");
            if (!tile || e.target.closest(".chip,[data-add]")) return;
            try {
                const book = JSON.parse(decodeURIComponent(tile.getAttribute("data-book")));
                openBookSheet(book);
            } catch { }
        });
    }

    // =================================================================================
    // DATA FETCHING & RAIL BUILDERS
    // =================================================================================
    async function fetchCombinedSearchResults(query, olLimit = 20, gbooksLimit = 20) {
        const [olResult, gbooksResult] = await Promise.allSettled([
            OL.search(query, 1, olLimit),
            GBOOKS.search(query, gbooksLimit)
        ]);

        let olBooks = [];
        if (olResult.status === 'fulfilled' && olResult.value.docs) {
            olBooks = olResult.value.docs.map(OL.normalize);
        } else if (olResult.status === 'rejected') {
            console.warn("OpenLibrary search failed:", olResult.reason);
        }

        let gbooks = [];
        if (gbooksResult.status === 'fulfilled') {
            gbooks = gbooksResult.value;
        } else if (gbooksResult.status === 'rejected') {
            console.warn("Google Books search failed:", gbooksResult.reason);
        }

        const combined = [];
        const seen = new Set();
        const bookKey = (b) => `${(b.title || "").toLowerCase().trim()}::${(b.author || "").toLowerCase().trim()}`;

        [...gbooks, ...olBooks].forEach(book => {
            const key = bookKey(book);
            if (book.title && !seen.has(key)) { combined.push(book); seen.add(key); }
        });
        return combined;
    }

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
        const rail = sec.querySelector(".rail-list");
        if (!top.length || !rail) {
            rail.innerHTML = `<div class="muted">Add books with genres to get recommendations.</div>`;
            return;
        }

        const tagsHost = sec.querySelector("[data-tags]");
        if (tagsHost) tagsHost.innerHTML = top.map(t => `<span class="chip muted-small">${esc(cap(t))}</span>`).join("");

        const query = top.map(s => `subject:"${s}"`).join(" OR ");
        const items = await fetchCombinedSearchResults(query, 15, 15);

        const filteredItems = items.filter(b => !markInLib(b, libMap));
        if (filteredItems.length === 0) { rail.innerHTML = `<div class="muted">No new recommendations for you in this category.</div>`; return; }

        rail.innerHTML = filteredItems.slice(0, 20).map(b => tileHTML(b, false)).join("");
        enhanceRailScroll(rail);
    }

    async function buildTrendingAmongFriends(libMap, user) {
        const sec = makeSection("trending_friends", "Trending Among Friends", []);
        bindSectionClicks(sec);

        const friendUids = await getFriendsUids(user);
        const rail = sec.querySelector(".rail-list");
        if (!rail) { console.warn("Could not find rail list for trending_friends"); return; }

        if (friendUids.length === 0) {
            rail.innerHTML = `<div class="muted">Add some friends to see what they're reading!</div>`;
            return;
        }

        const bookCounts = new Map();
        const bookData = new Map();

        const friendLibraries = await Promise.all(
            friendUids.map(uid => window.fb.db.collection("users").doc(uid).collection("books").limit(100).get())
        );

        friendLibraries.forEach(snap => {
            snap.forEach(doc => {
                const book = doc.data();
                const key = (book.workKey || book.title || "").toLowerCase();

                if (!key || libMap.work.has(key) || libMap.title.has(key.toLowerCase())) return;

                bookCounts.set(key, (bookCounts.get(key) || 0) + 1);
                if (!bookData.has(key)) {
                    bookData.set(key, { ...book, id: doc.id });
                }
            });
        });

        const sorted = Array.from(bookCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20);
        const items = sorted.map(([key]) => OL.normalize(bookData.get(key)));

        rail.innerHTML = items.length > 0 ? items.map(b => tileHTML(b, false)).join("") : `<div class="muted">No trending books among your friends right now.</div>`;
        enhanceRailScroll(rail);
    }

    async function buildCuratedRail(id, title, query, libMap, { tags = [] } = {}) {
        const sec = makeSection(id, title, tags);
        bindSectionClicks(sec);
        try {
            const items = await fetchCombinedSearchResults(query, 20, 20);
            const rail = sec.querySelector(".rail-list");
            if (!rail) return;

            const displayItems = libMap ? items.filter(b => !markInLib(b, libMap)) : items;

            if (displayItems.length === 0) {
                if (libMap && libMap.work.size > 0 && items.length > 0) {
                    rail.innerHTML = `<div class="muted">No new recommendations for you in this category.</div>`;
                } else {
                    rail.innerHTML = `<div class="muted">No books found for this collection.</div>`;
                }
                return;
            }
            rail.innerHTML = displayItems.slice(0, 24).map(b => tileHTML(b, markInLib(b, libMap))).join("");
            enhanceRailScroll(rail);
        } catch (e) {
            console.warn(`Failed to build rail for "${id}":`, e);
            sec.querySelector(".rail-list")?.innerHTML = `<div class="muted">Could not load “${esc(title)}”.</div>`;
        }
    }

    async function buildNewFromFaveAuthors(libMap) {
        const authors = Array.from(libMap.authors || []).slice(0, 3);
        if (authors.length === 0) return;

        const sec = makeSection("fave_authors", "New from Your Favorite Authors", ["Personalized"]);
        bindSectionClicks(sec);

        const query = authors.map(a => `inauthor:"${a}"`).join(" OR ");
        const fullQuery = `(${query}) AND published:${nowYear - 2}`;
        const items = await fetchCombinedSearchResults(fullQuery, 15, 15);

        const rail = sec.querySelector(".rail-list");
        if (!rail) { console.warn("Could not find rail list for fave_authors"); return; }

        const filteredItems = items.filter(b => !markInLib(b, libMap));
        filteredItems.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));

        if (filteredItems.length === 0) { rail.innerHTML = `<div class="muted">No new releases found from your favorite authors.</div>`; return; }

        rail.innerHTML = filteredItems.slice(0, 20).map(b => tileHTML(b, false)).join("");
        enhanceRailScroll(rail);
    }

    // =================================================================================
    // SEARCH & "SEE ALL" PAGE LOGIC
    // =================================================================================
    function renderBookList(books, containerEl, title = "Results") {
        if (!containerEl) return;

        const listHTML = books.map(b => `
        <div class="list-tile" data-book='${encodeURIComponent(JSON.stringify(b))}'>
            <img class="cover" src="${esc(b.cover || "")}" alt="" onerror="this.src='';this.style.background='#eee'" draggable="false"/>
            <div>
                <div class="t">${esc(b.title)}</div>
                <div class="a">${esc(b.author)} ${b.year ? "· " + esc(b.year) : ""}</div>
                ${(b.subjects || []).slice(0, 4).map(g => `<span class="chip muted-small">${esc(cap(g))}</span>`).join(" ")}
            </div>
            <div class="row" style="justify-content:flex-end">
                ${markInLib(b, LIB_CACHE) ?
                `<span class="muted-small">Already in ✓</span>` :
                `<button class="btn btn-secondary small" data-add='${encodeURIComponent(JSON.stringify(b))}'>+ Add</button>`
            }
            </div>
        </div>
    `).join("");

        containerEl.innerHTML = `
        <div class="card">
            <div class="card-head"><h3 style="margin:0">${esc(title)}</h3></div>
            <div class="list">${listHTML}</div>
        </div>
    `;

        containerEl.onclick = async (e) => {
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
            const tile = e.target.closest(".list-tile");
            if (tile && !e.target.closest(".chip")) {
                try { openBookSheet(JSON.parse(decodeURIComponent(tile.getAttribute("data-book")))); } catch { }
            }
        };
        containerEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function wireUI() {
        $("#discMenuBtn")?.addEventListener("click", () => {
            const drawer = ensureDrawer();
            drawer.classList.add("show");
        });
        $("#qBtn")?.addEventListener("click", doSearch);
        $("#q")?.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });
    }

    async function doSearch() {
        const q = ($("#q")?.value || "").trim();
        const host = $("#results");
        const railsHostEl = $("#railsHost");

        if (!host) return;

        if (railsHostEl) {
            railsHostEl.style.display = q ? 'none' : 'block';
        }

        if (!q) { host.innerHTML = ""; return; }

        host.innerHTML = `<div class="muted" style="padding:10px">Searching…</div>`;
        try {
            const combined = await fetchCombinedSearchResults(q, 20, 20);
            if (combined.length === 0) { host.innerHTML = `<div class="muted" style="padding:10px">No results found for "${esc(q)}".</div>`; return; }
            renderBookList(combined, host, `Search results for "${q}"`);
        } catch (e) {
            console.warn(e);
            host.innerHTML = `<div class="muted" style="padding:10px">Search failed.</div>`;
        }
    }

    async function showSeeAllPage(query, title) {
        const host = $("#results");
        if (!host) return;
        host.innerHTML = `<div class="muted" style="padding:10px">Loading “${esc(title)}”…</div>`;
        try {
            const items = await fetchCombinedSearchResults(query, 40, 40);
            renderBookList(items, host, title);
        } catch (e) {
            console.warn(e);
            host.innerHTML = `<div class="muted" style="padding:10px">Could not load “${esc(title)}”.</div>`;
        }
    }

    function openSeeAllFor(railId) {
        // Handle special, personalized rails first
        if (railId === 'fave_authors') {
            const authors = Array.from(LIB_CACHE.authors || []).slice(0, 10);
            if (!authors.length) { $("#results").innerHTML = `<div class="muted">Add books to your library to see this.</div>`; return; }
            const query = authors.map(a => `author:"${a}"`).join(" OR ");
            showSeeAllPage(query, "New from Your Favorite Authors");
            return;
        }
        if (railId === 'because') {
            const counts = {};
            (LIB_CACHE.subjects || []).forEach(s => {
                const k = String(s || "").toLowerCase();
                if (!k) return;
                counts[k] = (counts[k] || 0) + 1;
            });
            const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);
            const query = top.length > 0 ? top.map(s => `subject:"${s}"`).join(" OR ") : "subject:fiction"; // Fallback query
            showSeeAllPage(query, "Because You Read...");
            return;
        }
        if (railId === 'trending_friends') {
            $("#results").innerHTML = `<div class="muted" style="padding:10px">This collection doesn't have a "See All" page.</div>`;
            return;
        }

        // For all other rails, use the central definition
        const railDef = window.PB_RAILS?.[railId];
        if (railDef) {
            showSeeAllPage(railDef.query, railDef.title);
        } else {
            console.warn(`No "See All" definition for rail: ${railId}`);
        }
    }

    // =================================================================================
    // INITIALIZATION & BOOTSTRAPPING
    // =================================================================================
    async function buildHomeRails(user) {
        const host = railsHost();
        if (!host) {
            console.error("Discover page: Could not find #railsHost container.");
            return;
        }

        while (host.firstChild) { host.removeChild(host.firstChild); }
        const loadingEl = document.createElement('div');
        loadingEl.className = 'card muted';
        loadingEl.style.padding = '16px';
        loadingEl.textContent = 'Loading collections...';
        host.appendChild(loadingEl);

        LIB_CACHE = await myLibraryMap(user);

        if (host.contains(loadingEl)) { host.removeChild(loadingEl); }

        // --- Curated collections (for all users) from the central definition file ---
        const railsToShowOnHome = ['new_releases', 'booktok', 'epic_fantasy', 'psych_thrillers', 'romance_reads'];

        for (const railId of railsToShowOnHome) {
            const railDef = window.PB_RAILS?.[railId];
            if (railDef) {
                try {
                    await buildCuratedRail(railId, railDef.title, railDef.query, LIB_CACHE, { tags: railDef.tags });
                } catch (e) {
                    console.warn(`Failed to build curated rail for "${railId}"`, e);
                }
            }
            await sleep(100); // Be nice to APIs
        }

        // --- Personalized collections (for logged-in users) ---
        if (user) {
            try { await buildBecauseYouRead(LIB_CACHE); } catch (e) { console.warn("Failed to build 'Because You Read'", e); }
            try { await buildNewFromFaveAuthors(LIB_CACHE); } catch (e) { console.warn("Failed to build 'Fave Authors'", e); }
            try { await buildTrendingAmongFriends(LIB_CACHE, user); } catch (e) { console.warn("Failed to build 'Trending Friends'", e); }
        }
    }

    function bootDiscover() {
        console.log("PageBud Discover: Initializing...");
        try {
            wireUI();
        } catch (e) {
            console.error("Failed to initialize UI buttons:", e);
        }

        // Wait for Firebase auth to be ready before loading any data.
        if (window.onAuthReady) {
            window.onAuthReady.then(user => {
                buildHomeRails(user).catch(e => console.error("Failed to build home rails:", e));
            });
        } else {
            console.error("Firebase onAuthReady promise not found. Cannot load collections.");
            const host = railsHost();
            if (host) host.innerHTML = '<div class="card muted" style="padding:16px; color: red;">Error: Firebase not initialized correctly.</div>';
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bootDiscover, { once: true });
    } else {
        bootDiscover();
    }
})();
