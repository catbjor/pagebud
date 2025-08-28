// discover.js – Discover with curated shelves + add-to-library
// Uses Open Library search API. Self-contained local storage helpers included.

// ------------------ Config ------------------
const GENRES = [
    "All genres", "Romance", "Fantasy", "Mystery", "Horror", "Science fiction",
    "Young adult", "Historical fiction", "Thriller", "Nonfiction", "Poetry", "Comics"
];

// Curated shelves: each entry resolves to an array of Open Library fetches merged & de-duped.
const CURATED = {
    "Popular on BookTok": {
        // A pragmatic “BookTok-ish” set of titles/phrases frequently seen (not exhaustive/authoritative).
        // We query each and merge results.
        titles: [
            "Fourth Wing", "Iron Flame", "A Court of Thorns and Roses", "It Ends With Us",
            "The Seven Husbands of Evelyn Hugo", "The Song of Achilles", "Red, White & Royal Blue",
            "The Love Hypothesis", "The Atlas Six", "The Cruel Prince", "From Blood and Ash",
            "Legendborn", "We Were Liars", "The Invisible Life of Addie LaRue"
        ],
        limit: 24
    },
    "Dark Romance": {
        subjects: ["Romance", "Dark Romance", "Erotic"], // OL doesn't always have "Dark Romance" as subject, mix with keyword
        keywords: ["dark romance", "mafia romance", "billionaire romance", "forbidden love"],
        limit: 24
    },
    "Cozy Fantasy": {
        keywords: ["cozy fantasy", "found family fantasy", "slice of life fantasy", "tea shop fantasy"],
        subjects: ["Fantasy"],
        limit: 24
    },
    "Enemies to Lovers": {
        keywords: ["enemies to lovers", "\"enemies-to-lovers\"", "rivals to lovers"],
        subjects: ["Romance", "Young adult", "Fantasy"],
        limit: 24
    }
};

// ------------------ DOM ------------------
const els = {
    list: document.getElementById("results"),
    g: document.getElementById("genreList"),
    q: document.getElementById("q"),
    qBtn: document.getElementById("qBtn"),
    sortPopular: document.getElementById("sortPopular"),
    sortNew: document.getElementById("sortNew"),
};

// Inject curated row below the sort pills
(function injectCuratedRow() {
    const main = document.querySelector(".disc-main");
    if (!main || !els.sortPopular) return;
    const sortRow = els.sortPopular.parentElement;
    const row = document.createElement("div");
    row.id = "curatedRow";
    row.style.display = "flex";
    row.style.flexWrap = "wrap";
    row.style.gap = "8px";
    row.style.margin = "6px 2px 12px";
    row.innerHTML = Object.keys(CURATED)
        .map(name => `<span class="pill curated" data-shelf="${name}">${name}</span>`)
        .join("");
    sortRow.insertAdjacentElement("afterend", row);
})();

// ------------------ Local helpers ------------------
const LS_BOOKS = "pb:books";
const nowIso = () => new Date().toISOString();

function loadBooks() {
    try { return JSON.parse(localStorage.getItem(LS_BOOKS) || "[]"); }
    catch { return []; }
}
function saveBooks(arr) {
    localStorage.setItem(LS_BOOKS, JSON.stringify(arr));
    document.dispatchEvent(new CustomEvent("pb:booksSyncedLocal"));
}
function upsertBook(b) {
    const arr = loadBooks();
    if (!b.id) b.id = Math.random().toString(36).slice(2);
    b.lastUpdated = nowIso();
    const i = arr.findIndex(x => x.id === b.id);
    if (i >= 0) arr[i] = b; else arr.push(b);
    saveBooks(arr);
    try { PBSync?.pushOne?.(b); } catch { }
    return b.id;
}

function coverUrl(obj) {
    const id = obj.cover_i || obj.cover_id;
    return id ? `https://covers.openlibrary.org/b/id/${id}-M.jpg`
        : "https://covers.openlibrary.org/b/id/240727-M.jpg";
}
function authorOf(b) {
    return (b.author_name?.[0] || b.authors?.[0]?.name || "") + "";
}
function stableIdFromOL(b) {
    // Prefer edition/record keys when present
    const edKey = (b.cover_edition_key || (b.edition_key?.[0]));
    const workKey = (b.key || "").replace(/^\/works\//, "");
    return edKey ? `ol:ed:${edKey}` : (workKey ? `ol:work:${workKey}` : `ol:${(b.title || "")}:${authorOf(b)}`.toLowerCase().slice(0, 100));
}
function mapOLtoPB(b) {
    return {
        id: stableIdFromOL(b),
        title: (b.title || "Untitled").slice(0, 140),
        author: (authorOf(b) || "").slice(0, 120),
        cover: coverUrl(b),
        status: "want",
        rating: 0,
        genres: [],
        moods: [],
        tropes: [],
        tags: [],
        review: "",
        notes: "",
        quotes: [],
        fileUrl: "",
        fileName: "",
        fileType: "",
        lastUpdated: nowIso()
    };
}

// ------------------ Fetchers (Open Library) ------------------
function setLoading() { els.list.innerHTML = `<div class="muted">Loading…</div>`; }

async function olFetch(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Fetch failed: ${r.status}`);
    const j = await r.json();
    return (j.docs || []).slice(0, 50);
}

async function fetchPopular(subject) { // many editions ≈ popularity proxy
    const s = subject && subject !== "All genres" ? `&subject=${encodeURIComponent(subject)}` : "";
    const url = `https://openlibrary.org/search.json?sort=editions&limit=30${s}`;
    return olFetch(url).then(rows => rows.slice(0, 24));
}
async function fetchNewThisYear(subject) {
    const year = new Date().getFullYear();
    const s = subject && subject !== "All genres" ? `&subject=${encodeURIComponent(subject)}` : "";
    const url = `https://openlibrary.org/search.json?published_in=${year}-${year}&limit=30${s}`;
    return olFetch(url).then(rows => rows.slice(0, 24));
}
async function searchAny(q) {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=30`;
    return olFetch(url).then(rows => rows.slice(0, 24));
}

async function fetchCurated(name) {
    const spec = CURATED[name];
    if (!spec) return [];
    const tasks = [];

    // Titles list → per-title search
    if (spec.titles?.length) {
        spec.titles.forEach(t => {
            tasks.push(olFetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(t)}&limit=3`));
        });
    }
    // Subject-weighted fetch
    if (spec.subjects?.length) {
        spec.subjects.forEach(s =>
            tasks.push(olFetch(`https://openlibrary.org/search.json?sort=editions&limit=10&subject=${encodeURIComponent(s)}`)));
    }
    // Keyword searches
    if (spec.keywords?.length) {
        spec.keywords.forEach(k =>
            tasks.push(olFetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(k)}&limit=10`)));
    }

    const chunks = await Promise.all(tasks);
    const flat = chunks.flat();
    // de-dup by our stableId
    const seen = new Set();
    const dedup = [];
    for (const b of flat) {
        const id = stableIdFromOL(b);
        if (seen.has(id)) continue;
        seen.add(id);
        dedup.push(b);
        if (spec.limit && dedup.length >= spec.limit) break;
    }
    return dedup;
}

// ------------------ Rendering ------------------
function tile(b) {
    const title = (b.title || "Untitled").slice(0, 140);
    const author = authorOf(b).slice(0, 120);
    const year = b.first_publish_year || b.first_publish_date || "";
    const id = stableIdFromOL(b);

    // inline-light actions UI; uses existing styles where possible
    return `<div class="tile" data-olid="${id}">
    <img class="cover" src="${coverUrl(b)}" alt="">
    <div>
      <div class="t">${title}</div>
      <div class="a">${author}</div>
      <div class="actions" style="margin-top:6px; display:flex; flex-wrap:wrap; gap:6px; align-items:center">
        <select class="stSel" title="Status" style="padding:6px;border-radius:8px;border:1px solid var(--border);background:var(--card)">
          <option value="want">TBR</option>
          <option value="reading">Reading</option>
          <option value="finished">Finished</option>
          <option value="dnf">DNF</option>
        </select>
        <label style="font-size:.8rem;"><input type="checkbox" class="tgFav"> Favorite</label>
        <label style="font-size:.8rem;"><input type="checkbox" class="tgOwned"> Owned</label>
        <label style="font-size:.8rem;"><input type="checkbox" class="tgWish"> Wishlist</label>
        <button class="btn addBtn" style="width:auto;padding:6px 10px">Save</button>
      </div>
    </div>
    <div class="meta">${year ? `First published<br><b>${year}</b>` : ""}</div>
  </div>`;
}

function bindTileEvents() {
    document.querySelectorAll(".tile").forEach(tileEl => {
        const addBtn = tileEl.querySelector(".addBtn");
        if (!addBtn) return;

        addBtn.addEventListener("click", () => {
            const stSel = tileEl.querySelector(".stSel");
            const fav = tileEl.querySelector(".tgFav").checked;
            const owned = tileEl.querySelector(".tgOwned").checked;
            const wish = tileEl.querySelector(".tgWish").checked;

            // Reconstruct a minimal OL-like obj from DOM (we stored data-olid as id; but we need title/author/cover)
            // Instead, read from the markup:
            const title = tileEl.querySelector(".t")?.textContent?.trim() || "Untitled";
            const author = tileEl.querySelector(".a")?.textContent?.trim() || "";
            const cover = tileEl.querySelector(".cover")?.getAttribute("src") || "";

            const pb = {
                id: tileEl.getAttribute("data-olid") || null,
                title, author, cover,
                status: stSel?.value || "want",
                rating: 0,
                genres: [],
                moods: [],
                tropes: [],
                tags: [],
                review: "",
                notes: "",
                quotes: [],
                fileUrl: "",
                fileName: "",
                fileType: "",
                lastUpdated: nowIso()
            };
            if (fav) pb.tags.push("favorite");
            if (owned) pb.tags.push("owned");
            if (wish) pb.tags.push("wishlist");

            upsertBook(pb);
            alert(`Saved: ${pb.title} ✓`);
        });
    });
}

// ------------------ State + controller ------------------
let currentGenre = "All genres";
let currentFetcher = fetchPopular;
let currentShelf = null;

async function render() {
    setLoading();
    try {
        let rows = [];
        if (currentShelf) {
            rows = await fetchCurated(currentShelf);
        } else {
            rows = await currentFetcher(currentGenre);
        }
        if (!rows.length) {
            els.list.innerHTML = `<div class="muted">No results.</div>`;
            return;
        }
        els.list.innerHTML = rows.map(tile).join("");
        bindTileEvents();
    } catch (e) {
        console.error(e);
        els.list.innerHTML = `<div class="muted">Failed to load.</div>`;
    }
}

function renderGenres() {
    els.g.innerHTML = GENRES
        .map(g => `<span class="side-link ${g === currentGenre ? 'active' : ''}" data-g="${g}">${g}</span>`)
        .join("");
    els.g.querySelectorAll(".side-link").forEach(el => {
        el.onclick = () => {
            currentGenre = el.dataset.g;
            currentShelf = null;                               // leave curated mode
            // clear curated active visual
            document.querySelectorAll("#curatedRow .pill.curated").forEach(p => p.classList.remove("active"));
            renderGenres();
            render();
        };
    });
}

function wireCuratedRow() {
    const row = document.getElementById("curatedRow");
    if (!row) return;
    row.querySelectorAll(".pill.curated").forEach(pill => {
        pill.addEventListener("click", () => {
            // toggle active style
            row.querySelectorAll(".pill.curated").forEach(p => p.classList.remove("active"));
            pill.classList.add("active");

            // enter curated mode
            currentShelf = pill.dataset.shelf;
            render();
        });
    });
}

// ------------------ Boot ------------------
document.addEventListener("DOMContentLoaded", () => {
    renderGenres();
    wireCuratedRow();

    els.qBtn.onclick = async () => {
        const q = els.q.value.trim();
        if (!q) return;
        currentShelf = null;
        document.querySelectorAll("#curatedRow .pill.curated").forEach(p => p.classList.remove("active"));
        setLoading();
        const rows = await searchAny(q);
        els.list.innerHTML = rows.map(tile).join("");
        bindTileEvents();
    };
    els.q.addEventListener("keydown", (e) => {
        if (e.key === "Enter") els.qBtn.click();
    });

    els.sortPopular.onclick = () => {
        currentShelf = null;
        document.querySelectorAll("#curatedRow .pill.curated").forEach(p => p.classList.remove("active"));
        currentFetcher = fetchPopular; render();
    };
    els.sortNew.onclick = () => {
        currentShelf = null;
        document.querySelectorAll("#curatedRow .pill.curated").forEach(p => p.classList.remove("active"));
        currentFetcher = fetchNewThisYear; render();
    };

    render();
});
