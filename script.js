"use strict";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const db = (window.fb && fb.db)
  ? fb.db
  : (window.firebase && firebase.firestore ? firebase.firestore() : null);

let CURRENT_USER = null; // settes når vi har auth

const phCover =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600">
       <rect width="100%" height="100%" rx="12" fill="#e5e7eb"/>
       <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
             font-size="22" fill="#9aa3af" font-family="system-ui,-apple-system,Segoe UI,Roboto">No cover</text>
     </svg>`
  );

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

function cardHTML(doc) {
  const d = doc.data();
  const id = doc.id;

  const cover = d.coverUrl || d.coverDataUrl || phCover;
  const title = d.title || "Untitled";
  const author = d.author || "";

  const rating = Number(d.rating || 0);
  const spice = Number(d.spice || 0);
  const status = (d.status || "").toLowerCase();
  const favorite = !!d.favorite;
  const format = (d.format || "").toLowerCase();

  const hasFile = !!(
    d.fileUrl || d.pdfUrl || d.epubUrl || d.storagePath || d.filePath || d.hasFile
  );

  // NEW: mark rated state and compute compact label (e.g., 4.5)
  const ratingLabel = rating > 0
    ? (Number.isInteger(rating) ? String(rating) : String(Math.round(rating * 10) / 10))
    : "";

  const attrs = `data-id="${id}" data-status="${status}" data-fav="${favorite ? 1 : 0}" data-format="${format}" data-rated="${rating > 0 ? 1 : 0}"`;

  return `
    <article class="book-card" ${attrs}>
      <div class="thumb-wrap">
        <img class="thumb" src="${cover}" alt="Cover for ${escapeHtml(title)}">

        ${rating > 0 ? `
        <span class="rated-badge" title="Rated ${ratingLabel}">
          <img class="star" src="icons/yellow-star.svg" alt="" aria-hidden="true">
          <span class="val">${ratingLabel}</span>
        </span>` : ``}

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

function applyVisibility(card) {
  const hide = card.classList.contains("filter-hide-chip") ||
    card.classList.contains("filter-hide-text");
  card.style.display = hide ? "none" : "";
}

async function loadAndRenderLibrary(user) {
  const grid = $("#books-grid");
  const empty = $("#empty-state");
  if (!db || !user || !grid) return;

  const snap = await db.collection("users").doc(user.uid).collection("books").get();

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

  grid.addEventListener("click", async (e) => {
    const card = e.target.closest(".book-card");

    // ---- Multi-select toggle (the only click handler for cards while in mode) ----
    if (MS_IN_MODE && card) {
      e.preventDefault();
      e.stopPropagation();
      MS_toggleCard(card);
      return;
    }

    // ---- Normal actions ----
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

  // Long-press to enter multi-select
  MS_attachLongPress(grid);

  applyCurrentFilter();
}

function initSearch() {
  const input = $("#search-input");
  const grid = $("#books-grid");
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
  const grid = $("#books-grid");
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
      case "ebook": if (fmt !== "ebook") card.classList.add("filter-hide-chip"); break;
      case "paperback": if (fmt !== "paperback") card.classList.add("filter-hide-chip"); break;
      case "hardcover": if (fmt !== "hardcover") card.classList.add("filter-hide-chip"); break;
      case "audiobook": if (fmt !== "audiobook") card.classList.add("filter-hide-chip"); break;
      default: break;
    }

    applyVisibility(card);
  });
}

function initViewToggle() {
  const grid = document.getElementById("books-grid");
  const btnGrid = document.getElementById("viewGrid");
  const btnList = document.getElementById("viewList");
  if (!grid || !btnGrid || !btnList) {
    console.warn("Grid/List toggle not initialized – missing elements.");
    return;
  }

  function apply(mode) {
    grid.classList.toggle("list-view", mode === "list");
    btnGrid.classList.toggle("active", mode === "grid");
    btnList.classList.toggle("active", mode === "list");
    localStorage.setItem("pb:view", mode);
  }

  btnGrid.addEventListener("click", () => apply("grid"));
  btnList.addEventListener("click", () => apply("list"));

  const mode = localStorage.getItem("pb:view") || "grid";
  apply(mode);
}

document.addEventListener("DOMContentLoaded", () => {
  initViewToggle();
  initSearch();
  initFilterChips();

  if (typeof requireAuth === "function") {
    requireAuth(user => {
      CURRENT_USER = user;
      loadAndRenderLibrary(user);
      window.startSocialFeedPreview?.(); // Initialize the friends feed preview
    });
  } else {
    const tryNow = setInterval(() => {
      const u = (firebase?.auth?.().currentUser) || (fb?.auth?.currentUser);
      if (u) { clearInterval(tryNow); CURRENT_USER = u; loadAndRenderLibrary(u); }
    }, 300);
  }
});

document.querySelectorAll("#langToggle [data-lang]").forEach(btn => {
  btn.addEventListener("click", () => {
    const lang = btn.getAttribute("data-lang");
    window.PB_I18N?.setLang?.(lang);
    document.dispatchEvent(new CustomEvent("pb:lang:update"));
    alert("Language switched to " + lang);
  });
});

/* =========================================================
   Multi-select (long-press)
========================================================= */

let MS_IN_MODE = false;
const MS_SELECTED = new Set();

let MS_bar = null, MS_countEl = null, MS_cancelBtn = null, MS_deleteBtn = null;

function MS_getId(card) {
  return card?.dataset?.id || null;
}

function MS_ensureBar() {
  if (MS_bar) return MS_bar;
  MS_bar = document.createElement("div");
  MS_bar.className = "multi-select-bar";
  MS_bar.innerHTML = `
    <button class="btn btn-secondary" id="msCancel" type="button">Cancel</button>
    <div class="select-count" aria-live="polite"><span id="msCount">0</span> selected</div>
    <button class="btn btn-danger" id="msDelete" type="button">Delete</button>
  `;
  document.body.appendChild(MS_bar);
  MS_countEl = $("#msCount", MS_bar);
  MS_cancelBtn = $("#msCancel", MS_bar);
  MS_deleteBtn = $("#msDelete", MS_bar);

  MS_cancelBtn.addEventListener("click", MS_exitMode);
  MS_deleteBtn.addEventListener("click", MS_onDelete);
  return MS_bar;
}

function MS_updateBar() {
  MS_ensureBar();
  MS_countEl.textContent = String(MS_SELECTED.size);
  MS_bar.classList.toggle("show", MS_IN_MODE);
  MS_deleteBtn.disabled = MS_SELECTED.size === 0;
}

function MS_selectCard(card, on) {
  const id = MS_getId(card);
  if (!id) return;
  if (on) {
    MS_SELECTED.add(id);
    card.classList.add("selected");
  } else {
    MS_SELECTED.delete(id);
    card.classList.remove("selected");
  }
  MS_updateBar();
}

function MS_toggleCard(card) {
  const id = MS_getId(card);
  if (!id) return;
  MS_selectCard(card, !MS_SELECTED.has(id));
}

function MS_enterMode(initialCard) {
  if (MS_IN_MODE) return;
  MS_IN_MODE = true;
  document.body.classList.add("multi-select-mode");
  MS_ensureBar();
  MS_bar.classList.add("show");

  if (initialCard) MS_selectCard(initialCard, true);

  document.addEventListener("keydown", MS_onKeyDown);

  MS_updateBar();
}

function MS_exitMode() {
  if (!MS_IN_MODE) return;
  MS_IN_MODE = false;
  document.body.classList.remove("multi-select-mode");
  MS_bar?.classList.remove("show");
  MS_SELECTED.clear();
  $$(".book-card").forEach(c => c.classList.remove("selected"));

  document.removeEventListener("keydown", MS_onKeyDown);
  MS_updateBar();
}

function MS_onKeyDown(e) { if (e.key === "Escape") MS_exitMode(); }

// ✅ OPPDATERT: ruter via PBSync.deleteBook
async function MS_onDelete() {
  if (!MS_SELECTED.size || !db || !CURRENT_USER) return;
  const ids = Array.from(MS_SELECTED);

  const ok = confirm(`Delete ${ids.length} selected book(s)?`);
  if (!ok) return;

  try {
    for (const id of ids) {
      if (window.PBSync?.deleteBook) {
        await window.PBSync.deleteBook(id);           // ✅ riktig vei
      } else {
        await db.collection("users").doc(CURRENT_USER.uid).collection("books").doc(id).delete();
      }

      const grid = $("#books-grid");
      if (grid) {
        const node = grid.querySelector(`.book-card[data-id="${id}"]`);
        if (node) node.remove();
      }
    }

    MS_exitMode();
    window.toast?.("Deleted");
  } catch (err) {
    console.error("Bulk delete failed:", err);
    alert("Failed to delete some items. Please try again.");
  }
}

function MS_attachLongPress(container) {
  const LONG_MS = 450;
  const MOVE_CANCEL = 10;
  let timer = null, startX = 0, startY = 0, pressedCard = null;

  function clearTimer() {
    if (timer) { clearTimeout(timer); timer = null; }
    pressedCard = null;
  }

  container.addEventListener("pointerdown", (e) => {
    const card = e.target.closest(".book-card");
    if (!card) return;

    if (MS_IN_MODE) return;

    pressedCard = card;
    startX = e.clientX; startY = e.clientY;

    timer = setTimeout(() => {
      MS_enterMode(pressedCard);
      clearTimer();
    }, LONG_MS);
  });

  container.addEventListener("pointermove", (e) => {
    if (!timer) return;
    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);
    if (dx > MOVE_CANCEL || dy > MOVE_CANCEL) clearTimer();
  });

  ["pointerup", "pointercancel", "pointerleave"].forEach(type => {
    container.addEventListener(type, clearTimer);
  });

  container.addEventListener("contextmenu", (e) => {
    const card = e.target.closest(".book-card");
    if (!card) return;
    if (!MS_IN_MODE) {
      e.preventDefault();
      MS_enterMode(card);
    }
  });
}
