// home-friends-feed.js — small preview of friends activity on homepage
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const userCache = new Map();

  function toWhen(e) {
    if (e.createdAt?.toDate) return e.createdAt.toDate();
    if (e.createdAt?.seconds) return new Date(e.createdAt.seconds * 1000);
    if (e.at?.toDate) return e.at.toDate();
    if (e.at?.seconds) return new Date(e.at.seconds * 1000);
    if (typeof e.at === "number") return new Date(e.at);
    if (typeof e.createdAt === "string" || typeof e.createdAt === "number") return new Date(e.createdAt);
    return null;
  }

  async function getUserInfo(uid) {
    if (userCache.has(uid)) return userCache.get(uid);
    try {
      const doc = await fb.db.collection("users").doc(uid).get();
      const data = doc.exists ? doc.data() : { displayName: "A user" };
      userCache.set(uid, data);
      return data;
    } catch { return { displayName: "A user" }; }
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
      try { // Try private activity first (for self)
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
    if (t === "book_saved") return `saved a book: <b>${it.meta?.title || ''}</b>`;
    if (t === "book_finished") return `finished a book: <b>${it.meta?.title || ''}</b>`;
    if (t === "book_rated") return `rated <b>${it.meta?.title || ''}</b> ${it.meta?.rating}★`;
    if (t === "profile_updated") {
      if (it.meta?.updated === 'photo') return `updated their profile picture`;
      return `updated their profile`;
    }
    return t || "updated";
  }

  async function render(items) {
    const host = document.getElementById("social-feed-preview-container");
    if (!host) return;
    if (!items.length) {
      host.innerHTML = `<div class="muted small" style="padding:10px 0">No recent activity yet.</div>`;
      return;
    }

    let html = '';
    for (const it of items) {
      const user = await getUserInfo(it.owner);
      const when = toWhen(it);
      const time = when ? when.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : "";
      html += `
            <a href="profile.html?uid=${it.owner}" class="feed-preview-item">
                <img src="${user.photoURL || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}" alt="" class="avatar">
                <div class="text-content">
                    <div class="line-1"><b>${user.displayName || 'A user'}</b> ${line(it)}</div>
                    <div class="muted small">${time}</div>
                </div>
            </a>
        `;
    }
    host.innerHTML = html;
  }

  function start() {
    requireAuth(async (me) => {
      userCache.clear();
      const uids = await getFriendsUids(me.uid);
      const items = await loadFew(uids);
      render(items);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else start();
})();
