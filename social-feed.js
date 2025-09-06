// social-feed.js — friends' activity feed (best-effort).
// Renders into #friends-feed and wires like/comment actions.
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
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
  function esc(s) { return (s || "").replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  const libraryCache = new Set();

  // New function to populate the cache of books in the user's library
  async function buildLibraryCache(uid) {
    libraryCache.clear();
    try {
      const snap = await fb.db.collection("users").doc(uid).collection("books").get();
      snap.forEach(doc => {
        const title = doc.data()?.title?.toLowerCase();
        if (title) libraryCache.add(title);
      });
    } catch (e) {
      console.warn("Could not build library cache", e);
    }
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
    if (type === "profile_updated") return "fa-user-pen";
    return "fa-book";
  }
  function lineFor(item, user) {
    const t = item.type || item.action;
    const title = item.title ? `“${esc(item.title)}”` : (item.meta?.title ? `“${esc(item.meta.title)}”` : "");
    const userName = `<b>${esc(user.displayName || 'A user')}</b>`;

    if (t === "book_saved") return `${userName} saved ${title || "a book"}`;
    if (t === "file_attached") return `${userName} attached a ${esc(item.meta?.kind || "file")} to ${title}`;
    if (t === "progress_updated") {
      if (item.meta?.kind === "pdf" && item.meta.page) return `${userName} is reading ${title}… page ${item.meta.page}`;
      if (item.meta?.kind === "epub" && (item.meta.percent || item.meta.percent === 0)) return `${userName} is reading ${title}… ${item.meta.percent}%`;
      return `${userName} is reading ${title}`;
    }
    if (t === "started") return `${userName} started ${title}`;
    if (t === "finished") return `${userName} finished ${title}${item.rating ? ` — ${esc(String(item.rating))}★` : ""}`;
    if (t === "rated") return `${userName} rated ${title} ${esc(String(item.rating))}★`;
    if (t === "note") return `${userName} wrote a note on ${title}`;
    if (t === "profile_updated") {
      if (item.meta?.updated === 'photo') return `${userName} updated their profile picture`;
      return `${userName} updated their profile`;
    }
    return `${userName} updated ${title}`;
  }

  async function itemHTML(it) {
    const me = auth().currentUser;
    const user = await getUserInfo(it.owner);
    const when = toWhen(it);
    const whenTxt = when ? when.toLocaleString() : "";
    const likeN = Number(it.likeCount || 0);
    const comN = Number(it.commentCount || 0);

    // Check if the current user has liked this item
    let isLiked = false;
    if (me) {
      try {
        const likeSnap = await db().collection("users").doc(it.owner).collection("activity").doc(it.id).collection("likes").doc(me.uid).get();
        isLiked = likeSnap.exists;
      } catch (e) { /* ignore, assume not liked */ }
    }

    // Check if book is in library to conditionally show "Add" button
    const bookTitle = it.meta?.title?.toLowerCase();
    const inLibrary = bookTitle ? libraryCache.has(bookTitle) : false;

    // Conditionally create the "Add to Library" button
    let actionButton = '';
    const isBookActivity = it.action?.startsWith('book_') || it.type?.startsWith('book_');
    if (isBookActivity && !inLibrary && it.owner !== me.uid) {
      const bookData = JSON.stringify({
        title: it.meta?.title || 'Unknown Title',
        author: it.meta?.author || 'Unknown Author',
        coverUrl: it.meta?.coverUrl || '',
        workKey: it.meta?.workKey || null,
      });
      actionButton = `<button class="btn btn-secondary btn-add-to-tbr" data-book='${esc(bookData)}'><i class="fa-solid fa-plus"></i> Add to TBR</button>`;
    }

    return `
      <div class="feed-item" data-owner="${it.owner}" data-id="${it.id}"
           style="display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--border)">
        <img src="${user.photoURL || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;background:var(--surface);">
        <div style="flex:1;min-width:0">
          <div style="font-weight:500;margin:2px 0">${lineFor(it, user)}</div>
          <div class="muted" style="font-size:.85rem; margin-top: 4px;"><i class="fa-solid ${iconFor(it.type || it.action)}"></i> ${whenTxt}</div>
          <div class="row" style="display:flex;gap:8px;align-items:center;margin-top:8px">
            <button class="btn btn-secondary btn-like ${isLiked ? 'active' : ''}"><i class="fa-solid fa-heart"></i> <span class="like-count">${likeN}</span></button>
            <button class="btn btn-secondary btn-comment"><i class="fa-solid fa-comment"></i> ${comN}</button>
            ${actionButton}
          </div>
          <div class="comments-section" style="display:none;margin-top:12px;">
            <div class="comments-list"></div>
            <div class="comment-box" style="margin-top:8px">
              <input class="comment-input" placeholder="Write a comment…" />
              <button class="btn btn-primary btn-send" style="margin-left:6px">Send</button>
            </div>
          </div>
        </div>
      </div>`;
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
                        <b>${esc(commenter.displayName || 'A user')}</b>
                        <p>${esc(comment.text)}</p>
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

  async function saveBookToTBR(bookData) {
    const user = auth().currentUser;
    if (!user) throw new Error("Not signed in");
    const payload = {
      id: `feed_${Math.random().toString(36).slice(2, 10)}`,
      title: bookData.title,
      author: bookData.author,
      coverUrl: bookData.coverUrl || '',
      workKey: bookData.workKey || null,
      status: 'tbr',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    const col = db().collection("users").doc(user.uid).collection("books");
    await col.doc(payload.id).set(payload);
  }

  function bindActions(container) {
    container.addEventListener("click", async (e) => {
      const root = e.target.closest(".feed-item"); if (!root) return;
      const owner = root.dataset.owner, id = root.dataset.id;

      if (e.target.closest(".btn-like")) {
        const btn = e.target.closest(".btn-like");
        btn.disabled = true;
        try {
          const isNowLiked = await window.PBActivity?.like(owner, id);
          const countEl = btn.querySelector('.like-count');
          const currentCount = Number(countEl.textContent);
          countEl.textContent = isNowLiked ? currentCount + 1 : currentCount - 1;
          btn.classList.toggle('active', isNowLiked);
        } finally {
          btn.disabled = false;
        }
      }

      if (e.target.closest(".btn-comment")) {
        const commentsSection = root.querySelector(".comments-section");
        if (commentsSection) {
          const isHidden = commentsSection.style.display === "none";
          commentsSection.style.display = isHidden ? "block" : "none";
          if (isHidden) {
            loadAndRenderComments(root); // Load comments when shown
          }
        }
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
      if (e.target.closest(".btn-add-to-tbr")) {
        const btn = e.target.closest(".btn-add-to-tbr");
        const bookData = JSON.parse(btn.dataset.book);
        btn.disabled = true;
        try {
          await saveBookToTBR(bookData);
          btn.textContent = 'Added ✓';
          libraryCache.add(bookData.title.toLowerCase()); // Update cache
        } catch (err) {
          console.error("Failed to add book from feed:", err);
          alert("Could not add book.");
          btn.disabled = false;
        }
      }
    });
  }

  async function renderFeed() {
    const feed = $("#friends-feed"); if (!feed) return;
    feed.innerHTML = `<div class="muted">Loading…</div>`;

    requireAuth(async (me) => {
      userCache.clear();
      await buildLibraryCache(me.uid);
      const uids = await getFriendsUids(me.uid);
      const items = await loadActivities(uids);
      if (!items.length) {
        feed.innerHTML = `<div class="muted">No recent activity yet.</div>`;
        return;
      }
      const htmlChunks = await Promise.all(items.map(itemHTML));
      feed.innerHTML = htmlChunks.join("");
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
