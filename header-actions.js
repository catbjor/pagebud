// header-actions.js — Friends + Update i headeren, med notifikasjons-badge
(function () {
    "use strict";

    function ensureHeader() {
        const hdr = document.querySelector(".header .header-actions");
        return hdr || null;
    }

    function injectBadgeCSSOnce() {
        if (document.getElementById("pb-badge-css")) return;
        const s = document.createElement("style");
        s.id = "pb-badge-css";
        s.textContent = `
      .back-fab.badge-host{ position: relative; }
      .notif-badge{
        position:absolute; top:-4px; right:-4px;
        background: var(--accent, #ff3b30);
        color:#fff; min-width:16px; height:16px; border-radius:999px;
        font-size:10px; line-height:16px; padding:0 4px; text-align:center;
        box-shadow:0 1px 2px rgba(0,0,0,.25); display:none;
      }
      .notif-badge.dot{ width:8px; height:8px; min-width:0; padding:0; line-height:8px; }
    `;
        document.head.appendChild(s);
    }

    function makeIconBtn(id, title, href, glyph) {
        const a = document.createElement(href ? "a" : "button");
        a.id = id;
        a.className = "back-fab";
        a.title = title;
        a.setAttribute("aria-label", title);
        if (href) a.href = href;

        const i = document.createElement("i");
        i.className = `fa ${glyph}`;
        a.appendChild(i);
        return a;
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

    function ensureButtons() {
        injectBadgeCSSOnce();

        const wrap = ensureHeader();
        if (!wrap) return;

        // Rydd duplikater
        wrap.innerHTML = "";

        // Friends (til feed.html) + badge
        const friendsBtn = makeIconBtn("btnFriends", "Friends", "feed.html", "fa-user-friends");
        friendsBtn.classList.add("badge-host");
        const badge = document.createElement("span");
        badge.className = "notif-badge";  // blir vist når count>0
        badge.textContent = "0";
        friendsBtn.appendChild(badge);
        wrap.appendChild(friendsBtn);

        // Update app (refresh)
        const upd = makeIconBtn("btnUpdateApp", "Update", null, "fa-rotate-right");
        upd.addEventListener("click", doUpdate);
        wrap.appendChild(upd);

        // ---- Badge API + init ----
        function setBadge(count) {
            const n = Math.max(0, Number(count || 0));
            if (n <= 0) {
                badge.style.display = "none";
                badge.textContent = "0";
            } else {
                badge.style.display = "inline-block";
                badge.textContent = n > 9 ? "9+" : String(n);
            }
            try { localStorage.setItem("pb_feed_unread_count", String(n)); } catch { }
        }
        function bump(delta = 1) {
            const cur = Number(localStorage.getItem("pb_feed_unread_count") || "0");
            setBadge(cur + Number(delta || 1));
        }
        function clear() { setBadge(0); }

        // Eksponer for andre skript (preview, push, osv.)
        window.pbFriendsBadge = { set: setBadge, bump, clear };

        // Init fra storage
        try {
            const initial = Number(localStorage.getItem("pb_feed_unread_count") || "0");
            setBadge(initial);
        } catch { setBadge(0); }

        // Lytt på storage-endringer (andre faner/sider)
        window.addEventListener("storage", (e) => {
            if (e.key === "pb_feed_unread_count") {
                setBadge(Number(e.newValue || "0"));
            }
        });

        // Når man klikker Friends herfra, nullstill ved navigasjon
        friendsBtn.addEventListener("click", () => clear());
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", ensureButtons, { once: true });
    } else {
        ensureButtons();
    }
})();
