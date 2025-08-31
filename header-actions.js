// header-actions.js — sørger for Discover / Friends / Update i headeren (ikonknapper)
(function () {
    "use strict";

    function ensureHeader() {
        const hdr = document.querySelector(".header .header-actions");
        if (hdr) return hdr;
        return null;
    }

    function makeIconBtn(id, title, href, glyph) {
        const a = document.createElement(href ? "a" : "button");
        a.id = id;
        a.className = "back-fab";             // eksisterende stil
        a.title = title;
        a.setAttribute("aria-label", title);
        if (href) a.href = href;
        a.textContent = glyph;                 // enkle glyphs; byttes lett til <i> om du har ikonfont
        return a;
    }

    function ensureButtons() {
        const wrap = ensureHeader(); if (!wrap) return;

        if (!document.getElementById("btnDiscover")) {
            wrap.appendChild(makeIconBtn("btnDiscover", "Discover", "discover.html", "🧭"));
        }
        if (!document.getElementById("btnFriends")) {
            wrap.appendChild(makeIconBtn("btnFriends", "Friends feed", "feed.html", "👥"));
        }
        if (!document.getElementById("btnUpdateApp")) {
            const b = makeIconBtn("btnUpdateApp", "Update app", null, "↻");
            b.addEventListener("click", async (e) => {
                e.preventDefault();
                const ok = confirm("Update the app now? This will reload the page.");
                if (!ok) return;
                try {
                    window.toast?.("Updating…");
                    const reg = await navigator.serviceWorker?.getRegistration?.();
                    try { await reg?.update?.(); } catch { }
                    setTimeout(() => location.reload(), 400);
                } catch { location.reload(); }
            });
            wrap.appendChild(b);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", ensureButtons, { once: true });
    } else ensureButtons();
})();
