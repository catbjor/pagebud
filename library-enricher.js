// library-enricher.js — fyller subjects + workKey (og ev. year/cover) på bøker som mangler
(function () {
    "use strict";

    // Helper to wait for an authenticated user
    async function requireUser() {
        const a = (window.fb?.auth) || (window.firebase?.auth?.());
        if (!a) return null;
        if (a.currentUser) return a.currentUser;
        return new Promise((res) => { const off = a.onAuthStateChanged(u => { off(); res(u || null); }); });
    }

    const DAY_KEY = "pb:enrich:lastDay";
    const RUNNING_KEY = "pb:enrich:running";

    const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
    const shouldRun = () => { try { return localStorage.getItem(DAY_KEY) !== today(); } catch { return true; } };
    const markRun = () => { try { localStorage.setItem(DAY_KEY, today()); } catch { } };

    async function olJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error("fetch failed"); return r.json(); }
    async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    async function searchOne(title, author) {
        const u = new URL("https://openlibrary.org/search.json");
        if (title) u.searchParams.set("title", title);
        if (author) u.searchParams.set("author", author);
        u.searchParams.set("limit", "1");
        const s = await olJSON(u.toString());
        const d = Array.isArray(s.docs) ? s.docs[0] : null;
        if (!d) return null;
        const workKey = d.key || (Array.isArray(d.work_key) ? d.work_key[0] : null) || null;
        const year = d.first_publish_year || d.publish_year?.[0] || "";
        const cover = d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : "";
        return { workKey, year, cover };
    }

    async function fetchSubjects(workKey) {
        if (!workKey) return [];
        try {
            const meta = await olJSON(`https://openlibrary.org${workKey}.json`);
            return Array.isArray(meta?.subjects) ? meta.subjects.slice(0, 12) : [];
        } catch { return []; }
    }

    async function run(limit = 15) {
        if (!shouldRun()) return { status: "skipped" };
        if (localStorage.getItem(RUNNING_KEY) === "1") return { status: "skipped" };
        try { localStorage.setItem(RUNNING_KEY, "1"); } catch { }

        // This script now ONLY works with Firestore to avoid using stale local data.
        const user = await requireUser();
        const db = (window.fb?.db) || (window.firebase?.firestore?.());

        if (!user || !db) {
            console.warn("Enricher: User not signed in or DB not ready. Skipping.");
            try { localStorage.removeItem(RUNNING_KEY); } catch { }
            return { status: "skipped_no_auth" };
        }

        let books = [];
        try {
            // Force a server read to bypass the local cache, which can be stale after
            // deletions and cause this script to inadvertently "undelete" books.
            const snap = await db.collection("users").doc(user.uid).collection("books").limit(500).get({ source: 'server' });
            snap.forEach(d => {
                const x = d.data() || {};
                x.__id = d.id;
                books.push(x);
            });
        } catch (e) {
            console.warn("Enricher failed to get books:", e);
            try { localStorage.removeItem(RUNNING_KEY); } catch { }
            return { status: "error_fetching" };
        }

        const needs = books.filter(b => !b.subjects?.length || !b.workKey).slice(0, limit);

        for (const b of needs) {
            try {
                let workKey = b.workKey || null, year = b.year || "", cover = b.coverUrl || "";
                if (!workKey || !year || !cover) {
                    const s = await searchOne(b.title, b.author);
                    if (s) { workKey = workKey || s.workKey; year = year || s.year; cover = cover || s.cover; }
                }
                const subjects = b.subjects?.length ? b.subjects : await fetchSubjects(workKey);
                const patch = {};
                if (workKey) patch.workKey = workKey;
                if (subjects?.length) patch.subjects = subjects;
                if (year && !b.year) patch.year = year;
                if (cover && !b.coverUrl) patch.coverUrl = cover;
                if (Object.keys(patch).length) {
                    await db.collection("users").doc(user.uid)
                        .collection("books").doc(b.__id || b.id)
                        .set({ ...patch, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
                }
            } catch { }
            await sleep(900); // snilt mot OL
        }

        markRun();
        try { localStorage.removeItem(RUNNING_KEY); } catch { }
        return { status: "done", changed: needs.length };
    }

    function boot() { try { setTimeout(() => { if (shouldRun()) run().catch(() => { }); }, 2500); } catch { } }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();

    window.PBEnrich = { run };
})();
