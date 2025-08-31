/* ============================================================
PageBud – settings-timer.js
Controls:
- Daily goal (minutes): #goalMin, #goalRange, #goalSave, #goalStatus
- Timer dock side & collapsed: radio[name=pb-timer-side], #pb-timer-collapsed
- Buttons: #pb-timer-apply, #pb-timer-toggle, #pb-timer-reset
- Applies live via window.PageBudTimerUI.apply({ side, collapsed })
============================================================ */
(function () {
  "use strict";

  // ---- Keys ----
  const LS_GOAL = "pb:goalMin";
  const LS_SIDE = "pb:timer:side";          // "left" | "right"
  const LS_COLL = "pb:timer:collapsed";     // "1" | "0"

  // ---- DOM helpers ----
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v || 0)));

  // ---- Elements ----
  const goalMinEl = $("#goalMin");
  const goalRangeEl = $("#goalRange");
  const goalSaveBtn = $("#goalSave");
  const goalStatusEl = $("#goalStatus");

  const sideRadios = $$('input[name="pb-timer-side"]'); // left/right
  const chkCollapsed = $("#pb-timer-collapsed");
  const btnApply = $("#pb-timer-apply");
  const btnToggle = $("#pb-timer-toggle");
  const btnReset = $("#pb-timer-reset");

  function toastMsg(msg) {
    if (window.toast) { window.toast(msg); return; }
    try { document.dispatchEvent(new CustomEvent("pb:toast", { detail: { msg } })); } catch { }
  }

  function loadPrefsToUI() {
    // Daily goal
    const goal = clamp(localStorage.getItem(LS_GOAL) ?? 20, 0, 300);
    if (goalMinEl) goalMinEl.value = String(goal);
    if (goalRangeEl) goalRangeEl.value = String(goal);

    // Dock side + collapsed
    const side = localStorage.getItem(LS_SIDE) || "right";
    sideRadios.forEach(r => r.checked = (r.value === side));
    const collapsed = (localStorage.getItem(LS_COLL) || "0") === "1";
    if (chkCollapsed) chkCollapsed.checked = collapsed;
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadPrefsToUI();

    // Sync number <-> range
    goalRangeEl?.addEventListener("input", e => { if (goalMinEl) goalMinEl.value = e.target.value; });
    goalMinEl?.addEventListener("input", e => { if (goalRangeEl) goalRangeEl.value = e.target.value; });

    // Save daily goal
    goalSaveBtn?.addEventListener("click", () => {
      const v = clamp(goalMinEl?.value ?? 0, 0, 300);
      localStorage.setItem(LS_GOAL, String(v));
      if (goalStatusEl) { goalStatusEl.textContent = `Saved ${v} min`; setTimeout(() => goalStatusEl.textContent = "", 1500); }
      toastMsg("Daily goal saved ✓");
    });

    // Apply now → persist + live apply
    btnApply?.addEventListener("click", () => {
      const sideVal = (sideRadios.find(r => r.checked)?.value) || "right";
      const collVal = !!chkCollapsed?.checked;

      localStorage.setItem(LS_SIDE, sideVal);
      localStorage.setItem(LS_COLL, collVal ? "1" : "0");

      // live apply (timer.js exposes PageBudTimerUI)
      window.PageBudTimerUI?.apply({ side: sideVal, collapsed: collVal });
      toastMsg("Timer settings applied ✓");
    });

    // Show/Hide now (toggle collapsed)
    btnToggle?.addEventListener("click", () => {
      const current = (localStorage.getItem(LS_COLL) || "0") === "1";
      const next = !current;
      localStorage.setItem(LS_COLL, next ? "1" : "0");   // <-- fixed line
      window.PageBudTimerUI?.apply({ collapsed: next });
    });

    // Reset timer state (clears active session + queue; keeps preferences)
    btnReset?.addEventListener("click", () => {
      if (!confirm("Reset timer state?")) return;
      try {
        localStorage.removeItem("pb:timer:active");
        localStorage.removeItem("pb:timer:queue");
      } catch { }
      toastMsg("Timer state cleared");
    });
  });
})();
