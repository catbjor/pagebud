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
    function boot() {
        setHref("#btnDiscover,[data-action='discover']", "discover.html");
        setHref("#btnFriends,[data-action='friends']", "feed.html");
        hookBtn("#btnUpdateApp,[data-action='update']", doUpdate);
    }
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else boot();
})();
