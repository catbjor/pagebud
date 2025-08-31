// discover.js — Open Library search + subjects with infinite scroll
// Adds to library via PBSync.saveBook(...) for consistent offline/updatedAt flow
(() => {
    "use strict";
    const $ = (s, r = document) => r.querySelector(s);

    // ---- Config ----
    const PAGE_SIZE = 20;
    const SUBJECT_MAP = {
        Romance: "romance",
        Fantasy: "fantasy",
        Mystery: "mystery",
        Horror: "horror",
        "Sci-Fi": "science_fiction",
        YA: "young_adult",
        Thriller: "thriller",
        "Non-fiction": "nonfiction"
    };

    // ---- State ----
    const state = {
        mode: "subject",   // 'subject' | 'search'
        subject: "romance",
        query: "",
        sort: "popular",   // 'popular' | 'new'
        page: 1,
        loading: false,
        done: false
    };

    // ---- Helpers ----
    const coverURL = (doc) => {
        const id = doc.cover_i || (doc.cover_edition_key ? doc.cover_edition_key : null);
        if (!id) return "";
        if (doc.cover_i) return `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`;
        return `https://covers.openlibrary.org/b/olid/${doc.cover_edition_key}-M.jpg`;
    };

    const normalizeDoc = (doc) => ({
        title: doc.title || "Untitled",
        author: Array.isArray(doc.author_name) ? doc.author_name[0] : (doc.author_name || "Unknown"),
        year: doc.first_publish_year || "",
        cover: coverURL(doc)
    });

    function setLoading(on) {
        state.loading = on;
        const results = $("#results");
        if (!results) return;
        if (on) {
            const sk = document.createElement("div");
            sk.id = "disc-sk";
            sk.innerHTML = Array.from({ length: 4 }).map(() => `
        <div class="tile" aria-hidden="true">
          <div class="cover" style="background:#eee"></div>
          <div>
            <div class="t" style="height:14px;background:#eee;border-radius:6px;width:70%;margin-bottom:6px"></div>
            <div class="a" style="height:12px;background:#eee;border-radius:6px;width:40%"></div>
          </div>
          <div class="meta" style="height:12px;background:#eee;border-radius:6px;width:48px"></div>
        </div>`).join("");
            results.appendChild(sk);
        } else {
            $("#disc-sk")?.remove();
        }
    }

    function clearResults() {
        const results = $("#results");
        if (results) results.innerHTML = "";
    }

    function showEmpty(msg = "No results") {
        const results = $("#results");
        if (!results) return;
        results.innerHTML = `<div class="muted" style="text-align:center;padding:16px">${msg}</div>`;
    }

    // ---- Rendering ----
    function renderItems(docs = []) {
        const host = $("#results");
        if (!host || !docs.length) return;
        const items = docs.map(normalizeDoc);
        const canWrite = !!(window.PBSync && window.fb && fb.auth?.currentUser);

        const html = items.map(b => `
      <div class="tile">
        <img class="cover" src="${b.cover || ""}" alt=""
             onerror="this.style.background='#eee';this.src='';" />
        <div>
          <div class="t">${escapeHtml(b.title)}</div>
          <div class="a">${escapeHtml(b.author)}</div>
        </div>
        <div class="meta">
          ${b.year ? b.year : ""}
          ${canWrite ? `<div><button class="btn btn-secondary" data-add='${encodeURIComponent(JSON.stringify(b))}' style="margin-top:6px;padding:6px 10px">Add</button></div>` : ""}
        </div>
      </div>`).join("");

        host.insertAdjacentHTML("beforeend", html);

        if (canWrite) {
            host.querySelectorAll("[data-add]").forEach(btn => {
                btn.addEventListener("click", async () => {
                    try {
                        const book = JSON.parse(decodeURIComponent(btn.getAttribute("data-add")));
                        await addToLibrary(book);
                        toast("Added to your library ✓");
                    } catch (e) {
                        console.warn(e);
                        alert("Could not add this book.");
                    }
                });
            });
        }
    }

    // ---- API calls ----
    async function fetchSearch(q, page = 1, sort = "popular") {
        const url = new URL("https://openlibrary.org/search.json");
        url.searchParams.set("q", q || "");
        url.searchParams.set("page", String(page));
        url.searchParams.set("limit", String(PAGE_SIZE));
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        let docs = Array.isArray(data.docs) ? data.docs : [];
        if (sort === "new") {
            docs = docs.sort((a, b) => (b.first_publish_year || 0) - (a.first_publish_year || 0));
        }
        return { docs, numFound: data.numFound || 0 };
    }

    async function fetchSubject(subject, page = 1, sort = "popular") {
        const url = new URL("https://openlibrary.org/search.json");
        url.searchParams.set("q", `subject:${subject}`);
        url.searchParams.set("page", String(page));
        url.searchParams.set("limit", String(PAGE_SIZE));
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error("Subject fetch failed");
        const data = await res.json();
        let docs = Array.isArray(data.docs) ? data.docs : [];
        if (sort === "new") {
            docs = docs.sort((a, b) => (b.first_publish_year || 0) - (a.first_publish_year || 0));
        }
        return { docs, numFound: data.numFound || 0 };
    }

    // ---- Boot + Events ----
    function bindUI() {
        const genreList = $("#genreList");
        if (genreList && !genreList.children.length) {
            const names = Object.keys(SUBJECT_MAP);
            genreList.innerHTML = names
                .map((g, i) => `<div class="side-link ${i === 0 ? "active" : ""}" data-subj="${SUBJECT_MAP[g]}">${g}</div>`)
                .join("");
        }

        genreList?.addEventListener("click", (e) => {
            const link = e.target.closest(".side-link");
            if (!link) return;
            genreList.querySelectorAll(".side-link").forEach(n => n.classList.remove("active"));
            link.classList.add("active");
            state.mode = "subject";
            state.subject = link.getAttribute("data-subj") || "romance";
            state.page = 1; state.done = false;
            clearResults();
            loadMore(true);
        });

        $("#qBtn")?.addEventListener("click", () => {
            const q = ($("#q")?.value || "").trim();
            state.mode = "search";
            state.query = q;
            state.page = 1; state.done = false;
            clearResults();
            loadMore(true);
        });

        $("#sortPopular")?.addEventListener("click", () => {
            state.sort = "popular";
            $("#sortPopular")?.classList.add("active");
            $("#sortNew")?.classList.remove("active");
            state.page = 1; state.done = false;
            clearResults();
            loadMore(true);
        });

        $("#sortNew")?.addEventListener("click", () => {
            state.sort = "new";
            $("#sortNew")?.classList.add("active");
            $("#sortPopular")?.classList.remove("active");
            state.page = 1; state.done = false;
            clearResults();
            loadMore(true);
        });

        attachInfiniteScroll();
    }

    async function loadMore(first = false) {
        if (state.loading || state.done) return;
        if (first) state.page = 1;

        setLoading(true);
        try {
            const { mode, subject, query, page, sort } = state;
            const fn = mode === "search" ? fetchSearch : fetchSubject;
            const arg = mode === "search" ? query : subject;
            const { docs, numFound } = await fn(arg, page, sort);

            if (first && (!docs || docs.length === 0)) {
                showEmpty("No results found");
                state.done = true;
                setLoading(false);
                return;
            }

            if (!docs || docs.length === 0) {
                state.done = true;
                setLoading(false);
                return;
            }

            renderItems(docs);
            state.page += 1;

            if (docs.length < PAGE_SIZE || state.page * PAGE_SIZE >= (numFound || 999999)) {
                state.done = true;
            }
        } catch (err) {
            console.warn(err);
            if (first) showEmpty("Could not load results.");
        } finally {
            setLoading(false);
        }
    }

    function attachInfiniteScroll() {
        const host = $("#results");
        if (!host) return;
        const sentinel = document.createElement("div");
        sentinel.id = "disc-sentinel";
        sentinel.style.height = "1px";
        host.after(sentinel);

        const io = new IntersectionObserver((entries) => {
            entries.forEach(e => { if (e.isIntersecting) loadMore(); });
        }, { root: null, rootMargin: "600px 0px 600px 0px", threshold: 0.01 });

        io.observe(sentinel);
    }

    // ---- Add to Library via PBSync (offline-first & consistent updatedAt) ----
    async function addToLibrary(b) {
        // krever innlogget bruker (PBSync klarer local save uansett, men vi følger kravene dine)
        const user = fb?.auth?.currentUser;
        if (!user) throw new Error("Not signed in");

        const bookObj = {
            title: b.title || "Untitled",
            author: b.author || "",
            coverUrl: b.cover || "",
            status: "want",
            rating: 0,
            fileType: null,
            fileUrl: null
            // NB: id + updatedAt settes av PBSync.saveBook()
        };

        const saved = await PBSync.saveBook(bookObj);
        return saved?.id || saved?.book?.id || null;
    }

    // ---- Utilities ----
    function toast(msg = "Done") {
        if (window.toast) return window.toast(msg);
        let el = $("#pb-toast");
        if (!el) { el = document.createElement("div"); el.id = "pb-toast"; document.body.appendChild(el); }
        el.textContent = msg; el.classList.add("show");
        setTimeout(() => el.classList.remove("show"), 1600);
    }

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, s => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[s]));
    }

    // ---- Public boot ----
    window.startDiscover = function startDiscover() {
        if (!window.__discBound) { bindUI(); window.__discBound = true; }
        state.mode = "subject";
        state.subject = state.subject || "romance";
        state.sort = state.sort || "popular";
        state.page = 1; state.done = false;
        clearResults();
        loadMore(true);
    };
})();
