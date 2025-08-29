/* =========================================================
   PageBud — EPUB init (class-based open/close, no auto-open)
   --------------------------------------------------------- */
(function () {
    const shell = document.getElementById("epubReader");
    const viewer = document.getElementById("viewer");
    const btnClose = document.getElementById("btnCloseReader");
    const fontMinus = document.getElementById("fontMinus");
    const fontPlus = document.getElementById("fontPlus");

    let book = null;
    let rendition = null;
    let currentFontPct = parseInt(localStorage.getItem("pb:reader:fontPct") || "100", 10);

    function showReader() {
        if (!shell) return;
        shell.classList.add("open");           // ← styrt av CSS
        shell.removeAttribute("hidden");
    }
    function hideReader() {
        if (!shell) return;
        shell.classList.remove("open");
        shell.setAttribute("hidden", "");
    }

    function applyFontSize(pct) {
        currentFontPct = Math.max(70, Math.min(200, pct));
        localStorage.setItem("pb:reader:fontPct", String(currentFontPct));
        if (rendition) rendition.themes.fontSize(currentFontPct + "%");
    }

    // Åpnes manuelt fra “Read Book”
    window.initEpubReader = async function initEpubReader(fileOrUrl) {
        try {
            if (!viewer || !shell) { alert("EPUB viewer not ready."); return; }

            showReader();

            book = ePub(fileOrUrl);
            rendition = book.renderTo(viewer, {
                width: "100%",
                height: "100%",
                spread: "auto",
                flow: "paginated"
            });

            if (window.PBReaderTheme?.attach) {
                PBReaderTheme.attach(rendition, { mount: "#reader-toolbar" });
            }

            applyFontSize(currentFontPct);

            const savedCfi = localStorage.getItem("pb:reader:cfi");
            await rendition.display(savedCfi || undefined);

            rendition.on("relocated", (location) => {
                const cfi = location?.start?.cfi;
                if (cfi) localStorage.setItem("pb:reader:cfi", cfi);
            });

            function keyHandler(e) {
                if (!rendition) return;
                if (e.key === "ArrowRight") rendition.next();
                else if (e.key === "ArrowLeft") rendition.prev();
            }
            function tapToTurn(e) {
                if (!rendition) return;
                const rect = viewer.getBoundingClientRect();
                const x = e.clientX - rect.left;
                if (x < rect.width / 2) rendition.prev(); else rendition.next();
            }

            document.addEventListener("keydown", keyHandler);
            viewer.addEventListener("click", tapToTurn);

            fontMinus?.addEventListener("click", () => applyFontSize(currentFontPct - 10));
            fontPlus?.addEventListener("click", () => applyFontSize(currentFontPct + 10));

            btnClose?.addEventListener("click", () => {
                try {
                    document.removeEventListener("keydown", keyHandler);
                    viewer?.removeEventListener("click", tapToTurn);
                    book = null; rendition = null;
                } finally { hideReader(); }
            }, { once: true });

        } catch (err) {
            console.error("[EPUB init] error:", err);
            hideReader();
            alert("Kunne ikke åpne EPUB.");
        }
    };
})();
