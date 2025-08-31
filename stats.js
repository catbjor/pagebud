// stats.js — loads after firebase-init.js
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  let uid = null;

  document.addEventListener("firebase-ready", () => {
    requireAuth(async (user) => {
      uid = user.uid;
      $("#statsMount").textContent = "Loading charts…";
      try {
        // example: count books
        const booksSnap = await fb.db.collection("users").doc(uid).collection("books").get();
        const n = booksSnap.size;
        $("#statsMount").innerHTML = `
          <div style="display:grid;gap:10px">
            <div class="stat-card"><div class="stat-title">Books saved</div><div class="stat-value">${n}</div></div>
            <div class="muted">Charts go here (your previous detailed stats.js still works if you prefer).</div>
          </div>`;
      } catch (e) {
        $("#statsMount").textContent = "Failed to load stats.";
      }
    });
  });

  // cache reset button
  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btnQuickReset")?.addEventListener("click", async () => {
      if (!confirm("Reset caches (keep login)?")) return;
      await window.pbResetCaches?.({ full: false });
      location.reload();
    });
  });
})();
