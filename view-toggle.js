// view-toggle.js (final)
(function () {
    const grid = document.getElementById("book-grid");
    const btnGrid = document.getElementById("viewGrid");
    const btnList = document.getElementById("viewList");
    if (!grid || !btnGrid || !btnList) return;

    function apply(mode) {
        grid.classList.toggle("list-view", mode === "list");
        localStorage.setItem("pb:view", mode);
        btnGrid.classList.toggle("active", mode === "grid");
        btnList.classList.toggle("active", mode === "list");
    }
    btnGrid.addEventListener("click", () => apply("grid"));
    btnList.addEventListener("click", () => apply("list"));
    apply(localStorage.getItem("pb:view") || "grid");
})();
