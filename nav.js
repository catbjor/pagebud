// nav.js — idempotent header actions + bottom nav
(function () {
  "use strict";
  const PAGES = {
    library: { href: "index.html", icon: "fa-book", label: "Library" },
    stats: { href: "stats.html", icon: "fa-chart-line", label: "Stats" },
    discover: { href: "discover.html", icon: "fa-compass", label: "Discover" },
    settings: { href: "settings.html", icon: "fa-cog", label: "Settings" }
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function samePath(a, b) {
    const fn = u => (u || "").split("?")[0].split("#")[0].split("/").pop() || "index.html";
    return fn(a).toLowerCase() === fn(b).toLowerCase();
  }
  function activeKey() {
    const here = location.pathname.split("/").pop() || "index.html";
    if (samePath(here, PAGES.stats.href)) return "stats";
    if (samePath(here, PAGES.discover.href)) return "discover";
    if (samePath(here, PAGES.settings.href)) return "settings";
    return "library";
  }

  function buildHeaderActions() {
    const header = $(".header"); if (!header) return;
    let right = header.querySelector(".header-actions");
    if (!right) {
      right = document.createElement("div");
      right.className = "header-actions";
      header.appendChild(right);
    } else {
      right.innerHTML = "";
    }

    const mk = (title, icon, href) => {
      const b = document.createElement("button");
      b.className = "back-button";
      b.title = title;
      b.innerHTML = `<i class="fa-solid ${icon}"></i>`;
      b.addEventListener("click", () => location.href = href);
      return b;
    };
    right.appendChild(mk("Discover", "fa-compass", PAGES.discover.href));
    right.appendChild(mk("Friends", "fa-user-group", "friends.html"));
    const reset = mk("Reset caches", "fa-rotate", "#");
    reset.id = "btnQuickReset";
    reset.addEventListener("click", async () => {
      if (!confirm("Reset caches (keep login)?")) return;
      try { await window.pbResetCaches?.({ full: false }); location.reload(); } catch { }
    });
    right.appendChild(reset);
  }

  function buildBottomNav() {
    if (document.body.classList.contains("no-bottom-nav")) return;
    if ($(".bottom-nav")) return; // already exists
    const shell = $(".app-container") || document.body;
    const nav = document.createElement("nav");
    nav.className = "bottom-nav";
    const act = activeKey();

    function item(key) {
      const { href, icon, label } = PAGES[key];
      const el = document.createElement("div");
      el.className = "nav-item" + (act === key ? " active" : "");
      el.innerHTML = `<i class="fas ${icon}"></i> ${label}`;
      el.addEventListener("click", () => location.href = href);
      return el;
    }

    nav.appendChild(item("library"));
    nav.appendChild(item("stats"));
    nav.appendChild(item("discover"));
    nav.appendChild(item("settings"));
    shell.appendChild(nav);
  }

  function boot() {
    // Ensure FA is present
    if (!document.querySelector('link[href*="font-awesome"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css";
      document.head.appendChild(link);
    }
    buildHeaderActions();
    buildBottomNav();
    try { document.dispatchEvent(new CustomEvent("pb:nav-ready")); } catch { }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
