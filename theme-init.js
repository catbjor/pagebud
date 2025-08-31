/* theme-init.js
   Apply app theme early and keep it in sync across tabs and system changes.
   Adds palette-based CSS variable overrides so theme switching actually changes colors.
*/
(function () {
    "use strict";

    // ---- Palette map (id -> CSS variable overrides) ----
    // Only color tokens; layout tokens untouched.
    const PALETTES = {
        "default": {
            "--background": "#f6f7fb",
            "--text": "#1c1c1c",
            "--muted": "#5b616a",
            "--card": "#ffffff",
            "--surface": "#f2f4f7",
            "--border": "#e6e8ee",
            "--primary": "#2f4156",
            "--btn-bg": "#2f4156",
            "--btn-text": "#ffffff"
        },
        "light": {  // generic light
            "--background": "#f6f7fb",
            "--text": "#111827",
            "--muted": "#6b7280",
            "--card": "#ffffff",
            "--surface": "#eef2f7",
            "--border": "#e5e7eb",
            "--primary": "#2f4156",
            "--btn-bg": "#2f4156",
            "--btn-text": "#ffffff"
        },
        "dark": {   // generic dark
            "--background": "#0b1220",
            "--text": "#f8fafc",
            "--muted": "#9aa6b2",
            "--card": "#111827",
            "--surface": "#1f2937",
            "--border": "#263244",
            "--primary": "#38bdf8",
            "--btn-bg": "#38bdf8",
            "--btn-text": "#0b1220"
        },

        // ---- Your named themes from settings.js ----
        "porcelain": {             // Soft Neutrals (light)
            "--background": "#f7f7fb",
            "--text": "#1f2937",
            "--muted": "#6b7280",
            "--card": "#ffffff",
            "--surface": "#eceff6",
            "--border": "#cbd5e1",
            "--primary": "#475569",
            "--btn-bg": "#475569",
            "--btn-text": "#ffffff"
        },
        "moss": {                  // Moss Forest (dark-ish)
            "--background": "#0f172a",
            "--text": "#e5e7eb",
            "--muted": "#94a3b8",
            "--card": "#111827",
            "--surface": "#1e293b",
            "--border": "#223046",
            "--primary": "#34d399",
            "--btn-bg": "#34d399",
            "--btn-text": "#0b1220"
        },
        "navy": {                  // Navy & Teal (dark)
            "--background": "#0b1220",
            "--text": "#f8fafc",
            "--muted": "#9aa6b2",
            "--card": "#111827",
            "--surface": "#1f2937",
            "--border": "#243041",
            "--primary": "#0f766e",
            "--btn-bg": "#0f766e",
            "--btn-text": "#ffffff"
        },
        "blush": {                 // Soft Blush (light)
            "--background": "#fff7f9",
            "--text": "#1f2937",
            "--muted": "#6b7280",
            "--card": "#ffffff",
            "--surface": "#ffdce7",
            "--border": "#f3cfe0",
            "--primary": "#f472b6",
            "--btn-bg": "#f472b6",
            "--btn-text": "#ffffff"
        },
        "sunset": {                // Sunset Pastel (dark bg + warm accent)
            "--background": "#0f0f12",
            "--text": "#f8fafc",
            "--muted": "#cbd5e1",
            "--card": "#111113",
            "--surface": "#1b1b1f",
            "--border": "#26262d",
            "--primary": "#fb7185",
            "--btn-bg": "#fb7185",
            "--btn-text": "#0b1220"
        },
        "espresso-peony": {        // Espresso & Peony (light, warm)
            "--background": "#f5e1e9",
            "--text": "#14110f",
            "--muted": "#6b5f5a",
            "--card": "#ffffff",
            "--surface": "#f1d8e2",
            "--border": "#e5c9d5",
            "--primary": "#854d0e",
            "--btn-bg": "#854d0e",
            "--btn-text": "#ffffff"
        },
        "glow": {                  // Navy & Gold (dark bg + gold)
            "--background": "#0b1220",
            "--text": "#f8fafc",
            "--muted": "#9aa6b2",
            "--card": "#0f172a",
            "--surface": "#111827",
            "--border": "#223046",
            "--primary": "#f59e0b",
            "--btn-bg": "#f59e0b",
            "--btn-text": "#0b1220"
        },
        "bakery": {                // Bakery Pastels (light + playful)
            "--background": "#fffdfa",
            "--text": "#1f2937",
            "--muted": "#6b7280",
            "--card": "#ffffff",
            "--surface": "#f6eef2",
            "--border": "#f0dce3",
            "--primary": "#bde0fe",
            "--btn-bg": "#bde0fe",
            "--btn-text": "#0b1220"
        }
    };

    function setVars(vars) {
        const r = document.documentElement;
        for (const [k, v] of Object.entries(vars || {})) {
            r.style.setProperty(k, v);
        }
    }

    function resolvedKey(raw) {
        if (raw === "system") {
            return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        }
        return raw || "default";
    }

    function apply() {
        const raw = localStorage.getItem("pb:theme") || "default";
        const key = resolvedKey(raw);
        // data attributes (if you ever want CSS to branch on theme name)
        document.documentElement.setAttribute("data-theme", key);
        document.documentElement.setAttribute("data-tone", "pastel");

        // colors via CSS variables
        const palette = PALETTES[key] || PALETTES["default"];
        setVars(PALETTES["default"]); // baseline to ensure all tokens exist
        setVars(palette);
    }

    // 1) Apply immediately
    try { apply(); } catch { }

    // 2) React to OS change when using “system”
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener?.("change", function () {
        if ((localStorage.getItem("pb:theme") || "default") === "system") apply();
    });

    // 3) Cross-tab updates
    window.addEventListener("storage", function (e) {
        if (e.key === "pb:theme") apply();
    });

    // 4) Local custom event (from settings)
    window.addEventListener("pb:themeChanged", apply);

    // Expose
    window.pbApplyTheme = apply;
    window.PBTheme = { apply, resolvedKey };
})();
