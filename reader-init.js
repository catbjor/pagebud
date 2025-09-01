// reader-init.js — PageBud Reader (EPUB + PDF) with PDF TextLayer + OCR fallback
// Bevarer eksisterende design/markup. Binder kun til eksisterende knapper.
// EPUB: paginert, A−/A+, TOC (prompt), bokmerker, highlights (CFI).
// PDF: render-kø, fit-to-width, zoom, textLayer fra pdf.js ELLER OCR (Tesseract),
//      markering -> highlights (Firestore), søk, bokmerker. OCR caches i IndexedDB.
(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const qs = (k) => new URL(location.href).searchParams.get(k);

    // pdf.js worker
    if (window.pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
    }

    /* ===========================
       GLOBAL STATE / REFS
    =========================== */
    let user = null;
    let bookId = null;
    let bookDoc = null;

    const epubEl = $("#epubContainer");
    const pdfWrap = $("#pdfContainer");
    const pdfCanvas = $("#pdfCanvas");
    const titleEl = $("#bookTitle");
    const posLabel = $("#posLabel");

    const btnPrev = $("#btnPrev");
    const btnNext = $("#btnNext");
    const btnZoomIn = $("#btnZoomIn");
    const btnZoomOut = $("#btnZoomOut");
    const btnFontInc = $("#btnFontInc");
    const btnFontDec = $("#btnFontDec");
    const btnBookmark = $("#btnBookmark");
    const btnTOC = $("#btnTOC");
    const pdfSlider = $("#pdfSlider");

    const pdfSearchInput = $("#pdfSearch");
    const btnSearchNext = $("#btnSearchNext");
    const btnSearchPrev = $("#btnSearchPrev");

    /* ===========================
       SAVE PROGRESS (debounced)
    =========================== */
    let saveTimer = null;
    function scheduleSave(update) {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
            try {
                await fb.db
                    .collection("users").doc(user.uid)
                    .collection("books").doc(bookId)
                    .set({ progress: { ...(bookDoc.progress || {}), ...update, updatedAt: new Date() } }, { merge: true });
            } catch (e) { console.warn("Save progress failed", e); }
        }, 300);
    }

    /* ===========================
       FIRESTORE ANNOTATIONS
    =========================== */
    async function saveAnnotation(a) {
        const u = fb?.auth?.currentUser;
        if (!u || !bookId) return;
        const ref = fb.db.collection("users").doc(u.uid)
            .collection("books").doc(bookId)
            .collection("annotations").doc();
        await ref.set({
            ...a,
            createdAt: (window.firebase?.firestore?.FieldValue?.serverTimestamp?.()) || new Date(),
        });
    }
    async function loadAnnotationsForPage(pageNum) {
        try {
            const snap = await fb.db.collection("users").doc(user.uid)
                .collection("books").doc(bookId)
                .collection("annotations").where("engine", "==", "pdf").get();
            const out = [];
            snap.forEach(d => { const x = d.data(); if (x?.page === pageNum) out.push({ id: d.id, ...x }); });
            return out;
        } catch { return []; }
    }

    /* ===========================
       EPUB (ePub.js)
    =========================== */
    let book = null, rendition = null;
    let fontPct = Number(localStorage.getItem("pb:epub:font") || "100");

    function epubUpdatePos(loc) {
        const cfi = loc?.start?.cfi || "";
        if (posLabel) posLabel.textContent = cfi ? `EPUB • ${cfi.slice(0, 24)}…` : "EPUB";
        scheduleSave({ epubCfi: cfi });
    }
    function epubApplyFont() {
        try { rendition?.themes?.fontSize?.(fontPct + "%"); localStorage.setItem("pb:epub:font", String(fontPct)); } catch { }
    }
    function incFont(step = 10) { fontPct = Math.min(200, fontPct + step); epubApplyFont(); }
    function decFont(step = 10) { fontPct = Math.max(80, fontPct - step); epubApplyFont(); }

    async function addBookmarkEPUB() {
        try {
            const loc = rendition?.currentLocation?.();
            const cfi = loc?.start?.cfi || null;
            if (!cfi) return;
            await saveAnnotation({ type: "bookmark", engine: "epub", cfi });
            window.toast?.("Bookmark saved ✓");
        } catch (e) { console.warn("bookmark(epub) failed", e); }
    }
    async function openTOC() {
        try {
            await book?.loaded?.navigation;
            const toc = book?.navigation?.toc || [];
            if (!toc.length) return window.toast?.("No TOC available");
            const first = toc.slice(0, 10).map((x, i) => `${i + 1}. ${x.label}`).join("\n");
            const pick = prompt(`Go to chapter (1-${toc.length}):\n\n${first}${toc.length > 10 ? "\n…" : ""}`);
            const idx = Math.max(1, Math.min(toc.length, Number(pick || "0")));
            const href = toc[idx - 1]?.href; if (href) await rendition.display(href);
        } catch (e) { console.warn("TOC open failed", e); }
    }
    function bindEpubShortcuts() {
        window.addEventListener("keydown", (e) => {
            if (!rendition) return;
            if (e.key === "ArrowLeft") rendition.prev();
            else if (e.key === "ArrowRight") rendition.next();
            else if (e.key === "]") incFont();
            else if (e.key === "[") decFont();
            else if (e.key.toLowerCase() === "b") addBookmarkEPUB();
        });
        btnPrev && (btnPrev.onclick = () => rendition.prev());
        btnNext && (btnNext.onclick = () => rendition.next());
        btnFontInc && (btnFontInc.onclick = () => incFont());
        btnFontDec && (btnFontDec.onclick = () => decFont());
        btnBookmark && (btnBookmark.onclick = () => addBookmarkEPUB());
        btnTOC && (btnTOC.onclick = () => openTOC());
    }
    async function loadEPUB(src, startCfi) {
        pdfWrap && (pdfWrap.style.display = "none");
        epubEl && (epubEl.style.display = "block");
        book = ePub(src);
        rendition = book.renderTo(epubEl, { width: "100%", height: "70vh", spread: "none", flow: "paginated" });
        try { window.PBReaderTheme?.init?.(rendition); } catch { }
        await rendition.display(startCfi || undefined);
        if (posLabel) posLabel.textContent = "EPUB";
        rendition.on("relocated", epubUpdatePos);
        rendition.on("selected", async (cfiRange, contents) => {
            try {
                const selText = String(contents?.window?.getSelection?.()?.toString() || "").trim();
                rendition.annotations.add("highlight", cfiRange, {}, null, "hl-" + Date.now());
                await saveAnnotation({ type: "highlight", engine: "epub", cfi: cfiRange, text: selText });
                window.toast?.("Highlight saved ✓");
                contents?.window?.getSelection?.()?.removeAllRanges?.();
            } catch (e) { console.warn("highlight(epub) failed", e); }
        });
        bindEpubShortcuts();
        epubApplyFont();
    }

    /* ===========================
       PDF (pdf.js) + TextLayer + OCR
    =========================== */
    let pdfDoc = null, pdfPage = 1, pdfTotal = 1;
    let pdfScale = Number(localStorage.getItem("pb:pdf:scale") || "1.0");
    let rendering = false, pendingPage = null;

    let pdfTextLayer = null;  // usynlig tekst (for seleksjon/søk)
    let pdfHLOverlay = null;  // highlight overlay
    const textCache = new Map(); // pageNum -> { textContent, flat?, ocr? }
    let searchHits = []; let searchIdx = -1; let currentQuery = "";

    function ensureOverlays() {
        if (!pdfWrap || !pdfCanvas) return;
        const parent = pdfWrap;
        if (!pdfHLOverlay) {
            pdfHLOverlay = document.createElement("div");
            pdfHLOverlay.id = "pdfHighlightOverlay";
            Object.assign(pdfHLOverlay.style, { position: "absolute", left: "0", top: "0", pointerEvents: "none" });
            parent.appendChild(pdfHLOverlay);
        }
        if (!pdfTextLayer) {
            pdfTextLayer = document.createElement("div");
            pdfTextLayer.id = "pdfTextLayer";
            Object.assign(pdfTextLayer.style, {
                position: "absolute", left: "0", top: "0",
                color: "transparent", userSelect: "text", pointerEvents: "auto", whiteSpace: "pre"
            });
            parent.appendChild(pdfTextLayer);
            pdfTextLayer.addEventListener("mouseup", handlePDFSelection);
        }
        const offsetLeft = (pdfCanvas.offsetLeft || 0);
        const offsetTop = (pdfCanvas.offsetTop || 0);
        [pdfTextLayer, pdfHLOverlay].forEach(el => {
            el.style.width = pdfCanvas.width + "px";
            el.style.height = pdfCanvas.height + "px";
            el.style.transform = `translate(${offsetLeft}px, ${offsetTop}px)`;
        });
    }
    function clearTextLayer() { if (pdfTextLayer) pdfTextLayer.innerHTML = ""; }
    function clearHL() { if (pdfHLOverlay) pdfHLOverlay.innerHTML = ""; }

    function updatePdfUI() {
        if (posLabel) posLabel.textContent = `PDF • Page ${pdfPage} of ${pdfTotal}`;
        if (pdfSlider) { pdfSlider.max = String(pdfTotal); pdfSlider.value = String(pdfPage); }
        scheduleSave({ pdfPage, pdfTotal });
    }
    function setPdfScale(next) {
        pdfScale = Math.max(0.9, Math.min(2.0, next));
        localStorage.setItem("pb:pdf:scale", String(pdfScale));
        queueRender(pdfPage);
    }

    async function renderTextLayerFromPDF(page, viewport) {
        // pdf.js tekstlag
        const textContent = await page.getTextContent();
        const items = textContent.items || [];
        if (items.length >= 3) {
            // "ekte" PDF med tekstlag
            ensureOverlays(); clearTextLayer(); clearHL();
            const util = pdfjsLib?.Util;
            const container = pdfTextLayer;
            const H = viewport.height;
            items.forEach((item) => {
                try {
                    const tx = util ? util.transform(viewport.transform, item.transform) : item.transform;
                    const x = tx[4], y = tx[5];
                    const fontH = Math.hypot(tx[2], tx[3]);
                    const span = document.createElement("span");
                    span.textContent = item.str;
                    Object.assign(span.style, {
                        position: "absolute",
                        left: `${x}px`,
                        top: `${H - y}px`,
                        fontSize: `${fontH}px`,
                        lineHeight: "1",
                        whiteSpace: "pre",
                    });
                    container.appendChild(span);
                } catch { }
            });
            textCache.set(pdfPage, { textContent, flat: items.map(it => it.str).join("\n"), ocr: false });
            // tegn lagrede highlights
            try {
                (await loadAnnotationsForPage(pdfPage)).filter(a => a.type === "highlight" && a.rects)
                    .forEach(a => a.rects.forEach(drawHLRect));
            } catch { }
            return true; // vi har tekstlag
        }
        return false; // tomt -> OCR
    }

    // ---- OCR infra ----
    const OCR_LANGS = (localStorage.getItem("pb:ocr:langs") || "eng"); // legg til "nor" hvis ønsket
    const OCR_DB = "pbOCR";
    const OCR_STORE = "pages";
    let ocrDBP = null;

    function loadScriptOnce(src) {
        return new Promise((res, rej) => {
            if (document.querySelector(`script[src="${src}"]`)) return res();
            const s = document.createElement("script");
            s.src = src; s.async = true;
            s.onload = () => res(); s.onerror = rej;
            document.head.appendChild(s);
        });
    }
    async function ensureTesseract() {
        if (window.Tesseract) return true;
        window.toast?.("Loading OCR engine…");
        await loadScriptOnce("https://cdn.jsdelivr.net/npm/tesseract.js@v5.0.3/dist/tesseract.min.js");
        return !!window.Tesseract;
    }

    function ocrOpenDB() {
        if (ocrDBP) return ocrDBP;
        ocrDBP = new Promise((res, rej) => {
            const rq = indexedDB.open(OCR_DB, 1);
            rq.onupgradeneeded = () => {
                const db = rq.result;
                if (!db.objectStoreNames.contains(OCR_STORE)) db.createObjectStore(OCR_STORE, { keyPath: "key" });
            };
            rq.onsuccess = () => res(rq.result);
            rq.onerror = () => rej(rq.error);
        });
        return ocrDBP;
    }
    function ocrPut(rec) {
        return ocrOpenDB().then(db => new Promise((res, rej) => {
            const tx = db.transaction(OCR_STORE, "readwrite");
            tx.objectStore(OCR_STORE).put(rec);
            tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
        }));
    }
    function ocrGet(key) {
        return ocrOpenDB().then(db => new Promise((res, rej) => {
            const tx = db.transaction(OCR_STORE, "readonly");
            const rq = tx.objectStore(OCR_STORE).get(key);
            rq.onsuccess = () => res(rq.result || null);
            rq.onerror = () => rej(rq.error);
        }));
    }

    function drawHLRect(r) {
        if (!pdfHLOverlay) return;
        const hl = document.createElement("div");
        Object.assign(hl.style, {
            position: "absolute",
            left: (r.x * pdfCanvas.width) + "px",
            top: (r.y * pdfCanvas.height) + "px",
            width: (r.w * pdfCanvas.width) + "px",
            height: (r.h * pdfCanvas.height) + "px",
            background: "rgba(255, 225, 0, .35)",
            borderRadius: "2px",
            pointerEvents: "none",
        });
        pdfHLOverlay.appendChild(hl);
    }

    async function renderTextLayerFromOCR(page, viewport) {
        // OCR cache key
        const key = `${bookId}:${pdfPage}`;
        const cached = await ocrGet(key);
        if (cached?.words?.length) {
            buildOCRTextLayer(cached.words, viewport);
            return { text: cached.text || cached.words.map(w => w.text).join(" "), ok: true };
        }

        // Lag et midlertidig bilde av canvas (allerede renderet)
        const off = document.createElement("canvas");
        off.width = pdfCanvas.width; off.height = pdfCanvas.height;
        off.getContext("2d").drawImage(pdfCanvas, 0, 0);

        const ok = await ensureTesseract();
        if (!ok) { window.toast?.("OCR engine failed to load"); return { ok: false }; }

        window.toast?.("Running OCR…");
        const { data } = await Tesseract.recognize(off, OCR_LANGS, { /* logger: m => console.log(m) */ });

        // Ekstraher ord med bokser
        const words = (data?.words || []).map(w => {
            // Tesseract bbox i px på input-canvas
            const x = w.bbox.x0 / off.width;
            const y = w.bbox.y0 / off.height;
            const wRel = (w.bbox.x1 - w.bbox.x0) / off.width;
            const hRel = (w.bbox.y1 - w.bbox.y0) / off.height;
            return { x, y, w: wRel, h: hRel, text: (w.text || "").trim() };
        }).filter(w => w.text);

        await ocrPut({ key, page: pdfPage, bookId, text: data?.text || "", words, ts: Date.now() });

        buildOCRTextLayer(words, viewport);
        return { text: data?.text || "", ok: true };
    }

    function buildOCRTextLayer(words, viewport) {
        ensureOverlays(); clearTextLayer(); clearHL();
        const container = pdfTextLayer;
        words.forEach(w => {
            const span = document.createElement("span");
            span.textContent = w.text;
            Object.assign(span.style, {
                position: "absolute",
                left: (w.x * pdfCanvas.width) + "px",
                top: (w.y * pdfCanvas.height) + "px",
                width: (w.w * pdfCanvas.width) + "px",
                height: (w.h * pdfCanvas.height) + "px",
                fontSize: Math.max(8, Math.round(w.h * pdfCanvas.height * 0.9)) + "px",
                lineHeight: "1",
                whiteSpace: "pre",
            });
            container.appendChild(span);
        });
        // tegn lagrede highlights
        loadAnnotationsForPage(pdfPage).then((anns) => {
            anns.filter(a => a.type === "highlight" && a.rects).forEach(a => a.rects.forEach(drawHLRect));
        }).catch(() => { });
        textCache.set(pdfPage, { textContent: null, flat: words.map(w => w.text).join(" "), ocr: true });
    }

    async function renderPage(pageNo) {
        if (!pdfDoc || !pdfCanvas) return;
        rendering = true;
        const ctx = pdfCanvas.getContext("2d");
        const page = await pdfDoc.getPage(pageNo);

        // Fit-to-width baseline
        const desiredW = (pdfWrap && pdfWrap.clientWidth) || 800;
        const baseVp = page.getViewport({ scale: 1 });
        const fit = desiredW / baseVp.width;
        const used = Math.max(fit, pdfScale);
        const viewport = page.getViewport({ scale: used });

        pdfCanvas.width = viewport.width;
        pdfCanvas.height = viewport.height;

        await page.render({ canvasContext: ctx, viewport }).promise;

        // Forsøk pdf.js textLayer; hvis "tom", bruk OCR
        let hadText = false;
        try { hadText = await renderTextLayerFromPDF(page, viewport); } catch { hadText = false; }
        if (!hadText) {
            try { await renderTextLayerFromOCR(page, viewport); } catch (e) { console.warn("OCR failed", e); }
        }

        pdfPage = pageNo;
        rendering = false;

        if (pendingPage != null) { const n = pendingPage; pendingPage = null; queueRender(n); return; }
        updatePdfUI();
    }

    function queueRender(pageNo) {
        pageNo = Math.max(1, Math.min(pdfTotal, pageNo));
        if (rendering) pendingPage = pageNo; else renderPage(pageNo).catch(console.warn);
    }

    async function loadPDF(src, startPage) {
        if (!pdfWrap || !pdfCanvas) throw new Error("PDF container missing");
        epubEl && (epubEl.style.display = "none");
        pdfWrap.style.display = "block";
        textCache.clear(); searchHits = []; searchIdx = -1; currentQuery = "";

        pdfDoc = await pdfjsLib.getDocument(src).promise;
        pdfTotal = pdfDoc.numPages;
        pdfPage = Math.min(Math.max(1, Number(startPage || 1)), pdfTotal);

        btnPrev && (btnPrev.onclick = () => queueRender(pdfPage - 1));
        btnNext && (btnNext.onclick = () => queueRender(pdfPage + 1));
        btnZoomIn && (btnZoomIn.onclick = () => setPdfScale(pdfScale + 0.1));
        btnZoomOut && (btnZoomOut.onclick = () => setPdfScale(pdfScale - 0.1));
        pdfSlider && pdfSlider.addEventListener("input", () => queueRender(Number(pdfSlider.value) || pdfPage));

        window.addEventListener("keydown", (e) => {
            if (e.key === "ArrowLeft") queueRender(pdfPage - 1);
            else if (e.key === "ArrowRight") queueRender(pdfPage + 1);
            else if (e.key === "+") setPdfScale(pdfScale + 0.1);
            else if (e.key === "-") setPdfScale(pdfScale - 0.1);
            else if (e.key.toLowerCase() === "b") addBookmarkPDF();
            else if (e.key === "Enter" && (document.activeElement === pdfSearchInput)) doPDFSearchNext();
        });

        if (pdfSearchInput && btnSearchNext && btnSearchPrev) {
            btnSearchNext.onclick = doPDFSearchNext;
            btnSearchPrev.onclick = doPDFSearchPrev;
        }

        await renderPage(pdfPage);
    }

    async function addBookmarkPDF() {
        try { await saveAnnotation({ type: "bookmark", engine: "pdf", page: pdfPage }); window.toast?.("Bookmark saved ✓"); }
        catch (e) { console.warn("bookmark(pdf) failed", e); }
    }

    // Utvalg → highlight for PDF (uavhengig av pdf.js/ocr)
    function getSelectionRectsRelative() {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) return null;
        const canvasRect = pdfCanvas.getBoundingClientRect();
        const out = [];
        for (let i = 0; i < sel.rangeCount; i++) {
            const r = sel.getRangeAt(i).getClientRects();
            for (const cr of r) {
                const ix = Math.max(0, Math.min(1, (cr.left - canvasRect.left) / canvasRect.width));
                const iy = Math.max(0, Math.min(1, (cr.top - canvasRect.top) / canvasRect.height));
                const iw = Math.max(0, Math.min(1, cr.width / canvasRect.width));
                const ih = Math.max(0, Math.min(1, cr.height / canvasRect.height));
                if (iw > 0 && ih > 0) out.push({ x: ix, y: iy, w: iw, h: ih });
            }
        }
        const text = sel.toString().trim();
        return out.length ? { rects: out, text } : null;
    }
    async function handlePDFSelection() {
        try {
            const got = getSelectionRectsRelative();
            if (!got || !got.text) return;
            try { window.getSelection().removeAllRanges(); } catch { }
            await saveAnnotation({ type: "highlight", engine: "pdf", page: pdfPage, rects: got.rects, text: got.text });
            got.rects.forEach(r => drawHLRect(r));
            window.toast?.("Highlight saved ✓");
        } catch (e) { console.warn("pdf selection→highlight failed", e); }
    }

    // Søk (bruker textCache; OCR-tekst brukes hvis pdf.js-tekst mangler)
    async function ensurePageText(pageNum) {
        let rec = textCache.get(pageNum);
        if (rec?.flat) return rec.flat;

        // Prøv pdf.js textContent først
        try {
            const page = await pdfDoc.getPage(pageNum);
            const textContent = await page.getTextContent();
            const items = textContent.items || [];
            if (items.length >= 3) {
                const flat = items.map(it => it.str).join("\n");
                rec = { textContent, flat, ocr: false };
                textCache.set(pageNum, rec);
                return flat;
            }
        } catch { }

        // Kjør (eller hent) OCR
        const key = `${bookId}:${pageNum}`;
        const cached = await ocrGet(key);
        if (cached?.text) {
            rec = { textContent: null, flat: cached.text, ocr: true };
            textCache.set(pageNum, rec);
            return cached.text;
        }

        // Render siden (hvis vi ikke står på den) for å få canvas -> OCR
        if (pageNum !== pdfPage) {
            await queueJump(pageNum);
        }
        const ok = await ensureTesseract();
        if (!ok) return "";
        const off = document.createElement("canvas");
        off.width = pdfCanvas.width; off.height = pdfCanvas.height;
        off.getContext("2d").drawImage(pdfCanvas, 0, 0);
        const { data } = await Tesseract.recognize(off, OCR_LANGS);
        await ocrPut({ key, page: pageNum, bookId, text: data?.text || "", words: (data?.words || []), ts: Date.now() });
        const flat = data?.text || "";
        textCache.set(pageNum, { textContent: null, flat, ocr: true });
        return flat;
    }
    async function buildSearchHits(query) {
        searchHits = []; searchIdx = -1;
        if (!query) return;
        const q = query.toLowerCase();
        for (let p = 1; p <= pdfTotal; p++) {
            try {
                const txt = (await ensurePageText(p)).toLowerCase();
                let i = 0;
                while (true) {
                    i = txt.indexOf(q, i);
                    if (i === -1) break;
                    searchHits.push({ page: p, idx: searchHits.length });
                    i += q.length;
                    if (searchHits.length > 500) break;
                }
                if (searchHits.length > 500) break;
            } catch { }
        }
    }
    async function jumpToSearchHit(k) {
        if (!searchHits.length) return;
        searchIdx = (k + searchHits.length) % searchHits.length;
        const hit = searchHits[searchIdx]; if (!hit) return;
        if (hit.page !== pdfPage) { await queueJump(hit.page); }
        flashSearchMarker();
    }
    function flashSearchMarker() {
        if (!pdfHLOverlay) return;
        const mark = document.createElement("div");
        Object.assign(mark.style, {
            position: "absolute", left: "0", top: "0", width: "100%", height: "12px",
            background: "rgba(59,130,246,.35)", pointerEvents: "none"
        });
        pdfHLOverlay.appendChild(mark);
        setTimeout(() => mark.remove(), 600);
    }
    function doPDFSearchNext() {
        const q = (pdfSearchInput?.value || "").trim();
        if (!q) return;
        if (q !== currentQuery) { currentQuery = q; buildSearchHits(q).then(() => jumpToSearchHit(0)); }
        else { jumpToSearchHit(searchIdx + 1); }
    }
    function doPDFSearchPrev() {
        const q = (pdfSearchInput?.value || "").trim();
        if (!q) return;
        if (q !== currentQuery) { currentQuery = q; buildSearchHits(q).then(() => jumpToSearchHit(0)); }
        else { jumpToSearchHit(searchIdx - 1); }
    }
    function queueJump(n) {
        return new Promise((resolve) => {
            let done = false;
            const once = () => { if (done) return; done = true; resolve(); };
            const obs = new MutationObserver(() => { once(); obs.disconnect(); });
            try { obs.observe(pdfCanvas, { attributes: true, childList: false }); } catch { }
            queueRender(n);
            setTimeout(once, 600);
        });
    }

    /* ===========================
       BOOT / ROUTING
    =========================== */
    function fileSrcFromDoc(d) {
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
        return d.fileType || "pdf";
    }

    document.addEventListener("DOMContentLoaded", async () => {
        try {
            user = fb?.auth?.currentUser;
            if (!user) { location.href = "auth.html"; return; }
            bookId = qs("id");
            if (!bookId) { alert("Missing id"); history.back(); return; }
            $(".app-container")?.setAttribute("data-current-book-id", bookId);

            const snap = await fb.db.collection("users").doc(user.uid)
                .collection("books").doc(bookId).get();
            if (!snap.exists) { alert("Book not found"); history.back(); return; }
            bookDoc = snap.data() || {};
            titleEl && (titleEl.textContent = bookDoc.title || "Reader");

            let src = fileSrcFromDoc(bookDoc);
            if (!src && window.PBFileStore?.getURL) { try { src = await PBFileStore.getURL(bookDoc.file); } catch { } }
            if (!src) { alert("No file attached to this book."); return; }

            const kind = inferType(bookDoc);
            const startPdf = Number(bookDoc?.progress?.pdfPage || 1);
            const startCfi = bookDoc?.progress?.epubCfi || "";

            if (kind === "epub") await loadEPUB(src, startCfi);
            else await loadPDF(src, startPdf);
        } catch (e) { console.error(e); alert(e?.message || "Failed to open reader"); }
    });
})();

document.addEventListener("DOMContentLoaded", () => {
    const auth = (window.fb?.auth ? window.fb.auth() : firebase.auth());

    auth.onAuthStateChanged(user => {
        if (!user) {
            // Ikke logget inn → send tilbake til login
            window.location.href = "auth.html";
            return;
        }

        // Her kan du trygt starte resten av reader-init
        startReader(user);
    });
});

function startReader(user) {
    const params = new URLSearchParams(location.search);
    const bookId = params.get("id");
    if (!bookId) {
        alert("Missing book id");
        return;
    }

    // last boken fra Firestore og åpne PDF/EPUB
    const db = (window.fb?.db || firebase.firestore());
    db.collection("users").doc(user.uid).collection("books").doc(bookId).get()
        .then(snap => {
            if (!snap.exists) {
                alert("Book not found");
                return;
            }
            const data = snap.data();
            if (data.fileUrl) {
                openBook(data.fileUrl, data.fileType || "pdf");
            } else {
                alert("No file found for this book");
            }
        });
}
  