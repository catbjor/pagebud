// settings-fix.js — lim mellom Settings og tema/timer, uten UI-endringer
(function () {
    "use strict";

    /* ---------------- THEME ---------------- */
    function applyThemeNow(val) {
        try {
            localStorage.setItem("pb:theme", val);
            window.pbApplyTheme?.(); // samme fane
            window.dispatchEvent(new CustomEvent("pb:themeChanged", { detail: { theme: val } }));
            window.toast?.(`Theme: ${val} ✓`);
        } catch (e) { console.warn("Theme apply failed", e); }
    }

    document.addEventListener("click", (e) => {
        const el = e.target.closest("[data-theme], [data-name], [data-value], .theme-preview, .theme-chip");
        if (!el) return;
        const val = el.getAttribute("data-theme")
            || el.getAttribute("data-name")
            || el.getAttribute("data-value")
            || (el.textContent || "").trim().toLowerCase();
        if (!val) return;
        applyThemeNow(val);
        const lab = document.querySelector("[data-current-theme], #currentTheme, #currentThemeVal");
        if (lab) lab.textContent = val;
    });

    /* ---------------- DAILY GOAL ---------------- */
    function readGoal() {
        return Math.max(0, Number(localStorage.getItem("pb:timer:goalMin") || "20"));
    }
    function writeGoal(mins) {
        localStorage.setItem("pb:timer:goalMin", String(mins));
        window.dispatchEvent(new CustomEvent("pb:timer:goalChanged", { detail: { minutes: mins } }));
        window.toast?.(`Saved daily goal: ${mins}m ✓`);
        const lab = document.querySelector("[data-goal-value], #goalValue, .goal-value, #goalVal");
        if (lab) lab.textContent = `${mins} m`;
        // Vis en liten “Saved ✓”-label nær Save-knappen (uten markupkrav)
        const saveBtn = document.getElementById("goalSave") || document.querySelector("#goalInput")?.closest("section, .card")?.querySelector("button, .btn");
        if (saveBtn) {
            let msg = document.getElementById("goalSavedMsg");
            if (!msg) {
                msg = document.createElement("div");
                msg.id = "goalSavedMsg";
                msg.className = "muted small";
                msg.style.marginTop = "6px";
                saveBtn.insertAdjacentElement("afterend", msg);
            }
            msg.textContent = `Saved ✓ (${mins} m)`;
        }
    }

    function initGoalUI() {
        const saved = readGoal();

        // Finn slider i "Reading Timer"-seksjonen om mulig
        const sections = Array.from(document.querySelectorAll("section, .card"));
        const secTimer = sections.find(sec => /reading\s*timer/i.test(sec.textContent || "")) || document;
        const slider = secTimer.querySelector('#goalInput, input[type="range"]');

        if (slider) {
            const min = Number(slider.min || "0");
            const max = Number(slider.max || "999");
            const val = (saved && saved >= min && saved <= max) ? saved : Number(slider.value || saved || 20);
            slider.value = String(val);
            const lab = document.querySelector("[data-goal-value], #goalValue, .goal-value, #goalVal");
            if (lab) lab.textContent = `${val} m`;
            slider.addEventListener("input", () => { if (lab) lab.textContent = `${slider.value} m`; });
        }

        // “Save”-knapp
        const candidates = Array.from(secTimer.querySelectorAll('#goalSave, button, .btn'))
            .filter(b => /save/i.test(b.textContent || "") || b.id === "goalSave");
        const save = candidates[0];
        if (save) {
            save.addEventListener("click", () => {
                const val = slider ? Number(slider.value) : saved;
                writeGoal(val);
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initGoalUI, { once: true });
    } else {
        initGoalUI();
    }
})();
