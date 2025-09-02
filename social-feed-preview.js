// social-feed-preview.js — small “latest from friends” preview on homepage
(function () {
    "use strict";
    const $ = (s, r = document) => r.querySelector(s);
    const LIMIT = Number(localStorage.getItem("pb:feedPreviewLimit") || "5");

    const TYPE_TEXT = {
        addedBook: (e) => `📚 ${e.byName} added “${e.title}”`,
        startedReading: (e) => `📖 ${e.byName} started “${e.title}”`,
        finishedBook: (e) => `✅ ${e.byName} finished “${e.title}”${e.rating ? ` — ⭐ ${e.rating}` : ""}`,
        ratedBook: (e) => `⭐ ${e.byName} rated “${e.title}” ${e.rating}`,
        noteAdded: (e) => `📝 ${e.byName} noted on “${e.title}”`,
        statusChanged: (e) => `🔄 ${e.byName} set “${e.title}” → ${e.status}`
    };

    function toWhen(e) {
        // Prefer Firestore Timestamp 'createdAt'; fallback to older 'at'
        if (e.createdAt?.toDate) return e.createdAt.toDate();
        if (e.createdAt?.seconds) return new Date(e.createdAt.seconds * 1000);
        if (e.at?.toDate) return e.at.toDate();
        if (e.at?.seconds) return new Date(e.at.seconds * 1000);
        if (typeof e.at === "number") return new Date(e.at);
        return null;
    }

    function render(host, items) {
        if (!host) return;
        if (!items.length) {
            host.innerHTML = `<div class="muted">No recent activity from friends yet.</div>`;
            return;
        }
        host.innerHTML = items.map(e => {
            const txt = (TYPE_TEXT[e.type] ? TYPE_TEXT[e.type](e) : `${e.byName} did something`);
            const whenDate = toWhen(e);
            const when = whenDate ? whenDate.toLocaleString() : "";
            return `
        <div class="card list" style="display:flex; gap:10px; align-items:center; padding:8px 10px; margin-bottom:8px">
          <img src="${e.cover || 'icons/icon-192.png'}" alt="" style="width:22px;height:33px;object-fit:cover;border-radius:4px">
          <div style="flex:1;min-width:0">
            <div class="line-1">${txt}</div>
            <div class="muted" style="font-size:.75rem">${when}</div>
          </div>
        </div>`;
        }).join("") + `
      <div style="text-align:center; margin-top:6px">
        <a class="btn btn-secondary" href="feed.html">See more</a>
      </div>`;
    }

    async function buildPreview(me, host) {
        const friendsSnap = await fb.db.collection("users").doc(me.uid).collection("friends")
            .where("status", "==", "accepted").get();
        const friendIds = friendsSnap.docs.map(d => d.id);
        if (!friendIds.length) { render(host, []); return; }

        // get last N per friend, merge, sort by createdAt (fallback at)
        const perFriend = Math.max(LIMIT, 10);
        const tasks = friendIds.map(uid =>
            fb.db.collection("users").doc(uid).collection("activity")
                .orderBy("createdAt", "desc").limit(perFriend).get()
                .then(s => s.docs.map(d => ({ id: d.id, ...d.data() })))
                .catch(() => [])
        );

        const chunks = await Promise.all(tasks);
        const merged = chunks.flat().sort((a, b) => {
            const ad = toWhen(a)?.getTime?.() || 0;
            const bd = toWhen(b)?.getTime?.() || 0;
            return bd - ad;
        }).slice(0, LIMIT);

        render(host, merged);
    }

    // This function is called from index.html
    window.renderSocialFeedPreview = function () {
        const host = $("#social-feed-preview-container");
        if (!host) {
            // Don't throw an error, just warn. This prevents breaking other scripts.
            console.warn("Social feed preview container not found on this page.");
            return;
        }
        requireAuth(async (me) => { await buildPreview(me, host); });
    };
})();
