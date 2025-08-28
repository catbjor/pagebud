// discover.js – Open Library + raske kategorier + quick-add til biblioteket
const CATS = [
    { key: "booktok", name: "Popular on BookTok", q: "subject:romance OR subject:young adult OR subject:fantasy", sort: "editions" },
    { key: "darkromance", name: "Dark Romance", q: "subject:dark romance OR subject:erotic romance", sort: "editions" },
    { key: "cozyfantasy", name: "Cozy Fantasy", q: "title:cozy AND subject:fantasy", sort: "editions" },
    { key: "thrillers", name: "Twisty Thrillers", q: "subject:thriller OR subject:mystery", sort: "editions" },
    { key: "ya", name: "Young Adult", q: "subject:young adult", sort: "editions" },
    { key: "horror", name: "Horror", q: "subject:horror", sort: "editions" },
    { key: "romance", name: "Romance", q: "subject:romance", sort: "editions" },
    { key: "fantasy", name: "Fantasy", q: "subject:fantasy", sort: "editions" },
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
      <div style="margin-top:6px; display:flex; gap:6px;">
        <button class="btn btn-secondary" data-add="want">+ TBR</button>
        <button class="btn btn-secondary" data-add="finished">+ Finished</button>
        <button class="btn btn-secondary" data-add="reading">+ Reading</button>
      </div>
    </div>
    <div class="meta">${year ? `First published<br><b>${year}</b>` : ""}</div>
  </div>`;
}
function setLoading() { els.list.innerHTML = `<div class="muted">Loading…</div>`; }
function bindActions(rows) {
    // delegate add buttons
    els.list.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-add]"); if (!btn) return;
        const idx = Array.from(els.list.querySelectorAll(".tile")).indexOf(btn.closest(".tile"));
        if (idx < 0) return;
        const status = btn.dataset.add;
        const row = rows[idx];
        try {
            window.pbQuickAdd(row, status);
            btn.textContent = "Added ✓";
            btn.disabled = true;
        } catch (err) {
            console.error(err);
            alert("Could not add the book.");
        }
    }, { once: true });
}

async function fetchPopular(subjectQ) {
    const url = `https://openlibrary.org/search.json?sort=editions&limit=20&${subjectQ}`;
    const r = await fetch(url); const j = await r.json();
    return (j.docs || []).slice(0, 20);
}
async function fetchNewThisYear(subjectQ) {
    const year = new Date().getFullYear();
    const url = `https://openlibrary.org/search.json?published_in=${year}-${year}&limit=20&${subjectQ}`;
    const r = await fetch(url); const j = await r.json();
    return (j.docs || []).slice(0, 20);
}
async function searchAny(q) {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=20`;
    const r = await fetch(url); const j = await r.json();
    return (j.docs || []).slice(0, 20);
}

let currentCat = CATS[0];
let currentFetcher = async (cat) => fetchPopular(cat.q);

function renderSide() {
    els.g.innerHTML = CATS.map(c => `<span class="side-link ${c.key === currentCat.key ? 'active' : ''}" data-k="${c.key}">${c.name}</span>`).join("");
    els.g.querySelectorAll(".side-link").forEach(el => {
        el.onclick = () => {
            const k = el.dataset.k;
            currentCat = CATS.find(x => x.key === k) || currentCat;
            renderSide();
            render();
        };
    });
}

async function render() {
    setLoading();
    try {
        // Open Library krever q param; vi injiserer `q=` ved behov
        const subjectQ = currentCat.q.startsWith("q=") ? currentCat.q : `q=${encodeURIComponent(currentCat.q)}`;
        const rows = await currentFetcher({ q: subjectQ });
        if (!rows.length) { els.list.innerHTML = `<div class="muted">No results.</div>`; return; }
        els.list.innerHTML = rows.map(tile).join("");
        bindActions(rows);
    } catch (e) {
        console.error(e);
        els.list.innerHTML = `<div class="muted">Failed to load.</div>`;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    renderSide();

    els.qBtn.onclick = async () => {
        const q = els.q.value.trim();
        if (!q) return;
        setLoading();
        const rows = await searchAny(q);
        els.list.innerHTML = rows.map(tile).join("");
        bindActions(rows);
    };

    els.sortPopular.onclick = () => { currentFetcher = async (cat) => fetchPopular(cat.q); render(); };
    els.sortNew.onclick = () => { currentFetcher = async (cat) => fetchNewThisYear(cat.q); render(); };

    render();
});
