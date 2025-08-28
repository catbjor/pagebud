/* ============================================================
PageBud • script.js  (2025-08-29)
- Utilities
- Storage (LocalStorage books + IndexedDB for files)
- Data (genres/moods/tropes)
- Router (auto init per side)
- Library (index.html): render, search, filter, mini-stars
- Add/Edit (add-book.html + edit-page.html): form + stars + chips + quotes
- File handling: cover extraction (PDF/EPUB) + save file (IndexedDB)
- Reader: PDF overlay + EPUB via initEpubReader(file/blob)
- Stats (stats.html): daily/weekly/monthly/yearly (lightweight, no libs)
- Discover helpers (result → “Want to read”, etc) used by discover.js
- Theme + PWA update banner hook (optional)
============================================================ */

/* ===========================
Utilities
=========================== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const on = (el, ev, fn, opt) => el && el.addEventListener(ev, fn, opt);
const byId = id => document.getElementById(id);

function uid() { return Math.random().toString(36).slice(2); }
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function todayISO() { return new Date().toISOString().slice(0, 10); } // YYYY-MM-DD
function fmt(n, d = 0) { return Number(n || 0).toFixed(d); }
function escapeHTML(s) { return String(s || "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }

/* ===========================
Storage (books in LocalStorage)
and files in IndexedDB (blobs)
=========================== */
const LS_KEY = "pb:books";
function safeParse(json, fallback) { try { return JSON.parse(json) } catch { return fallback } }
function getBooks() { return safeParse(localStorage.getItem(LS_KEY), []); }
function setBooks(arr) { localStorage.setItem(LS_KEY, JSON.stringify(arr)); document.dispatchEvent(new CustomEvent("pb:booksChanged")); }
function findBook(id) { return getBooks().find(b => b.id === id); }
function upsertBook(book) {
  const arr = getBooks();
  const i = arr.findIndex(b => b.id === book.id);
  const now = new Date().toISOString();
  book.lastUpdated = now;
  if (i >= 0) arr[i] = { ...arr[i], ...book };
  else arr.push(book);
  setBooks(arr);
  // push til sky om tilgjengelig
  try { PBSync?.pushOne?.(book); } catch { }
  // sosialt feed hvis rating
  try { if (book.rating && typeof publishActivity === "function") publishActivity(book); } catch { }
}
function deleteBook(id) {
  const arr = getBooks().filter(b => b.id !== id);
  setBooks(arr);
}

/* ===== IndexedDB (files) ===== */
const IDB_NAME = "PageBud";
const IDB_STORE = "files";
// file record: {bookId, type:'pdf'|'epub', name, size, blob}
function idbOpen() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "bookId" });
      }
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function idbPutFile(rec) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(rec);
    tx.oncomplete = () => res(true);
    tx.onerror = () => rej(tx.error);
  });
}
async function idbGetFile(bookId) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(bookId);
    req.onsuccess = () => res(req.result || null);
    req.onerror = () => rej(req.error);
  });
}
async function idbDeleteFile(bookId) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(bookId);
    tx.oncomplete = () => res(true);
    tx.onerror = () => rej(tx.error);
  });
}

/* ===========================
Data: chip sets (curated)
=========================== */
const PB = {
  GENRES: [
    "Adventure", "Apocalypse", "Biography", "Business", "Children", "Christian", "Classics", "Comic", "Contemporary", "Crime",
    "Dark Romance", "Drama", "Dystopian", "Erotic", "Fairytale Retellings", "Fantasy", "Folklore", "Gothic", "History",
    "Holiday / Seasonal", "Horror", "Humor", "LGBTQ+", "Lost World", "Memoir", "Mystery", "Mythology", "New Adult", "Non-fiction",
    "Novel", "Novella", "Paranormal", "Philosophy", "Poetry", "Political", "Psychological", "Religious", "Romance", "Satire", "Sci-Fi",
    "Self-Help", "Short Stories", "Space", "Spiritual", "Splatterpunk", "Sports Fiction", "Steampunk", "Superhero", "Suspense", "Thriller",
    "Urban Legend", "Western", "Witchy", "YA"
  ],
  MOODS: [
    "💔 Angsty", "🌅 Bittersweet", "🧡 Cozy", "😱 Creepy", "🧟‍♀️ Dark", "😭 Emotional", "⚡ Fast-paced", "🥰 Feel-good", "🤣 Funny", "🌸 Heartwarming",
    "🤯 Mind-bending", "🌙 Moody", "✨ Magical", "😌 Relaxing", "😭 Sad/Crying", "🐢 Slow-burn", "🌶️ Spicy", "🌀 Twisty", "🧠 Thought-provoking", "🔥 Tense", "💖 Wholesome"
  ],
  TROPES: [
    "Age Gap", "Arranged Marriage", "Billionaire", "Celebrity", "Childhood Friends", "Close Proximity", "Coworkers", "Dark Secrets",
    "Destined Mates", "Enemies to Lovers", "Fake Dating", "Forbidden Love", "Friends to Lovers", "Grumpy x Sunshine", "Love Triangle",
    "Marriage of Convenience", "Only One Bed", "Opposites Attract", "Pen Pals", "Rivals to Lovers", "Royalty",
    "Second Chance", "Slow Burn", "Soulmates", "Time Travel", "Unrequited Love"
  ],
  STATUS: ["reading", "finished", "want", "dnf", "owned", "wishlist", "favorites"] // favorites = derived, but we accept it
};

function ensureStatus(s) {
  // normalize common labels → our keys
  const m = { "tbr": "want", "want to read": "want", "dnf": "dnf", "reading": "reading", "finished": "finished", "read": "finished", "owned": "owned", "wishlist": "wishlist", "favorites": "favorites" };
  return m[String(s || "").toLowerCase()] || "want";
}

/* ===========================
Mini-stars renderer (0–6 in 0.5 steps)
=========================== */
function starsToHtml(r) {
  // r in 0..6 step .5 → 12 half-stars
  const full = Math.floor(r);
  const half = (r - full) >= 0.5 ? 1 : 0;
  const total = 6;
  let out = "";
  for (let i = 0; i < total; i++) {
    if (i < full) out += `<span class="mini-star full">★</span>`;
    else if (i === full && half) out += `<span class="mini-star half">★</span>`;
    else out += `<span class="mini-star">★</span>`;
  }
  return out;
}

/* ===========================
Router – init per side
=========================== */
document.addEventListener("DOMContentLoaded", () => {
  const path = location.pathname.split("/").pop();
  if (path.includes("index.html") || path === "" || path === "./" || path === "index") initLibraryPage();
  else if (path.includes("add-book") || path.includes("edit-page")) initEditPage();
  else if (path.includes("stats")) initStatsPage();
  // discover har egen discover.js, men vi eksporterer helpers globalt
});

/* ===========================
Library (index.html)
=========================== */
function initLibraryPage() {
  const grid = byId("book-grid");
  const empty = byId("empty-state");
  const search = byId("search-input");
  const chips = byId("filter-chips");
  const addBtn = byId("add-book-btn");

  let filter = "all";
  let q = "";

  function matches(b) {
    if (q) {
      const s = (b.title || "") + " " + (b.author || "");
      if (s.toLowerCase().indexOf(q.toLowerCase()) < 0) return false;
    }
    if (filter === "all") return true;
    if (filter === "favorites") return (Number(b.rating) || 0) >= 5;
    return (b.status || "") === filter;
  }

  function card(b) {
    const cover = b.coverDataUrl ? `<img class="book-cover" src="${b.coverDataUrl}" alt="">`
      : `<div class="book-cover"><i class="fas fa-book"></i></div>`;
    return `<div class="book-card" data-id="${b.id}">
      ${cover}
      <div class="book-info">
        <div class="book-title">${escapeHTML(b.title || "Untitled")}</div>
        <div class="book-author">${escapeHTML(b.author || "")}</div>
        <div class="book-rating">${starsToHtml(Number(b.rating) || 0)}</div>
      </div>
    </div>`;
  }

  function render() {
    const rows = getBooks().filter(matches);
    if (!rows.length) {
      empty.style.display = "block";
      grid.innerHTML = "";
      return;
    }
    empty.style.display = "none";
    grid.innerHTML = rows.map(card).join("");
  }

  on(grid, "click", (e) => {
    const cardEl = e.target.closest(".book-card");
    if (!cardEl) return;
    const id = cardEl.dataset.id;
    location.href = `edit-page.html?id=${encodeURIComponent(id)}`;
  });

  on(chips, "click", (e) => {
    const c = e.target.closest(".category");
    if (!c) return;
    $$(".category", chips).forEach(el => el.classList.remove("active"));
    c.classList.add("active");
    filter = c.dataset.filter || "all";
    render();
  });

  on(search, "input", () => { q = search.value.trim(); render(); });

  on(addBtn, "click", () => { location.href = "add-book.html"; });

  // init + live sync updates
  render();
  document.addEventListener("pb:booksChanged", render);
  document.addEventListener("pb:booksSynced", render);
}

/* ===========================
Add/Edit (add-book.html + edit-page.html)
=========================== */
function initEditPage() {
  const isEdit = !!new URL(location.href).searchParams.get("id");
  const bookId = new URL(location.href).searchParams.get("id") || uid();

  // form els
  const titleEl = byId("title");
  const authorEl = byId("author");
  const statusEl = byId("status");
  const startedEl = byId("startedAt");
  const finishedEl = byId("finishedAt");
  const reviewEl = byId("review");
  const notesEl = byId("notes");

  // cover
  const coverBox = byId("cover");
  const coverIcon = byId("coverIcon");
  const pickCoverBtn = byId("pickCover");
  const coverInput = byId("coverInput");

  // stars
  const starsWrap = byId("stars");
  const ratingVal = byId("ratingVal");
  let currentRating = 0;

  // chips containers
  const genresBox = byId("genres");
  const moodsBox = byId("moods");
  const tropesBox = byId("tropes");

  // quotes
  const quoteText = byId("quoteText");
  const quotesWrap = byId("quotes");
  const addQuoteBtn = byId("addQuote");

  // file
  const uploadBtn = byId("upload-file-btn");
  const fileInput = byId("bookFile");
  const fileNameEl = byId("fileName");

  // actions
  const saveBtn = byId("update-book-btn");
  const delBtn = byId("delete-book-btn");
  const readBtn = byId("read-book-btn");

  // local working state
  let state = {
    id: bookId,
    title: "",
    author: "",
    status: "want",
    rating: 0,
    genres: [],
    moods: [],
    tropes: [],
    review: "",
    notes: "",
    quotes: [],
    startedAt: "",
    finishedAt: "",
    coverDataUrl: ""
  };

  /* ----- helpers ----- */
  function setCover(url) {
    state.coverDataUrl = url || "";
    if (url) {
      coverBox.style.backgroundImage = `url('${url}')`;
      coverBox.style.backgroundSize = "cover";
      coverBox.style.backgroundPosition = "center";
      coverIcon.style.display = "none";
    } else {
      coverBox.style.backgroundImage = "";
      coverIcon.style.display = "block";
    }
  }
  function setRating(r) {
    currentRating = clamp(Math.round(r * 2) / 2, 0, 6);
    ratingVal.textContent = `Selected: ${currentRating}`;
    state.rating = currentRating;
    renderStars();
  }
  function renderStars() {
    // 6 stars (click left half = .5, right half = +1)
    starsWrap.innerHTML = "";
    for (let i = 1; i <= 6; i++) {
      const span = document.createElement("span");
      span.className = "star-container";
      span.innerHTML = "★";
      span.title = `${i}`;
      on(span, "mousemove", (e) => {
        const rect = span.getBoundingClientRect();
        const half = (e.clientX - rect.left) < rect.width / 2 ? 0.5 : 1;
        const temp = Math.min(i - 1 + half, 6);
        ratingVal.textContent = `Selected: ${temp}`;
      });
      on(span, "mouseleave", () => ratingVal.textContent = `Selected: ${currentRating}`);
      on(span, "click", (e) => {
        const rect = span.getBoundingClientRect();
        const half = (e.clientX - rect.left) < rect.width / 2 ? 0.5 : 1;
        setRating(Math.min(i - 1 + half, 6));
      });
      // styling via opacity handled by CSS classes; we just color via inline for clarity
      const full = Math.floor(currentRating);
      const half = (currentRating - full) >= .5 ? 1 : 0;
      if (i <= full) span.style.color = "gold";
      else if (i === full + 1 && half) { span.style.color = "gold"; span.style.opacity = "0.7"; }
      else { span.style.opacity = "0.35"; }
      starsWrap.appendChild(span);
    }
  }

  function renderChips(root, values, selected) {
    if (!root) return;
    if (!root.children.length) {
      root.innerHTML = values.map(v => `<div class="toggle-option" data-val="${escapeHTML(v)}">${escapeHTML(v)}</div>`).join("");
    }
    $$(".toggle-option", root).forEach(el => {
      const val = el.dataset.val || el.textContent.trim();
      if (selected.includes(val)) el.classList.add("selected");
      on(el, "click", () => {
        const idx = selected.indexOf(val);
        if (idx >= 0) selected.splice(idx, 1);
        else selected.push(val);
        el.classList.toggle("selected");
      });
    });
  }

  function renderQuotes() {
    const items = (state.quotes || []).map((q, i) => `
      <div class="quote-item">
        <div class="quote-text">${escapeHTML(q)}</div>
        <div class="quote-actions">
          <span class="quote-action" data-del="${i}">Delete</span>
        </div>
      </div>
    `).join("");
    quotesWrap.innerHTML = items;
    $("[data-del]", quotesWrap)?.addEventListener?.("click", (e) => {
      const btn = e.target.closest("[data-del]");
      const i = Number(btn.dataset.del);
      state.quotes.splice(i, 1);
      renderQuotes();
    });
  }

  // PDF cover extraction → dataURL
  async function pdfFirstPageToDataURL(file) {
    const url = URL.createObjectURL(file);
    try {
      const pdf = await pdfjsLib.getDocument({ url }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const data = canvas.toDataURL("image/jpeg", 0.85);
      return data;
    } finally { URL.revokeObjectURL(url); }
  }

  // EPUB cover extraction via JSZip (robust)
  async function epubCoverToDataURL(file) {
    const zip = await JSZip.loadAsync(file);
    // 1) find container.xml
    const container = await zip.file("META-INF/container.xml").async("string").catch(() => null);
    if (!container) return "";
    const opfPath = (container.match(/full-path="([^"]+)"/i) || [])[1];
    if (!opfPath) return "";
    const opf = await zip.file(opfPath).async("string").catch(() => null);
    if (!opf) return "";
    // Try properties="cover-image"
    const coverHref1 = (opf.match(/<item[^>]+properties="[^"]*cover-image[^"]*"[^>]*href="([^"]+)"/i) || [])[1];
    if (coverHref1) {
      const p = opfPath.split("/").slice(0, -1).join("/");
      const full = p ? `${p}/${coverHref1}` : coverHref1;
      const blob = await zip.file(full).async("blob").catch(() => null);
      if (blob) return await blobToDataURL(blob);
    }
    // Try meta name="cover" content="id"
    const metaId = (opf.match(/<meta[^>]+name="cover"[^>]+content="([^"]+)"/i) || [])[1];
    if (metaId) {
      const itemHref = (new RegExp(`<item[^>]+id="${metaId}"[^>]+href="([^"]+)"`, "i").exec(opf) || [])[1];
      if (itemHref) {
        const p = opfPath.split("/").slice(0, -1).join("/");
        const full = p ? `${p}/${itemHref}` : itemHref;
        const blob = await zip.file(full).async("blob").catch(() => null);
        if (blob) return await blobToDataURL(blob);
      }
    }
    return "";
  }
  function blobToDataURL(blob) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(blob);
    });
  }

  /* ----- load existing if edit ----- */
  if (isEdit) {
    const b = findBook(bookId);
    if (!b) { alert("Book not found"); location.href = "index.html"; return; }
    state = { ...state, ...b };
    titleEl.value = b.title || "";
    authorEl.value = b.author || "";
    statusEl.value = ensureStatus(b.status);
    startedEl.value = b.startedAt || "";
    finishedEl.value = b.finishedAt || "";
    reviewEl.value = b.review || "";
    notesEl.value = b.notes || "";
    setCover(b.coverDataUrl || "");
  } else {
    // new book defaults
    statusEl.value = "want";
    startedEl.value = "";
    finishedEl.value = "";
  }
  setRating(Number(state.rating) || 0);

  // ensure chips rendered (works whether HTML has children or not)
  renderChips(genresBox, PB.GENRES, state.genres);
  renderChips(moodsBox, PB.MOODS, state.moods);
  renderChips(tropesBox, PB.TROPES, state.tropes);
  renderQuotes();

  /* ----- events ----- */
  on(pickCoverBtn, "click", () => coverInput.click());
  on(coverInput, "change", async () => {
    const f = coverInput.files?.[0]; if (!f) return;
    const data = await blobToDataURL(f);
    setCover(data);
  });

  on(uploadBtn, "click", () => fileInput.click());
  on(fileInput, "change", async () => {
    const f = fileInput.files?.[0]; if (!f) return;
    fileNameEl.textContent = `${f.name} (${Math.round(f.size / 1024)} KB)`;
    const ext = f.name.toLowerCase().endsWith(".pdf") ? "pdf" : "epub";
    await idbPutFile({ bookId, type: ext, name: f.name, size: f.size, blob: f });
    // try to extract cover
    try {
      const cov = ext === "pdf" ? await pdfFirstPageToDataURL(f) : await epubCoverToDataURL(f);
      if (cov) setCover(cov);
    } catch (e) { console.warn("cover extract failed", e); }
  });

  on(addQuoteBtn, "click", () => {
    const t = (quoteText.value || "").trim();
    if (!t) return;
    state.quotes.push(t);
    quoteText.value = "";
    renderQuotes();
  });

  on(saveBtn, "click", async () => {
    const book = {
      ...state,
      id: bookId,
      title: titleEl.value.trim() || "Untitled",
      author: authorEl.value.trim() || "",
      status: ensureStatus(statusEl.value),
      review: reviewEl.value || "",
      notes: notesEl.value || "",
      startedAt: startedEl.value || "",
      finishedAt: finishedEl.value || ""
    };
    upsertBook(book);
    alert(isEdit ? "Updated ✓" : "Added ✓");
    location.href = "index.html";
  });

  on(delBtn, "click", async () => {
    if (!confirm("Delete this book?")) return;
    await idbDeleteFile(bookId).catch(() => { });
    deleteBook(bookId);
    alert("Deleted");
    location.href = "index.html";
  });

  on(readBtn, "click", async () => {
    const rec = await idbGetFile(bookId);
    if (!rec || !rec.blob) { alert("No book file attached."); return; }
    if (rec.type === "pdf") {
      openPdfReader(rec.blob, state.title || rec.name);
    } else {
      // EPUB – bruker din initEpubReader (reader-init.js)
      try {
        window.initEpubReader(rec.blob);
      } catch (e) {
        console.error(e);
        alert("EPUB reader not ready.");
      }
    }
  });
}

/* ===========================
PDF Reader overlay (reusing your DOM in add/edit pages)
=========================== */
function openPdfReader(blob, title = "Book") {
  // expects DOM present (add-book.html/edit-page.html have it)
  const overlay = byId("reader"); if (!overlay) { alert("Reader UI missing on this page."); return; }
  const rTitle = byId("rTitle");
  const pdfWrap = byId("pdfWrap");
  const epubWrap = byId("epubWrap");
  const rClose = byId("rClose");
  const rAminus = byId("rAminus");
  const rAplus = byId("rAplus");
  const rSlider = byId("rSlider");
  const rCount = byId("rCount");
  const tapLeft = byId("tapLeft");
  const tapRight = byId("tapRight");
  const canvas = byId("pdfCanvas");
  const ctx = canvas.getContext("2d");

  let pdfDoc = null;
  let pageNum = 1;
  let scale = 1.1;

  function show() { overlay.classList.add("show"); pdfWrap.style.display = "block"; epubWrap.style.display = "none"; rTitle.textContent = title; }
  function hide() { overlay.classList.remove("show"); }

  async function renderPage(n) {
    const page = await pdfDoc.getPage(n);
    const viewport = page.getViewport({ scale });
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;
    rCount.textContent = `${n} / ${pdfDoc.numPages}`;
    rSlider.value = String(n);
  }

  async function load() {
    const url = URL.createObjectURL(blob);
    try {
      pdfDoc = await pdfjsLib.getDocument({ url }).promise;
      rSlider.min = 1; rSlider.max = pdfDoc.numPages; rSlider.value = 1;
      await renderPage(1);
      show();
    } finally { URL.revokeObjectURL(url); }
  }

  on(rClose, "click", hide);
  on(rAminus, "click", () => { scale = clamp(scale - 0.1, 0.7, 2.0); renderPage(pageNum); });
  on(rAplus, "click", () => { scale = clamp(scale + 0.1, 0.7, 2.0); renderPage(pageNum); });
  on(rSlider, "input", () => { pageNum = Number(rSlider.value); renderPage(pageNum); });
  on(tapLeft, "click", () => { if (pageNum > 1) { pageNum--; renderPage(pageNum); } });
  on(tapRight, "click", () => { if (pdfDoc && pageNum < pdfDoc.numPages) { pageNum++; renderPage(pageNum); } });

  load();
}

/* ===========================
Stats (stats.html)
=========================== */
function initStatsPage() {
  const root = $(".content-wrapper");
  if (!root) return;

  // header filter UI (Daily/Weekly/Monthly/Yearly)
  const toolbar = document.createElement("div");
  toolbar.className = "time-filter";
  toolbar.innerHTML = `
    <button class="time-btn active" data-v="daily">Daily</button>
    <button class="time-btn" data-v="weekly">Weekly</button>
    <button class="time-btn" data-v="monthly">Monthly</button>
    <button class="time-btn" data-v="yearly">Yearly</button>
  `;

  const wrap = document.createElement("div");
  root.appendChild(toolbar);
  root.appendChild(wrap);

  let view = "daily";

  function books() { return getBooks(); }
  function finishedDates() {
    return books().map(b => b.finishedAt).filter(Boolean).map(d => new Date(d));
  }
  function countByMonth(nMonths = 12) {
    const now = new Date();
    const map = new Map(); // key YYYY-MM → count
    for (let i = 0; i < nMonths; i++) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = dt.toISOString().slice(0, 7);
      map.set(key, 0);
    }
    for (const d of finishedDates()) {
      const key = d.toISOString().slice(0, 7);
      if (map.has(key)) map.set(key, map.get(key) + 1);
    }
    // newest → oldest
    return Array.from(map.entries()).sort((a, b) => a[0] < b[0] ? 1 : -1);
  }
  function countByYear(nYears = 5) {
    const yearNow = new Date().getFullYear();
    const map = new Map();
    for (let y = yearNow; y > yearNow - nYears; y--) map.set(String(y), 0);
    for (const d of finishedDates()) {
      const y = String(d.getFullYear());
      if (map.has(y)) map.set(y, map.get(y) + 1);
    }
    return Array.from(map.entries());
  }
  function topAuthors() {
    const m = new Map();
    for (const b of books()) {
      const a = (b.author || "").trim(); if (!a) continue;
      m.set(a, (m.get(a) || 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }
  function avgRating() {
    const arr = books().map(b => Number(b.rating) || 0).filter(x => x > 0);
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }
  function dailyCalendar() {
    // simple current month calendar with dots for finished/started
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const first = new Date(y, m, 1);
    const startDay = (first.getDay() + 6) % 7; // Mon=0
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    const finishedSet = new Set(books().filter(b => b.finishedAt).map(b => b.finishedAt));
    const startedSet = new Set(books().filter(b => b.startedAt).map(b => b.startedAt));

    let html = `<div class="stats-section"><div class="section-header"><div class="section-title"><i class="fa-regular fa-calendar"></i><span>Calendar (this month)</span></div></div>`;
    html += `<div class="calendar-grid">`;
    for (let i = 0; i < startDay; i++) html += `<div class="cell out"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateISO = new Date(y, m, d).toISOString().slice(0, 10);
      const isToday = (dateISO === todayISO());
      const hasStart = startedSet.has(dateISO);
      const hasFinish = finishedSet.has(dateISO);
      html += `<div class="cell${isToday ? ' today' : ''}">
        <div class="date">${d}</div>
        <div class="badge">
          ${hasStart ? `<span class="start"></span>` : ``}
          ${hasFinish ? `<span class="finish"></span>` : ``}
        </div>
      </div>`;
    }
    html += `</div></div>`;
    return html;
  }
  function weekly() {
    // last 8 weeks: count finishes per week
    const now = new Date();
    const arr = [];
    for (let w = 7; w >= 0; w--) {
      const start = new Date(now); start.setDate(now.getDate() - (w * 7));
      const end = new Date(start); end.setDate(start.getDate() + 6);
      const n = finishedDates().filter(d => d >= start && d <= end).length;
      const label = `${start.toISOString().slice(5, 10)}–${end.toISOString().slice(5, 10)}`;
      arr.push({ label, n });
    }
    let html = `<div class="stats-section"><div class="section-header"><div class="section-title"><i class="fa-solid fa-chart-simple"></i><span>Last 8 weeks</span></div></div>`;
    html += `<div class="authors-list">` +
      arr.map(x => `
              <div class="author-item">
                <div class="author-name">${escapeHTML(x.label)}</div>
                <div class="author-bar"><div class="author-fill" style="width:${Math.min(100, x.n * 15)}%"></div></div>
                <div class="author-count">${x.n}</div>
              </div>`).join("") +
      `</div></div>`;
    return html;
  }
  function monthly() {
    const rows = countByMonth(12);
    let html = `<div class="stats-section"><div class="section-header"><div class="section-title"><i class="fa-solid fa-chart-column"></i><span>Last 12 months</span></div></div>`;
    html += `<div class="authors-list">` +
      rows.map(([ym, n]) => {
        return `<div class="author-item">
                <div class="author-name">${ym}</div>
                <div class="author-bar"><div class="author-fill" style="width:${Math.min(100, n * 12)}%"></div></div>
                <div class="author-count">${n}</div>
              </div>`;
      }).join("") +
      `</div></div>`;
    return html;
  }
  function yearly() {
    const rows = countByYear(5);
    let html = `<div class="stats-section"><div class="section-header"><div class="section-title"><i class="fa-solid fa-chart-line"></i><span>By year</span></div></div>`;
    html += `<div class="authors-list">` +
      rows.map(([y, n]) => `
              <div class="author-item">
                <div class="author-name">${y}</div>
                <div class="author-bar"><div class="author-fill" style="width:${Math.min(100, n * 8)}%"></div></div>
                <div class="author-count">${n}</div>
              </div>`).join("") +
      `</div></div>`;
    return html;
  }

  function overview() {
    const total = books().length;
    const finished = books().filter(b => b.status === "finished").length;
    const avg = avgRating();
    const most = topAuthors();
    return `
      <div class="stats-section">
        <div class="overview-grid">
          <div class="stat-card">
            <div class="stat-number">${total}</div>
            <div class="stat-label">Total books</div>
          </div>
          <div class="stat-card rating-stat">
            <div class="stat-number">${fmt(avg, 1)}</div>
            <div class="stat-label">Avg rating</div>
          </div>
        </div>
        <div class="section-header"><div class="section-title"><i class="fa-solid fa-user-pen"></i><span>Top authors</span></div></div>
        <div class="authors-list">
          ${most.length ? most.map(([name, count]) => `
              <div class="author-item">
                <div class="author-name">${escapeHTML(name)}</div>
                <div class="author-bar"><div class="author-fill" style="width:${Math.min(100, count * 20)}%"></div></div>
                <div class="author-count">${count}</div>
              </div>`).join("")
        : `<div class="muted">No data yet.</div>`
      }
        </div>
      </div>
    `;
  }

  function render() {
    // toolbar active state
    $$(".time-btn", toolbar).forEach(b => b.classList.toggle("active", b.dataset.v === view));
    wrap.innerHTML = overview()
      + (view === "daily" ? dailyCalendar()
        : view === "weekly" ? weekly()
          : view === "monthly" ? monthly()
            : yearly());
  }

  on(toolbar, "click", (e) => {
    const btn = e.target.closest(".time-btn");
    if (!btn) return;
    view = btn.dataset.v;
    render();
  });

  render();
  document.addEventListener("pb:booksChanged", render);
  document.addEventListener("pb:booksSynced", render);
}

/* ===========================
Discover helpers (used by discover.js)
=========================== */
// Convert an Open Library result to a minimal PageBud book object
window.pbFromOpenLibrary = function (row) {
  const title = (row.title || "Untitled").slice(0, 200);
  const author = (row.author_name?.[0] || row.authors?.[0]?.name || "").slice(0, 160);
  const id = `ol_${row.key || uid()}`.replace(/[^\w\-]+/g, "_");
  const coverId = row.cover_i || row.cover_id;
  const coverUrl = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : "";
  return {
    id,
    title,
    author,
    status: "want",
    rating: 0,
    genres: [],
    moods: [],
    tropes: [],
    review: "",
    notes: "",
    quotes: [],
    startedAt: "",
    finishedAt: "",
    coverDataUrl: coverUrl
  };
};

window.pbQuickAdd = function (row, status = "want") {
  const b = pbFromOpenLibrary(row);
  b.status = ensureStatus(status);
  // if book with same title+author exists, update status only
  const all = getBooks();
  const i = all.findIndex(x => (x.title || "").toLowerCase() === b.title.toLowerCase() && (x.author || "").toLowerCase() === b.author.toLowerCase());
  if (i >= 0) { all[i].status = b.status; setBooks(all); try { PBSync?.pushOne?.(all[i]); } catch { }; return true; }
  upsertBook(b);
  return true;
};

/* ===========================
Theme switch (Settings page thumbnails)
=========================== */
(function () {
  const previews = $$(".theme-preview");
  previews.forEach(p => {
    on(p, "click", () => {
      const theme = p.dataset.theme || "default";
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("pb:theme", theme);
      previews.forEach(x => x.classList.toggle("active", x === p));
    });
  });
  const saved = localStorage.getItem("pb:theme") || "default";
  document.documentElement.setAttribute("data-theme", saved);
  previews.forEach(x => x.classList.toggle("active", (x.dataset.theme || "") === saved));
})();
