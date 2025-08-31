// social-feed.js — reads friends' activity, renders into #friends-feed, enables like/comment
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);

  async function getFriendsUids(uid) {
    // friends subcollection: { friendUid, status: "accepted" }
    const out = new Set([uid]); // include self
    try {
      const col = fb.db.collection("users").doc(uid).collection("friends");
      const snap = await col.where("status", "==", "accepted").get();
      snap.forEach(d => { const x = d.data(); if (x.friendUid) out.add(x.friendUid); });
    } catch { }
    return Array.from(out);
  }

  async function loadActivities(uids, limitPerUser = 15) {
    const all = [];
    for (const id of uids) {
      try {
        const snap = await fb.db.collection("users").doc(id).collection("activity")
          .orderBy("createdAt", "desc").limit(limitPerUser).get();
        snap.forEach(d => all.push({ id: d.id, owner: id, ...d.data() }));
      } catch { }
    }
    // sort global
    all.sort((a, b) => (b.createdAt?.toMillis?.() || new Date(b.createdAt || 0).getTime()) -
      (a.createdAt?.toMillis?.() || new Date(a.createdAt || 0).getTime()));
    return all.slice(0, 60);
  }

  function iconFor(type) {
    if (type === "started") return "fa-play";
    if (type === "finished") return "fa-flag-checkered";
    if (type === "rated") return "fa-star";
    if (type === "note") return "fa-pen";
    return "fa-book";
  }

  function lineFor(item) {
    const t = item.type;
    if (t === "started") return `started <b>${esc(item.title)}</b>`;
    if (t === "finished") return `finished <b>${esc(item.title)}</b> ${item.rating ? `(${item.rating}★)` : ""}`;
    if (t === "rated") return `rated <b>${esc(item.title)}</b> ${item.rating}★`;
    if (t === "note") return `wrote a note on <b>${esc(item.title)}</b>`;
    return `updated <b>${esc(item.title)}</b>`;
  }

  function esc(s) { return (s || "").replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  function itemHTML(it, meUid) {
    const liked = false; // we resolve on click; for speed we don’t prefetch
    const cover = it.cover ? `<img src="${it.cover}" alt="" style="width:42px;height:58px;object-fit:cover;border-radius:6px;border:1px solid var(--border)">` : "";
    const when = it.createdAt?.toDate ? it.createdAt.toDate().toLocaleString() : (new Date(it.createdAt || Date.now())).toLocaleString();
    return `
      <div class="feed-item" data-owner="${it.owner}" data-id="${it.id}" style="display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border)">
        ${cover}
        <div style="flex:1;min-width:0">
          <div class="muted" style="font-size:.85rem"><i class="fa-solid ${iconFor(it.type)}"></i> ${when}</div>
          <div style="font-weight:700;margin:2px 0">${lineFor(it)}</div>
          ${it.type === "note" && it.text ? `<div class="muted" style="margin-top:4px">${esc(it.text)}</div>` : ``}
          <div class="row" style="display:flex;gap:8px;align-items:center;margin-top:8px">
            <button class="btn btn-secondary btn-like"><i class="fa-solid fa-heart"></i> ${Number(it.likeCount || 0)}</button>
            <button class="btn btn-secondary btn-comment"><i class="fa-solid fa-comment"></i> ${Number(it.commentCount || 0)}</button>
            ${it.bookId ? `<a class="btn" href="reader.html?id=${encodeURIComponent(it.bookId)}"><i class="fa-solid fa-book-open"></i> Open</a>` : ``}
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
          // quick bump in UI
          const b = root.querySelector(".btn-like");
          const n = Number((b.textContent || "0").replace(/\D/g, "")) || 0;
          const next = liked ? n + 1 : Math.max(0, n - 1);
          b.innerHTML = `<i class="fa-solid fa-heart"></i> ${next}`;
        } catch { }
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
        } catch { }
      }
    });
  }

  async function renderFeed() {
    const feed = $("#friends-feed"); if (!feed) return;
    feed.innerHTML = `<div class="muted">Loading…</div>`;
    const u = fb?.auth?.currentUser; if (!u) return;

    const uids = await getFriendsUids(u.uid);
    const items = await loadActivities(uids);
    if (!items.length) {
      feed.innerHTML = `<div class="muted">No recent activity yet.</div>`;
      return;
    }
    feed.innerHTML = items.map(it => itemHTML(it, u.uid)).join("");
    bindActions(feed);
  }

  // Public
  window.startSocialFeed = renderFeed;
})();
