// nav.js — header actions + bottom nav (no auth side-effects)
(function () {
  "use strict";
  const PAGES = {
    library: { href: "index.html", icon: "fa-book", label: "Library" },
    stats: { href: "stats.html", icon: "fa-chart-line", label: "Stats" },
    discover: { href: "discover.html", icon: "fa-compass", label: "Discover" },
    settings: { href: "settings.html", icon: "fa-cog", label: "Settings" }
  };
  const $ = (s, r = document) => r.querySelector(s);

  function samePath(a, b) { const fn = u => (u || "").split("?")[0].split("#")[0].split("/").pop() || "index.html"; return fn(a).toLowerCase() === fn(b).toLowerCase(); }
  function activeKey() {
    const here = location.pathname.split("/").pop() || "index.html";
    if (samePath(here, PAGES.stats.href)) return "stats";
    if (samePath(here, PAGES.discover.href)) return "discover";
    if (samePath(here, PAGES.settings.href)) return "settings";
    return "library";
  }

  function buildBottomNav() {
    if (document.body.classList.contains("no-bottom-nav")) return;
    if ($(".bottom-nav")) return;
    const nav = document.createElement("nav");
    nav.className = "bottom-nav";
    const act = activeKey();

    function item(key) {
      const { href, icon, label } = PAGES[key];
      const el = document.createElement("div");
      el.className = "nav-item" + (act === key ? " active" : "");
      el.innerHTML = `<i class="fas ${icon}"></i> ${label}`;
      el.addEventListener("click", () => { if (location.pathname.endsWith(href)) return; location.href = href; });
      return el;
    }

    nav.appendChild(item("library"));
    nav.appendChild(item("stats"));
    nav.appendChild(item("discover"));
    nav.appendChild(item("settings"));
    (document.querySelector(".app-container") || document.body).appendChild(nav);
  }

  function boot() {
    // make sure FA CSS exists if page didn’t include it
    if (!document.querySelector('link[href*="font-awesome"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css";
      document.head.appendChild(link);
    }
    buildBottomNav();
    try { document.dispatchEvent(new CustomEvent("pb:nav-ready")); } catch { }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
