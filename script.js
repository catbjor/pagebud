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

function createCardElement(doc) {
  const cardTemplate = document.getElementById('book-card-template');
  if (!cardTemplate) {
    throw new Error("Missing #book-card-template in HTML");
  }

  const card = cardTemplate.content.cloneNode(true).firstElementChild;
  const d = doc.data() || {};
  const id = doc.id;

  // Set data attributes for filtering
  card.dataset.id = id;
  card.dataset.status = (d.status || "").toLowerCase();
  card.dataset.fav = d.favorite ? "1" : "0";
  card.dataset.format = (d.format || "").toLowerCase();
  card.dataset.rated = (d.rating || 0) > 0 ? "1" : "0";

  // Populate content
  const cover = d.coverUrl || d.coverDataUrl || phCover;
  const title = d.title || "Untitled";

  const thumb = card.querySelector('.thumb');
  thumb.src = cover;
  thumb.alt = `Cover for ${title}`;

  card.querySelector('.title').textContent = title;
  card.querySelector('.author').textContent = d.author || "";

  // Conditional UI: Rating badge
  const rating = Number(d.rating || 0);
  if (rating > 0) {
    const ratingBadge = card.querySelector('.rated-badge');
    const ratingLabel = Number.isInteger(rating) ? String(rating) : String(Math.round(rating * 10) / 10);
    ratingBadge.title = `Rated ${ratingLabel}`;
    ratingBadge.querySelector('.val').textContent = ratingLabel;
    ratingBadge.style.display = ''; // Show the badge
  }

  // Favorite button state
  card.querySelector('.heart-btn').classList.toggle('active', !!d.favorite);
  card.querySelector('.heart-btn').dataset.id = id;

  // Star/Chili rows (using existing helper functions)
  card.querySelector('.rating-stars').innerHTML = starsRow(rating);
  card.querySelector('.spice-chilis').innerHTML = chilisRow(Number(d.spice || 0));

  // Actions: Edit button and conditional Read button
  card.querySelector('[data-action="open"]').dataset.id = id;
  const readBtn = card.querySelector('[data-action="read"]');
  const hasFile = !!(d.fileUrl || d.pdfUrl || d.epubUrl || d.storagePath || d.filePath || d.hasFile);
  if (hasFile) {
    readBtn.dataset.id = id;
    readBtn.style.display = ''; // Show the button
  }

  return card;
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

  // Add a loading state for better UX
  grid.innerHTML = '<p class="muted" style="grid-column: 1 / -1;">Loading your library...</p>';
  if (empty) empty.style.display = "none";

  try {
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

    const fragment = document.createDocumentFragment();
    docs.forEach(doc => {
      try {
        const cardElement = createCardElement(doc);
        fragment.appendChild(cardElement);
      } catch (error) {
        console.error(`Failed to create card for book ${doc.id}:`, error);
      }
    });

    grid.innerHTML = ""; // Clear loading message
    grid.appendChild(fragment);

    applyCurrentFilter();
  } catch (error) {
    console.error("Failed to load library:", error);
    grid.innerHTML = '<p class="muted" style="color:red; grid-column: 1 / -1;">Could not load your library. Please try again later.</p>';
  }
}

function initGridActions(user) {
  const grid = $("#books-grid");
  if (!grid) return;

  // The multi-select click handler is now in multi-select.js.
  // This listener will only handle normal actions.
  grid.addEventListener("click", async (e) => {
    // If multi-select is active, do nothing and let its handler take over.
    // This prevents accidental navigation when trying to select a card.
    if (window.PB_MultiSelect?.isActive?.()) {
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

  // New logic to handle filter from URL
  const urlParams = new URLSearchParams(window.location.search);
  const filterFromUrl = urlParams.get('filter');
  if (filterFromUrl) {
    const chips = $$("#filter-chips .category");
    const targetChip = chips.find(c => c.dataset.filter === filterFromUrl);
    if (targetChip) {
      chips.forEach(c => c.classList.remove('active'));
      targetChip.classList.add('active');
      currentFilter = filterFromUrl;
    }
  }

  if (typeof requireAuth === "function") {
    requireAuth(user => {
      CURRENT_USER = user;
      loadAndRenderLibrary(user);
      initGridActions(user);
      window.startSocialFeedPreview?.(); // Initialize the friends feed preview
    });
  } else {
    const tryNow = setInterval(() => {
      const u = (firebase?.auth?.().currentUser) || (fb?.auth?.currentUser);
      if (u) { clearInterval(tryNow); CURRENT_USER = u; loadAndRenderLibrary(u); initGridActions(u); }
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
