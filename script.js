/* ============================================================
PageBud • script.js
--------------------------------------------------------------
- PWA-oppdateringsbanner + force update
- LocalStorage (bøker, mål, grupper, tema, streak) + IndexedDB (bokfiler)
- Bibliotek (index.html): render, søk, filter, ministjerner
- Add/Edit: skjema, 6★ med halv-trinn, chips, sitater, cover-ekstraksjon
- Leser-overlay: PDF/EPUB
- Stats: enkel oversikt + minidiagram (SVG)
- Buddy Read: lokale grupper + "chat"
- Innstillinger: tema, eksport/import/backup/reset, mål
============================================================ */

/* ===========================
Utils
=========================== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const byId = id => document.getElementById(id);
const on = (el, ev, fn, opt) => el && el.addEventListener(ev, fn, opt);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const ext = (name = '') => (name.split('.').pop() || '').toLowerCase();
const fmt = n => Intl.NumberFormat().format(n);
function qParam(name) { return new URL(location.href).searchParams.get(name); }
function escapeHTML(s) {
  return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ===========================
LocalStorage keys
=========================== */
const LS_BOOKS_KEY = "pb:books";
const LS_GOALS_KEY = "pb:goals";
const LS_GROUPS_KEY = "pb:groups";
const LS_THEME_KEY = "pb:theme";
const LS_STREAK_KEY = "pb:streak";
const LS_CHAT_PREFIX = "pb:chat:";

/* ===========================
LocalStorage helpers
=========================== */
function loadBooks() { try { return JSON.parse(localStorage.getItem(LS_BOOKS_KEY) || "[]"); } catch { return []; } }
function saveBooks(v) { localStorage.setItem(LS_BOOKS_KEY, JSON.stringify(v)); }
function getGoals() { try { return JSON.parse(localStorage.getItem(LS_GOALS_KEY) || "{}"); } catch { return {}; } }
function setGoals(v) { localStorage.setItem(LS_GOALS_KEY, JSON.stringify(v)); }
function getGroups() { try { return JSON.parse(localStorage.getItem(LS_GROUPS_KEY) || "[]"); } catch { return []; } }
function setGroups(v) { localStorage.setItem(LS_GROUPS_KEY, JSON.stringify(v)); }
function getTheme() { return localStorage.getItem(LS_THEME_KEY) || "default"; }
function setTheme(theme) { localStorage.setItem(LS_THEME_KEY, theme); document.documentElement.setAttribute("data-theme", theme); }
function getStreakData() { try { return JSON.parse(localStorage.getItem(LS_STREAK_KEY) || '{"current":0,"lastDate":null}'); } catch { return { current: 0, lastDate: null }; } }
function setStreakData(data) { localStorage.setItem(LS_STREAK_KEY, JSON.stringify(data)); }

/* ===========================
Lesestreak (pr. dag)
=========================== */
function updateReadingStreak() {
  const today = new Date().toDateString();
  const streakData = getStreakData();
  if (streakData.lastDate === today) return streakData.current;
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const ystr = yesterday.toDateString();
  if (!streakData.lastDate) streakData.current = 1;
  else if (streakData.lastDate === ystr) streakData.current += 1;
  else streakData.current = 1;
  streakData.lastDate = today;
  setStreakData(streakData);
  return streakData.current;
}

/* ===========================
Chat-lagring pr. gruppe
=========================== */
function getChat(id) { try { return JSON.parse(localStorage.getItem(LS_CHAT_PREFIX + id) || "[]"); } catch { return []; } }
function setChat(id, arr) { localStorage.setItem(LS_CHAT_PREFIX + id, JSON.stringify(arr)); }

/* ===========================
Tema: last ved start
=========================== */
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = getTheme();
  setTheme(savedTheme);
  const themeSelect = byId('theme-select');
  if (themeSelect) themeSelect.value = savedTheme;
});

/* ===========================
PWA: Service Worker + Update
=========================== */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").then((reg) => {
    if (reg.waiting) showUpdateBanner(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener("statechange", () => {
        if (nw.state === "installed" && navigator.serviceWorker.controller) showUpdateBanner(nw);
      });
    });
  });
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });
}
function showUpdateBanner(worker) {
  if (byId("pbUpdateBanner")) return;
  const btn = document.createElement("button");
  btn.id = "pbUpdateBanner";
  btn.className = "pb-update-banner";
  btn.textContent = "✨ New version available — tap to update";
  btn.onclick = () => worker.postMessage({ action: "skipWaiting" });
  document.body.appendChild(btn);
}
window.forceUpdateNow = async () => {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) { location.reload(); return; }
    if (reg.waiting) { reg.waiting.postMessage({ action: "skipWaiting" }); return; }
    await reg.update();
    if (reg.waiting) { reg.waiting.postMessage({ action: "skipWaiting" }); return; }
    await reg.unregister();
    location.reload();
  } catch {
    location.reload();
  }
};

/* ===========================
IndexedDB (PDF/EPUB)
=========================== */
const DB_NAME = "pagebud-db";
const DB_STORE = "files";
function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbPutFile(id, type, blob) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put({ id, type, blob });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}
async function idbGetFile(id) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const r = tx.objectStore(DB_STORE).get(id);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}
async function idbDeleteFile(id) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/* ===========================
Stjerner (6 med halv-trinn)
=========================== */
function makeStars(container, initial = 0, onChange = () => { }) {
  container.innerHTML = "";
  const total = 6;
  const state = { v: clamp(Number(initial) || 0, 0, 6) };
  for (let i = 1; i <= total; i++) {
    const wrap = document.createElement("span");
    wrap.className = "star-container" + (i === 6 ? " special" : "");
    wrap.title = `Star ${i}`;
    wrap.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.74 1.59 8.267L12 18.896l-7.526 4.417 1.59-8.267L0 9.306l8.332-1.151z"/></svg>`;
    container.appendChild(wrap);
  }
  function sync() {
    const whole = Math.floor(state.v);
    const half = (state.v - whole) >= 0.5;
    $$(".star-container", container).forEach((node, idx) => {
      const i = idx + 1;
      if (i <= whole) node.style.opacity = "1";
      else if (i === whole + 1 && half) node.style.opacity = "0.65";
      else node.style.opacity = "0.25";
    });
  }
  sync();
  function setVal(v) {
    state.v = clamp(Number(v) || 0, 0, 6);
    sync();
    container.dispatchEvent(new CustomEvent("pb:rating", { detail: { value: state.v } }));
    onChange(state.v);
  }
  on(container, "click", (e) => {
    const node = e.target.closest(".star-container");
    if (!node) return;
    const idx = $$(".star-container", container).indexOf(node) + 1;
    const rect = node.getBoundingClientRect();
    const half = (e.clientX - rect.left) < rect.width / 2 ? 0.5 : 1;
    const newVal = Math.min(idx - (half === 0.5 ? 0.5 : 0), 6);
    node.style.animation = "pb-pulse .25s";
    setTimeout(() => node.style.animation = "", 260);
    setVal(newVal);
  });
  on(container, "keydown", (e) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); setVal(state.v - 0.5); }
    if (e.key === "ArrowRight") { e.preventDefault(); setVal(state.v + 0.5); }
  });
  container.tabIndex = 0;
  return { get value() { return state.v; }, set value(v) { setVal(v); } };
}

/* ===========================
Datamodell for bok
=========================== */
const DEFAULT_BOOK = () => ({
  id: uid(),
  title: "", author: "", status: "reading",
  rating: 0, genres: [], moods: [], tropes: [],
  review: "", notes: "",
  coverDataUrl: "",
  fileId: "", fileType: "",
  quotes: [],
  startedAt: "",   // <-- NYTT
  finishedAt: ""   // <-- NYTT
});


/* ===========================
Index (bibliotek)
=========================== */
function initLibraryPage() {
  const grid = byId("book-grid");
  const emptyState = byId("empty-state");
  const searchInput = byId("search-input");
  const chipsWrap = byId("filter-chips");
  const addBtn = byId("add-book-btn");
  if (!grid || !addBtn) return;

  on(addBtn, "click", () => location.href = "add-book.html");

  let books = loadBooks();
  let activeFilter = "all";
  let searchTerm = "";

  function miniStarsHTML(r) {
    r = Number(r) || 0;
    let html = "";
    for (let i = 1; i <= 6; i++) {
      if (i <= Math.floor(r)) html += `<span class="mini-star full">★</span>`;
      else if (i === Math.floor(r) + 1 && (r % 1) >= 0.5) html += `<span class="mini-star half">★</span>`;
      else html += `<span class="mini-star">★</span>`;
    }
    return html;
  }
  function matchesFilter(b) {
    if (activeFilter === "all") return true;
    if (activeFilter === "favorites") return (b.rating || 0) >= 5;
    return (b.status === activeFilter);
  }
  function matchesSearch(b) {
    if (!searchTerm) return true;
    const hay = (b.title + " " + b.author).toLowerCase();
    return hay.includes(searchTerm);
  }
  function render() {
    books = loadBooks();
    const visible = books.filter(b => matchesFilter(b) && matchesSearch(b));
    if (!visible.length) {
      grid.innerHTML = "";
      emptyState.style.display = "";
      return;
    }
    emptyState.style.display = "none";
    grid.innerHTML = visible.map(b => {
      const cover = b.coverDataUrl
        ? `<img class="book-cover" src="${b.coverDataUrl}" alt="Cover">`
        : `<div class="book-cover"><i class="fas fa-image"></i></div>`;
      return `<div class="book-card" data-id="${b.id}">${cover}<div class="book-info"><div class="book-title">${escapeHTML(b.title || "Untitled")}</div><div class="book-author">${escapeHTML(b.author || "")}</div><div class="book-rating">${miniStarsHTML(b.rating || 0)}</div></div></div>`;
    }).join("");
    $$(".book-card", grid).forEach(card => {
      on(card, "click", () => {
        const id = card.getAttribute("data-id");
        location.href = `add-book.html?id=${encodeURIComponent(id)}`;
      });
    });
  }
  render();
  on(searchInput, "input", () => {
    searchTerm = searchInput.value.trim().toLowerCase();
    render();
  });
  if (chipsWrap) {
    $$(".category", chipsWrap).forEach(ch => {
      on(ch, "click", () => {
        $$(".category", chipsWrap).forEach(c => c.classList.remove("active"));
        ch.classList.add("active");
        activeFilter = ch.getAttribute("data-filter");
        render();
      });
    });
  }
}

/* ===========================
Add/Edit – skjema/chips/quotes/filer
=========================== */
const GENRES = [
  "Adventure", "Apocalypse", "Biography", "Business", "Children", "Christian", "Classics", "Comic",
  "Contemporary", "Crime", "Dark Romance", "Drama", "Dystopian", "Erotic", "Fairytale Retellings", "Fantasy",
  "Folklore", "Gothic", "History", "Holiday / Seasonal", "Horror", "Humor", "LGBTQ+", "Lost World", "Memoir",
  "Mystery", "Mythology", "New Adult", "Non-fiction", "Novel", "Novella", "Paranormal", "Philosophy", "Poetry",
  "Political", "Psychological", "Religious", "Romance", "Satire", "Sci-Fi", "Self-Help", "Short Stories",
  "Space", "Spiritual", "Splatterpunk", "Sports Fiction", "Steampunk", "Superhero", "Suspense", "Thriller",
  "Urban Legend", "Western", "Witchy", "YA"
];
const MOODS = [
  "💔 Angsty", "🌅 Bittersweet", "🧡 Cozy", "😱 Creepy", "🧟‍♀️ Dark", "😭 Emotional", "⚡ Fast-paced", "🥰 Feel-good", "🤣 Funny",
  "🌸 Heartwarming", "🤯 Mind-bending", "🌙 Moody", "✨ Magical", "😌 Relaxing", "😭 Sad/Crying", "🐢 Slow-burn", "🌶️ Spicy",
  "🌀 Twisty", "🧠 Thought-provoking", "🔥 Tense", "💖 Wholesome"
];
const TROPES = [
  ["age-gap", "Age Gap"], ["arranged-marriage", "Arranged Marriage"], ["billionaire", "Billionaire"],
  ["celebrity", "Celebrity"], ["childhood-friends", "Childhood Friends"], ["close-proximity", "Close Proximity"],
  ["coworkers", "Coworkers"], ["dark-secrets", "Dark Secrets"], ["destined-mates", "Destined Mates"],
  ["enemies-to-lovers", "Enemies to Lovers"], ["fake-dating", "Fake Dating"], ["forbidden-love", "Forbidden Love"],
  ["friends-to-lovers", "Friends to Lovers"], ["grumpy-sunshine", "Grumpy x Sunshine"], ["love-triangle", "Love Triangle"],
  ["marriage-of-convenience", "Marriage of Convenience"], ["one-bed", "Only One Bed"], ["opposites-attract", "Opposites Attract"],
  ["pen-pals", "Pen Pals"], ["rivals-to-lovers", "Rivals to Lovers"], ["royalty", "Royalty"], ["second-chance", "Second Chance"],
  ["slow-burn", "Slow Burn"], ["soulmates", "Soulmates"], ["time-travel", "Time Travel"], ["unrequited-love", "Unrequited Love"]
];

function initAddEditPage() {
  const titleEl = byId("title");
  const starsWrap = byId("stars");
  const coverBox = byId("cover");
  if (!titleEl || !starsWrap || !coverBox) return;

  startedAtEl.value = current.startedAt || "";
  finishedAtEl.value = current.finishedAt || "";

  current.startedAt = startedAtEl.value || "";
  current.finishedAt = finishedAtEl.value || "";

  const authorEl = byId("author");
  const statusEl = byId("status");
  const ratingValEl = byId("ratingVal");
  const pickCoverBtn = byId("pickCover");
  const coverInput = byId("coverInput");
  const uploadFileBtn = byId("upload-file-btn");
  const fileInput = byId("bookFile");
  const fileNameEl = byId("fileName");
  const reviewEl = byId("review");
  const notesEl = byId("notes");
  const addQuoteBtn = byId("addQuote");
  const quoteTextEl = byId("quoteText");
  const qTextOpt = byId("qText");
  const qGalleryOpt = byId("qGallery");
  const quotesWrap = byId("quotes");
  const startedAtEl = byId("startedAt");
  const finishedAtEl = byId("finishedAt");

  const btnUpdate = byId("update-book-btn");
  const btnDelete = byId("delete-book-btn");
  const btnRead = byId("read-book-btn");

  const genresBox = byId("genres");
  const moodsBox = byId("moods");
  const tropesBox = byId("tropes");

  if (genresBox && !genresBox.children.length) {
    genresBox.innerHTML = GENRES.map(g => `<div class="toggle-option" data-val="${escapeHTML(g)}">${escapeHTML(g)}</div>`).join("");
  }
  if (moodsBox && !moodsBox.children.length) {
    moodsBox.innerHTML = MOODS.map(m => `<div class="toggle-option" data-val="${escapeHTML(m)}">${escapeHTML(m)}</div>`).join("");
  }
  if (tropesBox && !tropesBox.children.length) {
    tropesBox.innerHTML = TROPES.map(([val, lab]) => `<div class="toggle-option" data-val="${val}">${escapeHTML(lab)}</div>`).join("");
  }

  function parseSelected(root) { return $$(".toggle-option.selected", root).map(n => n.getAttribute("data-val") || n.textContent.trim()); }
  function setSelected(root, values) {
    if (!root) return;
    const set = new Set(values || []);
    $$(".toggle-option", root).forEach(n => {
      const val = n.getAttribute("data-val") || n.textContent.trim();
      if (set.has(val)) n.classList.add("selected");
    });
  }
  $$(".toggle-option", genresBox).forEach(n => on(n, "click", () => n.classList.toggle("selected")));
  $$(".toggle-option", moodsBox).forEach(n => on(n, "click", () => n.classList.toggle("selected")));
  $$(".toggle-option", tropesBox).forEach(n => on(n, "click", () => n.classList.toggle("selected")));

  function setCoverDataUrl(dataUrl) {
    coverBox.style.backgroundImage = `url(${dataUrl})`;
    coverBox.style.backgroundSize = "cover";
    coverBox.style.backgroundPosition = "center";
    const icon = byId("coverIcon");
    if (icon) icon.style.display = "none";
    current.coverDataUrl = dataUrl;
  }
  on(pickCoverBtn, "click", () => coverInput.click());
  on(coverInput, "change", () => {
    const file = coverInput.files && coverInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCoverDataUrl(reader.result);
    reader.readAsDataURL(file);
  });

  const STAR = makeStars(starsWrap, 0, v => {
    ratingValEl.textContent = `Selected: ${v}`;
    current.rating = v;
  });

  let quoteMode = "text";
  on(qTextOpt, "click", () => { quoteMode = "text"; qTextOpt.classList.add("selected"); qGalleryOpt.classList.remove("selected"); });
  on(qGalleryOpt, "click", () => { quoteMode = "image"; qGalleryOpt.classList.add("selected"); qTextOpt.classList.remove("selected"); });

  function renderQuotes() {
    if (!quotesWrap) return;
    quotesWrap.innerHTML = (current.quotes || []).map(q => {
      if (q.type === "image") {
        return `<div class="quote-item" data-id="${q.id}"><img class="quote-image" src="${q.dataUrl}" alt="Quote image"><div class="quote-actions"><span class="quote-action" data-act="del">Delete</span></div></div>`;
      } else {
        return `<div class="quote-item" data-id="${q.id}"><div class="quote-text">${escapeHTML(q.text || "")}</div><div class="quote-actions"><span class="quote-action" data-act="del">Delete</span></div></div>`;
      }
    }).join("");
    $$(".quote-item .quote-action", quotesWrap).forEach(btn => {
      on(btn, "click", () => {
        const wrap = btn.closest(".quote-item");
        const id = wrap.getAttribute("data-id");
        current.quotes = (current.quotes || []).filter(q => q.id !== id);
        renderQuotes();
      });
    });
  }

  on(addQuoteBtn, "click", () => {
    if (quoteMode === "text") {
      const txt = (quoteTextEl.value || "").trim();
      if (!txt) return;
      current.quotes.push({ id: uid(), type: "text", text: txt });
      quoteTextEl.value = "";
      renderQuotes();
    } else {
      const input = document.createElement("input");
      input.type = "file"; input.accept = "image/*";
      on(input, "change", () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const fr = new FileReader();
        fr.onload = () => {
          current.quotes.push({ id: uid(), type: "image", dataUrl: fr.result });
          renderQuotes();
        };
        fr.readAsDataURL(file);
      });
      input.click();
    }
  });

  on(uploadFileBtn, "click", () => fileInput.click());

  let current = DEFAULT_BOOK();
  const currentId = qParam("id");
  if (currentId) {
    const found = loadBooks().find(b => b.id === currentId);
    if (found) current = Object.assign(DEFAULT_BOOK(), found);
  }

  titleEl.value = current.title || "";
  authorEl.value = current.author || "";
  statusEl.value = current.status || "reading";
  STAR.value = current.rating || 0;
  ratingValEl.textContent = `Selected: ${current.rating || 0}`;
  reviewEl.value = current.review || "";
  notesEl.value = current.notes || "";
  if (current.coverDataUrl) setCoverDataUrl(current.coverDataUrl);
  setSelected(genresBox, current.genres);
  setSelected(moodsBox, current.moods);
  setSelected(tropesBox, current.tropes);
  renderQuotes();

  if (current.fileId) fileNameEl.textContent = `${current.fileId} (${current.fileType || "file"})`;

  on(fileInput, "change", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const type = ext(file.name) === "pdf" ? "pdf" : (ext(file.name) === "epub" ? "epub" : "");
    const id = `file:${current.id}`;
    await idbPutFile(id, type, file);
    current.fileId = id;
    current.fileType = type;
    fileNameEl.textContent = file.name;
    try {
      if (type === "pdf") {
        const dataUrl = await extractPdfCover(file);
        if (dataUrl) setCoverDataUrl(dataUrl);
      } else if (type === "epub") {
        const dataUrl = await extractEpubCover(file);
        if (dataUrl) setCoverDataUrl(dataUrl);
      }
    } catch { }
  });

  function collectFromForm() {
    current.title = titleEl.value.trim();
    current.author = authorEl.value.trim();
    current.status = statusEl.value;
    current.review = reviewEl.value.trim();
    current.notes = notesEl.value.trim();
    current.genres = parseSelected(genresBox);
    current.moods = parseSelected(moodsBox);
    current.tropes = parseSelected(tropesBox);
    return current;
  }

  on(btnUpdate, "click", () => {
    const b = collectFromForm();
    let books = loadBooks();
    const idx = books.findIndex(x => x.id === b.id);
    if (idx >= 0) books[idx] = b; else books.push(b);
    saveBooks(books);
    alert("Saved ✓");
    location.href = "index.html";
  });

  on(btnDelete, "click", async () => {
    if (!confirm("Delete this book?")) return;
    let books = loadBooks();
    books = books.filter(x => x.id !== current.id);
    saveBooks(books);
    if (current.fileId) { try { await idbDeleteFile(current.fileId); } catch { } }
    location.href = "index.html";
  });

  on(btnRead, "click", async () => {
    if (!current.fileId) { alert("No book file attached."); return; }
    const rec = await idbGetFile(current.fileId);
    if (!rec) { alert("Stored file not found."); return; }
    openReaderOverlay({ title: current.title || "book", type: rec.type, blob: rec.blob });
  });
}

/* ===========================
Cover-ekstraksjon
=========================== */
async function extractPdfCover(file) {
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
  const arr = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arr }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1.5 });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: ctx, viewport }).promise;
  const url = canvas.toDataURL("image/jpeg", 0.85);
  try { await pdf.destroy(); } catch { }
  return url;
}
async function extractEpubCover(file) {
  try {
    const book = ePub(file);
    const url = await book.coverUrl();
    if (url) {
      const blob = await (await fetch(url)).blob();
      return await new Promise(res => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.readAsDataURL(blob);
      });
    }
  } catch { }
  return "";
}

/* ===========================
Reader overlay (PDF/EPUB)
=========================== */
let READER = null;
function openReaderOverlay({ title, type, blob }) {
  const overlay = byId("reader");
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
  const pdfCanvas = byId("pdfCanvas");
  if (!overlay) return;

  rTitle.textContent = title || "book";
  overlay.classList.add("show");
  updateReadingStreak();

  [pdfWrap, epubWrap].forEach(el => el.style.display = "none");
  rSlider.value = 1; rSlider.min = 1; rSlider.max = 1; rCount.textContent = "1 / 1";
  if (READER && READER.cleanup) READER.cleanup();

  if (type === "pdf") {
    pdfWrap.style.display = "";
    pdfReader(blob, { pdfCanvas, rSlider, rCount, tapLeft, tapRight }).then(api => { READER = api; });
  } else if (type === "epub") {
    epubWrap.style.display = "";
    epubReader(blob, { epubWrap, rSlider, rCount, tapLeft, tapRight }).then(api => { READER = api; });
  } else {
    alert("Unsupported file type.");
    overlay.classList.remove("show");
    return;
  }

  on(rAplus, "click", () => READER && READER.zoom && READER.zoom(1));
  on(rAminus, "click", () => READER && READER.zoom && READER.zoom(-1));
  on(rClose, "click", () => {
    if (READER && READER.cleanup) READER.cleanup();
    overlay.classList.remove("show");
  });
  on(rSlider, "input", () => {
    const v = Number(rSlider.value);
    if (READER && READER.goto) READER.goto(v);
  });
}

/* ---- PDF-visning ---- */
async function pdfReader(blob, { pdfCanvas, rSlider, rCount, tapLeft, tapRight }) {
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
  const data = await blob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  let pageNo = 1;
  let scale = 1.2;

  rSlider.min = 1;
  rSlider.max = pdf.numPages;
  rSlider.value = pageNo;
  rCount.textContent = `${pageNo} / ${pdf.numPages}`;

  async function render() {
    const page = await pdf.getPage(pageNo);
    const view = page.getViewport({ scale });
    const canvas = pdfCanvas;
    const ctx = canvas.getContext("2d");
    const maxW = canvas.parentElement.clientWidth;
    const s = Math.min(scale, maxW / view.width);
    const vp = page.getViewport({ scale: s });
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    try { window.pbNotifyProgress && window.pbNotifyProgress(Math.round((pageNo / pdf.numPages) * 100)); } catch { }
    rSlider.value = pageNo;
    rCount.textContent = `${pageNo} / ${pdf.numPages}`;
  }
  function goto(n) { pageNo = clamp(n, 1, pdf.numPages); render(); }
  function zoom(delta) { scale = clamp(scale + (delta > 0 ? 0.1 : -0.1), 0.6, 2); render(); }

  on(tapLeft, "click", () => goto(pageNo - 1));
  on(tapRight, "click", () => goto(pageNo + 1));

  await render();
  return { goto, zoom, cleanup() { try { pdf.destroy(); } catch { } } };
}

/* ---- EPUB-visning ---- */
async function epubReader(blob, { epubWrap, rSlider, rCount, tapLeft, tapRight }) {
  const book = ePub(blob);
  const rendition = book.renderTo(epubWrap, { width: "100%", height: "100%" });
  await rendition.display();

  let fontPct = 100;
  rSlider.min = 1; rSlider.max = 100; rSlider.value = 1;
  rCount.textContent = `1%`;

  function goto(step) {
    const pct = clamp(step, 1, 100) / 100;
    try {
      if (book.locations && book.locations.cfiFromPercentage) {
        const cfi = book.locations.cfiFromPercentage(pct);
        rendition.display(cfi);
      } else {
        rendition.display(pct);
      }
    } catch {
      rendition.next();
    }
  }
  function zoom(delta) {
    fontPct = clamp(fontPct + (delta > 0 ? 10 : -10), 70, 180);
    rendition.themes.fontSize(fontPct + "%");
  }

  rendition.on("relocated", (loc) => {
    let pct = 0;
    try {
      if (book.locations && book.locations.percentageFromCfi) {
        pct = Math.round(book.locations.percentageFromCfi(loc.start.cfi) * 100);
      } else if (loc && loc.start && loc.start.percentage != null) {
        pct = Math.round(loc.start.percentage * 100);
      }
    } catch { }
    pct = clamp(pct, 1, 100);
    rSlider.value = pct;
    rCount.textContent = `${pct}%`;
  });
  try { window.pbNotifyProgress && window.pbNotifyProgress(pct); } catch { }

  on(tapLeft, "click", () => rendition.prev());
  on(tapRight, "click", () => rendition.next());

  return { goto, zoom, cleanup() { try { book.destroy(); } catch { } } };
}

/* ===========================
Stats (oversikt + minidiagram)
=========================== */
function initStatsPage() {
  if (location.pathname.toLowerCase().indexOf("stats.html") === -1) return;

  const wrap = $(".content-wrapper");
  const btns = $$(".time-btn");
  const calTitle = byId("calTitle");
  const calPrev = byId("calPrev");
  const calNext = byId("calNext");
  const calToday = byId("calToday");
  const calContainer = byId("calContainer");

  const books = loadBooks();
  const finished = books.filter(b => b.status === "finished");
  const reading = books.filter(b => b.status === "reading");
  const avgRating = finished.length ? (finished.reduce((a, b) => a + (+b.rating || 0), 0) / finished.length).toFixed(2) : "0.00";

  // overview
  byId("ovTotal").textContent = fmt(books.length);
  byId("ovAvg").textContent = avgRating;
  byId("ovFinished").textContent = fmt(finished.length);
  byId("ovReading").textContent = fmt(reading.length);

  // streak (samme som før)
  const st = getStreakData();
  byId("streakNum").textContent = fmt(st.current || 0);
  const cal = byId("streakCal");
  cal.innerHTML = "";
  for (let i = 27; i >= 0; i--) {
    const cell = document.createElement("div");
    cell.className = "streak-day " + (i < st.current ? "active" : "inactive");
    cal.appendChild(cell);
  }

  // ---- Calendar state
  const state = {
    mode: "monthly",         // daily | weekly | monthly | yearly
    anchor: new Date()       // hva "nå" er
  };

  // helper: events fra bøker
  function toISO(d) { return d.toISOString().slice(0, 10); }
  function parseDate(s) { if (!s) return null; const d = new Date(s); return isNaN(d) ? null : d; }
  function eventsMap() {
    const map = {};
    books.forEach(b => {
      const s = parseDate(b.startedAt), f = parseDate(b.finishedAt);
      if (s) { const k = toISO(s); (map[k] ??= []).push({ t: "start", book: b }); }
      if (f) { const k = toISO(f); (map[k] ??= []).push({ t: "finish", book: b }); }
    });
    return map;
  }
  const ev = eventsMap();

  // helper: uke-start (mandag)
  function startOfWeek(d) {
    const x = new Date(d); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); x.setHours(0, 0, 0, 0); return x;
  }
  function ymLabel(d) { return d.toLocaleString(undefined, { month: "long", year: "numeric" }); }
  function yLabel(d) { return d.getFullYear(); }

  // ---- Renders
  function renderMonthGrid(anchor) {
    const y = anchor.getFullYear(), m = anchor.getMonth();
    const first = new Date(y, m, 1);
    const startDay = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cellsTotal = Math.ceil((startDay + daysInMonth) / 7) * 7;

    calTitle.textContent = ymLabel(anchor);

    const head = `<div class="cal-head"><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div></div>`;
    const grid = [];
    const todayStr = toISO(new Date());
    for (let i = 0; i < cellsTotal; i++) {
      const dayNum = i - startDay + 1;
      const date = new Date(y, m, dayNum);
      const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
      const dStr = toISO(date);
      const dayEv = ev[dStr] || [];
      grid.push(
        `<div class="cal-day ${inMonth ? "" : "out"} ${dStr === todayStr ? "today" : ""}">
          <div class="cal-date">${date.getDate()}</div>
          <div class="cal-list">
            ${dayEv.map(e => `${e.t === "start" ? "📗" : "🏁"} ${escapeHTML(e.book.title || "Untitled")}`).join("<br>")}
          </div>
          <div class="cal-badges">
            ${dayEv.some(e => e.t === "start") ? '<span class="cal-dot start"></span>' : ""}
            ${dayEv.some(e => e.t === "finish") ? '<span class="cal-dot finish"></span>' : ""}
          </div>
        </div>`
      );
    }
    calContainer.innerHTML = `<div class="cal-shell">${head}<div class="cal-grid">${grid.join("")}</div></div>`;
  }

  function renderWeekRow(anchor) {
    const start = startOfWeek(anchor);
    calTitle.textContent = `Week ${start.toLocaleDateString()} – ${toISO(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6))}`;
    const days = [...Array(7)].map((_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    const head = `<div class="cal-head"><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div></div>`;
    const cols = days.map(d => {
      const dStr = toISO(d);
      const dayEv = ev[dStr] || [];
      return `<div class="week-col">
        <div class="week-title">${d.getDate()}.${d.getMonth() + 1}</div>
        ${dayEv.map(e => `<div>${e.t === "start" ? "📗" : "🏁"} ${escapeHTML(e.book.title || "")}</div>`).join("")}
      </div>`;
    }).join("");
    calContainer.innerHTML = `<div class="week-shell">${head}<div class="week-grid">${cols}</div></div>`;
  }

  function renderMonthBars(anchor) {
    // 12 mnd fra anchor sin måned-11 → anchor
    const months = [];
    const a = new Date(anchor);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(a.getFullYear(), a.getMonth() - i, 1);
      months.push({ key: d.toLocaleString(undefined, { month: "short" }), year: d.getFullYear(), month: d.getMonth(), count: 0 });
    }
    Object.keys(ev).forEach(k => {
      const d = new Date(k);
      const idx = months.findIndex(m => m.year === d.getFullYear() && m.month === d.getMonth());
      if (idx >= 0) months[idx].count += (ev[k].filter(e => e.t === "finish").length); // “finished per month”
    });

    calTitle.textContent = `Last 12 Months`;
    const wrap = document.createElement("div");
    wrap.className = "small-bars";
    calContainer.innerHTML = "";
    calContainer.appendChild(wrap);
    drawMiniBars(wrap, months.map(m => m.count));
    // legg labels under
    const labels = document.createElement("div");
    labels.style.cssText = "display:grid;grid-template-columns:repeat(12,1fr);gap:6px;margin-top:6px;font-size:11px;color:var(--text-light);";
    labels.innerHTML = months.map(m => `<div style="text-align:center">${m.key}</div>`).join("");
    calContainer.appendChild(labels);
  }

  function renderYearBars(anchor) {
    const years = [];
    const y0 = anchor.getFullYear();
    for (let i = 4; i >= 0; i--) {
      years.push({ y: y0 - i, count: 0 });
    }
    Object.keys(ev).forEach(k => {
      const y = new Date(k).getFullYear();
      const it = years.find(r => r.y === y); if (it) it.count += ev[k].filter(e => e.t === "finish").length;
    });
    calTitle.textContent = `By Year`;
    const wrap = document.createElement("div");
    wrap.className = "small-bars";
    calContainer.innerHTML = "";
    calContainer.appendChild(wrap);
    drawMiniBars(wrap, years.map(r => r.count));
    const labels = document.createElement("div");
    labels.style.cssText = "display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:6px;font-size:11px;color:var(--text-light);";
    labels.innerHTML = years.map(r => `<div style="text-align:center">${r.y}</div>`).join("");
    calContainer.appendChild(labels);
  }

  function renderCalendar() {
    if (state.mode === "daily") return renderMonthGrid(state.anchor);
    if (state.mode === "weekly") return renderWeekRow(state.anchor);
    if (state.mode === "monthly") return renderMonthBars(state.anchor);
    if (state.mode === "yearly") return renderYearBars(state.anchor);
  }

  // filter buttons
  btns.forEach(b => {
    b.addEventListener("click", () => {
      btns.forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      state.mode = b.getAttribute("data-mode");
      renderCalendar();
    });
  });

  // nav
  calPrev.addEventListener("click", () => {
    if (state.mode === "daily") state.anchor.setMonth(state.anchor.getMonth() - 1);
    if (state.mode === "weekly") state.anchor.setDate(state.anchor.getDate() - 7);
    if (state.mode === "monthly") state.anchor.setMonth(state.anchor.getMonth() - 12);
    if (state.mode === "yearly") state.anchor.setFullYear(state.anchor.getFullYear() - 1);
    renderCalendar();
  });
  calNext.addEventListener("click", () => {
    if (state.mode === "daily") state.anchor.setMonth(state.anchor.getMonth() + 1);
    if (state.mode === "weekly") state.anchor.setDate(state.anchor.getDate() + 7);
    if (state.mode === "monthly") state.anchor.setMonth(state.anchor.getMonth() + 12);
    if (state.mode === "yearly") state.anchor.setFullYear(state.anchor.getFullYear() + 1);
    renderCalendar();
  });
  calToday.addEventListener("click", () => { state.anchor = new Date(); renderCalendar(); });

  // ---- Top lists (authors/genres/moods)
  function renderTopList(targetId, entries, labelKey = "name") {
    const el = byId(targetId); el.innerHTML = "";
    const top = entries.slice(0, 8);
    const max = Math.max(1, ...top.map(x => x.count));
    el.innerHTML = top.map(({ name, count }) =>
      `<div class="author-item">
         <div class="author-name">${escapeHTML(name)}</div>
         <div class="author-bar"><div class="author-fill" style="width:${(count / max) * 100}%"></div></div>
         <div class="author-count">${count}</div>
       </div>`).join("");
  }

  const authorCount = {};
  books.forEach(b => {
    const a = (b.author || "").trim() || "Unknown";
    authorCount[a] = (authorCount[a] || 0) + 1;
  });
  const authors = Object.entries(authorCount).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  renderTopList("authorsList", authors);

  const genreCount = {};
  books.forEach(b => (b.genres || []).forEach(g => genreCount[g] = (genreCount[g] || 0) + 1));
  const genres = Object.entries(genreCount).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  renderTopList("genresList", genres);

  const moodCount = {};
  books.forEach(b => (b.moods || []).forEach(m => moodCount[m] = (moodCount[m] || 0) + 1));
  const moods = Object.entries(moodCount).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  renderTopList("moodsList", moods);

  // initial draw
  renderCalendar();
}


/* ===========================
Innstillinger
=========================== */
function initSettingsPage() {
  if (location.pathname.toLowerCase().indexOf("settings.html") === -1) return;
  const themeSelect = byId("theme-select");
  const previews = $$(".theme-preview");
  const exportBtn = byId("exportDataBtn");
  const importBtn = byId("importDataBtn");
  const backupBtn = byId("backupDataBtn");
  const resetBtn = byId("resetDataBtn");
  const saveGoals = byId("saveGoalsBtn");
  const yGoal = byId("yearly-goal");
  const dGoal = byId("daily-goal");

  const goals = getGoals();
  if (yGoal) yGoal.value = goals.yearly || "";
  if (dGoal) dGoal.value = goals.daily || "";
  on(saveGoals, "click", () => {
    const g = { yearly: Number(yGoal.value || 0) || 0, daily: Number(dGoal.value || 0) || 0 };
    setGoals(g);
    alert("Goals saved ✓");
  });

  function highlight(theme) { previews.forEach(p => p.classList.toggle("active", p.getAttribute("data-theme") === theme)); }
  const curTheme = getTheme(); highlight(curTheme);
  on(themeSelect, "change", () => { setTheme(themeSelect.value === "default" ? "default" : themeSelect.value); highlight(getTheme()); });
  previews.forEach(p => {
    on(p, "click", () => {
      const t = p.getAttribute("data-theme");
      setTheme(t === "default" ? "default" : t);
      if (themeSelect) themeSelect.value = t === "default" ? "default" : t;
      highlight(t);
    });
  });

  on(exportBtn, "click", () => {
    const data = { books: loadBooks(), groups: getGroups(), goals: getGoals(), theme: getTheme(), streak: getStreakData() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pagebud-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  on(importBtn, "click", () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "application/json";
    on(input, "change", async () => {
      const f = input.files && input.files[0];
      if (!f) return;
      try {
        const text = await f.text();
        const data = JSON.parse(text);
        if (Array.isArray(data.books)) saveBooks(data.books);
        if (Array.isArray(data.groups)) setGroups(data.groups);
        if (data.goals && typeof data.goals === "object") setGoals(data.goals);
        if (data.theme) setTheme(data.theme);
        if (data.streak) setStreakData(data.streak);
        alert("Imported ✓");
        location.reload();
      } catch {
        alert("Import failed (invalid file).");
      }
    });
    input.click();
  });

  on(backupBtn, "click", () => exportBtn.click());

  on(resetBtn, "click", async () => {
    if (!confirm("Reset ALL data? This cannot be undone.")) return;
    localStorage.removeItem(LS_BOOKS_KEY);
    localStorage.removeItem(LS_GROUPS_KEY);
    localStorage.removeItem(LS_GOALS_KEY);
    localStorage.removeItem(LS_STREAK_KEY);
    try {
      const db = await idbOpen();
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).clear();
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
    } catch { }
    alert("Data reset ✓");
    location.reload();
  });
}

/* ===========================
Buddy Read
=========================== */
function initBuddyReadPage() {
  if (location.pathname.toLowerCase().indexOf("buddy-read.html") === -1) return;

  const groupName = byId("group-name");
  const groupBook = byId("group-book");
  const groupSched = byId("group-schedule");
  const createBtn = byId("create-btn");
  const refreshBtn = byId("refresh-btn");

  const listWrap = byId("groups-list");
  const emptyGroups = byId("empty-groups");

  const detail = byId("group-detail");
  const backToList = byId("back-to-list");
  const delGroupBtn = byId("delete-group");

  const dName = byId("detail-name");
  const dMembers = byId("detail-members");
  const dBookTitle = byId("detail-book-title");
  const dBookAuthor = byId("detail-book-author");
  const dProgress = byId("detail-progress");
  const dProgText = byId("detail-progress-text");

  const btnTogether = byId("btnTogether");
  const btnSync = byId("btnSync");
  const startSession = byId("start-session");
  const onlineCount = byId("online-count");

  const chatMessages = byId("chat-messages");
  const chatInput = byId("chat-input");
  const sendBtn = byId("send-btn");

  const books = loadBooks();
  if (groupBook) {
    groupBook.innerHTML = `<option value="">Choose a book from your library</option>` + books.map(b => `<option value="${b.id}">${escapeHTML(b.title || "Untitled")} — ${escapeHTML(b.author || "")}</option>`).join("");
  }

  function renderList() {
    const groups = getGroups();
    if (!groups.length) {
      listWrap.innerHTML = "";
      emptyGroups.style.display = "";
      detail.style.display = "none";
      return;
    }
    emptyGroups.style.display = "none";
    listWrap.innerHTML = groups.map(g => {
      const book = books.find(b => b.id === g.bookId);
      const title = book ? escapeHTML(book.title) : "Unknown book";
      return `<div class="card" data-id="${g.id}"><div style="display:flex;align-items:center;justify-content:space-between"><div><div style="font-weight:800">${escapeHTML(g.name)}</div><div style="color:#6b6b6b;font-size:.9rem">${title}</div></div><div style="width:120px"><div class="progress-bar"><div class="progress-fill" style="width:${g.progress || 0}%"></div></div><div style="color:#6b6b6b;font-size:.8rem;text-align:right">${g.progress || 0}%</div></div></div></div>`;
    }).join("");
    $$(".card[data-id]", listWrap).forEach(card => {
      on(card, "click", () => {
        const id = card.getAttribute("data-id");
        openDetail(id);
      });
    });
  }

  function openDetail(id) {
    const groups = getGroups();
    const g = groups.find(x => x.id === id);
    if (!g) return;

    dName.textContent = g.name;
    const book = loadBooks().find(b => b.id === g.bookId);
    dBookTitle.textContent = book ? (book.title || "Untitled") : "Unknown";
    dBookAuthor.textContent = book ? (book.author || "") : "";
    dProgress.style.width = `${g.progress || 0}%`;
    dProgText.textContent = `Group progress: ${g.progress || 0}%`;

    dMembers.innerHTML = `<div style="font-size:.9rem;color:#6b6b6b">Members: You</div>`;
    onlineCount.textContent = `1 online`;

    detail.dataset.id = g.id;
    detail.style.display = "";
    renderChat(g.id);
  }

  function renderChat(groupId) {
    const msgs = getChat(groupId);
    chatMessages.innerHTML = msgs.map(m => {
      const me = true; // alt er «meg» lokalt – utvid når du får backend
      const reacts = Object.entries(m.reacts || {}).map(([emo, c]) => `<span class="react" title="${c}">${emo} ${c}</span>`).join("");
      return `<div class="msg ${me ? "me" : "other"}" data-id="${m.id}">
        <div>${escapeHTML(m.text)}</div>
        <div class="reactions">${reacts}</div>
        <div class="time">${new Date(m.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
      </div>`;
    }).join("");
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  const emoBtn = byId("emoji-btn");
  const picker = byId("emoji-picker");
  const EMOJIS = ["👍", "❤️", "🔥", "😂", "👏", "😮", "😢", "🤯", "🫶", "🎉", "✅", "⭐️"];
  if (picker) picker.innerHTML = EMOJIS.map(e => `<span class="e">${e}</span>`).join("");

  on(emoBtn, "click", () => {
    picker.style.display = picker.style.display === "grid" ? "none" : "grid";
  });

  picker?.addEventListener("click", (e) => {
    const el = e.target.closest(".e"); if (!el) return;
    const gid = detail.dataset.id; if (!gid) return;
    const msgs = getChat(gid); if (!msgs.length) return;
    const last = msgs[msgs.length - 1];
    last.reacts = last.reacts || {};
    const emo = el.textContent;
    last.reacts[emo] = (last.reacts[emo] || 0) + 1;
    setChat(gid, msgs);
    picker.style.display = "none";
    renderChat(gid);
  });



  on(sendBtn, "click", () => {
    const gid = detail.dataset.id;
    if (!gid) return;
    const txt = (chatInput.value || "").trim();
    if (!txt) return;
    const msgs = getChat(gid);
    msgs.push({ id: uid(), t: Date.now(), text: txt, reacts: {} });
    setChat(gid, msgs);
    chatInput.value = "";
    renderChat(gid);
  });


  on(createBtn, "click", () => {
    const name = (groupName.value || "").trim();
    const bookId = groupBook.value;
    const schedule = (groupSched.value || "").trim();
    if (!name || !bookId) { alert("Add a group name and choose a book."); return; }
    const groups = getGroups();
    groups.push({ id: uid(), name, bookId, schedule, progress: 0 });
    setGroups(groups);
    groupName.value = ""; groupBook.value = ""; groupSched.value = "";
    renderList();
  });

  on(refreshBtn, "click", renderList);
  on(backToList, "click", () => { detail.style.display = "none"; });
  on(delGroupBtn, "click", () => {
    const id = detail.dataset.id;
    if (!id) return;
    if (!confirm("Delete this group?")) return;
    const groups = getGroups().filter(g => g.id !== id);
    setGroups(groups);
    detail.style.display = "none";
    renderList();
  });

  on(btnTogether, "click", () => { btnTogether.classList.add("active"); btnSync.classList.remove("active"); });
  on(btnSync, "click", () => { btnSync.classList.add("active"); btnTogether.classList.remove("active"); });

  on(startSession, "click", async () => {
    const id = detail.dataset.id;
    if (!id) { alert("Open a group first."); return; }
    const groups = getGroups();
    const g = groups.find(x => x.id === id);
    if (!g) { alert("Group not found."); return; }
    const book = loadBooks().find(b => b.id === g.bookId);
    if (!book || !book.fileId) { alert("This group’s book has no file attached."); return; }
    const rec = await idbGetFile(book.fileId);
    if (!rec) { alert("Stored file not found."); return; }
    openReaderOverlay({ title: book.title, type: rec.type, blob: rec.blob });
  });

  renderList();
}

/* ===========================
Bootstrap
=========================== */
document.addEventListener("DOMContentLoaded", () => {
  initLibraryPage();
  initAddEditPage();
  initStatsPage();
  initSettingsPage();
  initBuddyReadPage();
});
