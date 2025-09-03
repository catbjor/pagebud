// index-actions.js — header actions + home enhancements (Continue-reading + centered heart)
(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    // ---------- small Firebase helpers ----------
    function auth() { return (window.fb?.auth) || (window.firebase?.auth?.()) || firebase.auth(); }
    function db() { return (window.fb?.db) || (window.firebase?.firestore?.()) || firebase.firestore(); }

    // ---------- delete (existing) ----------
    async function deleteBook(id) {
        const u = auth().currentUser;
        if (!u || !id) return;
        if (!confirm("Delete this book?")) return;

        try {
            await db().collection("users").doc(u.uid).collection("books").doc(id).delete();
            document.getElementById("book-" + id)?.remove();
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

    // ---------- util: safe hook to links/buttons ----------
    function hookBtn(selector, onClick) {
        const el = document.querySelector(selector);
        if (!el) return;
        el.addEventListener("click", (e) => {
            if (!(el.tagName === "A" && el.getAttribute("href"))) e.preventDefault();
            onClick(e);
        });
    }
    function setHref(selector, href) {
        const el = document.querySelector(selector);
        if (!el) return;
        if (el.tagName === "A") {
            el.setAttribute("href", href);
        } else {
            el.addEventListener("click", (e) => { e.preventDefault(); location.href = href; });
            el.style.cursor = "pointer";
        }
    }
    async function doUpdate() {
        const ok = confirm("Update the app now? This will reload the page.");
        if (!ok) return;
        try {
            window.toast?.("Updating…");
            const reg = await navigator.serviceWorker?.getRegistration?.();
            try { await reg?.update?.(); } catch { }
            setTimeout(() => location.reload(), 400);
        } catch { location.reload(); }
    }

    // ---------- greeting (unchanged) ----------
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

    // ---------- enhancement: Continue-reading on cards ----------
    function cardRootForId(id) {
        // Prefer #book-<id>, else [data-book-id="<id>"]
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
        // Keep existing click to reader
        btn.onclick = () => { location.href = `reader.html?id=${encodeURIComponent(book.id)}`; };
    }

    async function enhanceCardsWithReading() {
        try {
            const a = auth();
            const u = a.currentUser || await new Promise(res => {
                const off = a.onAuthStateChanged(x => { off(); res(x); });
            });
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
        } catch (e) {
            console.warn("[Home] enhanceCardsWithReading failed:", e);
        }
    }

    // ---------- enhancement: center favorite-heart in its circle ----------
    function centerHeartIcons() {
        const candidates = $$('.fav, .favorite, .heart, .heart-btn, .fav-btn, [data-role="favorite"], [aria-label*="Favorite"], [aria-label*="favoritt"]');
        candidates.forEach(el => {
            const wrap = el.closest('.fav-circle, .favorite-circle, .circle, .badge, .icon-badge') || el.parentElement;
            if (!wrap) return;
            Object.assign(wrap.style, {
                display: 'grid',
                placeItems: 'center'
            });
            Object.assign(el.style, {
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: '1'
            });
        });
    }

    // ---------- boot ----------
    function boot() {
        // Friends-knappen skal nå åpne FRIENDS-siden (ikke feed)
        setHref("#btnFriends,[data-action='friends']", "friends.html");

        // (valgfritt) egen selector hvis du fortsatt vil ha feed et annet sted:
        // setHref("[data-action='friends-feed']", "feed.html");

        hookBtn("#btnUpdateApp,[data-action='update']", doUpdate);
        setHref("#btnCalendar,[data-action='calendar']", "stats.html");
        setHref("#goalBadge,[data-action='goal']", "stats.html");

        initGreeting();
        enhanceCardsWithReading();
        centerHeartIcons();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }
})();
