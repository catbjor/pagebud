/* =========================================================
   PageBud — EPUB init (robust for dataURL → Blob)
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

    const isDataURL = (s) => typeof s === "string" && s.startsWith("data:");
    function dataURLtoBlob(dataUrl) {
        const [header, b64] = dataUrl.split(',');
        const mime = header.match(/data:(.*);base64/)[1] || "application/octet-stream";
        const bin = atob(b64);
        const len = bin.length;
        const arr = new Uint8Array(len);
        for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
        return new Blob([arr], { type: mime });
    }

    function showReader() { shell && shell.removeAttribute("hidden"); }
    function hideReader() { shell && shell.setAttribute("hidden", ""); }

    function applyFontSize(pct) {
        currentFontPct = Math.max(70, Math.min(200, pct));
        localStorage.setItem("pb:reader:fontPct", String(currentFontPct));
        if (rendition) rendition.themes.fontSize(currentFontPct + "%");
    }

    // PUBLIC
    window.initEpubReader = async function initEpubReader(fileOrUrl) {
        try {
            showReader();

            // 1) Blob/URL
            const src = isDataURL(fileOrUrl) ? dataURLtoBlob(fileOrUrl) : fileOrUrl;

            // 2) Book + rendition
            book = ePub(src);
            rendition = book.renderTo(viewer, {
                width: "100%",
                height: "100%",
                spread: "auto",
                flow: "paginated"
            });

            // 3) Tema-knapp
            PBReaderTheme.attach(rendition, { mount: "#reader-toolbar" });

            // 4) Font
            applyFontSize(currentFontPct);

            // 5) Vent på readiness og vis
            if (book.ready) { try { await book.ready; } catch { } }
            const savedCfi = localStorage.getItem("pb:reader:cfi");
            await rendition.display(savedCfi || undefined);

            // 6) Lagre CFI ved flytting
            rendition.on("relocated", (location) => {
                if (location?.start?.cfi) localStorage.setItem("pb:reader:cfi", location.start.cfi);
            });

            // 7) Navigasjon
            document.addEventListener("keydown", keyHandler);
            viewer.addEventListener("click", tapToTurn);

            // 8) Font-knapper
            fontMinus.addEventListener("click", () => applyFontSize(currentFontPct - 10));
            fontPlus.addEventListener("click", () => applyFontSize(currentFontPct + 10));

        } catch (err) {
            console.error("[EPUB init] error:", err);
            hideReader();
            alert("Kunne ikke åpne EPUB.");
        }
    };

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

    btnClose?.addEventListener("click", () => {
        try {
            document.removeEventListener("keydown", keyHandler);
            viewer.removeEventListener("click", tapToTurn);
            book = null; rendition = null;
        } finally { hideReader(); }
    });

    // Bonus: ?epub=URL
    window.addEventListener("DOMContentLoaded", () => {
        const url = new URL(location.href);
        const epubUrl = url.searchParams.get("epub");
        if (epubUrl) initEpubReader(epubUrl);
    });
})();
