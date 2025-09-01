"use strict";

/* ============ Utils ============ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

// Firestore-håndtak (støtter både window.fb.db og compat)
const db = (window.fb && fb.db)
  ? fb.db
  : (window.firebase && firebase.firestore ? firebase.firestore() : null);

/* ============ View toggle (Grid/List) ============ */
function initViewToggle() {
  const grid = $("#book-grid");
  const btnGrid = $("#viewGrid");
  const btnList = $("#viewList");
  if (!grid || !btnGrid || !btnList) return;

  function setActive(mode) {
    btnGrid.classList.toggle("active", mode === "grid");
    btnList.classList.toggle("active", mode === "list");
  }
  function apply(mode) {
    grid.classList.toggle("list-view", mode === "list");
    localStorage.setItem("pb:view", mode);
    setActive(mode);
  }
  btnGrid.addEventListener("click", () => apply("grid"));
  btnList.addEventListener("click", () => apply("list"));
  apply(localStorage.getItem("pb:view") || "grid");
}

/* ============ Placeholder cover ============ */
const phCover =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600">
       <rect width="100%" height="100%" rx="12" fill="#e5e7eb"/>
       <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
             font-size="22" fill="#9aa3af" font-family="system-ui,-apple-system,Segoe UI,Roboto">No cover</text>
     </svg>`
  );

/* ============ Småhjelpere til kort ============ */
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function starsRow(val) {
  const full = Math.floor(Number(val) || 0);
  const half = (Number(val) - full) >= 0.5;
  let out = "";
  for (let i = 1; i <= 6; i++) {
    out += `<span class="${i <= full ? "card-star--on" : "card-star"}"></span>`;
  }
  // Forenklet halv-stjerne: slå på første ledige "off"
  if (half && full < 6) {
    out = out.replace(/(<span class="card-star"><\/span>)/, `<span class="card-star--on"></span>`);
  }
  return out;
}

function chilisRow(val) {
  const full = Math.floor(Number(val) || 0);
  let out = "";
  for (let i = 1; i <= 5; i++) {
    out += `<span class="${i <= full ? "card-chili--on" : "card-chili"}"></span>`;
  }
  return out;
}

/* ============ Kort (HTML) ============ */
function cardHTML(doc) {
  const d = doc.data();
  const id = doc.id;

  const cover = d.coverUrl || d.coverDataUrl || phCover;
  const title = d.title || "Untitled";
  const author = d.author || "";

  const rating = Number(d.rating || 0);
  const spice = Number(d.spice || 0);
  const status = (d.status || "").toLowerCase();         // reading|finished|tbr|dnf
  const favorite = !!d.favorite;
  const format = (d.format || "").toLowerCase();         // ebook|paperback|hardcover|audiobook

  // 👇 consider a file present if any of these fields exist
  const hasFile = !!(
    d.fileUrl || d.pdfUrl || d.epubUrl || d.storagePath || d.filePath || d.hasFile
  );

  const attrs = `data-id="${id}" data-status="${status}" data-fav="${favorite ? 1 : 0}" data-format="${format}"`;

  return `
    <article class="book-card" ${attrs}>
      <div class="thumb-wrap">
        <img class="thumb" src="${cover}" alt="Cover for ${escapeHtml(title)}">
        <button type="button" class="heart-btn ${favorite ? 'active' : ''}" data-action="fav" data-id="${id}" title="Favorite">
          <i class="fa-regular fa-heart"></i>
        </button>
      </div>

      <div class="title">${escapeHtml(title)}</div>
      <div class="author">${escapeHtml(author)}</div>

      <div class="card-ratings">
        <div class="card-row" aria-label="rating">${starsRow(rating)}</div>
        <div class="card-row" aria-label="spice">${chilisRow(spice)}</div>
      </div>

      <div class="actions">
        <button class="btn btn-secondary" data-action="open" data-id="${id}">
          <i class="fa fa-pen"></i> Edit
        </button>
        ${hasFile ? `
        <button class="btn" data-action="read" data-id="${id}">
          <i class="fa fa-book-open"></i> Read
        </button>` : ``}
      </div>
    </article>`;
}


/* ============ Synlighet (søk + chipfilter) ============ */
function applyVisibility(card) {
  const hide = card.classList.contains("filter-hide-chip") ||
    card.classList.contains("filter-hide-text");
  card.style.display = hide ? "none" : "";
}

/* ============ Laste + rendre bibliotek ============ */
async function loadAndRenderLibrary(user) {
  const grid = $("#book-grid");
  const empty = $("#empty-state");
  if (!db || !user || !grid) return;

  // Viktig: IKKE bruk orderBy her – tåler docs uten createdAt
  const snap = await db.collection("users").doc(user.uid).collection("books").get();

  // Robust klientsortering på createdAt (TS/Date/ISO), nyest først
  const docs = snap.docs.slice().sort((a, b) => {
    const da = a.data(), dbb = b.data();
    const ta = da.createdAt?.toMillis?.()
      ?? (da.createdAt ? new Date(da.createdAt).getTime() : 0);
    const tb = dbb.createdAt?.toMillis?.()
      ?? (dbb.createdAt ? new Date(dbb.createdAt).getTime() : 0);
    return tb - ta;
  });

  if (!docs.length) {
    if (empty) empty.style.display = "grid";
    grid.innerHTML = "";
    return;
  }
  if (empty) empty.style.display = "none";

  grid.innerHTML = docs.map(cardHTML).join("");

  // Klikk-actions på kort
  grid.addEventListener("click", async (e) => {
    const openBtn = e.target.closest("[data-action='open']");
    if (openBtn) {
      const id = openBtn.dataset.id;
      location.href = `edit-page.html?id=${encodeURIComponent(id)}`;
      return;
    }

    const readBtn = e.target.closest("[data-action='read']");
    if (readBtn) {
      const id = readBtn.dataset.id;
      location.href = `reader.html?id=${encodeURIComponent(id)}`;
      return;
    }

    const favBtn = e.target.closest("[data-action='fav']");
    if (favBtn) {
      const id = favBtn.dataset.id;
      try {
        const ref = db.collection("users").doc(user.uid).collection("books").doc(id);
        const snap = await ref.get();
        const d = snap.data() || {};
        const next = !d.favorite;
        await ref.set({ favorite: next, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });

        // Oppdater DOM + behold aktivt filter
        const card = favBtn.closest(".book-card");
        favBtn.classList.toggle("active", next);
        if (card) {
          card.dataset.fav = next ? "1" : "0";
          applyCurrentFilter();
        }
      } catch (err) {
        console.warn(err);
      }
    }
  });

  // Etter render: anvend gjeldende filter (f.eks. hvis bruker sto på "Favorites")
  applyCurrentFilter();
}

/* ============ Søk (tittel/forfatter) ============ */
function initSearch() {
  const input = $("#search-input");
  const grid = $("#book-grid");
  if (!input || !grid) return;

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    grid.querySelectorAll(".book-card").forEach(card => {
      const t = card.querySelector(".title")?.textContent?.toLowerCase() || "";
      const a = card.querySelector(".author")?.textContent?.toLowerCase() || "";
      const match = !q || t.includes(q) || a.includes(q);
      card.classList.toggle("filter-hide-text", !match);
      applyVisibility(card);
    });
  });
}

/* ============ Filterchips (status / favorites / ev. format) ============ */
let currentFilter = "all";

function initFilterChips() {
  const chips = $$("#filter-chips .category");
  if (!chips.length) return;

  chips.forEach(c => c.addEventListener("click", () => {
    chips.forEach(x => x.classList.toggle("active", x === c));
    currentFilter = c.dataset.filter || "all";
    applyCurrentFilter();
  }));
}

function applyCurrentFilter() {
  const grid = $("#book-grid");
  if (!grid) return;

  grid.querySelectorAll(".book-card").forEach(card => {
    card.classList.remove("filter-hide-chip");

    const st = (card.dataset.status || "");
    const fav = card.dataset.fav === "1";
    const fmt = (card.dataset.format || "");

    switch (currentFilter) {
      case "all": break;
      case "reading": if (st !== "reading") card.classList.add("filter-hide-chip"); break;
      case "finished": if (st !== "finished") card.classList.add("filter-hide-chip"); break;
      case "tbr": if (st !== "tbr") card.classList.add("filter-hide-chip"); break;
      case "dnf": if (st !== "dnf") card.classList.add("filter-hide-chip"); break;
      case "favorites": if (!fav) card.classList.add("filter-hide-chip"); break;

      // (valgfritt) format-filtre hvis du har chips for dem i UI
      case "ebook": if (fmt !== "ebook") card.classList.add("filter-hide-chip"); break;
      case "paperback": if (fmt !== "paperback") card.classList.add("filter-hide-chip"); break;
      case "hardcover": if (fmt !== "hardcover") card.classList.add("filter-hide-chip"); break;
      case "audiobook": if (fmt !== "audiobook") card.classList.add("filter-hide-chip"); break;
      default: break;
    }

    applyVisibility(card);
  });
}

/* ============ Boot ============ */
document.addEventListener("DOMContentLoaded", () => {
  initViewToggle();
  initSearch();
  initFilterChips();

  // Krever at firebase-init.js eksponerer requireAuth
  if (typeof requireAuth === "function") {
    requireAuth(user => loadAndRenderLibrary(user));
  } else {
    // Fallback – forsøk å hente currentUser etter en liten delay
    const tryNow = setInterval(() => {
      const u = (firebase?.auth?.().currentUser) || (fb?.auth?.currentUser);
      if (u) { clearInterval(tryNow); loadAndRenderLibrary(u); }
    }, 300);
  }
});
