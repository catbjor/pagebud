// goal-badge.js — "Goal: Xm" i en liten boks. Prøver først headeren (venstre for ikonknapper).
(function () {
    "use strict";
    const K = "pb:timer:goalMin";

    function readGoal() { return Math.max(0, Number(localStorage.getItem(K) || "20")); }

    function findActions() {
        // Finn eksisterende ikonknapper og deres parent (header-høyre)
        const candidates = [
            document.querySelector("#btnDiscover")?.parentElement,
            document.querySelector("[data-action='discover']")?.parentElement,
            document.querySelector("#btnFriends")?.parentElement,
            document.querySelector("[data-action='friends']")?.parentElement,
            document.querySelector("#btnUpdateApp")?.parentElement,
            document.querySelector("[data-action='update']")?.parentElement,
            document.querySelector(".page-head .actions"),
        ].filter(Boolean);
        return candidates[0] || null;
    }

    function ensureBox(parentForHeader) {
        let box = document.getElementById("goalBox");
        if (!box) {
            box = document.createElement("div");
            box.id = "goalBox";
            box.className = "card";
            box.style.display = "inline-flex";
            box.style.alignItems = "center";
            box.style.gap = "8px";
            box.style.padding = "6px 10px";
            box.style.marginRight = "8px";   // litt luft mot ikonene
            if (!getComputedStyle(box).borderRadius) {
                box.style.border = "1px solid var(--border, #e6e8ee)";
                box.style.borderRadius = "10px";
                box.style.background = "var(--card, #fff)";
            }

            const label = document.createElement("span");
            label.id = "goalBadgeText";
            label.className = "muted small";
            box.appendChild(label);

            const tick = document.createElement("span");
            tick.id = "goalBadgeTick";
            tick.textContent = "✓";
            tick.style.display = "none";
            tick.style.fontWeight = "700";
            box.appendChild(tick);
        }

        if (parentForHeader && box.parentElement !== parentForHeader) {
            // Sett boksen foran første ikon i header-høyre
            const firstChild = parentForHeader.firstElementChild;
            parentForHeader.insertBefore(box, firstChild || null);
        } else if (!parentForHeader && !box.parentElement) {
            // fallback: plasser i toolbar
            const toolbar = document.getElementById("toolbar") || document.querySelector(".toolbar") || document.body;
            box.style.marginLeft = "8px";
            toolbar.appendChild(box);
        }
        return box;
    }

    function paintHit(hit) {
        const t = document.getElementById("goalBadgeTick");
        if (t) t.style.display = hit ? "" : "none";
    }

    function paint() {
        const actParent = findActions();
        const box = ensureBox(actParent);
        const label = document.getElementById("goalBadgeText");
        const mins = readGoal();
        if (label) label.textContent = `Goal: ${mins} m`;
    }

    // Varsel når mål nås
    window.addEventListener("pb:timer:goalReached", () => {
        paintHit(true);
        window.toast?.("🎯 Daily reading goal reached! Nice work!");
    });

    function boot() {
        paint();
        paintHit(false);
        window.addEventListener("pb:timer:goalChanged", paint);
        window.addEventListener("storage", (e) => { if (e.key === K) paint(); });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else boot();
})();
