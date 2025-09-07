// nav.js — header actions + bottom nav (no auth side-effects)
(function () {
  "use strict";

  const PAGES = {
    library: { href: "index.html", icon: "fa-book", label: "Library" },
    stats: { href: "stats.html", icon: "fa-chart-line", label: "Stats" },
    discover: { href: "discover.html", icon: "fa-compass", label: "Discover" },
    friends: { href: "friends.html", icon: "fa-users", label: "Friends" },
    settings: { href: "settings.html", icon: "fa-cog", label: "Settings" }
  };

  const $ = (s, r = document) => r.querySelector(s);

  function samePath(a, b) {
    const fn = u => (u || "").split("?")[0].split("#")[0].split("/").pop() || "index.html";
    return fn(a).toLowerCase() === fn(b).toLowerCase();
  }

  function activeKey() {
    const here = location.pathname.split("/").pop() || "index.html";
    for (const key in PAGES) {
      if (samePath(here, PAGES[key].href)) return key;
    }
    return "library"; // Default to library for index.html or other pages
  }

  function buildBottomNav() {
    if (document.body.classList.contains("no-bottom-nav")) return;
    if ($(".bottom-nav")) return;

    const nav = document.createElement("nav");
    nav.className = "bottom-nav";
    const act = activeKey();

    function item(key) {
      const page = PAGES[key];
      if (!page) return document.createComment(`missing nav key: ${key}`);
      const { href, icon, label } = page;
      const el = document.createElement("a");
      el.href = href;
      el.className = "nav-item" + (act === key ? " active" : "");
      el.innerHTML = `<i class="fas ${icon}"></i><span>${label}</span>`;
      return el;
    }

    nav.appendChild(item("library"));
    nav.appendChild(item("stats"));
    nav.appendChild(item("discover"));
    nav.appendChild(item("friends"));
    nav.appendChild(item("settings"));

    (document.querySelector(".app-container") || document.body).appendChild(nav);
  }

  function boot() {
    // Ensure Font Awesome is available if page didn’t include it
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
