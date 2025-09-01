/* =========================================================
 PageBud – edit-page.js (stabil, chips-fix + Read lagrer først)
========================================================= */

(function () {
  "use strict";

  // ---------- Helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const byId = (id) => document.getElementById(id);
  const qs = (k) => new URLSearchParams(location.search).get(k);
  const FB = (window.fb || window);

  // ---------- Elements ----------
  const titleEl = byId("title");
  const authorEl = byId("author");
  const startedEl = byId("started");
  const finishedEl = byId("finished");
  const reviewEl = byId("review");

  // rating/chili – UI styres av rating-controls.js. Vi leser KUN dataset.value.
  const ratingBar = byId("ratingBar");
  const spiceBar = byId("spiceBar");

  const statusWrap = byId("statusChips");
  const formatWrap = byId("formatChips");
  const genresWrap = byId("genres");
  const moodsWrap = byId("moods");
  const tropesWrap = byId("tropes");

  const fileInput = byId("bookFile");
  const fileChip = byId("btnPickFile");
  const fileName = byId("fileName");
  const coverPreview = byId("coverPreview");

  const quoteInput = byId("quoteInput");
  const addQuoteBtn = byId("addQuoteBtn");
  const quotesList = byId("quotesList");

  const saveBtn = byId("saveBtn");
  const deleteBtn = byId("deleteBtn");

  // ---------- State ----------
  const bookId = qs("id");
  let docData = null;

  let activeStatus = null;
  let activeFormat = null;
  let pickedGenres = new Set();
  let pickedMoods = new Set();
  let pickedTropes = new Set();

  let existingQuotes = [];
  let pendingQuotes = [];

  let fileMeta = null;
  let coverBlob = null;

  // ---------- Lister ----------
  const CONST = window.PB_CONST || {};
  const GENRES = CONST.GENRES || [];
  const MOODS = (CONST.MOODS || []).map(x => (typeof x === "string" ? x : x.name || ""));
  const TROPES = CONST.TROPES || [];

  // ---------- Chips ----------
  function buildMulti(container, items, picked) {
    if (!container) return;
    container.innerHTML = "";
    items.forEach(txt => {
      if (!txt) return;
      const el = document.createElement("span");
      el.className = "category";
      el.textContent = txt;
      el.dataset.val = txt;
      if (picked.has(txt)) el.classList.add("active");
      container.appendChild(el);
    });
    container.addEventListener("click", (e) => {
      const btn = e.target.closest(".category");
      if (!btn || !container.contains(btn)) return;
      e.preventDefault(); e.stopPropagation();
      const v = btn.dataset.val;
      if (picked.has(v)) { picked.delete(v); btn.classList.remove("active"); }
      else { picked.add(v); btn.classList.add("active"); }
    });
  }

  function bindSingle(container, onPick) {
    if (!container) return;
    container.addEventListener("click", (e) => {
      const btn = e.target.closest(".category");
      if (!btn || !container.contains(btn)) return;
      e.preventDefault(); e.stopPropagation();
      $$(".category", container).forEach(n => n.classList.remove("active"));
      btn.classList.add("active");
      onPick(btn.dataset.val);
    });
  }

  function syncSingleActive(container, value) {
    if (!container) return;
    $$(".category", container).forEach(n => {
      n.classList.toggle("active", n.dataset.val === value);
    });
  }

  function populatePickers() {
    buildMulti(genresWrap, GENRES, pickedGenres);
    buildMulti(moodsWrap, MOODS, pickedMoods);
    buildMulti(tropesWrap, TROPES, pickedTropes);
    bindSingle(statusWrap, (v) => activeStatus = v);
    bindSingle(formatWrap, (v) => activeFormat = v);
  }

  // ---------- Quotes ----------
  function renderQuotes() {
    if (!quotesList) return;
    quotesList.innerHTML = "";

    existingQuotes.forEach(q => {
      const row = document.createElement("div");
      row.className = "card";
      row.style.padding = "10px";
      row.style.display = "grid";
      row.style.gridTemplateColumns = "1fr auto";
      row.style.gap = "8px";

      const txt = document.createElement("div");
      txt.textContent = q.text;

      const del = document.createElement("button");
      del.className = "btn";
      del.style.background = "#e23a3a";
      del.style.color = "#fff";
      del.textContent = "Delete";
      del.addEventListener("click", () => deleteSavedQuote(q.id));

      row.appendChild(txt);
      row.appendChild(del);
      quotesList.appendChild(row);
    });

    pendingQuotes.forEach(q => {
      const row = document.createElement("div");
      row.className = "card";
      row.style.padding = "10px";
      row.textContent = q.text;
      quotesList.appendChild(row);
    });
  }

  async function deleteSavedQuote(quoteId) {
    const u = await getAuthUser();
    if (!u || !bookId) return;

    const db = FB.db || FB.firestore();
    const ref = db.collection("users").doc(u.uid).collection("books").doc(bookId);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const arr = Array.isArray(snap.data().quotes) ? snap.data().quotes : [];
      tx.update(ref, { quotes: arr.filter(q => q.id !== quoteId) });
    });

    existingQuotes = existingQuotes.filter(q => q.id !== quoteId);
    renderQuotes();
  }

  // ---------- File UI ----------
  fileChip?.addEventListener("click", () => fileInput?.click());

  fileInput?.addEventListener("change", async () => {
    const f = fileInput.files && fileInput.files[0];
    if (fileName) fileName.textContent = f ? f.name : "";
    if (f && bookId) ensureReadButton(); // trykk -> lagre så lese

    if (!f) return;
    fileMeta = {
      name: f.name,
      type: /\.pdf$/i.test(f.name) ? "pdf" : (/\.epub$/i.test(f.name) ? "epub" : "unknown"),
      size: f.size
    };
    coverBlob = await tryExtractCover(f);
    if (coverBlob && coverPreview) {
      const url = URL.createObjectURL(coverBlob);
      coverPreview.src = url;
    }
  });

  // ---------- Cover extraction ----------
  async function tryExtractCover(file) {
    try {
      if (!file) return null;
      if (/\.pdf$/i.test(file.name) && window.pdfjsLib) {
        const ab = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
        const page = await pdf.getPage(1);
        const vp = page.getViewport({ scale: 1.4 });
        const c = document.createElement("canvas");
        c.width = vp.width; c.height = vp.height;
        await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
        return await new Promise(res => c.toBlob(res, "image/jpeg", 0.9));
      }
      if (/\.epub$/i.test(file.name) && window.ePub) {
        const book = ePub(file);
        const coverUrl = await book.loaded.cover;
        if (coverUrl) {
          const blobUrl = await book.archive.createUrl(coverUrl);
          const resp = await fetch(blobUrl);
          return await resp.blob();
        }
      }
    } catch (e) { console.warn("cover extract failed", e); }
    return null;
  }

  // ---------- Read-knapp (lagrer alltid før åpning) ----------
  function ensureReadButton() {
    const container = fileName?.parentElement || document.body;
    let btn = byId("readNowBtn");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "readNowBtn";
      btn.className = "btn";
      btn.style.marginLeft = "8px";
      btn.textContent = "Read";
      container.appendChild(btn);
    }
    btn.onclick = async () => {
      try {
        await saveChanges();                // lagre endringer
        location.href = `reader.html?id=${bookId}`;
      } catch (e) {
        console.error(e);
        alert("Could not open the reader yet. Try saving again.");
      }
    };
  }

  function maybeShowReadButton(d) {
    const hasFile = !!(d?.fileUrl || d?.fileName);
    if (hasFile && bookId) ensureReadButton();
  }

  // ---------- Save / Delete ----------
  function collectBase() {
    return {
      title: (titleEl?.value || "").trim(),
      author: (authorEl?.value || "").trim(),
      started: startedEl?.value || null,
      finished: finishedEl?.value || null,
      status: activeStatus || null,
      format: activeFormat || null,
      genres: Array.from(pickedGenres),
      moods: Array.from(pickedMoods),
      tropes: Array.from(pickedTropes),
      rating: Number(ratingBar?.dataset.value || 0),
      spice: Number(spiceBar?.dataset.value || 0),
      review: (reviewEl?.value || "").trim(),
      updatedAt: new Date()
    };
  }

  async function uploadToStorage(uid, bookId, file, cover) {
    const storage = FB.storage;
    let fileUrl = null, coverUrl = null;

    if (file) {
      const ref = storage.ref(`users/${uid}/books/${bookId}/${file.name}`);
      await ref.put(file);
      fileUrl = await ref.getDownloadURL();
    }
    if (cover) {
      const cref = storage.ref(`users/${uid}/books/${bookId}/cover.jpg`);
      await cref.put(cover, { contentType: "image/jpeg" });
      coverUrl = await cref.getDownloadURL();
    }
    return { fileUrl, coverUrl };
  }

  async function saveChanges() {
    if (!bookId) return alert("Missing book id");
    const t = (titleEl?.value || "").trim();
    const a = (authorEl?.value || "").trim();
    if (!t || !a) { alert("Title and Author are required."); return; }

    saveBtn && (saveBtn.disabled = true);
    try {
      const u = await getAuthUser();
      const db = FB.db || FB.firestore();
      const ref = db.collection("users").doc(u.uid).collection("books").doc(bookId);

      const base = collectBase();

      const newFile = (fileInput?.files && fileInput.files[0]) || null;
      const up = await uploadToStorage(u.uid, bookId, newFile, coverBlob);

      if (up.fileUrl) base.fileUrl = up.fileUrl;
      if (fileMeta?.type) base.fileType = fileMeta.type;
      if (fileMeta?.name) base.fileName = fileMeta.name;
      if (up.coverUrl) base.coverUrl = up.coverUrl;

      if (pendingQuotes.length) {
        const more = pendingQuotes.map(q => ({
          id: db.collection("_").doc().id,
          text: q.text,
          createdAt: new Date()
        }));
        if (FB.firebase?.firestore?.FieldValue?.arrayUnion) {
          base.quotes = FB.firebase.firestore.FieldValue.arrayUnion(...more);
        } else {
          const snap = await ref.get();
          const existing = (snap.exists && Array.isArray(snap.data().quotes)) ? snap.data().quotes : [];
          base.quotes = existing.concat(more);
        }
        existingQuotes = existingQuotes.concat(more.map(q => ({ id: q.id, text: q.text })));
        pendingQuotes = [];
      }

      await ref.set(base, { merge: true });
      renderQuotes();

      if ((up.fileUrl || base.fileName) && bookId) ensureReadButton();
      alert("Changes saved ✓");
    } catch (e) {
      console.error(e);
      alert("Failed to save. See console for details.");
    } finally {
      saveBtn && (saveBtn.disabled = false);
    }
  }

  async function deleteBook() {
    if (!bookId) return;
    if (!confirm("Delete this book?")) return;
    deleteBtn && (deleteBtn.disabled = true);
    try {
      const u = await getAuthUser();
      const db = FB.db || FB.firestore();
      await db.collection("users").doc(u.uid).collection("books").doc(bookId).delete();

      try {
        const storage = FB.storage;
        const tryDel = async (p) => { try { await storage.ref(p).delete(); } catch { } };
        await tryDel(`users/${u.uid}/books/${bookId}/cover.jpg`);
        if (docData?.fileName) await tryDel(`users/${u.uid}/books/${bookId}/${docData.fileName}`);
      } catch { }

      alert("Book deleted ✓");
      history.back();
    } catch (e) {
      console.error(e);
      alert("Failed to delete. See console for details.");
    } finally {
      deleteBtn && (deleteBtn.disabled = false);
    }
  }

  // Robust auth
  async function getAuthUser() {
    const auth =
      (FB && FB.auth) ||
      (FB && FB.firebase && FB.firebase.auth && FB.firebase.auth()) ||
      (firebase && firebase.auth && firebase.auth());
    const cur = auth && auth.currentUser;
    if (cur) return cur;
    return await new Promise((res, rej) => {
      const unsub = auth.onAuthStateChanged(u => { unsub(); u ? res(u) : rej(new Error("Not signed in")); });
    });
  }

  // ---------- Apply loaded doc ----------
  function applyDocToUI(d) {
    titleEl && (titleEl.value = d.title || "");
    authorEl && (authorEl.value = d.author || "");
    startedEl && (startedEl.value = d.started || "");
    finishedEl && (finishedEl.value = d.finished || "");
    reviewEl && (reviewEl.value = d.review || "");

    activeStatus = d.status || null;
    activeFormat = d.format || null;
    pickedGenres = new Set(Array.isArray(d.genres) ? d.genres : []);
    pickedMoods = new Set(Array.isArray(d.moods) ? d.moods : []);
    pickedTropes = new Set(Array.isArray(d.tropes) ? d.tropes : []);

    // marker aktive etter at pickers er bygd
    syncSingleActive(statusWrap, activeStatus);
    syncSingleActive(formatWrap, activeFormat);
    // Multi er allerede markert i buildMulti via picked-sets (kalles på nytt under init hvis ønskelig)

    if (d.coverUrl && coverPreview) coverPreview.src = d.coverUrl;

    existingQuotes = Array.isArray(d.quotes) ? d.quotes.map(q => ({ id: q.id, text: q.text })) : [];
    pendingQuotes = [];
    renderQuotes();

    if (fileName && d.fileName && !fileName.textContent) fileName.textContent = d.fileName;

    // Sett rating/spice verdi og trigge eksisterende widget til å re-rendere
    if (ratingBar) {
      ratingBar.dataset.value = String(Number(d.rating || 0));
      const img = ratingBar.querySelector("img"); img && img.dispatchEvent(new Event("mouseleave"));
    }
    if (spiceBar) {
      spiceBar.dataset.value = String(Number(d.spice || 0));
      const img = spiceBar.querySelector("img"); img && img.dispatchEvent(new Event("mouseleave"));
    }
  }

  // ---------- Init ----------
  document.addEventListener("DOMContentLoaded", async () => {
    if (!bookId) { alert("Missing ?id="); return; }

    populatePickers();                 // bygg chips først
    saveBtn?.addEventListener("click", saveChanges);
    deleteBtn?.addEventListener("click", deleteBook);

    try {
      const u = await getAuthUser();
      const db = FB.db || FB.firestore();
      const ref = db.collection("users").doc(u.uid).collection("books").doc(bookId);
      const snap = await ref.get();
      if (!snap.exists) { alert("Book not found."); return; }
      docData = snap.data() || {};

      // buildMulti bruker picked-sets. Rebuild etter vi vet hva som er valgt:
      pickedGenres = new Set(Array.isArray(docData.genres) ? docData.genres : []);
      pickedMoods = new Set(Array.isArray(docData.moods) ? docData.moods : []);
      pickedTropes = new Set(Array.isArray(docData.tropes) ? docData.tropes : []);
      buildMulti(genresWrap, GENRES, pickedGenres);
      buildMulti(moodsWrap, MOODS, pickedMoods);
      buildMulti(tropesWrap, TROPES, pickedTropes);

      applyDocToUI(docData);
      maybeShowReadButton(docData);
    } catch (e) {
      console.error(e);
      alert("Could not load the book. See console for details.");
    }
  });

})();
