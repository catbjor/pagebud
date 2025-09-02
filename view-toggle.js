// view-toggle.js — grid/list toggle (homepage)
(function () {
    "use strict";

    function boot() {
        const wrap = document.getElementById("viewToggle");
        const btnGrid = document.getElementById("viewGrid");
        const btnList = document.getElementById("viewList");
        const grid = document.getElementById("books-grid"); // << fixed (was "book-grid")

        if (!wrap || !btnGrid || !btnList || !grid) return;

        function apply(mode) {
            // toggle class on the books container
            grid.classList.toggle("list-view", mode === "list");
            // button states
            btnGrid.classList.toggle("active", mode === "grid");
            btnList.classList.toggle("active", mode === "list");
            // remember choice
            try { localStorage.setItem("pb:view", mode); } catch { }
        }

        btnGrid.addEventListener("click", () => apply("grid"));
        btnList.addEventListener("click", () => apply("list"));

        // initial state
        const saved = (localStorage.getItem("pb:view") || "grid");
        apply(saved);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
