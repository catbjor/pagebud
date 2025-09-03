// edit-page.js — Populate chips (already working), and FIX DELETE:
// Delete book from Firestore for real, then hard-refresh Home.

(function () {
  "use strict";

  // ---------- Helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function parseMultiInitial(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try { const j = JSON.parse(val); if (Array.isArray(j)) return j; } catch { }
    return String(val).split(",").map(s => s.trim()).filter(Boolean);
  }

  function initialOf(form, name, multi = false) {
    const inp = form.querySelector(`input[name="${name}"]`);
    if (inp && typeof inp.value === "string" && inp.value.length) {
      return multi ? parseMultiInitial(inp.value) : inp.value;
    }
    const B = window.PB_CURRENT_BOOK || window.EDIT_BOOK || null;
    if (B && name in B) return multi ? parseMultiInitial(B[name]) : B[name];
    return multi ? [] : "";
  }

  function ensureHidden(form, name) {
    let el = form.querySelector(`input[name="${name}"]`);
    if (!el) {
      el = document.createElement("input");
      el.type = "hidden";
      el.name = name;
      form.appendChild(el);
    }
    return el;
  }

  // ---------- Chips (unchanged behavior) ----------
  function buildMultiChips(container, items, initialArr, onChange) {
    if (!container) return;
    container.innerHTML = "";
    const selected = new Set((initialArr || []).map(String));

    items.forEach(label => {
      const val = String(label);
      const chip = document.createElement("span");
      chip.className = "category";
      chip.dataset.val = val;
      chip.textContent = label;
      if (selected.has(val)) chip.classList.add("active");
      container.appendChild(chip);
    });

    function commit() {
      const picked = $$(".category.active", container).map(c => c.dataset.val);
      onChange(picked);
    }

    container.addEventListener("click", (e) => {
      const chip = e.target.closest(".category");
      if (!chip) return;
      chip.classList.toggle("active");
      commit();
    });

    container.addEventListener("keydown", (e) => {
      if (e.key !== " " && e.key !== "Enter") return;
      const chip = e.target.closest(".category");
      if (!chip) return;
      e.preventDefault();
      chip.classList.toggle("active");
      commit();
    });

    commit();
  }

  function wireSingleSelect(container, initialVal, onChange) {
    if (!container) return;
    const chips = $$(".category", container);
    if (!chips.length) return;

    let foundInit = false;
    chips.forEach(chip => {
      const val = chip.dataset.val || chip.textContent.trim();
      if (!foundInit && initialVal && String(val) === String(initialVal)) {
        chip.classList.add("active");
        foundInit = true;
      } else {
        chip.classList.remove("active");
      }
    });

    function commit() {
      const active = $(".category.active", container);
      const val = active ? (active.dataset.val || active.textContent.trim()) : "";
      onChange(val);
    }

    function setActive(chip) {
      chips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      commit();
    }

    container.addEventListener("click", (e) => {
      const chip = e.target.closest(".category");
      if (!chip) return;
      setActive(chip);
    });

    container.addEventListener("keydown", (e) => {
      if (e.key !== " " && e.key !== "Enter") return;
      const chip = e.target.closest(".category");
      if (!chip) return;
      e.preventDefault();
      setActive(chip);
    });

    commit();
  }

  // ---------- Real Firestore delete ----------
  async function deleteBookById(id) {
    // Prefer a shared app API if present
    if (window.PB_API?.deleteBook) {
      await window.PB_API.deleteBook(id);
      return true;
    }

    // Fallback to Firestore compat (you load firebase-*-compat)
    const app = firebase.app();
    const db = firebase.firestore();
    const auth = firebase.auth ? firebase.auth() : null;
    const user = auth ? auth.currentUser : null;

    // Helper: delete if doc exists
    const tryDeleteRef = async (ref) => {
      const snap = await ref.get();
      if (snap.exists) {
        await ref.delete();
        return true;
      }
      return false;
    };

    // Try user-scoped first: users/{uid}/books/{id}
    if (user && user.uid) {
      const userRef = db.collection("users").doc(user.uid).collection("books").doc(id);
      if (await tryDeleteRef(userRef)) return true;
    }

    // Try common top-level fallbacks
    const candidates = ["books", "library", "book"];
    for (const col of candidates) {
      const ref = db.collection(col).doc(id);
      if (await tryDeleteRef(ref)) return true;
    }

    // If we still didn't find it, throw so caller can decide next step
    throw new Error("Document not found in expected collections");
  }

  function goHomeFresh() {
    window.location.replace(`index.html?refresh=${Date.now()}`);
  }

  function wireDeleteButton() {
    const btn = document.getElementById("deleteBtn");
    if (!btn || btn.dataset.wired === "1") return;
    btn.dataset.wired = "1";

    btn.addEventListener("click", async (e) => {
      // Stop any other delete.js handler from racing
      e.preventDefault();
      e.stopImmediatePropagation();

      if (btn.disabled) return;
      btn.disabled = true;

      // Find id from data-id, form dataset or URL ?id=
      const form = document.getElementById("bookForm") || document.querySelector("form");
      const id =
        btn.dataset.id ||
        (form && (form.dataset.id || form.dataset.bookId)) ||
        new URLSearchParams(location.search).get("id");

      if (!id) {
        console.warn("Delete pressed but no book id found. Redirecting.");
        goHomeFresh();
        return;
      }

      try {
        await deleteBookById(id);
        // Optionally show a lightweight toast if your global showToast exists
        try { window.showToast?.("Book deleted"); } catch { }
        goHomeFresh();
      } catch (err) {
        console.error("Delete failed:", err);
        // Last resort: redirect anyway so Home can reconcile
        goHomeFresh();
      }
    });
  }

  // ---------- Boot ----------
  function boot() {
    const form = $("#bookForm") || $("form");
    if (!form) return;

    // Hidden inputs kept in sync
    const inpGenres = ensureHidden(form, "genres");
    const inpMoods = ensureHidden(form, "moods");
    const inpTropes = ensureHidden(form, "tropes");
    const inpStatus = ensureHidden(form, "status");
    const inpFormat = ensureHidden(form, "format");

    // Sources (chips lists)
    const CONST = window.PB_CONST || {};
    const genres = Array.isArray(CONST.GENRES) ? CONST.GENRES : [];
    const moods = Array.isArray(CONST.MOODS) ? CONST.MOODS : [];
    const tropes = Array.isArray(CONST.TROPES) ? CONST.TROPES : [];

    // Containers
    const genresBox = $("#genres");
    const moodsBox = $("#moods");
    const tropesBox = $("#tropes");
    const statusBox = $("#statusChips");
    const formatBox = $("#formatChips");

    // Initial values
    const gInitial = initialOf(form, "genres", true);
    const mInitial = initialOf(form, "moods", true);
    const tInitial = initialOf(form, "tropes", true);
    const sInitial = initialOf(form, "status", false);
    const fInitial = initialOf(form, "format", false);

    // Build multi-selects
    buildMultiChips(genresBox, genres, gInitial, (vals) => {
      try { inpGenres.value = JSON.stringify(vals); } catch { inpGenres.value = "[]"; }
    });
    buildMultiChips(moodsBox, moods, mInitial, (vals) => {
      try { inpMoods.value = JSON.stringify(vals); } catch { inpMoods.value = "[]"; }
    });
    buildMultiChips(tropesBox, tropes, tInitial, (vals) => {
      try { inpTropes.value = JSON.stringify(vals); } catch { inpTropes.value = "[]"; }
    });

    // Single-selects
    wireSingleSelect(statusBox, sInitial, (val) => { inpStatus.value = val || ""; });
    wireSingleSelect(formatBox, fInitial, (val) => { inpFormat.value = val || ""; });

    // Ensure inputs populated even if user doesn't touch chips
    if (!inpGenres.value) inpGenres.value = JSON.stringify(gInitial);
    if (!inpMoods.value) inpMoods.value = JSON.stringify(mInitial);
    if (!inpTropes.value) inpTropes.value = JSON.stringify(tInitial);
    if (!inpStatus.value) inpStatus.value = sInitial || "";
    if (!inpFormat.value) inpFormat.value = fInitial || "";

    // Serialize arrays before submit (safety)
    form.addEventListener("submit", () => {
      try { if (Array.isArray(inpGenres.value)) inpGenres.value = JSON.stringify(inpGenres.value); } catch { }
      try { if (Array.isArray(inpMoods.value)) inpMoods.value = JSON.stringify(inpMoods.value); } catch { }
      try { if (Array.isArray(inpTropes.value)) inpTropes.value = JSON.stringify(inpTropes.value); } catch { }
    });

    // DELETE: do the real Firestore delete, then hard-refresh Home
    wireDeleteButton();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
