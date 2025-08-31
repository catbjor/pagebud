"use strict";

/* ===== Tiny utils ===== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const db = window.fb?.db || window.firebase?.firestore?.();

/* ===== View toggle (Grid/List) ===== */
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
    setActive(mode);
    localStorage.setItem("pb:view", mode);
  }
  btnGrid.addEventListener("click", () => apply("grid"));
  btnList.addEventListener("click", () => apply("list"));
  apply(localStorage.getItem("pb:view") || "grid");
}

/* ===== Static rating rows for cards (6 stars, 5 chilis) ===== */
function starsHTML(n = 0) {
  const filled = Math.max(0, Math.min(6, Number(n) || 0));
  let out = '<div class="card-row" aria-label="rating">';
  for (let i = 1; i <= 6; i++) {
    out += `<span class="${i <= filled ? 'card-star--on' : 'card-star'}"></span>`;
  }
  out += "</div>";
  return out;
}
function chilisHTML(n = 0) {
  const filled = Math.max(0, Math.min(5, Number(n) || 0));
  let out = '<div class="card-row" aria-label="spice">';
  for (let i = 1; i <= 5; i++) {
    out += `<span class="${i <= filled ? 'card-chili--on' : 'card-chili'}"></span>`;
  }
  out += "</div>";
}

/* Placeholder cover */
const phCover = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600">
     <rect width="100%" height="100%" rx="12" fill="#e5e7eb"/>
     <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
           font-size="22" fill="#9aa3af" font-family="system-ui,-apple-system,Segoe UI,Roboto">No cover</text>
   </svg>`
);

/* ===== Card template ===== */
function cardHTML(doc) {
  const d = doc.data(); const id = doc.id;
  const cover = d.coverDataUrl || d.coverUrl || phCover;
  const title = d.title || "Untitled";
  const author = d.author || "";
  const rating = Number(d.rating || 0);
  const spice = Number(d.spice || 0);
  const isFav = (d.status || []).includes("favorite");

  return `
    <article class="book-card" data-id="${id}">
      <div class="thumb-wrap">
        <img class="thumb" src="${cover}" alt="Cover for ${title}">
        <button type="button" class="heart-btn ${isFav ? 'active' : ''}" data-action="fav" data-id="${id}" title="Favorite">
          <i class="fa-regular fa-heart"></i>
        </button>
      </div>

      <div class="meta">
        <div class="title">${title}</div>
        <div class="author">${author}</div>

        <div class="card-ratings">
          ${starsHTML(rating)}
          ${chilisHTML(spice)}
        </div>

        <div class="actions">
          <button type="button" class="btn btn-secondary" data-action="read" data-id="${id}">
            <i class="fa-regular fa-clock"></i> Read
          </button>
          <button type="button" class="btn" data-action="edit" data-id="${id}">Edit</button>
        </div>
      </div>
    </article>
  `;
}

/* ===== Firestore helpers ===== */
async function toggleFavorite(uid, id) {
  const ref = db.collection("users").doc(uid).collection("books").doc(id);
  const snap = await ref.get(); const d = snap.data() || {};
  const has = (d.status || []).includes("favorite");
  const next = has ? (d.status || []).filter(x => x !== "favorite")
    : [...new Set([...(d.status || []), "favorite"])];
  await ref.set({ status: next }, { merge: true });
  return !has;
}

/* ===== Load + render library ===== */
async function loadAndRenderLibrary(user) {
  const grid = $("#book-grid");
  const empty = $("#empty-state");
  if (!db || !user || !grid) return;

  const qSnap = await db.collection("users").doc(user.uid)
    .collection("books").orderBy("createdAt", "desc").get();

  if (qSnap.empty) {
    empty && (empty.style.display = "grid");
    grid.innerHTML = "";
    return;
  }
  empty && (empty.style.display = "none");
  grid.innerHTML = qSnap.docs.map(cardHTML).join("");

  // Actions
  grid.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;

    if (action === "edit") {
      location.href = `edit-page.html?id=${encodeURIComponent(id)}`;
      return;
    }
    if (action === "fav") {
      try {
        const on = await toggleFavorite(user.uid, id);
        btn.classList.toggle("active", on);
      } catch (err) { console.error(err); }
      return;
    }
    if (action === "read") {
      window.PageBudTimer?.start?.({ bookId: id });
      return;
    }
  });
}

/* ===== Filter chips ===== */
function initFilterChips() {
  const grid = $("#book-grid");
  const chips = $$("#filter-chips .category");
  if (!grid || !chips.length) return;

  chips.forEach(c => c.addEventListener("click", () => {
    chips.forEach(x => x.classList.toggle("active", x === c));
    const f = c.dataset.filter;

    grid.querySelectorAll(".book-card").forEach(card => {
      if (f === "all") { card.style.display = ""; return; }

      // simple text/status check (reads author/title text in card)
      const id = card.dataset.id;
      const docEl = card; // nothing async here; filtering by dataset we add below
      // For now, show all; advanced filter requires status in DOM.
      // You can extend by embedding data-status on card.

      card.style.display = ""; // keep visible unless you decide to wire status attributes
    });
  }));
}

/* ===== Search ===== */
function initSearch() {
  const input = $("#search-input");
  const grid = $("#book-grid");
  if (!input || !grid) return;

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    grid.querySelectorAll(".book-card").forEach(card => {
      const t = card.querySelector(".title")?.textContent?.toLowerCase() || "";
      const a = card.querySelector(".author")?.textContent?.toLowerCase() || "";
      card.style.display = (!q || t.includes(q) || a.includes(q)) ? "" : "none";
    });
  });
}

/* ===== Init ===== */
(window.requireAuth || function (cb) { firebase.auth().onAuthStateChanged(u => u ? cb(u) : location.href = "auth.html"); })(async (u) => {
  initViewToggle();
  initFilterChips();
  initSearch();
  await loadAndRenderLibrary(u);
});
