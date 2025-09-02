// feed-lazy.js — Infinite scroll feed for PageBud
(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const FEED_LIMIT = 20;
    let lastDoc = null;
    let isLoading = false;
    let hasMore = true;

    async function loadPage() {
        if (isLoading || !hasMore) return;
        isLoading = true;

        const user = fb?.auth?.currentUser;
        if (!user) return;

        const container = $("#feedContainer");
        if (!container) return;

        const query = fb.db.collection("users").doc(user.uid)
            .collection("activity")
            .orderBy("createdAt", "desc")
            .limit(FEED_LIMIT);

        const snap = lastDoc ? await query.startAfter(lastDoc).get() : await query.get();

        if (snap.empty) {
            hasMore = false;
            if (lastDoc === null) container.innerHTML = "<p>No feed items found.</p>";
            return;
        }

        snap.docs.forEach(doc => {
            const d = doc.data();
            const el = document.createElement("div");
            el.className = "card";
            el.style.marginBottom = "10px";
            el.innerHTML = `
        <div><strong>${d.action || "Unknown"}</strong> — ${d.createdAt?.toDate?.().toLocaleString?.() || ""}</div>
        <div class="muted small">${doc.id}</div>`;
            container.appendChild(el);
        });

        lastDoc = snap.docs[snap.docs.length - 1];
        isLoading = false;
    }

    function setupInfiniteScroll() {
        const target = $("#feedSentinel");
        if (!target || !("IntersectionObserver" in window)) {
            console.warn("No IntersectionObserver support or missing #feedSentinel");
            return;
        }

        const io = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) loadPage();
        });

        io.observe(target);
    }

    function boot() {
        loadPage();
        setupInfiniteScroll();
    }

    document.addEventListener("DOMContentLoaded", () => {
        if (typeof requireAuth === "function") {
            requireAuth(() => boot());
        } else {
            const wait = setInterval(() => {
                if (fb?.auth?.currentUser) {
                    clearInterval(wait);
                    boot();
                }
            }, 300);
        }
    });
})();
