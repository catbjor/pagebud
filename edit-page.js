// edit-page.js — Load book, hydrate chips, SAVE (keeps existing file unless new chosen), DELETE

(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function qsAny(arr) { for (const s of arr) { const el = document.querySelector(s); if (el) return el; } return null; }
  function goHomeFresh() { window.location.replace(`index.html?refresh=${Date.now()}`); }

  function auth() { return (window.fb?.auth) || (window.firebase?.auth?.()) || firebase.auth(); }
  function db() { return (window.fb?.db) || (window.firebase?.firestore?.()) || firebase.firestore(); }

  // constants
  function getLists() {
    const C = window.PB_CONST || window.CONSTANTS || (window.PB && {
      GENRES: window.PB.GENRES, MOODS: window.PB.MOODS, TROPES: window.PB.TROPES, STATUSES: window.PB.STATUSES, FORMATS: window.PB.FORMATS
    }) || {};
    return {
      genres: C.GENRES || window.GENRES || [],
      moods: C.MOODS || window.MOODS || [],
      tropes: C.TROPES || window.TROPES || [],
      statuses: C.STATUSES || window.STATUSES || [],
      formats: C.FORMATS || window.FORMATS || []
    };
  }

  // hidden helpers
  function ensureHidden(form, name) {
    let el = form.querySelector(`input[name="${name}"]`);
    if (!el) { el = document.createElement("input"); el.type = "hidden"; el.name = name; form.appendChild(el); }
    return el;
  }
  function chipValue(el) { return el.dataset.value || el.dataset.val || el.textContent.trim(); }
  function safeParse(v, d) { try { return JSON.parse(v); } catch { return d; } }

  function hydrateMulti(container, items, hiddenInput, initial = []) {
    if (!container) return;
    let chips = $$(".category", container);
    if (!chips.length && Array.isArray(items)) {
      items.forEach((label) => {
        const el = document.createElement("span");
        el.className = "category";
        el.textContent = label;
        el.dataset.value = String(label);
        container.appendChild(el);
      });
      chips = $$(".category", container);
    }
    const picked = new Set(Array.isArray(initial) ? initial.map(String) : []);
    chips.forEach(ch => {
      const val = chipValue(ch);
      ch.dataset.value = val;
      ch.tabIndex = 0; ch.setAttribute("role", "button");
      ch.classList.toggle("active", picked.has(val));
    });
    function commit() {
      const vals = $$(".category.active", container).map(c => chipValue(c));
      try { hiddenInput.value = JSON.stringify(vals); } catch { hiddenInput.value = "[]"; }
    }
    container.addEventListener("click", (e) => {
      const chip = e.target.closest(".category"); if (!chip) return;
      chip.classList.toggle("active"); commit();
    });
    container.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const chip = e.target.closest(".category"); if (!chip) return;
      e.preventDefault(); chip.classList.toggle("active"); commit();
    });
    commit();
  }

  function hydrateSingle(container, items, hiddenInput, initial = "") {
    if (!container) return;
    let chips = $$(".category", container);
    if (!chips.length && Array.isArray(items)) {
      items.forEach((label) => {
        const el = document.createElement("span");
        el.className = "category";
        el.textContent = label;
        el.dataset.value = String(label);
        container.appendChild(el);
      });
      chips = $$(".category", container);
    }
    chips.forEach(ch => {
      const val = chipValue(ch);
      ch.dataset.value = val;
      ch.tabIndex = 0; ch.setAttribute("role", "button");
      ch.classList.toggle("active", initial && initial === val);
    });
    function commitTo(val) {
      $$(".category.active", container).forEach(c => c.classList.remove("active"));
      const chip = $$('.category', container).find(c => chipValue(c) === val);
      if (chip) chip.classList.add("active");
      hiddenInput.value = val || "";
    }
    container.addEventListener("click", (e) => {
      const chip = e.target.closest(".category"); if (!chip) return;
      commitTo(chipValue(chip));
    });
    container.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const chip = e.target.closest(".category"); if (!chip) return;
      e.preventDefault(); commitTo(chipValue(chip));
    });
    commitTo(initial || "");
  }

  // Load doc
  async function loadBookIntoForm(form) {
    const params = new URLSearchParams(location.search);
    const id = params.get("id") || form.dataset.id || "";
    if (!id) return null;
    const user = auth().currentUser || await new Promise(res => auth().onAuthStateChanged(u => res(u)));
    if (!user) return null;

    const ref = db().collection("users").doc(user.uid).collection("books").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    form.dataset.id = id;

    $("#title") && ($("#title").value = data.title || "");
    $("#author") && ($("#author").value = data.author || "");
    $("#started") && ($("#started").value = typeof data.started === "string" ? data.started : "");
    $("#finished") && ($("#finished").value = typeof data.finished === "string" ? data.finished : "");
    $("#review") && ($("#review").value = data.review || "");

    // hidden initial
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

  // Delete
  function wireDelete(form) {
    const delBtn = qsAny(["#deleteBookBtn", "#deleteBtn", '[data-role="delete-book"]']);
    if (!delBtn || delBtn.dataset.wired === "1") return;
    delBtn.dataset.wired = "1";
    delBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const user = auth().currentUser;
      if (!user) return alert("You must be signed in.");
      const id = form.dataset.id || new URLSearchParams(location.search).get("id");
      if (!id) return goHomeFresh();
      await db().collection("users").doc(user.uid).collection("books").doc(id).delete();
      goHomeFresh();
    });
  }

  // Save (keeps existing file meta if no new file chosen)
  async function onSave(form) {
    const btn = $("#saveBtn");
    try {
      btn && (btn.disabled = true);
      const user = auth().currentUser;
      if (!user) throw new Error("You must be signed in to save.");
      const database = db();
      let bookId = new URLSearchParams(location.search).get("id") || form.dataset.id || "";
      if (!bookId) bookId = database.collection("_ids").doc().id;
      form.dataset.id = bookId;

      const title = ($("#title")?.value || "").trim();
      const author = ($("#author")?.value || "").trim();
      if (!title || !author) throw new Error("Title and Author are required.");

      const inpGenres = form.querySelector('input[name="genres"]');
      const inpMoods = form.querySelector('input[name="moods"]');
      const inpTropes = form.querySelector('input[name="tropes"]');
      const inpStatus = form.querySelector('input[name="status"]');
      const inpFormat = form.querySelector('input[name="format"]');

      let genres = []; let moods = []; let tropes = [];
      try { genres = inpGenres?.value ? JSON.parse(inpGenres.value) : []; } catch { }
      try { moods = inpMoods?.value ? JSON.parse(inpMoods.value) : []; } catch { }
      try { tropes = inpTropes?.value ? JSON.parse(inpTropes.value) : []; } catch { }

      const status = inpStatus?.value || "";
      const format = inpFormat?.value || "";

      const ratingVal = $('input[name="rating"]')?.value ?? $("#ratingValue")?.value ?? "";
      const spiceVal = $('input[name="spice"]')?.value ?? $("#spiceValue")?.value ?? "";

      const ref = database.collection("users").doc(user.uid).collection("books").doc(bookId);

      // 1) core fields
      const data = {
        title, author,
        status: status || null,
        format: format || null,
        started: $("#started")?.value || null,
        finished: $("#finished")?.value || null,
        review: $("#review")?.value || "",
        genres, moods, tropes,
        ...(ratingVal !== "" ? { rating: Number(ratingVal) || 0 } : {}),
        ...(spiceVal !== "" ? { spice: Number(spiceVal) || 0 } : {}),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      await ref.set(data, { merge: true });

      // 2) ny fil? – lagre lokalt og MERGE meta
      const f = $("#bookFile")?.files?.[0] || null;
      if (f && window.PBFileStore?.save) {
        // prøv å bruke nåværende coverPreview (blob) som cover
        let coverBlob = null;
        try {
          const img = $("#coverPreview");
          if (img?.src?.startsWith("blob:")) {
            const resp = await fetch(img.src);
            coverBlob = await resp.blob();
          }
        } catch { }
        const meta = await PBFileStore.save({ file: f, uid: user.uid, bookId, coverBlob });
        if (meta) await ref.set({ ...meta, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      }

      goHomeFresh();
    } catch (e) {
      console.error("[Edit Save] failed:", e);
      alert(e?.message || "Failed to save.");
    } finally {
      btn && (btn.disabled = false);
    }
  }

  async function boot() {
    const form = $("#editBookForm") || $("#bookForm") || $("form");
    if (!form) return;

    // load existing (if any)
    let loaded = null;
    try { loaded = await loadBookIntoForm(form); } catch { }

    const { genres, moods, tropes, statuses, formats } = getLists();

    // chip containers
    const genresBox = qsAny(["#genresBox .categories", "#genresBox", "#genres", '[data-chips="genres"]']);
    const moodsBox = qsAny(["#moodsBox .categories", "#moodsBox", "#moods", '[data-chips="moods"]']);
    const tropesBox = qsAny(["#tropesBox .categories", "#tropesBox", "#tropes", '[data-chips="tropes"]']);
    const statusBox = qsAny(["#statusChips", '[data-chips="status"]']);
    const formatBox = qsAny(["#formatChips", '[data-chips="format"]']);

    const formEl = form;
    const inpGenres = ensureHidden(formEl, "genres");
    const inpMoods = ensureHidden(formEl, "moods");
    const inpTropes = ensureHidden(formEl, "tropes");
    const inpStatus = ensureHidden(formEl, "status");
    const inpFormat = ensureHidden(formEl, "format");

    const gInitial = loaded?.genres || safeParse(inpGenres.value, []);
    const mInitial = loaded?.moods || safeParse(inpMoods.value, []);
    const tInitial = loaded?.tropes || safeParse(inpTropes.value, []);
    const sInitial = loaded?.status || (inpStatus.value || "");
    const fInitial = loaded?.format || (inpFormat.value || "");

    hydrateMulti(genresBox, genres, inpGenres, gInitial);
    hydrateMulti(moodsBox, moods, inpMoods, mInitial);
    hydrateMulti(tropesBox, tropes, inpTropes, tInitial);
    hydrateSingle(statusBox, statuses, inpStatus, sInitial);
    hydrateSingle(formatBox, formats, inpFormat, fInitial);

    // Delete og Save
    wireDelete(formEl);
    const saveBtn = $("#saveBtn");
    if (saveBtn && saveBtn.dataset.wired !== "1") {
      saveBtn.dataset.wired = "1";
      saveBtn.addEventListener("click", (e) => { e.preventDefault(); onSave(formEl); });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
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
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureReadNowBtn, { once: true });
  } else {
    ensureReadNowBtn();
  }
})();
