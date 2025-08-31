/* =========================================================================
   settings.js – pastel-first themes + working buttons
   ======================================================================== */
(function () {
    "use strict";

    // ---- Theme registry shown in the grid (id must match data-theme) ----
    const THEMES = [
        // basics
        { id: "default", name: "Default", colors: ["#F7D6E0", "#B4F8C8", "#7BDFF2"] },
        { id: "light", name: "Light", colors: ["#ffffff", "#e2e8f0", "#0f172a"] },
        { id: "dark", name: "Dark", colors: ["#eaeaf0", "#6aa8ff", "#0c0d10"] },
        { id: "amoled", name: "AMOLED", colors: ["#e9eef5", "#7aa7ff", "#000000"] },
        { id: "black-white", name: "Black / White", colors: ["#ffffff", "#cbd5e1", "#000000"] },

        // palettes you asked for (swatch order = lightest, mid, darkest)
        { id: "cotton-candy", name: "Cotton Candy", colors: ["#FFD3DD", "#F0F9F8", "#F3A2BE"] },
        { id: "hot-pink", name: "Hot Pink", colors: ["#FBD9E5", "#EE7ABF", "#EE2A7B"] },
        { id: "mint-frost", name: "Mint Frost", colors: ["#C6E6E3", "#ABDCD9", "#81BFB7"] },

        { id: "granite-beige", name: "Granite Beige", colors: ["#F6ECE3", "#B7A7A9", "#91766E"] },
        { id: "soft-neutrals", name: "Soft Neutrals", colors: ["#FAFAFF", "#DADDD8", "#1C1C1C"] },

        { id: "moss-forest", name: "Moss Forest", colors: ["#DADED8", "#768064", "#2C3424"] },
        { id: "navy-teal", name: "Navy & Teal", colors: ["#C8D9E6", "#567C8D", "#2F4156"] },

        { id: "dark-romance", name: "Dark Romance", colors: ["#F2F1ED", "#B38F6F", "#710014"] },
        { id: "goth-mauve", name: "Goth Mauve", colors: ["#EEE9F0", "#9B8791", "#5A4B5B"] },
        { id: "lime-pop", name: "Lime Pop", colors: ["#FFD9F8", "#FF7ABF", "#CDFF30"] },

        { id: "sunset-peach", name: "Sunset Peach", colors: ["#FEC6A3", "#F3C4BE", "#EC8366"] },
        { id: "halloween-spice", name: "Halloween Spice", colors: ["#EEE7E0", "#5D4F46", "#F47421"] },
        { id: "terracotta-olive", name: "Terracotta Olive", colors: ["#CFC4B1", "#676127", "#935727"] },
        { id: "autumn-pastel", name: "Autumn Pastel", colors: ["#F5E7E1", "#E3E5F2", "#F6CFA3"] },
        { id: "navy-gold", name: "Navy & Gold", colors: ["#F0EBDB", "#C9A6A1", "#C79466"] },
    ];

    // ---- Shorthands ----
    const $ = (s, r = document) => r.querySelector(s);

    // DOM refs
    let grid, statusEl, nameEl, btnSystem, btnResetKeep, btnResetFull, resetStatus, btnPush, pushStatus;

    // ---- Tiny toast ----
    function toast(msg) {
        let n = document.getElementById("pb-toast");
        if (!n) { n = document.createElement("div"); n.id = "pb-toast"; document.body.appendChild(n); }
        n.textContent = msg;
        n.classList.add("show");
        clearTimeout(n._t);
        n._t = setTimeout(() => n.classList.remove("show"), 1400);
    }

    // ---- Theme helpers ----
    const resolveApplied = (raw) => raw === "system"
        ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : raw;

    function applyTheme(raw) {
        const applied = resolveApplied(raw);
        document.documentElement.setAttribute("data-theme", applied);
        document.documentElement.setAttribute("data-tone", "pastel"); // pastel-first mapping
        // update UI labels
        nameEl = nameEl || $("#themeName");
        statusEl = statusEl || $("#themeStatus");
        if (nameEl) nameEl.textContent = raw;
        if (statusEl) statusEl.innerHTML = `Current: <b id="themeName">${raw}</b>`;
        highlightActive(raw);

        // announce
        try { document.dispatchEvent(new CustomEvent("pb:themeChanged", { detail: { name: raw, applied } })); } catch { }
    }

    function setTheme(id) {
        localStorage.setItem("pb:theme", id);
        applyTheme(id);
        toast(`Theme: ${id}`);
    }

    // ---- Theme grid ----
    function cardHTML(t) {
        const [a, b, c] = t.colors; // a=lightest for background preview
        return `
    <div class="theme-preview" role="button" tabindex="0" data-theme="${t.id}" title="${t.name}">
      <div class="theme-colors">
        <div class="color-swatch" style="background:${a}"></div>
        <div class="color-swatch" style="background:${b}"></div>
        <div class="color-swatch" style="background:${c}"></div>
      </div>
      <div class="theme-name">${t.name}</div>
    </div>`;
    }
    function renderGrid() {
        grid = $("#themeGrid");
        if (!grid) return;
        grid.innerHTML = THEMES.map(cardHTML).join("");
    }
    function highlightActive(currentRaw) {
        grid = grid || $("#themeGrid");
        if (!grid) return;
        const applied = resolveApplied(currentRaw);
        grid.querySelectorAll(".theme-preview")
            .forEach(el => el.classList.toggle("active", el.dataset.theme === applied));
    }
    function onGridClick(e) {
        const card = e.target.closest(".theme-preview");
        if (!card || !grid.contains(card)) return;
        setTheme(card.dataset.theme);
    }
    function onGridKey(e) {
        const card = e.target.closest(".theme-preview");
        if (!card) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setTheme(card.dataset.theme); }
    }

    // ---- Reset fallbacks ----
    async function fallbackClear(signOut = false) {
        try { if (signOut && window.fb?.auth) await fb.auth.signOut(); } catch { }
        if ("caches" in window) {
            const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k)));
        }
        if ("serviceWorker" in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(r => r.unregister()));
        }
    }

    // ---- Init ----
    function init() {
        grid = $("#themeGrid");
        statusEl = $("#themeStatus");
        nameEl = $("#themeName");
        btnSystem = $("#btnMatchSystem");
        btnResetKeep = $("#btnResetKeep");
        btnResetFull = $("#btnResetFull");
        resetStatus = $("#resetStatus");
        btnPush = $("#btnEnablePush");
        pushStatus = $("#pushStatus");

        renderGrid();
        grid?.addEventListener("click", onGridClick);
        grid?.addEventListener("keydown", onGridKey);

        applyTheme(localStorage.getItem("pb:theme") || "default");

        // Match system
        btnSystem?.addEventListener("click", () => {
            localStorage.setItem("pb:theme", "system");
            applyTheme("system");
            toast("Theme: match system");
        });
        const mq = matchMedia("(prefers-color-scheme: dark)");
        mq.addEventListener?.("change", () => {
            if ((localStorage.getItem("pb:theme") || "default") === "system") applyTheme("system");
        });

        // Storage sync
        addEventListener("storage", (e) => { if (e.key === "pb:theme") applyTheme(e.newValue || "default"); });

        // Reset buttons
        btnResetKeep?.addEventListener("click", async () => {
            try {
                resetStatus && (resetStatus.textContent = "Resetting caches…");
                if (window.pbResetCaches) await window.pbResetCaches({ full: false }); else await fallbackClear(false);
                resetStatus && (resetStatus.textContent = "Done. Reloading…");
                setTimeout(() => location.reload(), 250);
            } catch (e) { resetStatus && (resetStatus.textContent = e?.message || "Reset failed"); }
        });
        btnResetFull?.addEventListener("click", async () => {
            if (!confirm("Full reset will sign you out. Continue?")) return;
            try {
                resetStatus && (resetStatus.textContent = "Full reset…");
                if (window.pbResetCaches) await window.pbResetCaches({ full: true }); else await fallbackClear(true);
                resetStatus && (resetStatus.textContent = "Done. Reloading…");
                setTimeout(() => location.reload(), 250);
            } catch (e) { resetStatus && (resetStatus.textContent = e?.message || "Reset failed"); }
        });

        // Optional push helper
        btnPush?.addEventListener("click", async () => {
            try {
                if (window.pbEnablePush) {
                    const res = await window.pbEnablePush();
                    pushStatus && (pushStatus.textContent = res || "Push ready");
                    toast("Push enabled ✓");
                } else {
                    pushStatus && (pushStatus.textContent = "Push helper not loaded.");
                }
            } catch (e) { pushStatus && (pushStatus.textContent = e?.message || "Push failed"); }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
