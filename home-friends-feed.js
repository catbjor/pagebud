// home-friends-feed.js — small preview of friends activity on homepage
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const userCache = new Map();

  function auth() {
    return (window.fb?.auth) || (window.firebase?.auth?.()) || firebase.auth();
  }
  function db() {
    return (window.fb?.db) || (window.firebase?.firestore?.()) || firebase.firestore();
  }


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
        s.forEach(d => all.push({ id: d.id, owner: id, ...d.data() }));
      } catch { }
      // best-effort public_activity
      try {
        const s2 = await fb.db.collection("users").doc(id).collection("public_activity")
          .orderBy("createdAt", "desc").limit(5).get();
        s2.forEach(d => all.push({ id: d.id, owner: id, ...d.data() }));
      } catch { }
    }
    // De-duplicate based on ID, since we might fetch from both private and public
    const unique = Array.from(new Map(all.map(item => [item.id, item])).values());
    unique.sort((a, b) => (toWhen(b)?.getTime?.() || 0) - (toWhen(a)?.getTime?.() || 0));
    return unique.slice(0, 6);
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

  async function loadAndRenderComments(rootEl) {
    const owner = rootEl.dataset.owner;
    const id = rootEl.dataset.id;
    const listEl = rootEl.querySelector('.comments-list');
    if (!listEl) return;

    listEl.innerHTML = '<p class="muted small">Loading comments...</p>';

    try {
      const commentsSnap = await db().collection("users").doc(owner).collection("activity").doc(id).collection("comments").orderBy("at", "asc").get();
      if (commentsSnap.empty) {
        listEl.innerHTML = ''; // No comments yet
        return;
      }

      let commentsHtml = '';
      for (const doc of commentsSnap.docs) {
        const comment = doc.data();
        const commenter = await getUserInfo(comment.uid);
        commentsHtml += `
                <div class="comment-item">
                    <img src="${commenter.photoURL || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}" class="comment-avatar" alt="">
                    <div class="comment-body">
                        <b>${commenter.displayName || 'A user'}</b>
                        <p>${comment.text}</p>
                    </div>
                </div>
            `;
      }
      listEl.innerHTML = commentsHtml;
    } catch (e) {
      console.error("Failed to load comments:", e);
      listEl.innerHTML = '<p class="muted small" style="color:red;">Could not load comments.</p>';
    }
  }

  async function render(items) {
    const host = document.getElementById("social-feed-preview-container");
    if (!host) return;
    if (!items.length) {
      host.innerHTML = `<div class="muted small" style="padding:10px 0">No recent activity yet.</div>`;
      return;
    }

    const me = auth().currentUser;
    let html = '';
    for (const it of items) {
      const user = await getUserInfo(it.owner);
      const when = toWhen(it);
      const time = when ? when.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : "";
      const isBookActivity = it.action?.startsWith('book_') || it.action === 'note_added';
      const likeN = Number(it.likeCount || 0);
      const comN = Number(it.commentCount || 0);

      let isLiked = false;
      if (me && it.id) {
        try {
          const likeSnap = await db().collection("users").doc(it.owner).collection("activity").doc(it.id).collection("likes").doc(me.uid).get();
          isLiked = likeSnap.exists;
        } catch (e) { /* ignore */ }
      }

      html += `
            <div class="feed-preview-item" data-owner="${it.owner}" data-id="${it.id}">
                <a href="profile.html?uid=${it.owner}" class="feed-avatar-link">
                    <img src="${user.photoURL || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}" alt="" class="avatar">
                </a>
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
                    <div class="feed-actions">
                        <button class="btn btn-secondary small btn-like ${isLiked ? 'active' : ''}" title="Like">
                            <i class="fa-solid fa-heart"></i> <span class="like-count">${likeN}</span>
                        </button>
                        <button class="btn btn-secondary small btn-comment" title="Comment">
                            <i class="fa-solid fa-comment"></i> ${comN}
                        </button>
                    </div>
                    <div class="comments-section" style="display:none;">
                        <div class="comments-list"></div>
                        <div class="comment-box">
                            <input class="comment-input" placeholder="Write a comment…" />
                            <button class="btn btn-primary small btn-send">Send</button>
                        </div>
                    </div>
                </div> 
            </div>
        `;
    }
    host.innerHTML = html;
  }

  function bindFeedActions(container) {
    if (!container) return;

    container.addEventListener("click", async (e) => {
      const root = e.target.closest(".feed-preview-item");
      if (!root) return;

      const owner = root.dataset.owner;
      const id = root.dataset.id;

      if (e.target.closest(".btn-like")) {
        const btn = e.target.closest(".btn-like");
        btn.disabled = true;
        try {
          const isNowLiked = await window.PBActivity?.like(owner, id);
          const countEl = btn.querySelector('.like-count');
          const currentCount = Number(countEl.textContent);
          countEl.textContent = isNowLiked ? currentCount + 1 : Math.max(0, currentCount - 1);
          btn.classList.toggle('active', isNowLiked);
        } finally {
          btn.disabled = false;
        }
        return;
      }

      if (e.target.closest(".btn-comment")) {
        const commentsSection = root.querySelector(".comments-section");
        if (commentsSection) {
          const isHidden = commentsSection.style.display === "none";
          commentsSection.style.display = isHidden ? "block" : "none";
          if (isHidden) loadAndRenderComments(root);
        }
        return;
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
          loadAndRenderComments(root);
        } catch (err) {
          console.error("Failed to post comment:", err);
          alert("Could not post comment.");
        }
        return;
      }
    });
  }

  function start() {
    requireAuth(async (me) => {
      userCache.clear();
      const uids = await getFriendsUids(me.uid);
      const items = await loadFew(uids);
      await render(items);
      const host = document.getElementById("social-feed-preview-container");
      bindFeedActions(host);
    });
  }

  window.startSocialFeedPreview = start; // Expose for script.js

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else start();
})();
