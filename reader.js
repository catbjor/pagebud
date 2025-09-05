// reader.js — EPUB + paged PDF w/ resume (Firestore + localStorage), arrows, click-zones, progress log
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
    const throttle = (fn, ms) => {
        let t = 0, lastArgs = null, inFlight = false;
        return (...args) => {
            lastArgs = args;
            const now = Date.now();
            if (inFlight || now - t < ms) return;
            inFlight = true;
            t = now;
            Promise.resolve(fn(...lastArgs)).catch(() => { }).finally(() => { inFlight = false; });
        };
    };
    function makeActivityWriter(bookId) {
        return throttle((meta) => {
            try { window.PB?.logActivity?.({ action: "progress_updated", targetId: bookId, meta }); } catch { }
        }, 5000);
    }

    function loadScript(src) {
        return new Promise((res, rej) => {
            const s = document.createElement("script");
            s.src = src;
            s.onload = () => res(true);
            s.onerror = () => rej(new Error("Failed to load " + src));
            document.head.appendChild(s);
        });
    }
    async function ensureEPUB() {
        if (window.ePub) return true;
        try { await loadScript("https://cdn.jsdelivr.net/npm/epubjs@0.3.93/build/epub.min.js"); } catch { }
        if (window.ePub) return true;
        try { await loadScript("https://unpkg.com/epubjs@0.3.93/build/epub.min.js"); } catch { }
        return !!window.ePub;
    }

    // ---------- progress persistence ----------
    function lsKey(uid, bookId) { return `pb:reading:${uid}:${bookId}`; }

    async function loadSaved(uid, bookId) {
        try {
            const ref = db().collection("users").doc(uid).collection("books").doc(bookId);
            const snap = await ref.get();
            const data = snap.exists ? snap.data() : null;
            if (data?.reading && typeof data.reading === "object") return data.reading;
        } catch { }
        try {
            const raw = localStorage.getItem(lsKey(uid, bookId));
            if (raw) return JSON.parse(raw);
        } catch { }
        return null;
    }

    async function saveSaved(uid, bookId, reading) {
        if (!reading || typeof reading !== "object") return;
        try { localStorage.setItem(lsKey(uid, bookId), JSON.stringify(reading)); } catch { }
        try {
            const ref = db().collection("users").doc(uid).collection("books").doc(bookId);
            await ref.set({
                reading: { ...reading, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } catch { }
    }

    function makeProgressWriter(uid, bookId) {
        return throttle((reading) => saveSaved(uid, bookId, reading), 1000);
    }

    // ---------- kilder (resolvers) ----------
    async function tryFromExplicitFields(doc) {
        const url = doc.fileUrl || doc.pdfUrl || doc.epubUrl || "";
        if (!url) return null;
        const type = preferType(doc.fileType, doc.fileExt, extFromUrl(url));
        return { url, type };
    }
    async function tryFromStorage(doc) {
        try {
            if (!doc.storagePath) return null;
            const st = storage(); if (!st?.ref) return null;
            const url = await st.ref(doc.storagePath).getDownloadURL();
            const type = preferType(doc.fileType, doc.fileExt, extFromUrl(url));
            return { url, type };
        } catch { return null; }
    }
    async function tryFromLocalFilePath(doc) {
        try {
            if (!doc.filePath || !window.LocalFiles?.loadByPath) return null;
            const rec = await window.LocalFiles.loadByPath(doc.filePath);
            if (rec?.blob) {
                const url = URL.createObjectURL(rec.blob);
                const type = preferType(doc.fileType, doc.fileExt, rec.ext, extFromUrl(rec.name || ""));
                return { url, type };
            }
        } catch { }
        return null;
    }
    async function tryPB_getURL_fromDoc(doc) {
        try {
            if (!window.PBFileStore?.getURL) return null;
            if (!doc.localId && !doc.fileUrl) return null;
            const url = await PBFileStore.getURL(doc);
            if (url) {
                const type = preferType(doc.fileType, doc.fileExt, extFromUrl(doc.fileName || ""));
                return { url, type };
            }
        } catch { }
        return null;
    }
    async function tryPB_getUrl_byIds(uid, bookId, doc) {
        try {
            if (!window.PBFileStore?.getUrl) return null;
            const url = await PBFileStore.getUrl(uid, bookId);
            if (url) {
                const type = preferType(doc?.fileType, doc?.fileExt, extFromUrl(url));
                return { url, type };
            }
        } catch { }
        return null;
    }

    // --- Buddy Read Chapter Check-in ---
    let currentBuddyReadId = null;
    let currentChapter = null;
    let lastCheckInChapter = null;

    function showChapterCheckInModal(chapter, uid) {
        if (!chapter || !currentBuddyReadId || chapter.id === lastCheckInChapter) return;

        const modal = $("#checkInModal");
        $("#checkInTitle").textContent = `Finished: ${chapter.label.trim() || 'Chapter'}`;
        $("#checkInThoughts").value = "";
        modal.style.display = 'flex';

        let selectedMood = '';

        const moodSpans = modal.querySelectorAll("#checkInMoods span");
        moodSpans.forEach(span => {
            span.onclick = () => {
                selectedMood = span.textContent;
                moodSpans.forEach(s => s.style.border = 'none');
                span.style.borderBottom = '3px solid var(--primary)';
            };
        });

        $("#skipCheckInBtn").onclick = () => {
            modal.style.display = 'none';
            lastCheckInChapter = chapter.id;
        };

        $("#saveCheckInBtn").onclick = async () => {
            const thoughts = $("#checkInThoughts").value.trim();
            const groupRef = db().collection("buddy_reads").doc(currentBuddyReadId);
            const fieldPath = `chapterCheckIns.${chapter.id}.${uid}`;
            await groupRef.update({ [fieldPath]: { mood: selectedMood, thoughts, at: new Date() } });
            modal.style.display = 'none';
            lastCheckInChapter = chapter.id;
        };
    }

    // New function to save a highlight or note to Firestore
    async function saveQuote({ uid, bookId, bookTitle, cfi, text, type = 'highlight', note = '' }) {
        if (!uid || !bookId || !cfi || !text) {
            throw new Error("Missing required data to save quote.");
        }
        const payload = {
            uid,
            bookId,
            bookTitle,
            cfi,
            text: text.trim(),
            type, // 'highlight' or 'note'
            note: note.trim(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await db().collection("users").doc(uid).collection("quotes").add(payload);

        // Log this as an activity
        try {
            window.PBActivity?.note?.({ bookId, title: bookTitle, text: payload.text });
        } catch (e) {
            console.warn("Failed to log note activity", e);
        }
    }

    // New function to load and render existing annotations
    async function loadAndRenderAnnotations(uid, bookId, rendition) {
        const quotesSnap = await db().collection("users").doc(uid).collection("quotes").where("bookId", "==", bookId).get();
        quotesSnap.forEach(doc => {
            const quote = doc.data();
            const style = quote.type === 'note' ? { fill: '#38bdf8', 'fill-opacity': '0.3' } : { fill: 'yellow', 'fill-opacity': '0.3' };
            rendition.annotations.add('highlight', quote.cfi, {}, (e) => { console.log('annotation clicked', e); }, 'hl', style);
        });
    }

    // ---------- EPUB render ----------
    async function renderEPUB(url, uid, bookId, bookTitle, saved) {
        const root = $("#viewerRoot");
        root.innerHTML = "";

        const host = document.createElement("div");
        host.id = "epubViewer";
        host.style.width = "100%";
        host.style.height = "100vh";
        host.style.position = "relative";
        root.appendChild(host);

        // Get references to the new UI elements
        const popup = $("#selectionPopup");
        const highlightBtn = $("#highlightBtn");
        const addNoteBtn = $("#addNoteBtn");
        const noteModal = $("#noteModal");
        const noteQuoteText = $("#noteQuoteText");
        const noteTextarea = $("#noteTextarea");

        const ctrls = document.createElement("div");
        ctrls.style.position = "absolute";
        ctrls.style.bottom = "12px";
        ctrls.style.left = "50%";
        ctrls.style.transform = "translateX(-50%)";
        ctrls.style.display = "flex";
        ctrls.style.gap = "8px";
        ctrls.style.zIndex = "10";
        ctrls.style.alignItems = "center";

        const btnPrev = document.createElement("button");
        btnPrev.className = "btn"; btnPrev.textContent = "‹ Prev";

        const pageInfo = document.createElement("span");
        pageInfo.style.fontSize = "12px"; pageInfo.style.opacity = "0.8";

        const btnNext = document.createElement("button");
        btnNext.className = "btn"; btnNext.textContent = "Next ›";

        const prog = document.createElement("input");
        prog.type = "range"; prog.min = "0"; prog.max = "100"; prog.value = "0";
        prog.style.width = "160px";

        const gotoPct = document.createElement("input");
        gotoPct.type = "number"; gotoPct.min = "0"; gotoPct.max = "100"; gotoPct.value = "0";
        gotoPct.style.width = "64px"; gotoPct.title = "Go to %";

        const idxLabel = document.createElement("span");
        idxLabel.textContent = "Indexing…";
        idxLabel.style.fontSize = "12px";
        idxLabel.style.opacity = "0.7";
        idxLabel.style.display = "none";

        ctrls.append(btnPrev, pageInfo, btnNext, prog, gotoPct, idxLabel);
        host.appendChild(ctrls);

        const leftZone = document.createElement("div");
        const rightZone = document.createElement("div");
        [leftZone, rightZone].forEach(z => {
            z.style.position = "absolute";
            z.style.top = "0"; z.style.bottom = "0";
            z.style.width = "30%"; z.style.cursor = "pointer"; z.style.zIndex = "5";
        });
        leftZone.style.left = "0"; rightZone.style.right = "0";
        host.append(leftZone, rightZone);

        const ok = await ensureEPUB();
        if (!ok) { root.textContent = "EPUB viewer not loaded."; return; }
        const book = ePub(url);
        const rendition = book.renderTo(host, { width: "100%", height: "100%" });

        let currentSelection = null; // To store the active text selection details
        const writeProgress = makeProgressWriter(uid, bookId);
        const writeActivity = makeActivityWriter(bookId);

        let startDisplayed = null;
        if (saved?.kind === "epub") {
            if (saved.cfi) startDisplayed = saved.cfi;
            else if (typeof saved.percent === "number") {
                try {
                    await book.ready;
                    await book.locations.generate(1000);
                    const cfi = book.locations.cfiFromPercentage(Math.max(0, Math.min(1, saved.percent / 100)));
                    if (cfi) startDisplayed = cfi;
                } catch (e) { warn("EPUB resume by percent failed:", e); }
            }
        }

        await rendition.display(startDisplayed || undefined);

        // Load existing highlights and notes for this book
        loadAndRenderAnnotations(uid, bookId, rendition);

        const updateDisplayedInfo = async () => {
            try {
                const loc = rendition.currentLocation();
                if (loc && loc.start && loc.start.displayed) {
                    const { page, total } = loc.start.displayed;
                    pageInfo.textContent = `${page} / ${total}`;
                } else pageInfo.textContent = "";
            } catch { pageInfo.textContent = ""; }
        };
        rendition.on("rendered", updateDisplayedInfo);
        await updateDisplayedInfo();

        let locationsReady = false;
        try {
            idxLabel.style.display = "";
            await book.ready;
            await book.locations.generate(1000);
            locationsReady = true;
            idxLabel.style.display = "none";
        } catch (e) {
            warn("EPUB locations.generate failed:", e);
            idxLabel.textContent = "Index failed";
        }

        const setProgressFromLoc = () => {
            if (!locationsReady) return;
            try {
                const cur = rendition.currentLocation();
                const cfi = cur?.start?.cfi;
                if (!cfi) return;
                const pct = book.locations.percentageFromCfi(cfi);
                const pct100 = Math.round(pct * 100);
                prog.value = String(pct100);
                gotoPct.value = String(pct100);
                writeProgress({ kind: "epub", cfi, percent: pct100 });
                writeActivity({ kind: "epub", percent: pct100 });
            } catch { }
        };
        rendition.on("relocated", () => { updateDisplayedInfo(); setProgressFromLoc(); });
        setProgressFromLoc();

        // --- Buddy Read Chapter Detection ---
        if (currentBuddyReadId) {
            rendition.on("relocated", (location) => {
                const chapterInfo = book.navigation.get(location.start.href);
                if (chapterInfo && chapterInfo.id !== currentChapter) {
                    const previousChapter = book.navigation.get(book.spine.get(location.start.index - 1)?.href);
                    currentChapter = chapterInfo.id;
                    if (previousChapter) {
                        showChapterCheckInModal(previousChapter, uid);
                    }
                }
            });
        }

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

        // --- Highlighting & Notes Logic ---
        rendition.on("selected", (cfiRange, contents) => {
            const range = contents.window.getSelection().getRangeAt(0);
            const rect = range.getBoundingClientRect();
            const text = range.toString();

            if (text.trim().length === 0) return;

            currentSelection = { cfi: cfiRange, text: text };

            popup.style.display = "flex";
            popup.style.left = `${rect.left + rect.width / 2 - popup.offsetWidth / 2}px`;
            popup.style.top = `${rect.top - popup.offsetHeight - 5}px`;

            // Hide popup when clicking away
            const hidePopup = () => {
                popup.style.display = "none";
                document.removeEventListener("click", hidePopup);
            };
            setTimeout(() => document.addEventListener("click", hidePopup), 100);
        });

        highlightBtn.addEventListener("click", async () => {
            if (!currentSelection) return;
            try {
                await saveQuote({ uid, bookId, bookTitle, ...currentSelection });
                rendition.annotations.add('highlight', currentSelection.cfi, {}, null, 'hl', { fill: 'yellow', 'fill-opacity': '0.3' });
                popup.style.display = "none";
            } catch (e) {
                console.error("Failed to save highlight:", e);
                alert("Could not save highlight.");
            }
        });

        addNoteBtn.addEventListener("click", () => {
            if (!currentSelection) return;
            noteQuoteText.textContent = `“${currentSelection.text.trim()}”`;
            noteTextarea.value = "";
            noteModal.classList.add("show");
            popup.style.display = "none";
        });

        noteModal.querySelector("#cancelNoteBtn").addEventListener("click", () => noteModal.classList.remove("show"));
        noteModal.querySelector("#saveNoteBtn").addEventListener("click", async () => {
            if (!currentSelection) return;
            const noteText = noteTextarea.value;
            try {
                await saveQuote({ uid, bookId, bookTitle, ...currentSelection, type: 'note', note: noteText });
                // Use a different color for notes
                rendition.annotations.add('highlight', currentSelection.cfi, {}, null, 'hl', { fill: '#38bdf8', 'fill-opacity': '0.3' });
                noteModal.classList.remove("show");
            } catch (e) {
                console.error("Failed to save note:", e);
                alert("Could not save note.");
            }
        });

        const gotoPercent = (pct) => {
            if (!locationsReady) return;
            pct = Math.max(0, Math.min(100, Number(pct) || 0));
            try {
                const cfi = book.locations.cfiFromPercentage(pct / 100);
                if (cfi) rendition.display(cfi);
            } catch (e) { warn("gotoPercent failed:", e); }
        };
        prog.addEventListener("input", () => gotoPercent(prog.value));
        gotoPct.addEventListener("change", () => gotoPercent(gotoPct.value));

        window.addEventListener("beforeunload", () => {
            try {
                const cur = rendition.currentLocation();
                const cfi = cur?.start?.cfi || null;
                if (cfi) {
                    const pct = locationsReady ? Math.round((book.locations.percentageFromCfi(cfi) || 0) * 100) : null;
                    saveSaved(uid, bookId, { kind: "epub", cfi, percent: pct ?? undefined });
                }
            } catch { }
        });
    }

    // ---------- PDF render (paged) ----------
    async function renderPDFPaged(url, uid, bookId, saved) {
        if (!window.pdfjsLib) {
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

        const wrap = document.createElement("div");
        wrap.style.position = "relative"; wrap.style.width = "100%"; wrap.style.height = "100vh";
        wrap.style.display = "grid"; wrap.style.placeItems = "center";
        root.appendChild(wrap);

        const canvas = document.createElement("canvas");
        canvas.style.maxWidth = "100%"; canvas.style.maxHeight = "100vh";
        wrap.appendChild(canvas);
        const ctx = canvas.getContext("2d");

        const ctrls = document.createElement("div");
        ctrls.style.position = "absolute";
        ctrls.style.bottom = "12px";
        ctrls.style.left = "50%";
        ctrls.style.transform = "translateX(-50%)";
        ctrls.style.display = "flex";
        ctrls.style.gap = "8px";
        ctrls.style.zIndex = "10";
        ctrls.style.alignItems = "center";

        const btnPrev = document.createElement("button");
        btnPrev.className = "btn"; btnPrev.textContent = "‹ Prev";

        const pageInfo = document.createElement("span");
        pageInfo.style.fontSize = "12px"; pageInfo.style.opacity = "0.8";

        const btnNext = document.createElement("button");
        btnNext.className = "btn"; btnNext.textContent = "Next ›";

        const prog = document.createElement("input");
        prog.type = "range"; prog.min = "1"; prog.value = "1";
        prog.style.width = "160px";

        const gotoPage = document.createElement("input");
        gotoPage.type = "number"; gotoPage.min = "1"; gotoPage.value = "1";
        gotoPage.style.width = "64px"; gotoPage.title = "Go to page";

        ctrls.append(btnPrev, pageInfo, btnNext, prog, gotoPage);
        wrap.appendChild(ctrls);

        const leftZone = document.createElement("div");
        const rightZone = document.createElement("div");
        [leftZone, rightZone].forEach(z => {
            z.style.position = "absolute"; z.style.top = "0"; z.style.bottom = "0";
            z.style.width = "30%"; z.style.cursor = "pointer"; z.style.zIndex = "5";
        });
        leftZone.style.left = "0"; rightZone.style.right = "0";
        wrap.append(leftZone, rightZone);

        const pdf = await pdfjsLib.getDocument({ url }).promise;
        const writeProgress = makeProgressWriter(uid, bookId);
        const writeActivity = makeActivityWriter(bookId);

        let pageNum = 1;
        if (saved?.kind === "pdf" && typeof saved.page === "number" && saved.page >= 1 && saved.page <= pdf.numPages) {
            pageNum = saved.page;
        }

        async function renderPage(n) {
            const page = await pdf.getPage(n);
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
            prog.max = String(pdf.numPages);
            prog.value = String(n);
            gotoPage.max = String(pdf.numPages);
            gotoPage.value = String(n);

            writeProgress({ kind: "pdf", page: n });
            writeActivity({ kind: "pdf", page: n });
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

        prog.addEventListener("input", () => {
            const n = Math.max(1, Math.min(pdf.numPages, Number(prog.value) || 1));
            if (n !== pageNum) { pageNum = n; renderPage(pageNum); }
        });
        gotoPage.addEventListener("change", () => {
            const n = Math.max(1, Math.min(pdf.numPages, Number(gotoPage.value) || 1));
            if (n !== pageNum) { pageNum = n; renderPage(pageNum); }
        });

        await renderPage(pageNum);

        window.addEventListener("beforeunload", () => {
            try { saveSaved(uid, bookId, { kind: "pdf", page: pageNum }); } catch { }
        });
        window.addEventListener("resize", () => renderPage(pageNum));
    }

    // ---------- boot ----------
    async function boot() {
        const user = await requireUser();
        const uid = user?.uid || null;
        const params = new URLSearchParams(location.search);
        const id = params.get("id");
        currentBuddyReadId = params.get("buddyRead"); // Get the buddy read ID from URL
        if (!uid || !id) { warn("Missing uid or book id."); return; }

        const ref = db().collection("users").doc(uid).collection("books").doc(id);
        const snap = await ref.get();
        if (!snap.exists) { $("#viewerRoot").textContent = "Book not found."; return; }
        const doc = snap.data() || {};
        if (doc.title) { const h = $("#bookTitle"); if (h) h.textContent = doc.title; }

        const saved = await loadSaved(uid, id);

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
        if (t === "epub") await renderEPUB(src.url, uid, id, doc.title, saved);
        else await renderPDFPaged(src.url, uid, id, doc.title, saved);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
})();
