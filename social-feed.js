// social-feed.js — friends' activity feed (best-effort).
// Renders into #friends-feed and wires like/comment actions.
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
  function esc(s) { return (s || "").replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  async function getFriendsUids(uid) {
    const out = new Set([uid]); // include self always
    try {
      const snap = await fb.db.collection("users").doc(uid).collection("friends")
        .where("status", "==", "accepted").get();
      snap.forEach(d => out.add(d.id));
    } catch { /* ignore */ }
    return Array.from(out);
  }

  async function loadUserActivities(uid, limit = 30) {
    // 1) try users/{uid}/public_activity (cross-readable if rules allow)
    try {
      const s = await fb.db.collection("users").doc(uid).collection("public_activity")
        .orderBy("createdAt", "desc").limit(limit).get();
      if (!s.empty) return s.docs.map(d => ({ id: d.id, owner: uid, ...d.data() }));
    } catch { }
    // 2) fallback to private users/{uid}/activity (works for self)
    try {
      const s = await fb.db.collection("users").doc(uid).collection("activity")
        .orderBy("createdAt", "desc").limit(limit).get();
      if (!s.empty) return s.docs.map(d => ({ id: d.id, owner: uid, ...d.data() }));
    } catch { }
    return [];
  }

  async function loadActivities(uids, limitPerUser = 20) {
    const chunks = await Promise.all(uids.map(u => loadUserActivities(u, limitPerUser)));
    const all = chunks.flat();
    all.sort((a, b) => {
      const ad = toWhen(a)?.getTime?.() || 0;
      const bd = toWhen(b)?.getTime?.() || 0;
      return bd - ad;
    });
    return all.slice(0, 120);
  }

  function iconFor(type) {
    if (type === "book_saved") return "fa-floppy-disk";
    if (type === "file_attached") return "fa-paperclip";
    if (type === "progress_updated") return "fa-book-open";
    if (type === "started") return "fa-play";
    if (type === "finished") return "fa-flag-checkered";
    if (type === "rated") return "fa-star";
    if (type === "note") return "fa-pen";
    return "fa-book";
  }
  function lineFor(item) {
    const t = item.type || item.action;
    const title = item.title ? `“${esc(item.title)}”` : (item.meta?.title ? `“${esc(item.meta.title)}”` : "");
    if (t === "book_saved") return `saved <b>${title || "a book"}</b>`;
    if (t === "file_attached") return `attached a ${esc(item.meta?.kind || "file")} ${title}`;
    if (t === "progress_updated") {
      if (item.meta?.kind === "pdf" && item.meta.page) return `reading… page ${item.meta.page}`;
      if (item.meta?.kind === "epub" && (item.meta.percent || item.meta.percent === 0)) return `reading… ${item.meta.percent}%`;
      return `reading…`;
    }
    if (t === "started") return `started <b>${title}</b>`;
    if (t === "finished") return `finished <b>${title}</b>${item.rating ? ` — ${esc(String(item.rating))}★` : ""}`;
    if (t === "rated") return `rated <b>${title}</b> ${esc(String(item.rating))}★`;
    if (t === "note") return `wrote a note on <b>${title}</b>`;
    return `updated <b>${title}</b>`;
  }

  function itemHTML(it) {
    const when = toWhen(it);
    const whenTxt = when ? when.toLocaleString() : "";
    const likeN = Number(it.likeCount || 0);
    const comN = Number(it.commentCount || 0);
    return `
      <div class="feed-item" data-owner="${it.owner}" data-id="${it.id}"
           style="display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1;min-width:0">
          <div class="muted" style="font-size:.85rem"><i class="fa-solid ${iconFor(it.type || it.action)}"></i> ${whenTxt}</div>
          <div style="font-weight:700;margin:2px 0">${lineFor(it)}</div>
          <div class="row" style="display:flex;gap:8px;align-items:center;margin-top:8px">
            <button class="btn btn-secondary btn-like"><i class="fa-solid fa-heart"></i> ${likeN}</button>
            <button class="btn btn-secondary btn-comment"><i class="fa-solid fa-comment"></i> ${comN}</button>
          </div>
          <div class="comment-box" style="display:none;margin-top:8px">
            <input class="comment-input" placeholder="Write a comment…" />
            <button class="btn btn-primary btn-send" style="margin-left:6px">Send</button>
          </div>
        </div>
      </div>`;
  }

  function bindActions(container) {
    container.addEventListener("click", async (e) => {
      const root = e.target.closest(".feed-item"); if (!root) return;
      const owner = root.dataset.owner, id = root.dataset.id;

      if (e.target.closest(".btn-like")) {
        try {
          const liked = await window.PBActivity?.like(owner, id);
          const b = root.querySelector(".btn-like");
          const n = Number((b.textContent || "0").replace(/\D/g, "")) || 0;
          b.innerHTML = `<i class="fa-solid fa-heart"></i> ${liked ? n + 1 : Math.max(0, n - 1)}`;
        } catch { /* noop */ }
      }
      if (e.target.closest(".btn-comment")) {
        const box = root.querySelector(".comment-box");
        if (box) box.style.display = box.style.display === "none" ? "" : "none";
      }
      if (e.target.closest(".btn-send")) {
        const inp = root.querySelector(".comment-input");
        const txt = (inp?.value || "").trim();
        if (!txt) return;
        try {
          await window.PBActivity?.comment(owner, id, txt);
          const b = root.querySelector(".btn-comment");
          const n = Number((b.textContent || "0").replace(/\D/g, "")) || 0;
          b.innerHTML = `<i class="fa-solid fa-comment"></i> ${n + 1}`;
          inp.value = "";
          window.toast?.("Comment posted ✓");
        } catch { /* noop */ }
      }
    });
  }

  async function renderFeed() {
    const feed = $("#friends-feed"); if (!feed) return;
    feed.innerHTML = `<div class="muted">Loading…</div>`;

    requireAuth(async (me) => {
      const uids = await getFriendsUids(me.uid);
      const items = await loadActivities(uids);
      if (!items.length) {
        feed.innerHTML = `<div class="muted">No recent activity yet.</div>`;
        return;
      }
      feed.innerHTML = items.map(itemHTML).join("");
      bindActions(feed);
    });
  }

  window.startSocialFeed = renderFeed;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { if ($("#friends-feed")) renderFeed(); });
  } else {
    if ($("#friends-feed")) renderFeed();
  }
})();
