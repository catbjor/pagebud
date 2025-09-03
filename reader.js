// reader.js — robust EPUB + paged PDF (pdf.js) med neste/forrige + piltaster
(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const log = (...a) => console.log("[Reader]", ...a);
    const warn = (...a) => console.warn("[Reader]", ...a);

    // Firebase helpers
    function auth() { return (window.fb?.auth) || (window.firebase?.auth?.()) || firebase.auth(); }
    function db() { return (window.fb?.db) || (window.firebase?.firestore?.()) || firebase.firestore(); }
    function storage() { return (window.fb?.storage) || (window.firebase?.storage?.()) || (firebase.storage?.()); }

    async function requireUser() {
        const a = auth();
        if (a.currentUser) return a.currentUser;
        return new Promise((res) => { const off = a.onAuthStateChanged(u => { off(); res(u || null); }); });
    }

    // ---------- utils ----------
    const extFromUrl = (u) => {
        try {
            const q = (u || "").split("?")[0].toLowerCase();
            if (q.endsWith(".epub")) return "epub";
            if (q.endsWith(".pdf")) return "pdf";
        } catch { }
        return "";
    };
    const preferType = (hint, ...cands) => {
        const t = (hint || cands.find(Boolean) || "").toLowerCase();
        return t === "epub" || t === "pdf" ? t : "";
    };

    // ---------- kilder (resolvers) ----------
    async function tryFromExplicitFields(doc) {
        const url = doc.fileUrl || doc.pdfUrl || doc.epubUrl || "";
        if (!url) return null;
        const type = preferType(doc.fileType, doc.fileExt, extFromUrl(url));
        log("Resolved from explicit URL:", { type });
        return { url, type };
    }

    async function tryFromStorage(doc) {
        try {
            if (!doc.storagePath) return null;
            const st = storage(); if (!st?.ref) return null;
            const url = await st.ref(doc.storagePath).getDownloadURL();
            const type = preferType(doc.fileType, doc.fileExt, extFromUrl(url));
            log("Resolved from Firebase Storage:", { type });
            return { url, type };
        } catch (e) { warn("Storage resolve failed:", e); return null; }
    }

    async function tryFromLocalFilePath(doc) {
        try {
            if (!doc.filePath || !window.LocalFiles?.loadByPath) return null;
            const rec = await window.LocalFiles.loadByPath(doc.filePath);
            if (rec?.blob) {
                const url = URL.createObjectURL(rec.blob);
                const type = preferType(doc.fileType, doc.fileExt, rec.ext, extFromUrl(rec.name || ""));
                log("Resolved via LocalFiles.filePath:", { type });
                return { url, type };
            }
        } catch (e) { warn("LocalFiles.loadByPath failed:", e); }
        return null;
    }

    async function tryPB_getURL_fromDoc(doc) {
        try {
            if (!window.PBFileStore?.getURL) return null;
            if (!doc.localId && !doc.fileUrl) return null;
            const url = await PBFileStore.getURL(doc);
            if (url) {
                const type = preferType(doc.fileType, doc.fileExt, extFromUrl(doc.fileName || ""));
                log("Resolved via PBFileStore.getURL(meta):", { type });
                return { url, type };
            }
        } catch (e) { warn("PBFileStore.getURL(meta) failed:", e); }
        return null;
    }

    async function tryPB_getUrl_byIds(uid, bookId, doc) {
        try {
            if (!window.PBFileStore?.getUrl) return null;
            const url = await PBFileStore.getUrl(uid, bookId);
            if (url) {
                const type = preferType(doc?.fileType, doc?.fileExt, extFromUrl(url));
                log("Resolved via PBFileStore.getUrl(uid,bookId):", { type });
                return { url, type };
            }
        } catch (e) { warn("PBFileStore.getUrl(uid,bookId) failed:", e); }
        return null;
    }

    // ---------- EPUB render ----------
    async function renderEPUB(url) {
        const root = $("#viewerRoot");
        root.innerHTML = "";

        // host
        const host = document.createElement("div");
        host.id = "epubViewer";
        host.style.width = "100%";
        host.style.height = "100vh";
        host.style.position = "relative";
        root.appendChild(host);

        // controls
        const ctrls = document.createElement("div");
        ctrls.style.position = "absolute";
        ctrls.style.bottom = "12px";
        ctrls.style.left = "50%";
        ctrls.style.transform = "translateX(-50%)";
        ctrls.style.display = "flex";
        ctrls.style.gap = "8px";
        ctrls.style.zIndex = "10";

        const btnPrev = document.createElement("button");
        btnPrev.className = "btn";
        btnPrev.textContent = "‹ Prev";

        const pageInfo = document.createElement("span");
        pageInfo.style.fontSize = "12px";
        pageInfo.style.opacity = "0.8";

        const btnNext = document.createElement("button");
        btnNext.className = "btn";
        btnNext.textContent = "Next ›";

        ctrls.append(btnPrev, pageInfo, btnNext);
        host.appendChild(ctrls);

        // tap-soner (usynlige, for klikk/sveip)
        const leftZone = document.createElement("div");
        const rightZone = document.createElement("div");
        [leftZone, rightZone].forEach(z => {
            z.style.position = "absolute";
            z.style.top = "0"; z.style.bottom = "0";
            z.style.width = "30%";
            z.style.cursor = "pointer";
            z.style.zIndex = "5";
        });
        leftZone.style.left = "0";
        rightZone.style.right = "0";
        host.append(leftZone, rightZone);

        if (!window.ePub) { root.textContent = "EPUB viewer not loaded."; return; }
        const book = ePub(url);
        const rendition = book.renderTo(host, { width: "100%", height: "100%" });
        await rendition.display();

        // vis "location" som side-ish info
        const updateInfo = async () => {
            try {
                const loc = rendition.currentLocation();
                if (loc && loc.start && loc.start.displayed) {
                    const { page, total } = loc.start.displayed;
                    pageInfo.textContent = `${page} / ${total}`;
                } else {
                    pageInfo.textContent = "";
                }
            } catch { pageInfo.textContent = ""; }
        };
        rendition.on("rendered", updateInfo);
        await updateInfo();

        // navigasjon
        const goPrev = () => rendition.prev();
        const goNext = () => rendition.next();
        btnPrev.addEventListener("click", goPrev);
        btnNext.addEventListener("click", goNext);
        leftZone.addEventListener("click", goPrev);
        rightZone.addEventListener("click", goNext);

        window.addEventListener("keydown", (e) => {
            if (e.key === "ArrowRight") goNext();
            if (e.key === "ArrowLeft") goPrev();
        });
    }

    // ---------- PDF render (paged, pdf.js) ----------
    async function renderPDFPaged(url) {
        if (!window.pdfjsLib) {
            // fallback til iframe hvis pdf.js mangler
            const root = $("#viewerRoot");
            root.innerHTML = "";
            const iframe = document.createElement("iframe");
            iframe.id = "pdfFrame";
            iframe.src = url;
            iframe.style.width = "100%";
            iframe.style.height = "100vh";
            iframe.style.border = "0";
            root.appendChild(iframe);
            return;
        }

        const root = $("#viewerRoot");
        root.innerHTML = "";

        // wrapper
        const wrap = document.createElement("div");
        wrap.style.position = "relative";
        wrap.style.width = "100%";
        wrap.style.height = "100vh";
        wrap.style.display = "grid";
        wrap.style.placeItems = "center";
        root.appendChild(wrap);

        // canvas
        const canvas = document.createElement("canvas");
        canvas.style.maxWidth = "100%";
        canvas.style.maxHeight = "100vh";
        wrap.appendChild(canvas);
        const ctx = canvas.getContext("2d");

        // controls
        const ctrls = document.createElement("div");
        ctrls.style.position = "absolute";
        ctrls.style.bottom = "12px";
        ctrls.style.left = "50%";
        ctrls.style.transform = "translateX(-50%)";
        ctrls.style.display = "flex";
        ctrls.style.gap = "8px";
        ctrls.style.zIndex = "10";

        const btnPrev = document.createElement("button");
        btnPrev.className = "btn";
        btnPrev.textContent = "‹ Prev";

        const pageInfo = document.createElement("span");
        pageInfo.style.fontSize = "12px";
        pageInfo.style.opacity = "0.8";

        const btnNext = document.createElement("button");
        btnNext.className = "btn";
        btnNext.textContent = "Next ›";

        ctrls.append(btnPrev, pageInfo, btnNext);
        wrap.appendChild(ctrls);

        // tap-soner for klikknavigasjon
        const leftZone = document.createElement("div");
        const rightZone = document.createElement("div");
        [leftZone, rightZone].forEach(z => {
            z.style.position = "absolute";
            z.style.top = "0"; z.style.bottom = "0";
            z.style.width = "30%";
            z.style.cursor = "pointer";
            z.style.zIndex = "5";
        });
        leftZone.style.left = "0";
        rightZone.style.right = "0";
        wrap.append(leftZone, rightZone);

        const pdf = await pdfjsLib.getDocument({ url }).promise;
        let pageNum = 1;

        async function renderPage(n) {
            const page = await pdf.getPage(n);
            // skaler til viewport
            const vw = root.clientWidth || window.innerWidth;
            const vh = root.clientHeight || window.innerHeight;
            const scaleBase = 1.5;
            let viewport = page.getViewport({ scale: scaleBase });
            const scaleW = (vw - 24) / viewport.width;
            const scaleH = (vh - 24) / viewport.height;
            const scale = Math.min(scaleBase * scaleW, scaleBase * scaleH, 3) || scaleBase;
            viewport = page.getViewport({ scale });

            canvas.width = viewport.width | 0;
            canvas.height = viewport.height | 0;
            await page.render({ canvasContext: ctx, viewport }).promise;

            pageInfo.textContent = `${n} / ${pdf.numPages}`;
            btnPrev.disabled = (n <= 1);
            btnNext.disabled = (n >= pdf.numPages);
        }

        const goPrev = () => { if (pageNum > 1) { pageNum--; renderPage(pageNum); } };
        const goNext = () => { if (pageNum < pdf.numPages) { pageNum++; renderPage(pageNum); } };

        btnPrev.addEventListener("click", goPrev);
        btnNext.addEventListener("click", goNext);
        leftZone.addEventListener("click", goPrev);
        rightZone.addEventListener("click", goNext);
        window.addEventListener("keydown", (e) => {
            if (e.key === "ArrowRight") goNext();
            if (e.key === "ArrowLeft") goPrev();
        });

        await renderPage(pageNum);
        window.addEventListener("resize", () => renderPage(pageNum));
    }

    // ---------- boot ----------
    async function boot() {
        const user = await requireUser();
        const uid = user?.uid || null;
        const id = new URLSearchParams(location.search).get("id");
        if (!uid || !id) { warn("Missing uid or book id."); return; }

        const ref = db().collection("users").doc(uid).collection("books").doc(id);
        const snap = await ref.get();
        if (!snap.exists) { $("#viewerRoot").textContent = "Book not found."; return; }
        const doc = snap.data() || {};
        if (doc.title) { const h = $("#bookTitle"); if (h) h.textContent = doc.title; }

        log("Doc fields:", Object.keys(doc));

        const src =
            (await tryFromExplicitFields(doc)) ||
            (await tryFromStorage(doc)) ||
            (await tryFromLocalFilePath(doc)) ||
            (await tryPB_getURL_fromDoc(doc)) ||
            (await tryPB_getUrl_byIds(uid, id, doc));

        if (!src || !src.url) {
            $("#viewerRoot").textContent = "No file found for this book.";
            warn("All resolvers failed for book:", id, "doc:", doc);
            return;
        }

        const t = (src.type || "").toLowerCase();
        if (t === "epub") await renderEPUB(src.url);
        else await renderPDFPaged(src.url); // default/fallback PDF
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
})();
