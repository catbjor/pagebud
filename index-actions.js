// index-actions.js — header actions + home enhancements (+ 🔔 split badges: chat + requests)
(function () {
    "use strict";

    // --- Proactive Cache Cleanup ---
    // The app has a history of using a "pb:books" localStorage key which can become
    // stale and cause deleted books to reappear. This line proactively removes that
    // key on every load of the homepage to ensure that other scripts are forced
    // to fetch fresh data from Firestore, the single source of truth.
    try { localStorage.removeItem("pb:books"); }
    catch (e) { console.warn("Could not remove stale book cache.", e); }

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    function auth() { return (window.fb?.auth) || (window.firebase?.auth?.()) || firebase.auth(); }
    function db() { return (window.fb?.db) || (window.firebase?.firestore?.()) || firebase.firestore(); }

    // ---------- delete book (single) ----------
    async function deleteBook(id) {
        const u = auth().currentUser;
        if (!u || !id) return;
        if (!confirm("Delete this book?")) return;

        try {
            if (window.PBSync?.deleteBook) {
                await window.PBSync.deleteBook(id);                 // ✅ riktig vei
            } else {
                await db().collection("users").doc(u.uid).collection("books").doc(id).delete();
            }

            // Fjern fra DOM – prøv både id og data-attributt
            document.getElementById("book-" + id)?.remove();
            document.querySelector(`.book-card[data-id="${id}"]`)?.remove();

            alert("Book deleted");
        } catch (e) {
            alert("Error: " + (e.message || e));
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        document.body.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-del-id]");
            if (btn) deleteBook(btn.getAttribute("data-del-id"));
        });
    });

    // ---------- utils ----------
    function hookBtn(selector, onClick) {
        const el = document.querySelector(selector);
        if (!el) return;
        el.addEventListener("click", (e) => {
            if (!(el.tagName === "A" && el.getAttribute("href"))) e.preventDefault();
            onClick(e);
        });
    }

    // ---------- greeting ----------
    async function initGreeting() {
        const el = document.getElementById("homeGreeting");
        if (!el) return;

        const cached = sessionStorage.getItem("pb_greeting");
        if (cached) { el.textContent = cached; return; }

        if (window.PB_I18N?.loadUserLang) {
            try { await window.PB_I18N.loadUserLang(); } catch { }
        }

        const firstName = await resolveFirstName();
        const line = pickGreeting(firstName);
        sessionStorage.setItem("pb_greeting", line);
        el.textContent = line;
    }
    async function resolveFirstName() {
        try {
            const a = auth();
            const user = a.currentUser || await new Promise(res => {
                const off = a.onAuthStateChanged(x => { off(); res(x); });
            });
            if (!user) return "Reader";
            const dn = (user.displayName || "").trim();
            if (dn) return dn.split(" ")[0];
            try {
                const s = await db().collection("users").doc(user.uid).get();
                const n = s.exists && s.data()?.displayName;
                if (n) return String(n).split(" ")[0];
            } catch { }
            const em = (user.email || "").split("@")[0];
            return em ? em.charAt(0).toUpperCase() + em.slice(1) : "Reader";
        } catch { return "Reader"; }
    }
    function pickGreeting(name) {
        const h = new Date().getHours();
        const when = h < 12 ? "morning" : (h < 18 ? "afternoon" : "evening");
        const L = window.PB_I18N, F = (k) => (L?.list("greetings." + k) || []);
        const pool = [...F(when), ...((Math.random() < 0.5) ? F("fun") : F("wisdom"))];
        const msg = (pool[Math.floor(Math.random() * pool.length)] || "Good day, {name}!").replace("{name}", name);
        return msg;
    }

    // ---------- Continue-reading on cards ----------
    function cardRootForId(id) {
        return document.getElementById(`book-${id}`) || document.querySelector(`[data-book-id="${id}"]`) || null;
    }
    function findReadButton(root) {
        if (!root) return null;
        return root.querySelector(
            '.btn-read, [data-role="read"], [data-action="read"], button.read, a.read, .btn:has(.fa-book)'
        ) || root.querySelector(".btn");
    }
    function updateReadLabel(btn, book) {
        if (!btn || !book?.reading) return;
        const r = book.reading || {};
        if (typeof r.page === "number") {
            btn.textContent = `Continue · Page ${r.page}`;
        } else if (typeof r.percent === "number") {
            btn.textContent = `Continue · ${Math.round(r.percent)}%`;
        }
        btn.onclick = () => { location.href = `reader.html?id=${encodeURIComponent(book.id)}`; };
    }
    async function enhanceCardsWithReading() {
        try {
            const a = auth();
            const u = a.currentUser || await new Promise(res => { const off = a.onAuthStateChanged(x => { off(); res(x); }); });
            if (!u) return;
            const snap = await db().collection("users").doc(u.uid).collection("books").get();
            snap.forEach(doc => {
                const data = doc.data() || {};
                const book = { id: doc.id, ...data };
                const root = cardRootForId(book.id);
                if (!root) return;
                const readBtn = findReadButton(root);
                if (readBtn && (book.reading?.page || book.reading?.percent)) {
                    updateReadLabel(readBtn, book);
                }
            });
        } catch (e) { console.warn("[Home] enhanceCardsWithReading failed:", e); }
    }

    // ---------- center heart icons ----------
    function centerHeartIcons() {
        const candidates = $$('.fav, .favorite, .heart, .heart-btn, .fav-btn, [data-role="favorite"], [aria-label*="Favorite"], [aria-label*="favoritt"]');
        candidates.forEach(el => {
            const wrap = el.closest('.fav-circle, .favorite-circle, .circle, .badge, .icon-badge') || el.parentElement;
            if (!wrap) return;
            Object.assign(wrap.style, { display: 'grid', placeItems: 'center' });
            Object.assign(el.style, { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: '1' });
        });
    }

    // ---------- split badges on Friends button (chat + requests) ----------
    function wireGlobalFriendsBadgesSplit() {
        const hook = document.querySelector("#btnFriends,[data-action='friends']");
        if (!hook) return;

        hook.style.position = hook.style.position || "relative";

        const make = (id, bg, title) => {
            let b = document.getElementById(id);
            if (!b) {
                b = document.createElement("span");
                b.id = id;
                Object.assign(b.style, {
                    position: "absolute", top: "-6px",
                    minWidth: "18px", height: "18px", borderRadius: "9px",
                    display: "inline-grid", placeItems: "center",
                    fontSize: "12px", padding: "0 6px", color: "#000",
                    background: bg,
                });
                b.title = title;
                hook.appendChild(b);
            }
            return b;
        };

        // plassér dem begge: chat til høyre, requests litt til venstre
        const chatBadge = make("homeChatBadge", "var(--primary)", "Unread chats");
        const reqBadge = make("homeRequestBadge", "#ffd166", "Pending friend requests");
        chatBadge.style.right = "-6px";
        reqBadge.style.right = "16px";

        (async () => {
            const a = auth();
            const u = a.currentUser || await new Promise(res => { const off = a.onAuthStateChanged(x => { off(); res(x); }); });
            if (!u) return;

            // Chat-unreads
            db().collection("chats").where(`participants.${u.uid}`, "==", true)
                .onSnapshot((snap) => {
                    let total = 0;
                    snap.forEach(doc => {
                        const d = doc.data() || {};
                        if ((d.read || {})[u.uid] === false) total += 1;
                    });
                    chatBadge.textContent = String(total);
                    chatBadge.style.display = total > 0 ? "inline-grid" : "none";
                });

            // Pending friend requests
            db().collection("friend_requests")
                .where("to", "==", u.uid).where("status", "==", "pending")
                .onSnapshot((snap) => {
                    const n = snap.size;
                    reqBadge.textContent = String(n);
                    reqBadge.style.display = n > 0 ? "inline-grid" : "none";
                });
        })();
    }

    // ---------- Robust book filtering ----------
    function wireBookFilters() {
        const container = $('#filter-chips');
        const grid = $('#books-grid');
        if (!container || !grid) return;

        // This logic correctly handles all status filters, including 'owned' and 'wishlist'.
        // It replaces potentially incomplete logic from other scripts.
        container.addEventListener('click', (e) => {
            const chip = e.target.closest('.category[data-filter]');
            if (!chip) return;

            // Update active chip
            $$('.category', container).forEach(c => c.classList.remove('active'));
            chip.classList.add('active');

            const filterBy = chip.dataset.filter;
            const cards = $$('.book-card', grid);

            cards.forEach(card => {
                let show = false;
                if (filterBy === 'all') {
                    show = true;
                } else if (filterBy === 'favorites') {
                    show = card.dataset.fav === '1';
                } else {
                    // Generic status filter logic that works for all statuses
                    const status = card.dataset.status || '';
                    if (status.includes(filterBy)) {
                        show = true;
                    }
                }
                card.style.display = show ? '' : 'none';
            });
        });
    }

    // ---------- boot ----------
    function boot() {
        initGreeting();
        enhanceCardsWithReading();
        centerHeartIcons();
        wireBookFilters();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }
})();
