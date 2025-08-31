// social-feed-preview.js — liten “siste X fra venner” til forsiden
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

    function render(host, items) {
        if (!host) return;
        if (!items.length) {
            host.innerHTML = `<div class="muted">No recent activity from friends yet.</div>`;
            return;
        }
        host.innerHTML = items.map(e => {
            const txt = (TYPE_TEXT[e.type] ? TYPE_TEXT[e.type](e) : `${e.byName} did something`);
            const when = e.at ? new Date(e.at.seconds ? e.at.seconds * 1000 : e.at).toLocaleString() : "";
            return `
        <div class="card list" style="display:flex; gap:10px; align-items:center; padding:8px 10px; margin-bottom:8px">
          <img src="${e.cover || 'icons/icon-192.png'}" alt="" style="width:22px;height:33px;object-fit:cover;border-radius:4px">
          <div style="flex:1">
            <div class="line-1">${txt}</div>
            <div class="muted" style="font-size:.75rem">${when}</div>
          </div>
        </div>`;
        }).join("") + `
      <div style="text-align:center; margin-top:6px">
        <a class="btn btn-secondary" href="feed.html">See more</a>
      </div>
    `;
    }

    // Flett siste N fra alle venner
    async function buildPreview(me, host) {
        const friendsSnap = await fb.db.collection("users").doc(me.uid).collection("friends").get();
        const friendIds = friendsSnap.docs.map(d => d.id);
        if (!friendIds.length) { render(host, []); return; }

        // Hent siste 10 per venn (liten buffer), slå sammen og ta topp LIMIT
        const tasks = friendIds.map(uid =>
            fb.db.collection("users").doc(uid).collection("activity")
                .orderBy("at", "desc").limit(Math.max(LIMIT, 10)).get()
                .then(s => s.docs.map(d => ({ id: d.id, ...d.data() })))
                .catch(() => []));
        const chunks = await Promise.all(tasks);
        const merged = chunks.flat()
            .sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0))
            .slice(0, LIMIT);
        render(host, merged);
    }

    window.startSocialFeedPreview = function () {
        const host = $("#friends-feed");
        if (!host) return;
        requireAuth(async (me) => { await buildPreview(me, host); });
    };
})();
