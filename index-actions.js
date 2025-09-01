// index-actions.js — binder eksisterende header-ikoner (ingen nye elementer)
(function () {
    "use strict";

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
        // Hvis det ikke er <a>, gjør vi det klikkbart uten å endre markupen
        if (el && el.tagName !== "A") {
            el.addEventListener("click", (e) => {
                e.preventDefault();
                location.href = href;
            }, { once: false });
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

    // -------- boot --------
    function boot() {
        // Behold disse
        setHref("#btnFriends,[data-action='friends']", "feed.html");
        hookBtn("#btnUpdateApp,[data-action='update']", doUpdate);

        // NYTT: kalender -> stats (uansett om det er <a> eller <button>)
        setHref("#btnCalendar,[data-action='calendar']", "stats.html");

        // (valgfritt) goal-badge kan også linke til stats hvis den finnes
        setHref("#goalBadge,[data-action='goal']", "stats.html");

        // Hilsen under PageBud (fra tidligere)
        initGreeting();
    }

    // -------- greeting --------
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
            const auth = (window.fb?.auth) || firebase.auth();
            const user = auth.currentUser || await new Promise(res => {
                const u = auth.onAuthStateChanged(x => { u(); res(x); });
            });
            if (!user) return "Reader";
            const dn = (user.displayName || "").trim();
            if (dn) return dn.split(" ")[0];
            try {
                const db = window.fb?.db || firebase.firestore();
                const s = await db.collection("users").doc(user.uid).get();
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

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else boot();
})();
