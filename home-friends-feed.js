// home-friends-feed.js — small preview of friends activity on homepage
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);

  function toWhen(e) {
    if (e.createdAt?.toDate) return e.createdAt.toDate();
    if (e.createdAt?.seconds) return new Date(e.createdAt.seconds * 1000);
    if (e.at?.toDate) return e.at.toDate();
    if (e.at?.seconds) return new Date(e.at.seconds * 1000);
    if (typeof e.at === "number") return new Date(e.at);
    if (typeof e.createdAt === "string" || typeof e.createdAt === "number") return new Date(e.createdAt);
    return null;
  }

  async function getFriendsUids(uid) {
    const out = new Set([uid]);
    try {
      const snap = await fb.db.collection("users").doc(uid).collection("friends")
        .where("status", "==", "accepted").get();
      snap.forEach(d => out.add(d.id));
    } catch { }
    return Array.from(out);
  }

  async function loadFew(uids) {
    const all = [];
    for (const id of uids) {
      try {
        const s = await fb.db.collection("users").doc(id).collection("activity")
          .orderBy("createdAt", "desc").limit(5).get();
        s.forEach(d => all.push({ owner: id, ...d.data() }));
      } catch { }
      // best-effort public_activity
      try {
        const s2 = await fb.db.collection("users").doc(id).collection("public_activity")
          .orderBy("createdAt", "desc").limit(5).get();
        s2.forEach(d => all.push({ owner: id, ...d.data() }));
      } catch { }
    }
    all.sort((a, b) => (toWhen(b)?.getTime?.() || 0) - (toWhen(a)?.getTime?.() || 0));
    return all.slice(0, 6);
  }

  function line(it) {
    const t = it.type || it.action;
    if (t === "progress_updated" && it.meta?.kind === "pdf" && it.meta.page) return `Reading… page ${it.meta.page}`;
    if (t === "progress_updated" && it.meta?.kind === "epub" && (it.meta.percent || it.meta.percent === 0)) return `Reading… ${it.meta.percent}%`;
    if (t === "file_attached") return `Attached a ${it.meta?.kind || "file"}`;
    if (t === "book_saved") return `Saved a book`;
    if (t === "finished") return `Finished a book`;
    if (t === "rated") return `Rated ${it.rating}★`;
    return t || "updated";
  }

  function render(items) {
    const host = document.getElementById("social-feed-preview-container");
    if (!host) return;
    if (!items.length) {
      host.innerHTML = `<div class="muted small" style="padding:10px 0">No recent activity yet.</div>`;
      return;
    }
    host.innerHTML = items.map(it => {
      const when = toWhen(it);
      const time = when ? when.toLocaleString() : "";
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
          <div style="font-weight:600">${line(it)}</div>
          <div class="muted small">${time}</div>
        </div>
      `;
    }).join("");
  }

  function start() {
    requireAuth(async (me) => {
      const uids = await getFriendsUids(me.uid);
      const items = await loadFew(uids);
      render(items);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else start();
})();
