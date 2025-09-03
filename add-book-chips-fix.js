// add-book-chips-fix.js
// Genres / Moods / Tropes ONLY – multi-select chips inside <details>.
// - Builds from PB_CONST or global arrays; falls back to safe defaults.
// - Click + Enter/Space toggle, writes hidden inputs.
// - Forces pointer-events: auto in case page CSS disables it.

(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    // Safe defaults if constants are missing
    const DEFAULTS = {
        GENRES: ["Romance", "Mystery", "Thriller", "Fantasy", "Sci-Fi", "Horror", "Non-fiction", "Historical", "YA"],
        MOODS: ["Cozy", "Dark", "Funny", "Steamy", "Heartwarming", "Gritty"],
        TROPES: ["Enemies to Lovers", "Friends to Lovers", "Forced Proximity", "Found Family", "Love Triangle", "Second Chance", "Grumpy / Sunshine"],
    };

    function listFromConstants(key) {
        // Prefer PB_CONST, then global window[key], else defaults
        if (Array.isArray(window.PB_CONST?.[key])) return window.PB_CONST[key];
        if (Array.isArray(window[key])) return window[key];
        return DEFAULTS[key] || [];
    }

    function ensureHidden(form, name) {
        let el = form.querySelector(`input[name="${name}"]`);
        if (!el) {
            el = document.createElement("input");
            el.type = "hidden";
            el.name = name;
            form.appendChild(el);
        }
        return el;
    }

    function wireMulti(container, items, hiddenName) {
        if (!container) return;

        // Make sure clicks can happen even if page CSS was restrictive
        container.style.pointerEvents = "auto";

        // Guard (don’t double-wire)
        if (container.dataset.pbChipsWired === "1") return;
        container.dataset.pbChipsWired = "1";

        const form = container.closest("form") || $("#bookForm") || $("form");
        const hidden = ensureHidden(form, hiddenName);

        // Build chips only if empty
        if (!container.querySelector(".category") && items.length) {
            items.forEach((label) => {
                const el = document.createElement("span");
                el.className = "category";
                el.textContent = label;
                el.dataset.value = String(label);
                container.appendChild(el);
            });
        }

        // Initial selected state from hidden (JSON array)
        let initial = [];
        try { initial = hidden.value ? JSON.parse(hidden.value) : []; } catch { initial = []; }
        const initSet = new Set((Array.isArray(initial) ? initial : []).map(String));

        $$(".category", container).forEach(chip => {
            const val = chip.dataset.value || chip.textContent.trim();
            chip.dataset.value = val;
            if (initSet.size) chip.classList.toggle("active", initSet.has(val));
            chip.tabIndex = 0;
            chip.setAttribute("role", "button");
            chip.setAttribute("aria-pressed", chip.classList.contains("active") ? "true" : "false");
            // also ensure each chip is clickable even if a parent had pointer-events:none
            chip.style.pointerEvents = "auto";
        });

        function commit() {
            const vals = $$(".category.active", container).map(c => c.dataset.value || c.textContent.trim());
            hidden.value = JSON.stringify(vals);
        }

        function toggle(chip) {
            chip.classList.toggle("active");
            chip.setAttribute("aria-pressed", chip.classList.contains("active") ? "true" : "false");
            commit();
        }

        // Click + keyboard
        container.addEventListener("click", (e) => {
            const chip = e.target.closest(".category");
            if (!chip || !container.contains(chip)) return;
            toggle(chip);
        }, { capture: true }); // capture to survive weird parent handlers

        container.addEventListener("keydown", (e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            const chip = e.target.closest(".category");
            if (!chip || !container.contains(chip)) return;
            e.preventDefault();
            toggle(chip);
        }, { capture: true });

        // Ensure hidden reflects current DOM
        commit();
    }

    function boot() {
        wireMulti($("#genres"), listFromConstants("GENRES"), "genres");
        wireMulti($("#moods"), listFromConstants("MOODS"), "moods");
        wireMulti($("#tropes"), listFromConstants("TROPES"), "tropes");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }
})();
