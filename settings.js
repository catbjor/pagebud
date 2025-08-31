/* ========== Settings logic (themes + timer + cache) ========== */
(function () {
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    /* -------- util: cross-page broadcast -------- */
    function broadcast(payload) {
        try { window.dispatchEvent(new CustomEvent("pb:settings:update", { detail: payload })); } catch { }
    }
    function toast(msg) {
        const t = document.createElement("div");
        t.className = "toast";
        t.textContent = msg;
        document.body.appendChild(t);
        requestAnimationFrame(() => t.classList.add("show"));
        setTimeout(() => t.classList.remove("show"), 1800);
        setTimeout(() => t.remove(), 2200);
    }

    /* ---------- THEMES ---------- */
    const THEMES = [
        { id: "navy", name: "Navy & Teal", sw: ["#0b1220", "#0f766e", "#38bdf8", "#1f2937"] },
        { id: "porcelain", name: "Soft Neutrals", sw: ["#f7f7fb", "#eceff6", "#cbd5e1", "#475569"] },
        { id: "moss", name: "Moss Forest", sw: ["#0f172a", "#064e3b", "#34d399", "#1e293b"] },
        { id: "blush", name: "Soft Blush", sw: ["#fff7f9", "#ffdce7", "#f472b6", "#6b7280"] },
        { id: "sunset", name: "Sunset Pastel", sw: ["#0f0f12", "#fb7185", "#fca5a5", "#fde68a"] },
        { id: "espresso-peony", name: "Espresso & Peony", sw: ["#14110f", "#854d0e", "#cc8899", "#f5e1e9"] },
        { id: "glow", name: "Navy & Gold", sw: ["#0b1220", "#f59e0b", "#fde68a", "#111827"] },
        { id: "bakery", name: "Bakery Pastels", sw: ["#fffdfa", "#ffd1dc", "#bde0fe", "#c1f0d9"] }
    ];

    const themeList = $("#themeList");
    const currentThemeVal = $("#currentThemeVal");
    const btnMatchSystem = $("#btnMatchSystem");

    function applyTheme(key) {
        localStorage.setItem("pb:theme", key);
        // Re-apply on this tab
        if (window.pbApplyTheme) window.pbApplyTheme();
        currentThemeVal.textContent = key;
        $$(".theme-preview").forEach(b => b.classList.toggle("active", b.dataset.theme === key));
        // Tell other open pages
        broadcast({ theme: { key } });
        toast(`Theme set: ${key}`);
    }

    if (themeList) {
        themeList.innerHTML = THEMES.map(t => `
      <button class="theme-preview" data-theme="${t.id}">
        <div class="theme-slab">
          ${t.sw.map(c => `<span class="sw" style="background:${c}"></span>`).join("")}
        </div>
        <div class="theme-name">${t.name}</div>
        <i class="fa fa-check check"></i>
      </button>`).join("");

        $$(".theme-preview", themeList).forEach(btn =>
            btn.addEventListener("click", () => applyTheme(btn.dataset.theme))
        );

        btnMatchSystem?.addEventListener("click", () => applyTheme("system"));
        applyTheme(localStorage.getItem("pb:theme") || "default");
    }

    /* ---------- READING TIMER ---------- */
    const K = { goal: "pb:timer:goalMin", side: "pb:timer:side", coll: "pb:timer:collapsed", visible: "pb:timer:visible" };

    const goalInput = $("#goalInput");
    const goalVal = $("#goalVal");
    const goalSave = $("#goalSave");

    const dockLeft = $("#dockLeft");
    const dockRight = $("#dockRight");
    const startCollapsed = $("#startCollapsed");

    const btnApplyNow = $("#btnApplyNow");
    const btnShowDock = $("#btnShowDock");
    const btnResetTimer = $("#btnResetTimer");

    const st = {
        goal: parseInt(localStorage.getItem(K.goal) || "20", 10),
        side: localStorage.getItem(K.side) || "right",
        coll: localStorage.getItem(K.coll) === "1"
    };

    if (goalInput) {
        goalInput.value = st.goal;
        goalVal.textContent = st.goal;
        goalInput.addEventListener("input", () => (goalVal.textContent = goalInput.value));
    }
    if (dockLeft && dockRight) ((st.side === "right") ? dockRight : dockLeft).checked = true;
    if (startCollapsed) startCollapsed.checked = !!st.coll;

    // Save + broadcast each control
    goalSave?.addEventListener("click", () => {
        const v = parseInt(goalInput.value || "20", 10);
        localStorage.setItem(K.goal, String(v));
        broadcast({ timer: { goalMin: v } });
        toast(`Daily goal saved: ${v}m`);
    });

    dockLeft?.addEventListener("change", () => {
        if (dockLeft.checked) {
            localStorage.setItem(K.side, "left");
            broadcast({ timer: { side: "left" } });
            toast("Dock set: left");
        }
    });
    dockRight?.addEventListener("change", () => {
        if (dockRight.checked) {
            localStorage.setItem(K.side, "right");
            broadcast({ timer: { side: "right" } });
            toast("Dock set: right");
        }
    });

    startCollapsed?.addEventListener("change", () => {
        const flag = startCollapsed.checked;
        localStorage.setItem(K.coll, flag ? "1" : "0");
        broadcast({ timer: { collapsed: flag } });
        toast(flag ? "Starts collapsed" : "Starts expanded");
    });

    btnApplyNow?.addEventListener("click", () => {
        broadcast({
            timer: {
                goalMin: parseInt(localStorage.getItem(K.goal) || "20", 10),
                side: localStorage.getItem(K.side) || "right",
                collapsed: localStorage.getItem(K.coll) === "1"
            }
        });
        toast("Timer settings applied now");
    });

    btnShowDock?.addEventListener("click", () => {
        const now = localStorage.getItem(K.visible) === "1";
        const next = !now;
        localStorage.setItem(K.visible, next ? "1" : "0");
        broadcast({ timer: { toggleVisible: true } });
        toast("Toggled dock visibility");
    });

    btnResetTimer?.addEventListener("click", () => {
        ["pb:timer:active", "pb:timer:queue"].forEach(k => localStorage.removeItem(k));
        broadcast({ timer: { resetState: true } });
        toast("Timer state reset");
    });

    /* ---------- RESET CACHE ---------- */
    $("#btnResetKeep")?.addEventListener("click", () => {
        Object.keys(localStorage).filter(k => k.startsWith("pb:")).forEach(k => localStorage.removeItem(k));
        broadcast({ cache: { softReset: true } });
        alert("Cache cleared (login kept)."); location.reload();
    });

    $("#btnFullReset")?.addEventListener("click", () => {
        localStorage.clear(); broadcast({ cache: { hardReset: true } });
        alert("Full reset. You may need to sign in again."); location.reload();
    });
})();
