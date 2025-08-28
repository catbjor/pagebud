/* =========================================================
   PageBud — EPUB Reader Themes (light/dark) + toggle button
   ---------------------------------------------------------
   Bruk:
   1) Etter at du har laget ePub.js `rendition`, kall:
        window.PBReaderTheme.attach(rendition, { mount: '#reader-toolbar' })
      - Hvis du ikke har #reader-toolbar, dropp mount: knappen flyter øverst til høyre.

   2) Leser tema huskes i localStorage: key "pb:reader:theme"
   ========================================================= */

(function () {
    const STORAGE_KEY = "pb:reader:theme";
    const THEME_LIGHT = "pb-light";
    const THEME_DARK = "pb-dark";

    // ePub.js CSS-objekter
    const PB_LIGHT = {
        "html, body": { "background": "#FFFFFF", "color": "#161616" },
        "p, h1, h2, h3, h4, h5, h6, li, blockquote": { "color": "#161616", "line-height": "1.6" },
        "a": { "color": "#243b7a" }
    };
    const PB_DARK = {
        "html, body": { "background": "#161616", "color": "#FFFFFF" },
        "p, h1, h2, h3, h4, h5, h6, li, blockquote": { "color": "#FFFFFF", "line-height": "1.6" },
        "a": { "color": "#9bb5ff" }
    };

    function createButton() {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.id = "pb-reader-theme-toggle";
        btn.textContent = "Aa";
        btn.title = "Toggle light/dark";
        btn.setAttribute("aria-label", "Toggle light/dark");

        // Enkel, mørk stil. Endre farger om du vil.
        btn.style.cssText = `
      display:inline-flex; align-items:center; justify-content:center;
      width:38px; height:32px; border-radius:8px;
      border:1px solid #2a3244; background:#0f1625; color:#cbd5e1;
      font-weight:700; cursor:pointer; user-select:none;
    `;
        return btn;
    }

    function applyButtonStyleFor(theme, btn) {
        if (!btn) return;
        if (theme === THEME_DARK) {
            btn.style.background = "#243b7a";
            btn.style.borderColor = "#3852a3";
            btn.style.color = "#ffffff";
        } else {
            btn.style.background = "#0f1625";
            btn.style.borderColor = "#2a3244";
            btn.style.color = "#cbd5e1";
        }
    }

    function mountFloating(btn) {
        // flytende øverst til høyre om ingen mount finnes
        const wrap = document.createElement("div");
        wrap.style.cssText = `
      position:fixed; top:12px; right:12px; z-index:9999; 
      display:flex; gap:8px; background:transparent;
    `;
        wrap.appendChild(btn);
        document.body.appendChild(wrap);
        return wrap;
    }

    window.PBReaderTheme = {
        attach(rendition, opts = {}) {
            if (!rendition) {
                console.warn("[PBReaderTheme] rendition mangler");
                return;
            }

            // Registrer temaer
            rendition.themes.register(THEME_LIGHT, PB_LIGHT);
            rendition.themes.register(THEME_DARK, PB_DARK);

            // Velg lagret tema (default: lys)
            const saved = localStorage.getItem(STORAGE_KEY) || THEME_LIGHT;
            rendition.themes.select(saved);

            // Lag/monter knapp
            const btn = createButton();
            let mount;
            if (opts.mount) {
                mount = (typeof opts.mount === "string") ? document.querySelector(opts.mount) : opts.mount;
                if (!mount) mount = mountFloating(btn);
                else mount.appendChild(btn);
            } else {
                mount = mountFloating(btn);
            }
            applyButtonStyleFor(saved, btn);

            // Toggle
            function toggle() {
                const current = (rendition.themes._current || THEME_LIGHT);
                const next = current === THEME_LIGHT ? THEME_DARK : THEME_LIGHT;
                rendition.themes.select(next);
                localStorage.setItem(STORAGE_KEY, next);
                applyButtonStyleFor(next, btn);
            }
            btn.addEventListener("click", toggle);
            window.addEventListener("keydown", (e) => {
                if (e.key.toLowerCase() === "t") toggle();
            });

            // Eksponér for ev. andre kontroller
            window.__pbSetReaderTheme = (name) => {
                if (![THEME_LIGHT, THEME_DARK].includes(name)) return;
                rendition.themes.select(name);
                localStorage.setItem(STORAGE_KEY, name);
                applyButtonStyleFor(name, btn);
            };
        }
    };
})();