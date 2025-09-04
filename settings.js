// settings.js
(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    // Helper to show a generic "Saved" toast
    function showSavedToast() {
        if (window.toast) {
            window.toast("Saved ✓");
        } else {
            alert("Saved ✓");
        }
    }

    // --- Appearance / Themes ---
    function initThemes() {
        const container = $("#themeList");
        const currentThemeEl = $("#currentThemeVal");
        const btnMatchSystem = $("#btnMatchSystem");
        if (!container || !currentThemeEl) return;

        const themes = [
            { id: "default", name: "Default" }, { id: "light", name: "Light" }, { id: "dark", name: "Dark" },
            { id: "porcelain", name: "Porcelain" }, { id: "moss", name: "Moss" }, { id: "navy", name: "Navy & Teal" },
            { id: "blush", name: "Soft Blush" }, { id: "sunset", name: "Sunset Pastel" }, { id: "espresso-peony", name: "Espresso & Peony" },
            { id: "glow", name: "Navy & Gold" }, { id: "bakery", name: "Bakery Pastels" }
        ];

        const palettes = {
            default: ['#2f4156', '#f6f7fb', '#fff', '#e6e8ee'], light: ['#2f4156', '#f6f7fb', '#fff', '#e5e7eb'],
            dark: ['#38bdf8', '#0b1220', '#111827', '#263244'], porcelain: ['#475569', '#f7f7fb', '#fff', '#cbd5e1'],
            moss: ['#34d399', '#0f172a', '#111827', '#223046'], navy: ['#0f766e', '#0b1220', '#111827', '#243041'],
            blush: ['#f472b6', '#fff7f9', '#fff', '#f3cfe0'], sunset: ['#fb7185', '#0f0f12', '#111113', '#26262d'],
            "espresso-peony": ['#854d0e', '#f5e1e9', '#fff', '#e5c9d5'], glow: ['#f59e0b', '#0b1220', ' #0f172a', '#223046'],
            bakery: ['#bde0fe', '#fffdfa', '#fff', '#f0dce3']
        };

        let html = '';
        themes.forEach(theme => {
            const p = palettes[theme.id] || palettes.default;
            html += `
                <div class="theme-preview" data-theme-id="${theme.id}" role="button" tabindex="0" aria-label="Select ${theme.name} theme">
                    <div class="theme-slab">
                        <span class="sw" style="background:${p[0]}"></span><span class="sw" style="background:${p[1]}"></span>
                        <span class="sw" style="background:${p[2]}"></span><span class="sw" style="background:${p[3]}"></span>
                    </div>
                    <div class="theme-name">${theme.name}</div>
                    <i class="fa fa-check-circle check"></i>
                </div>
            `;
        });
        container.innerHTML = html;

        function updateActiveState() {
            const currentTheme = localStorage.getItem("pb:theme") || "default";
            $$(".theme-preview", container).forEach(el => {
                el.classList.toggle("active", el.dataset.themeId === currentTheme);
            });
            const activeTheme = themes.find(t => t.id === currentTheme);
            currentThemeEl.textContent = activeTheme ? activeTheme.name : (currentTheme === 'system' ? 'System' : 'Default');
        }

        container.addEventListener("click", (e) => {
            const preview = e.target.closest(".theme-preview");
            if (!preview) return;

            const themeId = preview.dataset.themeId;
            localStorage.setItem("pb:theme", themeId);
            window.dispatchEvent(new CustomEvent("pb:themeChanged"));
            updateActiveState();
            toast(`Theme set to ${preview.querySelector('.theme-name').textContent}`);
        });

        btnMatchSystem?.addEventListener("click", () => {
            localStorage.setItem("pb:theme", "system");
            window.dispatchEvent(new CustomEvent("pb:themeChanged"));
            updateActiveState();
            toast("Theme set to match system");
        });

        updateActiveState();
    }

    // --- Reading Timer Settings ---
    function initTimerSettings() {
        const goalInput = $("#goalInput");
        const goalVal = $("#goalVal");
        const goalSaveBtn = $("#goalSave");
        const dockLeft = $("#dockLeft");
        const dockRight = $("#dockRight");
        const startCollapsed = $("#startCollapsed");

        if (!goalInput) return;

        const currentGoal = localStorage.getItem("pb:timer:goal") || "20";
        goalInput.value = currentGoal;
        goalVal.textContent = currentGoal;

        const currentDock = localStorage.getItem("pb:timer:side") || "right";
        if (currentDock === 'left') dockLeft.checked = true; else dockRight.checked = true;

        startCollapsed.checked = localStorage.getItem("pb:timer:collapsed") === "true";

        goalInput.addEventListener("input", () => { goalVal.textContent = goalInput.value; });

        goalSaveBtn.addEventListener("click", () => {
            localStorage.setItem("pb:timer:goal", goalInput.value);
            showSavedToast();
        });

        const saveDockSettings = () => {
            localStorage.setItem("pb:timer:side", dockLeft.checked ? "left" : "right");
            localStorage.setItem("pb:timer:collapsed", startCollapsed.checked ? "true" : "false");
            showSavedToast();
            // Immediately apply the change to the visible timer dock
            window.PBTimer?.applySettings?.();
        };

        dockLeft.addEventListener("change", saveDockSettings);
        dockRight.addEventListener("change", saveDockSettings);
        startCollapsed.addEventListener("change", saveDockSettings);

        $("#btnShowDock")?.addEventListener("click", () => {
            window.PBTimer?.toggleDock?.();
            toast("Timer shown/hidden");
        });
        $("#btnResetTimer")?.addEventListener("click", () => { window.PBTimer?.reset?.(); toast("Timer state reset"); });
    }

    // --- App Actions (Update, Reset) ---
    async function doUpdate() {
        const ok = confirm("Update the app now? This will reload the page.");
        if (!ok) return;
        try {
            window.toast?.("Updating…");
            const reg = await navigator.serviceWorker?.getRegistration?.();
            await reg?.update?.();
            setTimeout(() => location.reload(), 400);
        } catch { location.reload(); }
    }

    // --- Reset Buttons ---
    function initAppActions() {
        // Update
        $("#btnUpdateApp")?.addEventListener("click", doUpdate);

        // Reset
        $("#btnResetKeep")?.addEventListener("click", () => window.pbResetCaches?.({ full: false }));
        $("#btnFullReset")?.addEventListener("click", () => window.pbResetCaches?.({ full: true }));
    }

    function boot() {
        initThemes();
        initTimerSettings();
        initAppActions();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();

})();