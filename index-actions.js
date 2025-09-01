// index-actions.js — binder header-ikoner + dynamisk greeting under "PageBud"
(function () {
    "use strict";

    // ---------- helpers ----------
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
        if (el && el.tagName === "A") el.setAttribute("href", href);
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

    // ---------- greeting ----------
    async function getFirstName() {
        try {
            const auth = (window.fb?.auth) || firebase.auth();
            const user = auth.currentUser || await new Promise((res) => {
                const unsub = auth.onAuthStateChanged(u => { unsub(); res(u); });
            });
            if (!user) return null;

            const dn = (user.displayName || "").trim();
            if (dn) return dn.split(" ")[0];

            try {
                const db = window.fb?.db || firebase.firestore();
                const snap = await db.collection("users").doc(user.uid).get();
                const prof = snap.exists ? snap.data() : null;
                if (prof?.displayName) return String(prof.displayName).split(" ")[0];
            } catch { }

            const em = (user.email || "").split("@")[0];
            if (em) return em.charAt(0).toUpperCase() + em.slice(1);

            return "Reader";
        } catch {
            return "Reader";
        }
    }

    function pickGreeting(name) {
        const hour = new Date().getHours();
        const when = hour < 12 ? "morning" : (hour < 18 ? "afternoon" : "evening");

        const i18n = window.PB_I18N;
        const fallback = {
            morning: [
                "Good morning, {name}!", "Morning, {name} — ready to read?", "Rise and shine, {name}."
            ],
            afternoon: [
                "Good afternoon, {name}!", "Nice to see you, {name}. Time for a chapter?", "A perfect time to read, {name}."
            ],
            evening: [
                "Good evening, {name}!", "Cozy reading time, {name}?", "Unwind with a book, {name}."
            ],
            fun: [
                "Books > notifications, {name}.", "One page is a tiny adventure, {name}.", "Stories are brain cardio, {name}."
            ],
            wisdom: [
                "Small pages add up, {name}.", "Read a little, learn a lot, {name}.", "Today’s words, tomorrow’s ideas, {name}."
            ]
        };

        const base = {
            morning: (i18n?.list("greetings.morning") || fallback.morning),
            afternoon: (i18n?.list("greetings.afternoon") || fallback.afternoon),
            evening: (i18n?.list("greetings.evening") || fallback.evening),
            fun: (i18n?.list("greetings.fun") || fallback.fun),
            wisdom: (i18n?.list("greetings.wisdom") || fallback.wisdom)
        };

        const pool = [...base[when], ...((Math.random() < 0.5) ? base.fun : base.wisdom)];
        return pool[Math.floor(Math.random() * pool.length)].replace("{name}", name);
    }

    async function initGreeting() {
        const el = document.getElementById("homeGreeting");
        if (!el) return;

        const cached = sessionStorage.getItem("pb_greeting");
        if (cached) { el.textContent = cached; return; }

        // last brukerens språk (hvis i18n er med)
        if (window.PB_I18N?.loadUserLang) {
            try { await window.PB_I18N.loadUserLang(); } catch { }
        }

        const name = await getFirstName();
        const line = pickGreeting(name || "Reader");
        sessionStorage.setItem("pb_greeting", line);
        el.textContent = line;
    }

    // ---------- boot ----------
    function boot() {
        setHref("#btnDiscover,[data-action='discover']", "discover.html");
        setHref("#btnFriends,[data-action='friends']", "feed.html");
        hookBtn("#btnUpdateApp,[data-action='update']", doUpdate);

        initGreeting(); // hilsen under PageBud
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else boot();
})();
