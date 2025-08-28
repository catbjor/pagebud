/* =========================================================
   PageBud — EPUB init
   - Oppretter ePub.js book+rendition
   - Knytter font-størrelse og lukke-knapp
   - KOBLER PÅ TEMA: PBReaderTheme.attach(rendition, { mount: '#reader-toolbar' })
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

    // Hjelpere
    function showReader() { shell.removeAttribute("hidden"); }
    function hideReader() { shell.setAttribute("hidden", ""); }

    function applyFontSize(pct) {
        currentFontPct = Math.max(70, Math.min(200, pct)); // 70%–200%
        localStorage.setItem("pb:reader:fontPct", String(currentFontPct));
        if (rendition) {
            rendition.themes.fontSize(currentFontPct + "%");
        }
    }

    // ===== INIT: kall denne med fil/URL når du vil åpne en EPUB =====
    // f.eks. initEpubReader(fileInput.files[0]) ELLER initEpubReader('/books/my.epub')
    window.initEpubReader = async function initEpubReader(fileOrUrl) {
        try {
            showReader();

            // 1) Opprett bok (Blob eller URL)
            book = ePub(fileOrUrl);

            // 2) Render til viewer
            rendition = book.renderTo(viewer, {
                width: "100%",
                height: "100%",
                spread: "auto",       // la ePub.js avgjøre oppslag
                flow: "paginated"     // klassisk side-for-side scrolling
            });

            // 3) Koble på tema-knappen (Aa) — HER er linja du spurte etter
            PBReaderTheme.attach(rendition, { mount: "#reader-toolbar" });

            // 4) Font-størrelse fra lagring
            applyFontSize(currentFontPct);

            // 5) Vis første lokasjon (eventuelt lagret)
            const savedCfi = localStorage.getItem("pb:reader:cfi");
            await rendition.display(savedCfi || undefined);

            // 6) Oppdater lokasjon løpende
            rendition.on("relocated", (location) => {
                if (location && location.start && location.start.cfi) {
                    localStorage.setItem("pb:reader:cfi", location.start.cfi);
                }
            });

            // 7) Piltaster venstre/høyre for side
            document.addEventListener("keydown", keyHandler);

            // 8) Font-kontroller
            fontMinus.addEventListener("click", () => applyFontSize(currentFontPct - 10));
            fontPlus.addEventListener("click", () => applyFontSize(currentFontPct + 10));

            // (valgfritt) Klikk venstre/høyre halvdel for forrige/neste
            viewer.addEventListener("click", tapToTurn);

        } catch (err) {
            console.error("[EPUB init] error:", err);
            hideReader();
            alert("Kunne ikke åpne EPUB.");
        }
    };

    // ----- Navigasjon -----
    function keyHandler(e) {
        if (!rendition) return;
        const k = e.key;
        if (k === "ArrowRight") { rendition.next(); }
        else if (k === "ArrowLeft") { rendition.prev(); }
    }

    function tapToTurn(e) {
        if (!rendition) return;
        const rect = viewer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        if (x < rect.width / 2) rendition.prev();
        else rendition.next();
    }

    // ----- Lukk leser -----
    btnClose.addEventListener("click", () => {
        try {
            document.removeEventListener("keydown", keyHandler);
            viewer.removeEventListener("click", tapToTurn);
            // Forsiktig opprydding; ePub.js har GC, men null stiller referanser
            book = null;
            rendition = null;
        } finally {
            hideReader();
        }
    });

    // ===== BONUS: åpne via ?epub=URL =====
    // Eks.: page.html?epub=/samples/alice.epub
    window.addEventListener("DOMContentLoaded", () => {
        const url = new URL(location.href);
        const epubUrl = url.searchParams.get("epub");
        if (epubUrl) {
            initEpubReader(epubUrl);
        }
    });
})();
