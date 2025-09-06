// home-friends-feed.js — small preview of friends activity on homepage
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const userCache = new Map();

  const phCover =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600">
         <rect width="100%" height="100%" rx="12" fill="#e5e7eb"/>
         <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
               font-size="22" fill="#9aa3af" font-family="system-ui,-apple-system,Segoe UI,Roboto">No cover</text>
       </svg>`
    );

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
    const t = it.action || it.type;
    if (t === "book_saved") return `added a new book:`;
    if (t === "book_finished") return `finished reading:`;
    if (t === "book_rated") return `rated a book:`;
    if (t === "note_added") return `wrote a note on:`;
    if (t === "profile_updated") {
      if (it.meta?.updated === 'photo') return `updated their profile picture`;
      return `updated their profile`;
    }
    // Fallback for older activity types
    if (t === "progress_updated") return `is reading:`;
    if (t === "file_attached") return `attached a file to:`;
    return "updated:";
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
      const time = when ? when.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : "";
      const isBookActivity = it.action?.startsWith('book_') || it.action === 'note_added';

      html += `
            <a href="profile.html?uid=${it.owner}" class="feed-preview-item">
                <img src="${user.photoURL || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}" alt="" class="avatar">
                <div class="feed-content">
                    <div class="feed-line-1"><b>${user.displayName || 'A user'}</b> ${line(it)}</div>
                    ${isBookActivity && it.meta?.title ? `
                        <div class="feed-book-snippet">
                            <img src="${it.meta.coverUrl || phCover}" class="feed-book-cover" alt="Cover for ${it.meta.title}">
                            <div>
                                <div class="feed-book-title">${it.meta.title}</div>
                                <div class="feed-book-author">${it.meta.author || ''}</div>
                            </div>
                        </div>
                    ` : ''}
                    <div class="muted small feed-timestamp">${time}</div>
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
