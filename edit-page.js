/* =========================================================
 PageBud – edit-page.js (stabil, storage-fix + Read-knapp)
 - Laster bok (?id=...)
 - Viser valgt filnavn og "Read"-knapp
 - Lagrer endringer + laster opp ny fil/cover til Storage
 - Sletter sitater trygt med transaksjon
========================================================= */

(function () {
  "use strict";

  // ---------- Helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const byId = (id) => document.getElementById(id);
  const qs = (k) => new URLSearchParams(location.search).get(k);
  const FB = (window.fb || window);

  // ---------- Elements (kun det vi faktisk bruker her) ----------
  const titleEl = byId("title");
  const authorEl = byId("author");
  const startedEl = byId("started");
  const finishedEl = byId("finished");
  const reviewEl = byId("review");

  // rating/spice beholdes – vi leser kun dataset når vi lagrer
  const ratingBar = byId("ratingBar");
  const spiceBar = byId("spiceBar");

  // pickers beholdes – vi rører ikke genereringen deres
  const statusWrap = byId("statusChips");
  const formatWrap = byId("formatChips");
  const genresWrap = byId("genres");
  const moodsWrap = byId("moods");
  const tropesWrap = byId("tropes");

  // fil
  const fileInput = byId("bookFile");
  const fileChip = byId("btnPickFile");
  const fileName = byId("fileName");
  const coverPreview = byId("coverPreview");

  // quotes (beholdes som før)
  const quoteInput = byId("quoteInput");
  const addQuoteBtn = byId("addQuoteBtn");
  const quotesList = byId("quotesList");

  // actions
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

  let fileMeta = null;   // {name,type,size}
  let coverBlob = null;  // Blob (cover fra pdf/epub hvis vi klarer)

  // ---------- UI wiring (kun fil + quotes) ----------
  fileChip?.addEventListener("click", () => fileInput?.click());

  fileInput?.addEventListener("change", async () => {
    const f = fileInput.files && fileInput.files[0];
    if (fileName) fileName.textContent = f ? f.name : "";

    // Vis Read-knapp når det finnes en valgt fil
    if (f && bookId) ensureReadButton(bookId);

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

  addQuoteBtn?.addEventListener("click", () => {
    const t = (quoteInput?.value || "").trim();
    if (!t) return;
    pendingQuotes.push({ text: t, createdAt: Date.now() });
    quoteInput.value = "";
    renderQuotes();
  });
  quoteInput?.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") addQuoteBtn?.click();
  });

  // ---------- Read button ----------
  function ensureReadButton(bookId) {
    // legg knappen rett ved siden av filnavnet (samme rad)
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
    btn.onclick = () => location.href = `reader.html?id=${bookId}`;
  }

  function maybeShowReadButton(d) {
    const hasFile = !!(
      d?.fileUrl ||
      d?.fileName ||
      (d?.file && (d.file.url || d.file.blobUrl))
    );
    if (hasFile && bookId) ensureReadButton(bookId);
  }

  // ---------- Quotes render/delete (uendret oppførsel) ----------
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
    const u = FB.auth?.currentUser || FB.auth().currentUser;
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

  // ---------- Cover extraction (best-effort, endrer ikke design) ----------
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

  // ---------- Save / Delete ----------
  function collectBase() {
    return {
      title: (titleEl?.value || "").trim(),
      author: (authorEl?.value || "").trim(),
      started: startedEl?.value || null,
      finished: finishedEl?.value || null,
      // les status/format/valgte – vi rører ikke UI, bare leser state
      status: activeStatus || null,
      format: activeFormat || null,
      genres: Array.from(pickedGenres),
      moods: Array.from(pickedMoods),
      tropes: Array.from(pickedTropes),
      // rating/spice: les fra data-attributtene hvis widgetene er tegnet
      rating: Number(ratingBar?.dataset.value || 0),
      spice: Number(spiceBar?.dataset.value || 0),
      review: (reviewEl?.value || "").trim(),
      updatedAt: new Date()
    };
  }

  // *** STORAGE FIX – bruker FB.storage.ref(...) (ikke FB.storage()) ***
  async function uploadToStorage(uid, bookId, file, cover) {
    const storage = FB.storage; // compat-objekt med .ref()
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
      const u = FB.auth?.currentUser || (await new Promise((res, rej) => {
        const unsub = (FB.auth ? FB.auth() : FB.firebase.auth()).onAuthStateChanged((x) => { unsub(); x ? res(x) : rej(new Error("Not signed in")); });
      }));

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

      // Sørg for at Read-knappen vises når vi nettopp lastet ny fil
      if ((up.fileUrl || base.fileName) && bookId) ensureReadButton(bookId);

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
      const u = FB.auth?.currentUser || (await new Promise((res, rej) => {
        const unsub = (FB.auth ? FB.auth() : FB.firebase.auth()).onAuthStateChanged((x) => { unsub(); x ? res(x) : rej(new Error("Not signed in")); });
      }));

      const db = FB.db || FB.firestore();
      await db.collection("users").doc(u.uid).collection("books").doc(bookId).delete();

      // best-effort: fjern filer i Storage
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

  // ---------- Apply loaded doc to UI (rører ikke layout) ----------
  function applyDocToUI(d) {
    titleEl && (titleEl.value = d.title || "");
    authorEl && (authorEl.value = d.author || "");
    startedEl && (startedEl.value = d.started || "");
    finishedEl && (finishedEl.value = d.finished || "");
    reviewEl && (reviewEl.value = d.review || "");

    // behold state – vi tukler ikke med hvordan chips bygges i HTMLen din
    activeStatus = d.status || null;
    activeFormat = d.format || null;
    pickedGenres = new Set(Array.isArray(d.genres) ? d.genres : []);
    pickedMoods = new Set(Array.isArray(d.moods) ? d.moods : []);
    pickedTropes = new Set(Array.isArray(d.tropes) ? d.tropes : []);

    if (d.coverUrl && coverPreview) coverPreview.src = d.coverUrl;

    existingQuotes = Array.isArray(d.quotes) ? d.quotes.map(q => ({ id: q.id, text: q.text })) : [];
    pendingQuotes = [];
    renderQuotes();

    // Vis filnavn om det finnes
    if (fileName && d.fileName && !fileName.textContent) fileName.textContent = d.fileName;
  }

  // ---------- Init ----------
  document.addEventListener("DOMContentLoaded", async () => {
    if (!bookId) { alert("Missing ?id="); return; }

    saveBtn?.addEventListener("click", saveChanges);
    deleteBtn?.addEventListener("click", deleteBook);

    try {
      const u = FB.auth?.currentUser || (await new Promise((res, rej) => {
        const unsub = (FB.auth ? FB.auth() : FB.firebase.auth()).onAuthStateChanged((x) => { unsub(); x ? res(x) : rej(new Error("Not signed in")); });
      }));

      const db = FB.db || FB.firestore();
      const snap = await db.collection("users").doc(u.uid).collection("books").doc(bookId).get();
      if (!snap.exists) { alert("Book not found."); return; }

      docData = snap.data() || {};
      applyDocToUI(docData);
      maybeShowReadButton(docData); // knappen vises når fil finnes
    } catch (e) {
      console.error(e);
      alert("Could not load the book. See console for details.");
    }
  });

})();
