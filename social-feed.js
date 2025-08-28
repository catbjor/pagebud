// social-feed.js
(function () {
    const FEED_LIMIT = 20;
    const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    function escapeHTML(s) { return String(s || "").replace(/[&<>"']/g, m => ESC[m]); }

    // Kalles når bruker lagrer bok med rating
    window.publishActivity = async function (book) {
        try {
            const u = fb.auth.currentUser; if (!u) return;
            if (!book?.title || !book?.rating) return;

            const ref = fb.db.collection("users").doc(u.uid).collection("activities").doc();
            await ref.set({
                type: "rating",
                title: book.title || "",
                author: book.author || "",
                rating: Number(book.rating) || 0,
                bookId: book.id || "",
                at: firebase.firestore.FieldValue.serverTimestamp(),
                user: {
                    uid: u.uid,
                    name: u.displayName || (u.email || "").split("@")[0],
                    photoURL: u.photoURL || ""
                }
            });
        } catch (e) { console.warn("publishActivity failed", e); }
    };

    // Leser venners aktiviteter
    window.startSocialFeed = async function () {
        const u = fb.auth.currentUser; if (!u) return;
        const feedEl = document.getElementById("friends-feed");
        if (!feedEl) return;

        const friendsSnap = await fb.db.collection("users").doc(u.uid).collection("friends").get();
        const friendIds = friendsSnap.docs.map(d => d.id);

        if (!friendIds.length) {
            feedEl.innerHTML = `<div class="muted">Add friends to see their ratings.</div>`;
            return;
        }

        const unsubs = [];
        const items = [];
        function render() {
            if (!items.length) {
                feedEl.innerHTML = `<div class="muted">No recent activity yet.</div>`;
                return;
            }
            const sorted = items.sort((a, b) => (b.at?.toMillis?.() || 0) - (a.at?.toMillis?.() || 0)).slice(0, FEED_LIMIT);
            feedEl.innerHTML = sorted.map(x => `
        <div style="display:flex;gap:10px;align-items:flex-start;border-bottom:1px solid var(--border);padding:10px 0">
          <img src="${x.user.photoURL || 'icons/icon-192.png'}" alt="" style="width:32px;height:32px;border-radius:50%">
          <div>
            <div><b>${escapeHTML(x.user.name || 'Friend')}</b> rated <b>${escapeHTML(x.title)}</b> ${"★".repeat(Math.round(x.rating))}</div>
            <div class="muted" style="font-size:.85rem">${escapeHTML(x.author || "")}</div>
          </div>
        </div>`).join("");
        }

        friendIds.forEach(fid => {
            const unsub = fb.db.collection("users").doc(fid).collection("activities")
                .orderBy("at", "desc").limit(10)
                .onSnapshot(s => {
                    for (let i = items.length - 1; i >= 0; i--) if (items[i].user?.uid === fid) items.splice(i, 1);
                    s.forEach(d => items.push(d.data()));
                    render();
                });
            unsubs.push(unsub);
        });

        window.addEventListener("beforeunload", () => unsubs.forEach(u => u && u()));
    };
})();