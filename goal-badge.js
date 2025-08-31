// goal-badge.js — liten boks "Goal: Xm" i header; fallback til toolbar
(function () {
    "use strict";
    const K = "pb:timer:goalMin";

    function readGoal() { return Math.max(0, Number(localStorage.getItem(K) || "20")); }

    function headerActions() {
        return document.querySelector(".header .header-actions") || null;
    }

    function ensureBox() {
        let box = document.getElementById("goalBox");
        if (!box) {
            box = document.createElement("div");
            box.id = "goalBox";
            box.className = "card";
            box.style.display = "inline-flex";
            box.style.alignItems = "center";
            box.style.gap = "8px";
            box.style.padding = "6px 10px";
            box.style.marginRight = "8px";
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
        const hdr = headerActions();
        if (hdr) {
            const first = hdr.firstElementChild;
            if (box.parentElement !== hdr) hdr.insertBefore(box, first || null);
        } else {
            const toolbar = document.getElementById("toolbar") || document.querySelector(".toolbar") || document.body;
            if (box.parentElement !== toolbar) {
                box.style.marginLeft = "8px";
                toolbar.appendChild(box);
            }
        }
        return box;
    }

    function paint() {
        ensureBox();
        const label = document.getElementById("goalBadgeText");
        if (label) label.textContent = `Goal: ${readGoal()} m`;
    }
    function paintHit(hit) {
        const t = document.getElementById("goalBadgeTick");
        if (t) t.style.display = hit ? "" : "none";
    }

    window.addEventListener("pb:timer:goalReached", () => {
        paintHit(true);
        window.toast?.("🎯 Daily reading goal reached! Nice work!");
    });

    function boot() {
        paint(); paintHit(false);
        window.addEventListener("pb:timer:goalChanged", paint);
        window.addEventListener("storage", (e) => { if (e.key === K) paint(); });
    }
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else boot();
})();
