// edit-book.js — Load existing book into the form, hydrate chips, SAVE to Firestore,
// DELETE from edit (hard delete in Firestore), local-only file save (PBFileStore/LocalFiles), then home.
(function () {
  "use strict";

  // ---------- Helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function qsAny(selectors) {
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return null;
  }

  function goHomeFresh() { window.location.replace(`index.html?refresh=${Date.now()}`); }

  // Pull lists from constants (used only if a container is empty)
  function getLists() {
    const C =
      (window.PB_CONST) ||
      (window.CONSTANTS) ||
      (window.PB && {
        GENRES: window.PB.GENRES,
        MOODS: window.PB.MOODS,
        TROPES: window.PB.TROPES,
        STATUSES: window.PB.STATUSES,
        FORMATS: window.PB.FORMATS
      }) || {};

    const genres = C.GENRES || window.GENRES || [
      "Romance", "Mystery", "Thriller", "Fantasy", "Sci-Fi", "Horror", "Non-fiction", "Historical", "YA"
    ];
    const moods = C.MOODS || window.MOODS || ["Cozy", "Dark", "Funny", "Steamy", "Heartwarming", "Gritty"];
    const tropes = C.TROPES || window.TROPES || [
      "Enemies to Lovers", "Friends to Lovers", "Forced Proximity", "Found Family", "Love Triangle", "Second Chance", "Grumpy / Sunshine"
    ];
    const statuses = C.STATUSES || window.STATUSES || ["To Read", "Reading", "Finished", "DNF"];
    const formats = C.FORMATS || window.FORMATS || ["eBook", "Audiobook", "Paperback", "Hardcover"];
    return { genres, moods, tropes, statuses, formats };
  }

  function ensureHidden(form, name) {
    let el = form.querySelector(`input[name="${name}"]`);
    if (!el) { el = document.createElement("input"); el.type = "hidden"; el.name = name; form.appendChild(el); }
    return el;
  }

  function hydrateChipGroup({ container, items, multi, initial = [], onChange }) {
    if (!container) return { get: () => (multi ? [] : "") };

    let chips = $$(".category", container);
    if (chips.length === 0 && Array.isArray(items)) {
      items.forEach((label) => {
        const el = document.createElement("span");
        el.className = "category";
        el.textContent = label;
        el.dataset.value = String(label);
        container.appendChild(el);
      });
      chips = $$(".category", container);
    }

    const initialSet = new Set(Array.isArray(initial) ? initial.map(String) : [String(initial)].filter(Boolean));
    chips.forEach(ch => {
      const val = ch.dataset.value || ch.textContent.trim();
      ch.dataset.value = val;
      if (multi) ch.classList.toggle("active", initialSet.has(val));
      else ch.classList.toggle("active", initialSet.size ? initialSet.has(val) : false);
      ch.setAttribute("tabindex", "0");
      ch.setAttribute("role", "button");
    });

    function commit() {
      const picked = $$(".category.active", container).map(c => c.dataset.value || c.textContent.trim());
      onChange?.(multi ? picked : (picked[0] || ""));
    }

    function toggleChip(chip) {
      if (multi) chip.classList.toggle("active");
      else { chips.forEach(c => c.classList.remove("active")); chip.classList.add("active"); }
      commit();
    }

    container.addEventListener("click", (e) => {
      const chip = e.target.closest(".category");
      if (!chip || !container.contains(chip)) return;
      toggleChip(chip);
    });

    container.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        const chip = e.target.closest(".category");
        if (!chip || !container.contains(chip)) return;
        e.preventDefault();
        toggleChip(chip);
      }
    });

    commit();

    return {
      get() {
        const picked = $$(".category.active", container).map(c => c.dataset.value || c.textContent.trim());
        return multi ? picked : (picked[0] || "");
      }
    };
  }

  function initialOf(form, name, multi = false) {
    const inp = form.querySelector(`input[name="${name}"]`);
    if (inp && inp.value) {
      if (multi) { try { return JSON.parse(inp.value); } catch { return []; } }
      return inp.value;
    }
    const B = window.PB_CURRENT_BOOK || window.EDIT_BOOK || null;
    if (B && name in B) return B[name];
    return multi ? [] : "";
  }

  function waitForAuth() {
    return new Promise((resolve) => {
      const u = firebase.auth().currentUser;
      if (u) return resolve(u);
      const off = firebase.auth().onAuthStateChanged(user => { off(); resolve(user || null); });
    });
  }

  async function loadBookIntoForm(form) {
    const params = new URLSearchParams(location.search);
    const id = params.get("id") || form.dataset.id || "";
    if (!id) return null;

    const user = await waitForAuth();
    if (!user) return null;

    const db = firebase.firestore();
    const snap = await db.collection("users").doc(user.uid).collection("books").doc(id).get();
    if (!snap.exists) return null;

    const data = snap.data() || {};
    window.PB_CURRENT_BOOK = { id, ...data };
    form.dataset.id = id;

    if ($("#title")) $("#title").value = data.title || "";
    if ($("#author")) $("#author").value = data.author || "";
    if ($("#started")) $("#started").value = typeof data.started === "string" ? data.started : "";
    if ($("#finished")) $("#finished").value = typeof data.finished === "string" ? data.finished : "";
    if ($("#review")) $("#review").value = data.review || "";

    ensureHidden(form, "genres").value = JSON.stringify(Array.isArray(data.genres) ? data.genres : []);
    ensureHidden(form, "moods").value = JSON.stringify(Array.isArray(data.moods) ? data.moods : []);
    ensureHidden(form, "tropes").value = JSON.stringify(Array.isArray(data.tropes) ? data.tropes : []);
    ensureHidden(form, "status").value = data.status || "";
    ensureHidden(form, "format").value = data.format || "";

    if ($("#coverPreview")) {
      if (data.coverUrl) $("#coverPreview").src = data.coverUrl;
      else if (data.coverDataUrl) $("#coverPreview").src = data.coverDataUrl;
    }

    return data;
  }

  function wireDeleteIfPresent(form) {
    const delBtn = qsAny(["#deleteBookBtn", "#deleteBtn", '[data-role="delete-book"]']);
    if (!delBtn) return;
    if (delBtn.dataset.wired === "1") return;
    delBtn.dataset.wired = "1";

    delBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        const user = firebase.auth().currentUser;
        if (!user) throw new Error("You must be signed in to delete.");

        const id =
          delBtn.dataset.id ||
          form.dataset.id ||
          new URLSearchParams(location.search).get("id");

        if (!id) { goHomeFresh(); return; }

        const db = firebase.firestore();
        await db.collection("users").doc(user.uid).collection("books").doc(id).delete();

        try {
          const t = document.createElement("div");
          t.className = "toast"; t.textContent = "Deleted";
          document.body.appendChild(t);
          requestAnimationFrame(() => t.classList.add("show"));
          setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 800);
        } catch { }

        goHomeFresh();
      } catch (err) {
        console.error("[Edit Delete] failed:", err);
        alert(err?.message || "Failed to delete.");
      }
    });
  }

  // ---------- SAVE ----------
  async function onSave(form) {
    const btn = $("#saveBtn");
    try {
      if (btn) btn.disabled = true;

      const user = firebase.auth().currentUser;
      if (!user) throw new Error("You must be signed in to save.");

      const db = firebase.firestore();
      const uid = user.uid;

      let bookId = new URLSearchParams(location.search).get("id") || form.dataset.id || "";
      if (!bookId) bookId = db.collection("_ids").doc().id;
      form.dataset.id = bookId;

      const title = ($("#title")?.value || "").trim();
      const author = ($("#author")?.value || "").trim();
      const started = $("#started")?.value || "";
      const finished = $("#finished")?.value || "";
      const review = $("#review")?.value || "";
      if (!title || !author) throw new Error("Title and Author are required.");

      const inpGenres = form.querySelector('input[name="genres"]');
      const inpMoods = form.querySelector('input[name="moods"]');
      const inpTropes = form.querySelector('input[name="tropes"]');
      const inpStatus = form.querySelector('input[name="status"]');
      const inpFormat = form.querySelector('input[name="format"]');

      let genres = [], moods = [], tropes = [];
      try { genres = inpGenres?.value ? JSON.parse(inpGenres.value) : []; } catch { }
      try { moods = inpMoods?.value ? JSON.parse(inpMoods.value) : []; } catch { }
      try { tropes = inpTropes?.value ? JSON.parse(inpTropes.value) : []; } catch { }

      const status = inpStatus?.value || "";
      const format = inpFormat?.value || "";

      const ratingVal = $('input[name="rating"]')?.value ?? $("#ratingValue")?.value ?? "";
      const spiceVal = $('input[name="spice"]')?.value ?? $("#spiceValue")?.value ?? "";

      const ref = db.collection("users").doc(uid).collection("books").doc(bookId);

      const data = {
        title, author,
        status: status || null,
        format: format || null,
        started: started || null,
        finished: finished || null,
        review: review || "",
        genres: Array.isArray(genres) ? genres : [],
        moods: Array.isArray(moods) ? moods : [],
        tropes: Array.isArray(tropes) ? tropes : [],
        ...(ratingVal !== "" ? { rating: Number(ratingVal) || 0 } : {}),
        ...(spiceVal !== "" ? { spice: Number(spiceVal) || 0 } : {}),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      await ref.set(data, { merge: true });

      // logg aktivitet
      try { window.PB?.logActivity?.({ action: "book_saved", targetId: bookId, meta: { title } }); } catch { }

      // lokalt fil-lagring (LocalFiles/PBFileStore)
      const fileInputEl = $("#bookFile");
      const f = fileInputEl?.files?.[0] || null;

      if (f && (window.PBFileStore?.save || window.LocalFiles?.save)) {
        // forsøk å bruke PBFileStore hvis tilgjengelig, ellers LocalFiles
        const saveFn = window.PBFileStore?.save
          ? (args) => window.PBFileStore.save(args)
          : ({ file, uid, bookId, coverBlob }) => window.LocalFiles.save(uid, bookId, file, coverBlob);

        // forsøk å hente evt. blob fra coverPreview (valgfritt)
        let coverBlob = null;
        try {
          const img = $("#coverPreview");
          if (img?.src?.startsWith("blob:")) {
            const resp = await fetch(img.src);
            coverBlob = await resp.blob();
          }
        } catch { }

        const fileMeta = await saveFn({ file: f, uid, bookId, coverBlob });
        if (fileMeta) {
          await ref.set({ ...fileMeta, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
          try { window.PB?.logActivity?.({ action: "file_attached", targetId: bookId, meta: { title, kind: fileMeta.fileType } }); } catch { }
        }
      }

      goHomeFresh();

    } catch (err) {
      console.error("[Edit Save] failed:", err);
      alert(err?.message || "Failed to save. Check console for details.");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ---------- Boot ----------
  async function boot() {
    const form = $("#editBookForm") || $("#bookForm") || $("form");
    if (!form) return;

    let loaded = null;
    try { loaded = await loadBookIntoForm(form); } catch (e) { console.warn("Could not pre-load book:", e); }

    const { genres, moods, tropes, statuses, formats } = getLists();

    const genresBox = qsAny(["#genresBox .categories", "#genresBox", "#genres", '[data-chips="genres"]']);
    const moodsBox = qsAny(["#moodsBox .categories", "#moodsBox", "#moods", '[data-chips="moods"]']);
    const tropesBox = qsAny(["#tropesBox .categories", "#tropesBox", "#tropes", '[data-chips="tropes"]']);
    const statusBox = qsAny(["#statusChips", '[data-chips="status"]']);
    const formatBox = qsAny(["#formatChips", '[data-chips="format"]']);

    const inpGenres = ensureHidden(form, "genres");
    const inpMoods = ensureHidden(form, "moods");
    const inpTropes = ensureHidden(form, "tropes");
    const inpStatus = ensureHidden(form, "status");
    const inpFormat = ensureHidden(form, "format");

    const gInitial = initialOf(form, "genres", true);
    const mInitial = initialOf(form, "moods", true);
    const tInitial = initialOf(form, "tropes", true);
    const sInitial = initialOf(form, "status", false);
    const fInitial = initialOf(form, "format", false);

    hydrateChipGroup({
      container: genresBox, items: genres, multi: true, initial: gInitial,
      onChange: (vals) => { try { inpGenres.value = JSON.stringify(vals); } catch { inpGenres.value = "[]"; } }
    });
    hydrateChipGroup({
      container: moodsBox, items: moods, multi: true, initial: mInitial,
      onChange: (vals) => { try { inpMoods.value = JSON.stringify(vals); } catch { inpMoods.value = "[]"; } }
    });
    hydrateChipGroup({
      container: tropesBox, items: tropes, multi: true, initial: tInitial,
      onChange: (vals) => { try { inpTropes.value = JSON.stringify(vals); } catch { inpTropes.value = "[]"; } }
    });
    hydrateChipGroup({
      container: statusBox, items: $$(".category", statusBox).length ? null : statuses, multi: false, initial: sInitial,
      onChange: (val) => { inpStatus.value = val || ""; }
    });
    hydrateChipGroup({
      container: formatBox, items: $$(".category", formatBox).length ? null : formats, multi: false, initial: fInitial,
      onChange: (val) => { inpFormat.value = val || ""; }
    });

    if (!inpGenres.value) inpGenres.value = JSON.stringify(Array.isArray(gInitial) ? gInitial : []);
    if (!inpMoods.value) inpMoods.value = JSON.stringify(Array.isArray(mInitial) ? mInitial : []);
    if (!inpTropes.value) inpTropes.value = JSON.stringify(Array.isArray(tInitial) ? tInitial : []);
    if (!inpStatus.value) inpStatus.value = (sInitial || "");
    if (!inpFormat.value) inpFormat.value = (fInitial || "");

    form.addEventListener("submit", () => {
      try { if (Array.isArray(inpGenres.value)) inpGenres.value = JSON.stringify(inpGenres.value); } catch { }
      try { if (Array.isArray(inpMoods.value)) inpMoods.value = JSON.stringify(inpMoods.value); } catch { }
      try { if (Array.isArray(inpTropes.value)) inpTropes.value = JSON.stringify(inpTropes.value); } catch { }
    });

    wireDeleteIfPresent(form);

    const saveBtn = $("#saveBtn");
    if (saveBtn && saveBtn.dataset.wired !== "1") {
      saveBtn.dataset.wired = "1";
      saveBtn.addEventListener("click", (e) => { e.preventDefault(); onSave(form); });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { boot(); });
  else boot();
})();

// ---------- Minimal, isolated wiring for the "Choose file" button ----------
(() => {
  function wirePickFile() {
    const pickBtn = document.getElementById('btnPickFile');
    const fileInput = document.getElementById('bookFile');
    const fileName = document.getElementById('fileName');

    if (!pickBtn || !fileInput) return;
    if (pickBtn.dataset.wired === '1') return;
    pickBtn.dataset.wired = '1';

    if (!pickBtn.getAttribute('type')) pickBtn.setAttribute('type', 'button');

    pickBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); fileInput.click(); });
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      if (fileName) fileName.textContent = f ? f.name : '';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wirePickFile);
  else wirePickFile();
})();

// --- Read Now button (edit page) ---
(() => {
  function currentBookId() {
    const form = document.querySelector('#editBookForm, #bookForm, form');
    const qid = new URLSearchParams(location.search).get('id');
    return qid || form?.dataset?.id || null;
  }

  function ensureReadNowBtn() {
    const host = document.querySelector('.file-row') || document.getElementById('fileName')?.parentElement;
    if (!host) return;

    let btn = document.getElementById('readNowBtn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'readNowBtn';
      btn.className = 'btn';
      btn.type = 'button';
      btn.textContent = 'Read';
      btn.style.marginLeft = '8px';
      host.appendChild(btn);
    }

    const id = currentBookId();
    btn.disabled = !id;
    btn.onclick = () => {
      const bookId = currentBookId();
      if (!bookId) return alert('Save first, then you can read.');
      location.href = `reader.html?id=${encodeURIComponent(bookId)}`;
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureReadNowBtn, { once: true });
  else ensureReadNowBtn();
})();
