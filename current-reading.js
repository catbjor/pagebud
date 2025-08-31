/* ============================================================
PageBud – current-reading.js
Viser siste aktive bok (status=reading) med progresjon + “Resume” (starter timer)
- Robust mot manglende felter; prøver progress/progressPct/currentPage/pages/pagesRead
- Krever auth; bruker users/{uid}/books
============================================================ */
(function () {
    "use strict";
    const wrap = document.getElementById("current-reading");
    const sec = document.getElementById("current-reading-section");
    if (!wrap || !sec) return;

    function pctFromBook(b) {
        // Prøv ulike skjema-varianter
        if (typeof b.progressPct === "number") return clamp(b.progressPct, 0, 100);
        if (typeof b.progress === "number") return clamp(b.progress, 0, 100);
        const pages = Number(b.pages) || 0;
        const cur = Number(b.currentPage ?? b.pagesRead ?? 0);
        if (pages > 0 && cur >= 0) return clamp(Math.round((cur / pages) * 100), 0, 100);
        return 0;
    }
    const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Number(v) || 0));

    async function load() {
        if (!window.fb?.auth?.currentUser || !window.fb?.db) return; // krever init
        const uid = fb.auth.currentUser?.uid; if (!uid) return;

        // hent bøker med status=reading; sorter på updatedAt/startedAt/timestamp
        let snap;
        try {
            // forsøk sortert spørring først
            snap = await fb.db.collection("users").doc(uid).collection("books")
                .where("status", "==", "reading").orderBy("updatedAt", "desc").limit(1).get();
        } catch {
            // fallback: uten orderBy
            snap = await fb.db.collection("users").doc(uid).collection("books")
                .where("status", "==", "reading").limit(5).get();
        }
        if (snap.empty) { sec.style.display = "none"; return; }

        // Finn “freshest”
        const books = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        books.sort((a, b) => {
            const at = (a.updatedAt?.toMillis?.() ?? +new Date(a.updatedAt || a.startedAt || 0));
            const bt = (b.updatedAt?.toMillis?.() ?? +new Date(b.updatedAt || b.startedAt || 0));
            return bt - at;
        });
        const b = books[0];
        const p = pctFromBook(b);

        wrap.innerHTML = `
      <div style="display:grid;grid-template-columns:72px 1fr auto;gap:12px;align-items:center">
        <img src="${b.cover || ''}" alt="" style="width:72px;height:96px;object-fit:cover;border-radius:8px;background:#222"/>
        <div>
          <div style="font-weight:900">${b.title || "Untitled"}</div>
          <div class="muted" style="font-size:.9rem">${b.author || ""}</div>
          <div style="height:8px;border-radius:6px;background:var(--surface);border:1px solid var(--border);margin-top:8px;overflow:hidden">
            <div style="height:100%;width:${p}%;background:var(--primary)"></div>
          </div>
          <div class="muted" style="font-size:.85rem;margin-top:4px">${p}% read</div>
        </div>
        <div style="display:grid;gap:8px;justify-items:end">
          <button class="btn btn-primary" id="cr-resume" data-book-id="${b.id}"><i class="fa-solid fa-play"></i> Resume</button>
          <a class="btn" style="text-decoration:none" href="book.html?id=${encodeURIComponent(b.id)}">Open</a>
        </div>
      </div>
    `;
        sec.style.display = "";
    }

    // Resume -> start timer for denne boka
    document.addEventListener("click", (e) => {
        const btn = e.target.closest("#cr-resume"); if (!btn) return;
        const id = btn.getAttribute("data-book-id") || "unknown";
        window.PageBudTimer?.start({ bookId: id });
    });

    // start når auth er klar
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            if (window.requireAuth) requireAuth(load); else load();
        });
    } else {
        if (window.requireAuth) requireAuth(load); else load();
    }
})();
