/* theme-init.js
   Keep the theme in sync across the whole app (system changes + other tabs) */
(function () {
    "use strict";

    function resolve(raw) {
        if (raw === "system") {
            return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        }
        return raw || "default";
    }
    function apply() {
        var raw = localStorage.getItem("pb:theme") || "default";
        document.documentElement.setAttribute("data-theme", resolve(raw));
        document.documentElement.setAttribute("data-tone", "pastel");
    }

    // React to OS theme changes when using “system”
    var mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener?.("change", function () {
        if ((localStorage.getItem("pb:theme") || "default") === "system") apply();
    });

    // Cross-tab updates
    window.addEventListener("storage", function (e) {
        if (e.key === "pb:theme") apply();
    });

    // Expose a helper (optional) if you ever want to force re-apply
    window.pbApplyTheme = apply;
})();
