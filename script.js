// script.js — Library rendering + progress + "currently reading" widget
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from((r || document).querySelectorAll(s));

  // ---------- Firebase helpers ----------
  function hasFB() { return !!(window.fb && fb.auth && fb.db); }
  function me() { return fb?.auth?.currentUser || null; }

  // ---------- Filters / search state ----------
  let LIB = [];        // all books
  let FILTER = localStorage.getItem("pb:libFilter") || "all";
  let Q = "";          // search query

  // ---------- Utils ----------
  function hasFile(b) {
    return !!(b && (b.fileUrl || (b.file && (b.file.url || b.file.path))) && (b.fileType === "pdf" || b.fileType === "epub" || (b.file && b.file.type)));
  }

  function progressInfo(b) {
    // PDF: lastPage / totalPages → %
    if ((b.fileType || b?.file?.type) === "pdf" && (b.pdfTotalPages || b?.file?.totalPages)) {
      const total = Number(b.pdfTotalPages || b?.file?.totalPages || 0);
      const last = Number(b.pdfLastPage || b?.file?.lastPage || 0);
      const pct = total ? Math.max(0, Math.min(100, Math.round((last / total) * 100))) : 0;
      return { pct, label: total ? `p. ${last || 1} / ${total}` : "" };
    }
    // EPUB: epubPercent (0-100) stored by reader
    if ((b.fileType || b?.file?.type) === "epub" && (b.epubPercent || b?.file?.percent)) {
      const pct = Math.max(0, Math.min(100, Math.round(Number(b.epubPercent || b?.file?.percent || 0))));
      return { pct, label: `${pct}%` };
    }
    return { pct: 0, label: "" };
  }

  function continueLabel(b) {
    const p = progressInfo(b);
    if (p.pct > 0) {
      if ((b.fileType || b?.file?.type) === "pdf") {
        return `<div class="muted" style="margin-top:4px">Continue · ${p.label}</div>`;
      }
      return `<div class="muted" style="margin-top:4px">Continue · ${p.label}</div>`;
    }
    return "";
  }

  function renderProgressMini(b) {
    const { pct, label } = progressInfo(b);
    if (!pct) return "";
    return `
      <div class="progress-mini">
        <div class="bar"><div class="fill" style="width:${pct}%;"></div></div>
        <div class="label">${label}</div>
      </div>`;
  }

  // ---------- Card render ----------
  function renderBookCard(b) {
    const readBtn = hasFile(b)
      ? `<button class="btn btn-primary btn-read" data-book-id="${b.id}"><i class="fa-solid fa-book-open"></i> Read</button>`
      : ``;

    const cont = continueLabel(b);
    const prog = renderProgressMini(b);
    const status = (b.status || "").toUpperCase();

    return `
      <article class="book-card" data-id="${b.id}">
        <img class="cover" src="${b.coverUrl || b.cover || ""}" alt="">
        <div class="meta">
          <h3 class="t">${b.title || "Untitled"}</h3>
          <div class="a">${b.author || ""}</div>
          ${cont}
          ${prog}
          <div class="row" style="display:flex;align-items:center;gap:8px;margin-top:8px">
            ${readBtn}
            ${status ? `<span class="pill">${status}</span>` : ``}
            <a class="btn" href="edit-book.html?id=${encodeURIComponent(b.id)}">Edit</a>
          </div>
        </div>
      </article>`;
  }

  // ---------- List render ----------
  function renderList() {
    const grid = $("#book-grid");
    const empty = $("#empty-state");
    if (!grid) return;
    let list = LIB.slice();

    // filter by status
    list = list.filter(b => {
      if (FILTER === "all") return true;
      if (FILTER === "favorites") return !!b.favorite || (b.status === "favorite");
      if (FILTER === "reading") return b.status === "reading";
      if (FILTER === "finished") return b.status === "finished";
      if (FILTER === "want") return b.status === "want" || b.status === "tbr";
      if (FILTER === "dnf") return b.status === "dnf";
      if (FILTER === "owned") return b.owned === true || b.status === "owned";
      if (FILTER === "wishlist") return b.status === "wishlist";
      return true;
    });

    // search
    if (Q) {
      const q = Q.toLowerCase();
      list = list.filter(b =>
        (b.title || "").toLowerCase().includes(q) ||
        (b.author || "").toLowerCase().includes(q)
      );
    }

    grid.innerHTML = list.map(renderBookCard).join("");
    empty.style.display = list.length ? "none" : "";

    // bind read buttons
    $$(".btn-read", grid).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-book-id");
        if (id) location.href = `reader.html?id=${encodeURIComponent(id)}`;
      });
    });
  }

  // ---------- Load books ----------
  async function loadBooks() {
    if (!hasFB()) return;
    const u = me(); if (!u) return;
    const snap = await fb.db.collection("users").doc(u.uid).collection("books").orderBy("updatedAt", "desc").get();
    LIB = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderList();
  }

  // ---------- Currently reading widget ----------
  async function injectCurrentlyReading() {
    try {
      const u = me(); if (!u) return;
      const doc = await fb.db.collection("users").doc(u.uid).collection("presence").doc("state").get();
      const st = doc.exists ? (doc.data() || {}).currentlyReading : null;
      if (!st || !st.bookId) return;

      // build card only if it doesn't exist yet
      if ($("#current-reading-card")) return;

      const hostSection = $("#friends-feed")?.parentElement; // the <section> that wraps Friends activity
      if (!hostSection) return;

      const card = document.createElement("div");
      card.id = "current-reading-card";
      card.className = "card";
      card.style.margin = "0 16px 12px"; // inside .library section
      const label = st.fileType === "pdf" && st.page ? `· p. ${st.page}` : "";
      card.innerHTML = `
        <div style="display:flex;gap:12px;align-items:center">
          <img src="${st.cover || ""}" alt="" style="width:56px;height:78px;object-fit:cover;border-radius:8px;border:1px solid var(--border)">
          <div style="flex:1">
            <div class="muted" style="font-size:.8rem;margin-bottom:2px">Currently reading</div>
            <div style="font-weight:900">${st.title || "Open book"}</div>
            <div class="muted" style="font-size:.9rem">${label}</div>
          </div>
          <button id="crContinue" class="btn btn-primary" style="white-space:nowrap"><i class="fa-solid fa-book-open"></i> Continue</button>
        </div>
      `;
      hostSection.parentElement.insertBefore(card, hostSection); // place it right above Friends activity

      $("#crContinue")?.addEventListener("click", () => {
        location.href = `reader.html?id=${encodeURIComponent(st.bookId)}`;
      });
    } catch (e) {
      console.warn("[current-reading]", e);
    }
  }

  // ---------- Search / chips ----------
  function wireSearch() {
    $("#search-input")?.addEventListener("input", (e) => {
      Q = (e.target.value || "").trim();
      renderList();
    });

    // make chips clickable (your design untouched)
    $$("#filter-chips .category").forEach(ch => {
      ch.addEventListener("click", () => {
        $$("#filter-chips .category").forEach(x => x.classList.remove("active"));
        ch.classList.add("active");
        FILTER = ch.dataset.filter || "all";
        localStorage.setItem("pb:libFilter", FILTER);
        renderList();
      });
    });

    // reflect currently saved filter
    const active = $(`#filter-chips .category[data-filter="${FILTER}"]`);
    if (active) {
      $$("#filter-chips .category").forEach(x => x.classList.remove("active"));
      active.classList.add("active");
    }
  }

  // ---------- Public API ----------
  window.PB = window.PB || {};
  window.PB.renderLibrary = renderList;

  // ---------- Boot ----------
  document.addEventListener("DOMContentLoaded", async () => {
    wireSearch();
    if (!hasFB()) return;
    const u = await new Promise(res => {
      const ready = fb?.auth?.currentUser;
      if (ready) return res(ready);
      const unsub = fb.auth.onAuthStateChanged(x => { unsub(); res(x); });
    });
    if (!u) return location.href = "auth.html";
    await loadBooks();
    await injectCurrentlyReading();

    // Live updates: if books change (simple polling)
    try {
      fb.db.collection("users").doc(u.uid).collection("books")
        .orderBy("updatedAt", "desc")
        .onSnapshot(snap => {
          LIB = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          renderList();
        });
    } catch { }
  });
})();
