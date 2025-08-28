// discover.js – Open Library
const GENRES = [
    "All genres", "Romance", "Fantasy", "Mystery", "Horror", "Science fiction", "Young adult",
    "Historical fiction", "Thriller", "Nonfiction", "Poetry", "Comics"
];

const els = {
    list: document.getElementById("results"),
    g: document.getElementById("genreList"),
    q: document.getElementById("q"),
    qBtn: document.getElementById("qBtn"),
    sortPopular: document.getElementById("sortPopular"),
    sortNew: document.getElementById("sortNew"),
};

function coverUrl(obj) {
    const id = obj.cover_i || obj.cover_id;
    return id ? `https://covers.openlibrary.org/b/id/${id}-M.jpg`
        : "https://covers.openlibrary.org/b/id/240727-M.jpg";
}
function tile(b) {
    const title = (b.title || "Untitled").slice(0, 140);
    const author = (b.author_name?.[0] || b.authors?.[0]?.name || "").slice(0, 120);
    const year = b.first_publish_year || b.first_publish_date || "";
    return `<div class="tile">
    <img class="cover" src="${coverUrl(b)}" alt="">
    <div>
      <div class="t">${title}</div>
      <div class="a">${author}</div>
    </div>
    <div class="meta">${year ? `First published<br><b>${year}</b>` : ""}</div>
  </div>`;
}
function setLoading() { els.list.innerHTML = `<div class="muted">Loading…</div>`; }

async function fetchPopular(subject) { // “Popular” ≈ mange utgaver
    const s = subject && subject !== "All genres" ? `&subject=${encodeURIComponent(subject)}` : "";
    const url = `https://openlibrary.org/search.json?sort=editions&limit=20${s}`;
    const r = await fetch(url); const j = await r.json();
    return (j.docs || []).slice(0, 20);
}
async function fetchNewThisYear(subject) {
    const year = new Date().getFullYear();
    const s = subject && subject !== "All genres" ? `&subject=${encodeURIComponent(subject)}` : "";
    const url = `https://openlibrary.org/search.json?published_in=${year}-${year}&limit=20${s}`;
    const r = await fetch(url); const j = await r.json();
    return (j.docs || []).slice(0, 20);
}
async function searchAny(q) {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=20`;
    const r = await fetch(url); const j = await r.json();
    return (j.docs || []).slice(0, 20);
}

let currentGenre = "All genres";
let currentFetcher = fetchPopular;

async function render() {
    setLoading();
    try {
        const rows = await currentFetcher(currentGenre);
        if (!rows.length) { els.list.innerHTML = `<div class="muted">No results.</div>`; return; }
        els.list.innerHTML = rows.map(tile).join("");
    } catch (e) { els.list.innerHTML = `<div class="muted">Failed to load.</div>`; }
}

function renderGenres() {
    els.g.innerHTML = GENRES.map(g => `<span class="side-link ${g === currentGenre ? 'active' : ''}" data-g="${g}">${g}</span>`).join("");
    els.g.querySelectorAll(".side-link").forEach(el => {
        el.onclick = () => { currentGenre = el.dataset.g; renderGenres(); render(); };
    });
}

document.addEventListener("DOMContentLoaded", () => {
    renderGenres();
    els.qBtn.onclick = async () => {
        const q = els.q.value.trim();
        if (!q) return;
        setLoading();
        const rows = await searchAny(q);
        els.list.innerHTML = rows.map(tile).join("");
    };
    els.sortPopular.onclick = () => { currentFetcher = fetchPopular; render(); };
    els.sortNew.onclick = () => { currentFetcher = fetchNewThisYear; render(); };
    render();
});
