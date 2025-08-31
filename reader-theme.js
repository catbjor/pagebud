/* reader-theme.js
   Sync EPUB reader appearance with app theme (pb:theme)
   Works with epub.js v0.3.x
*/
(function () {
    "use strict";

    const STATE = {
        rendition: null,
        fontPercent: Number(localStorage.getItem("pb:reader:font") || "100"), // base 100%
    };

    // --- Map app theme -> reader base theme ---
    function mapAppThemeToReader(appTheme) {
        // app themes you already support in style.css
        // map them to a small set epub theme ids: 'light' | 'dark' | 'sepia'
        const t = (appTheme || localStorage.getItem("pb:theme") || "default").toLowerCase();

        if (t === "sepia") return "sepia";
        if (t === "dark" || t === "amoled" || t === "goth") return "dark";
        // everything else -> light
        return "light";
    }

    // --- EPUB CSS themes (reader content) ---
    // These only affect the book iframe (rendition), not your outer UI.
    const EPUB_THEMES = {
        light: {
            "body": {
                "background": "#ffffff !important",
                "color": "#1f2937 !important",
                "line-height": "1.6",
                "font-family": "system-ui, -apple-system, Segoe UI, Inter, Roboto, Arial, sans-serif"
            },
            "img": { "max-width": "100%", "height": "auto" },
            "a": { "color": "#1d4ed8" }
        },
        dark: {
            "body": {
                "background": "#0f0f10 !important",
                "color": "#e5e7eb !important",
                "line-height": "1.6",
                "font-family": "system-ui, -apple-system, Segoe UI, Inter, Roboto, Arial, sans-serif"
            },
            "img": { "max-width": "100%", "height": "auto", "filter": "brightness(0.92)" },
            "a": { "color": "#93c5fd" }
        },
        sepia: {
            "body": {
                "background": "#f5efe6 !important",
                "color": "#3e2f22 !important",
                "line-height": "1.7",
                "font-family": "Georgia, 'Times New Roman', serif"
            },
            "img": { "max-width": "100%", "height": "auto" },
            "a": { "color": "#7f5d3a" }
        }
    };

    // Register & apply theme to rendition
    function applyReaderTheme(rendition) {
        if (!rendition) return;
        // register once (idempotent)
        try {
            rendition.themes.register("light", EPUB_THEMES.light);
            rendition.themes.register("dark", EPUB_THEMES.dark);
            rendition.themes.register("sepia", EPUB_THEMES.sepia);
        } catch (e) {
            // no-op; epub.js may throw if re-registering—safe to ignore
        }

        const appTheme = localStorage.getItem("pb:theme") || "default";
        const readerTheme = mapAppThemeToReader(appTheme);
        rendition.themes.select(readerTheme);

        // apply font scale
        setFontScale(STATE.fontPercent);
    }

    function setFontScale(percent) {
        STATE.fontPercent = Math.max(60, Math.min(200, Math.round(percent || 100))); // clamp 60–200%
        localStorage.setItem("pb:reader:font", String(STATE.fontPercent));
        if (STATE.rendition) {
            STATE.rendition.themes.fontSize(STATE.fontPercent + "%");
        }
    }

    function increaseFont(step = 10) {
        setFontScale(STATE.fontPercent + step);
    }
    function decreaseFont(step = 10) {
        setFontScale(STATE.fontPercent - step);
    }

    // Public API
    const API = {
        /**
         * Initialize reader theme with an epub.js rendition
         * call after: const rendition = book.renderTo('#viewer', { ... })
         */
        init(rendition) {
            STATE.rendition = rendition;
            // apply immediately when displayed
            if (rendition.book) {
                // when new spine items load
                rendition.hooks && rendition.hooks.content && rendition.hooks.content.register(() => {
                    // ensure theme persists across chapters
                    applyReaderTheme(rendition);
                });
            }
            applyReaderTheme(rendition);
        },

        /** Re-apply based on current pb:theme */
        applyFromApp() {
            applyReaderTheme(STATE.rendition);
        },

        /** Font controls */
        increaseFont,
        decreaseFont,
        setFont: setFontScale
    };

    // Listen for global theme changes triggered by settings.js
    document.addEventListener("pb:themeChanged", () => {
        API.applyFromApp();
    });

    // Expose
    window.PBReaderTheme = API;
})();
