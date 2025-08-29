/* =========================================================
   PageBud – app logic (library, editor, buddy, stats)
   ========================================================= */
"use strict";

/* -------------------- Utils -------------------- */
const LS_BOOKS = "pb:books";
const LS_READING_DAYS = "pb:readingDays"; // Map { "YYYY-MM-DD": true }
const nowIso = () => new Date().toISOString();
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

function loadBooks() {
  try { return JSON.parse(localStorage.getItem(LS_BOOKS) || "[]"); }
  catch { return []; }
}
function saveBooks(arr) {
  localStorage.setItem(LS_BOOKS, JSON.stringify(arr));
  document.dispatchEvent(new CustomEvent("pb:booksSyncedLocal"));
}
function getBook(id) { return loadBooks().find(b => b.id === id); }
function upsertBook(book) {
  const arr = loadBooks();
  if (!book.id) book.id = Math.random().toString(36).slice(2);
  book.lastUpdated = nowIso();
  const i = arr.findIndex(x => x.id === book.id);
  if (i >= 0) arr[i] = book; else arr.push(book);
  saveBooks(arr);
  try { PBSync?.pushOne?.(book); } catch { }
  return book.id;
}
function removeBook(id) {
  const arr = loadBooks().filter(x => x.id !== id);
  saveBooks(arr);
  try { PBSync?.pushAll?.(); } catch { }
}

/* Reading-days storage */
function loadReadingDays() {
  try { return JSON.parse(localStorage.getItem(LS_READING_DAYS) || "{}"); }
  catch { return {}; }
}
function saveReadingDays(map) {
  localStorage.setItem(LS_READING_DAYS, JSON.stringify(map));
}
function fmtDateYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function markReadToday() {
  const k = fmtDateYMD(new Date());
  const map = loadReadingDays();
  if (!map[k]) {
    map[k] = true;
    saveReadingDays(map);
    document.dispatchEvent(new CustomEvent("pb:readMarked", { detail: { date: k } }));
  }
}

/* Mini-stars for cards */
function starsHTML(rating = 0) {
  const full = Math.floor(rating);
  const half = (rating - full) >= 0.5 ? 1 : 0;
  const total = 5;
  let out = "";
  for (let i = 0; i < full; i++) out += `<span class="mini-star full">★</span>`;
  if (half) out += `<span class="mini-star half">★</span>`;
  for (let i = full + half; i < total; i++) out += `<span class="mini-star">★</span>`;
  return out;
}

/* -------------------- Library (index.html) -------------------- */
function matchesFactory(q, filter) {
  // exact logic you requested
  return function matches(b) {
    if (q) {
      const s = (b.title || "") + " " + (b.author || "");
      if (!s.toLowerCase().includes(q.toLowerCase())) return false;
    }
    if (filter === "all") return true;
    if (filter === "favorites") return ((Number(b.rating) || 0) >= 5) || (b.tags || []).includes("favorite");
    if (filter === "owned") return (b.tags || []).includes("owned");
    if (filter === "wishlist") return (b.tags || []).includes("wishlist");
    return (b.status || "") === filter;
  };
}

function renderLibrary() {
  const grid = $("#book-grid");
  const empty = $("#empty-state");
  if (!grid || !empty) return;

  const q = ($("#search-input")?.value || "").trim();
  const activeChip = $("#filter-chips .category.active");
  const filter = activeChip ? activeChip.dataset.filter : "all";

  const rows = loadBooks().filter(matchesFactory(q, filter));
  if (!rows.length) {
    empty.style.display = "block";
    grid.innerHTML = "";
    return;
  }
  empty.style.display = "none";

  grid.innerHTML = rows.map(b => `
    <div class="book-card" data-id="${b.id}">
      <img class="book-cover" src="${b.cover || 'icons/icon-192.png'}" alt="">
      <div class="book-info">
        <div class="book-title">${(b.title || 'Untitled')}</div>
        <div class="book-author">${(b.author || '')}</div>
        <div class="book-rating">${starsHTML(Number(b.rating) || 0)}</div>
      </div>
    </div>
  `).join("");

  // Always go to Edit; reading only from Add/Edit pages
  grid.querySelectorAll(".book-card").forEach(card => {
    card.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const id = card.getAttribute("data-id");
      location.href = `edit-page.html?id=${encodeURIComponent(id)}`;
    });
  });
}

function initLibraryPage() {
  const grid = $("#book-grid");
  if (!grid) return;

  $("#search-input")?.addEventListener("input", renderLibrary);
  $$("#filter-chips .category").forEach(chip => {
    chip.addEventListener("click", () => {
      $$("#filter-chips .category").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      renderLibrary();
    });
  });
  $("#add-book-btn")?.addEventListener("click", () => { location.href = "add-book.html"; });

  renderLibrary();
  document.addEventListener("pb:booksSynced", renderLibrary);
  document.addEventListener("pb:booksSyncedLocal", renderLibrary);
}

/* -------------------- Reader helpers (PDF/EPUB) -------------------- */
async function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function openPDF(dataUrl) {
  const pdfWrap = $("#pdfWrap"); const canvas = $("#pdfCanvas"); const overlay = $("#reader");
  if (!overlay || !canvas || !pdfWrap) { alert("PDF viewer not ready."); return; }
  if (!window['pdfjsLib']) { alert("PDF reader not ready."); return; }

  $("#epubWrap")?.style && ($("#epubWrap").style.display = "none");
  pdfWrap.style.display = "block";
  overlay.classList.add("show");

  const pdfjsLib = window['pdfjsLib'];
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const ctx = canvas.getContext("2d");
  let pdfDoc = null, pageNum = 1, scale = 1.25;

  function renderPage(num) {
    pdfDoc.getPage(num).then(page => {
      const vw = overlay.clientWidth;
      const vp = page.getViewport({ scale: scale });
      const ratio = vw / vp.width;
      const finalScale = scale * ratio;
      const vpf = page.getViewport({ scale: finalScale });
      canvas.height = vpf.height; canvas.width = vpf.width;
      page.render({ canvasContext: ctx, viewport: vpf });
      $("#rCount").textContent = `${num} / ${pdfDoc.numPages}`;
      $("#rSlider").max = pdfDoc.numPages;
      $("#rSlider").value = num;
    });
  }

  pdfjsLib.getDocument(dataUrl).promise.then(pdf => {
    pdfDoc = pdf; renderPage(1);
  });

  $("#rAplus")?.addEventListener("click", () => { scale += .1; renderPage(pageNum); });
  $("#rAminus")?.addEventListener("click", () => { scale = Math.max(.5, scale - .1); renderPage(pageNum); });
  $("#rSlider")?.addEventListener("input", (e) => { pageNum = Number(e.target.value) || 1; renderPage(pageNum); });
  $("#rClose")?.addEventListener("click", () => {
    overlay.classList.remove("show");
    pdfWrap.style.display = "none";
  }, { once: true });
}

/* -------------------- Editor (add/edit) -------------------- */
function wireStarRating(starsEl, valueEl, book) {
  const makeStar = (i) => `<span class="star-container" data-i="${i}" title="${i}">★</span>`;
  starsEl.innerHTML = Array.from({ length: 5 }, (_, i) => makeStar(i + 1)).join("");
  const paint = (n = 0) => $$(".star-container", starsEl).forEach((s, idx) => {
    s.style.color = (idx < n) ? "gold" : "var(--text-light)";
  });
  paint(book.rating || 0);
  valueEl.textContent = `Selected: ${book.rating || 0}`;

  starsEl.addEventListener("click", (e) => {
    const el = e.target.closest(".star-container"); if (!el) return;
    const v = Number(el.dataset.i) || 0;
    book.rating = v;
    paint(v);
    valueEl.textContent = `Selected: ${v}`;
  });
}

function wireChipBox(rootSel, field, book) {
  const root = $(rootSel); if (!root) return;
  const set = new Set(book[field] || []);
  root.addEventListener("click", (e) => {
    const opt = e.target.closest(".toggle-option"); if (!opt) return;
    const val = opt.dataset.val || opt.textContent.trim();
    if (set.has(val)) set.delete(val); else set.add(val);
    book[field] = Array.from(set);
    opt.classList.toggle("selected");
  });
  // paint
  $$(".toggle-option", root).forEach(opt => {
    const val = opt.dataset.val || opt.textContent.trim();
    if (set.has(val)) opt.classList.add("selected");
  });
}

function initEditorCommon() {
  const book = window.__currentBook;

  // Cover
  $("#pickCover")?.addEventListener("click", () => $("#coverInput").click());
  $("#coverInput")?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const url = await fileToDataURL(f);
    book.cover = url;
    $("#cover").style.backgroundImage = `url('${url}')`;
    $("#coverIcon").style.display = "none";
  });

  // Rating
  const stars = $("#stars"), ratingVal = $("#ratingVal");
  if (stars && ratingVal) wireStarRating(stars, ratingVal, book);

  // Chip-bokser
  wireChipBox("#genres", "genres", book);
  wireChipBox("#moods", "moods", book);
  wireChipBox("#tropes", "tropes", book);
  wireChipBox("#tags", "tags", book); // favorite/owned/wishlist

  // Fields
  $("#title")?.addEventListener("input", (e) => book.title = e.target.value);
  $("#author")?.addEventListener("input", (e) => book.author = e.target.value);
  $("#status")?.addEventListener("change", (e) => book.status = e.target.value);
  $("#startedAt")?.addEventListener("change", (e) => book.startedAt = e.target.value);
  $("#finishedAt")?.addEventListener("change", (e) => book.finishedAt = e.target.value);
  $("#review")?.addEventListener("input", (e) => book.review = e.target.value);
  $("#notes")?.addEventListener("input", (e) => book.notes = e.target.value);

  // Quotes (text)
  $("#addQuote")?.addEventListener("click", () => {
    const q = ($("#quoteText")?.value || "").trim();
    if (!q) return;
    book.quotes = book.quotes || [];
    book.quotes.push({ t: q, at: nowIso() });
    $("#quoteText").value = "";
    renderQuotes();
  });
  function renderQuotes() {
    const wrap = $("#quotes"); if (!wrap) return;
    const list = book.quotes || [];
    wrap.innerHTML = list.map((q, i) => `
      <div class="quote-item">
        <div class="quote-text">${q.t}</div>
        <div class="quote-actions"><span class="quote-action" data-i="${i}">Delete</span></div>
      </div>
    `).join("");
    wrap.querySelectorAll(".quote-action").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = Number(btn.dataset.i); book.quotes.splice(i, 1); renderQuotes();
      });
    });
  }
  renderQuotes();

  // File upload
  $("#upload-file-btn")?.addEventListener("click", () => $("#bookFile").click());
  $("#bookFile")?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    const dataUrl = await fileToDataURL(f);
    book.fileUrl = dataUrl; book.fileName = f.name;
    book.fileType = (ext === "pdf") ? "pdf" : (ext === "epub" ? "epub" : "");
    $("#fileName").textContent = f.name + ` (${Math.round(f.size / 1024)} KB)`;
  });

  // Buttons
  $("#update-book-btn")?.addEventListener("click", () => {
    upsertBook(book);
    try { publishActivity?.(book); } catch { }
    alert("Saved ✓");
  });
  $("#delete-book-btn")?.addEventListener("click", () => {
    if (!book.id) { alert("Not saved yet."); return; }
    if (!confirm("Delete this book?")) return;
    removeBook(book.id);
    location.href = "index.html";
  });
  $("#read-book-btn")?.addEventListener("click", () => {
    if (!book.fileUrl) { alert("No book file attached."); return; }

    // Log reading today before opening reader
    markReadToday();

    if (book.fileType === "pdf") {
      openPDF(book.fileUrl);
    } else if (book.fileType === "epub") {
      if (typeof window.initEpubReader !== "function") {
        alert("EPUB reader not ready.");
        return;
      }
      window.initEpubReader(book.fileUrl);
    } else {
      alert("Unknown file type.");
    }
  });

  $("#rClose")?.addEventListener("click", () => $("#reader")?.classList.remove("show"));
}

function initAddPage() {
  if (!document.body.classList.contains("edit-page")) return;
  const book = {
    id: null, title: "", author: "",
    status: "reading", rating: 0,
    genres: [], moods: [], tropes: [],
    tags: [], // favorite / owned / wishlist
    review: "", notes: "", quotes: [],
    cover: "", fileUrl: "", fileName: "", fileType: ""
  };
  window.__currentBook = book;
  $("#status").value = "reading";
  wireStarRating($("#stars"), $("#ratingVal"), book);
  initEditorCommon();
}

function initEditPage() {
  if (!document.body.classList.contains("edit-page")) return;
  const url = new URL(location.href);
  const id = url.searchParams.get("id");
  const book = id ? (getBook(id) || {}) : {};
  if (!book.id) { alert("Book not found; creating a new one."); book.id = null; }
  window.__currentBook = book;

  $("#title").value = book.title || "";
  $("#author").value = book.author || "";
  $("#status").value = book.status || "reading";
  $("#startedAt").value = book.startedAt || "";
  $("#finishedAt").value = book.finishedAt || "";
  $("#review").value = book.review || "";
  $("#notes").value = book.notes || "";
  if (book.cover) {
    $("#cover").style.backgroundImage = `url('${book.cover}')`;
    $("#coverIcon").style.display = "none";
  }

  // paint chips
  ["genres", "moods", "tropes", "tags"].forEach(field => {
    const root = document.getElementById(field); if (!root) return;
    const set = new Set(book[field] || []);
    $$(".toggle-option", root).forEach(opt => {
      const val = opt.dataset.val || opt.textContent.trim();
      if (set.has(val)) opt.classList.add("selected");
    });
  });

  wireStarRating($("#stars"), $("#ratingVal"), book);
  initEditorCommon();
}

/* -------------------- Buddy Read (dropdown from your books) -------------------- */
function initBuddyPage() {
  if (!$("#group-book")) return;
  const select = $("#group-book");
  const refresh = () => {
    const books = loadBooks();
    select.innerHTML = `<option value="">Select…</option>` + books.map(b =>
      `<option value="${b.id}">${(b.title || 'Untitled')} — ${(b.author || '')}</option>`
    ).join("");
  };
  refresh();
  $("#refresh-btn")?.addEventListener("click", refresh);
  $("#create-btn")?.addEventListener("click", () => {
    const name = ($("#group-name")?.value || "").trim();
    const bookId = select.value;
    if (!name || !bookId) { alert("Give the group a name and select a book."); return; }
    alert("Group created ✓ (UI demo). For real sync, wire Firestore + buddy-chat.js.");
    $("#group-name").value = ""; select.value = "";
  });
}

/* -------------------- Stats (stats.html) -------------------- */
function initStatsPage() {
  const host = $(".content-wrapper"); if (!host) return;

  const hdr = `
    <div class="stats-section">
      <div class="section-header">
        <div class="section-title"><i class="fas fa-chart-line"></i><span>Overview</span></div>
        <div class="header-actions">
          <button class="btn btn-secondary" id="btnLogToday" title="Mark read today" type="button">Read today</button>
        </div>
      </div>
      <div class="overview-grid">
        <div class="stat-card">
          <div class="stat-number" id="stTotal">0</div>
          <div class="stat-label">Books total</div>
        </div>
        <div class="stat-card rating-stat">
          <div class="stat-number" id="stAvg">–</div>
          <div class="stat-label">Avg rating</div>
        </div>
      </div>
    </div>
  `;

  const calendar = `
    <div class="stats-section">
      <div class="section-header">
        <div class="section-title"><i class="fas fa-calendar"></i><span>Reading Calendar</span></div>
        <div class="time-filter">
          <button class="time-btn active" data-range="daily" type="button">Daily</button>
          <button class="time-btn" data-range="weekly" type="button">Weekly</button>
          <button class="time-btn" data-range="monthly" type="button">Monthly</button>
          <button class="time-btn" data-range="yearly" type="button">Yearly</button>
        </div>
      </div>
      <div id="calWrap"></div>
    </div>
  `;

  host.innerHTML = hdr + calendar;

  // numbers
  function refreshOverview() {
    const books = loadBooks();
    $("#stTotal").textContent = books.length;
    const rated = books.map(b => Number(b.rating) || 0).filter(x => x > 0);
    $("#stAvg").textContent = rated.length ? (rated.reduce((a, b) => a + b, 0) / rated.length).toFixed(2) : "–";
  }

  // calendar builder
  function buildCalendar() {
    const days = loadReadingDays();
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();

    const wrap = document.createElement("div");
    wrap.className = "cal-shell";

    wrap.innerHTML = `
      <div class="cal-head">
        <div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div>
      </div>
      <div class="cal-grid" id="calGrid"></div>
    `;
    const grid = wrap.querySelector("#calGrid");

    const first = new Date(year, month, 1);
    const firstWeekday = (first.getDay() + 6) % 7; // 0=Mon
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstWeekday; i++) {
      const cell = document.createElement("div");
      cell.className = "cal-day out";
      grid.appendChild(cell);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const ymd = fmtDateYMD(date);
      const cell = document.createElement("div");
      cell.className = "cal-day";
      if (fmtDateYMD(new Date()) === ymd) cell.classList.add("today");

      cell.innerHTML = `
        <div class="cal-date">${d}</div>
        <div class="cal-list"></div>
        <div class="cal-badges"></div>
      `;
      if (days[ymd]) {
        const badge = cell.querySelector(".cal-badges");
        badge.innerHTML = `<span class="cal-dot start"></span>`;
      }

      cell.addEventListener("click", () => {
        const map = loadReadingDays();
        map[ymd] = !map[ymd];
        saveReadingDays(map);
        renderCal(); // repaint
      });

      grid.appendChild(cell);
    }

    return wrap;
  }

  function renderCal() {
    $("#calWrap").innerHTML = "";
    $("#calWrap").appendChild(buildCalendar());
  }

  $$(".time-btn", host).forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".time-btn", host).forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderCal();
    });
  });

  $("#btnLogToday")?.addEventListener("click", () => {
    const map = loadReadingDays();
    const k = fmtDateYMD(new Date());
    map[k] = true; saveReadingDays(map); renderCal();
  });

  refreshOverview();
  renderCal();
}

/* -------------------- Boot -------------------- */
document.addEventListener("DOMContentLoaded", () => {
  if ($("#book-grid")) initLibraryPage();

  if (document.body?.classList?.contains("edit-page")) {
    const hasId = new URL(location.href).searchParams.has("id");
    if (hasId) initEditPage(); else initAddPage();
  }

  if ($("#group-book")) initBuddyPage();

  if (document.body && document.title.includes("Stats")) initStatsPage();
});
