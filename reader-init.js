// reader-init.js — PDF & EPUB reader with position save/restore
(function () {
    "use strict";
    const $ = (s, r = document) => r.querySelector(s);
    const qs = k => new URL(location.href).searchParams.get(k);

    // PDF.js worker (required)
    if (window.pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
    }

    // State
    let user = null;
    let bookId = null;
    let bookDoc = null;

    // PDF state
    let pdf = null;
    let pdfPage = 1;
    let pdfTotal = 1;

    // EPUB state
    let book = null;       // ePub Book
    let rendition = null;  // ePub Rendition

    // UI
    const epubEl = $("#epubContainer");
    const pdfCanvas = $("#pdfCanvas");
    const pdfWrap = $("#pdfContainer");
    const posLabel = $("#posLabel");
    const titleEl = $("#bookTitle");

    const btnPrev = $("#btnPrev");
    const btnNext = $("#btnNext");

    // ---- Data helpers ----
    function fileSrcFromDoc(d) {
        // Prefer local PBFileStore blob URL if present
        const meta = d.file || {};
        return meta.blobUrl || meta.url || d.fileUrl || "";
    }
    function inferType(d) {
        if (d?.file?.type) {
            if (/pdf/i.test(d.file.type)) return "pdf";
            if (/epub/i.test(d.file.type)) return "epub";
        }
        const src = fileSrcFromDoc(d);
        if (/\.pdf(\?|$)/i.test(src)) return "pdf";
        if (/\.epub(\?|$)/i.test(src)) return "epub";
        return d.fileType || "pdf"; // fallback
    }

    // ---- Firestore progress save ----
    let saveTimer = null;
    function scheduleSave(update) {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
            try {
                await fb.db.collection("users").doc(user.uid)
                    .collection("books").doc(bookId)
                    .set({ progress: { ...(bookDoc.progress || {}), ...update, updatedAt: new Date() } }, { merge: true });
            } catch (e) {
                console.error("Save progress failed", e);
            }
        }, 300); // small debounce
    }

    // ---- PDF logic ----
    async function loadPDF(src, startPage) {
        epubEl.style.display = "none";
        pdfWrap.style.display = "block";
        const ctx = pdfCanvas.getContext("2d");

        pdf = await pdfjsLib.getDocument(src).promise;
        pdfTotal = pdf.numPages;
        pdfPage = Math.min(Math.max(1, startPage || 1), pdfTotal);

        async function render(pageNo) {
            pdfPage = Math.min(Math.max(1, pageNo), pdfTotal);
            const page = await pdf.getPage(pdfPage);
            // scale to container width
            const desiredW = pdfWrap.clientWidth || 800;
            const viewport = page.getViewport({ scale: 1 });
            const scale = Math.max(1, desiredW / viewport.width);
            const vp = page.getViewport({ scale });

            pdfCanvas.width = vp.width;
            pdfCanvas.height = vp.height;

            await page.render({ canvasContext: ctx, viewport: vp }).promise;

            $("#pdfStatus").textContent = `Page ${pdfPage} / ${pdfTotal}`;
            posLabel.textContent = `PDF • Page ${pdfPage} of ${pdfTotal}`;

            scheduleSave({ pdfPage, pdfTotal });
        }

        // expose navigation
        btnPrev.onclick = () => render(pdfPage - 1);
        btnNext.onclick = () => render(pdfPage + 1);
        window.addEventListener("keydown", (e) => {
            if (e.key === "ArrowLeft") render(pdfPage - 1);
            if (e.key === "ArrowRight") render(pdfPage + 1);
        });

        await render(pdfPage);
    }

    // ---- EPUB logic ----
    async function loadEPUB(src, startCfi) {
        pdfWrap.style.display = "none";
        epubEl.style.display = "block";

        book = ePub(src);
        rendition = book.renderTo(epubEl, { width: "100%", height: "70vh", spread: "none", flow: "paginated" });

        await rendition.display(startCfi || undefined);

        posLabel.textContent = "EPUB";

        // Save CFI on move
        rendition.on("relocated", (loc) => {
            const cfi = loc?.start?.cfi || "";
            posLabel.textContent = cfi ? `EPUB • ${cfi.slice(0, 24)}…` : "EPUB";
            scheduleSave({ epubCfi: cfi });
        });

        // Nav
        btnPrev.onclick = () => rendition.prev();
        btnNext.onclick = () => rendition.next();
        window.addEventListener("keydown", (e) => {
            if (e.key === "ArrowLeft") rendition.prev();
            if (e.key === "ArrowRight") rendition.next();
        });
    }

    // ---- Boot ----
    document.addEventListener("DOMContentLoaded", async () => {
        try {
            user = fb.auth.currentUser;
            if (!user) { location.href = "auth.html"; return; }
            bookId = qs("id");
            if (!bookId) { alert("Missing id"); history.back(); return; }
            $(".app-container").setAttribute("data-current-book-id", bookId);

            const snap = await fb.db.collection("users").doc(user.uid).collection("books").doc(bookId).get();
            if (!snap.exists) { alert("Book not found"); history.back(); return; }
            bookDoc = snap.data() || {};

            titleEl.textContent = bookDoc.title || "Reader";

            // Resolve source & type
            let src = fileSrcFromDoc(bookDoc);
            if (!src && window.PBFileStore?.getUrl) {
                // try to resolve from PBFileStore by bookId (in case only a key is stored)
                src = await PBFileStore.getUrl({ uid: user.uid, bookId });
            }
            if (!src) { alert("No file attached to this book."); return; }

            const type = inferType(bookDoc);

            // Start at saved position if any
            const startPdf = Number(bookDoc?.progress?.pdfPage || 1);
            const startCfi = bookDoc?.progress?.epubCfi || "";

            if (type === "epub") {
                await loadEPUB(src, startCfi);
            } else {
                await loadPDF(src, startPdf);
            }
        } catch (e) {
            console.error(e);
            alert(e?.message || "Failed to open reader");
        }
    });
})();
