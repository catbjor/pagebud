// reader-local-bridge.js — add filePath support without touching reader UI
(function () {
    "use strict";
    // Hook hvis appen din eksponerer en resolve-funksjon:
    // Hvis ikke – injiserer vi en liten hjelper på window.
    async function tryFromLocalFilePath(doc) {
        try {
            if (!doc?.filePath) return null;
            if (window.LocalFiles?.loadByPath) {
                const rec = await window.LocalFiles.loadByPath(doc.filePath);
                if (rec?.blob) {
                    const url = URL.createObjectURL(rec.blob);
                    const type = (doc.fileExt || (rec.name?.toLowerCase().endsWith(".epub") ? "epub" :
                        rec.name?.toLowerCase().endsWith(".pdf") ? "pdf" : "")).toLowerCase();
                    return { url, type };
                }
            }
        } catch { }
        return null;
    }

    // Hvis leseren din har en global resolveSource – wrap den
    const oldResolve = window.PBReader?.resolveSource;
    if (typeof oldResolve === "function") {
        window.PBReader.resolveSource = async function (uid, bookId, doc) {
            // behold original prioritet
            const first = await oldResolve(uid, bookId, doc);
            if (first) return first;
            // ekstra forsøk: filePath
            return await tryFromLocalFilePath(doc);
        };
        return;
    }

    // Hvis ikke – eksponer en helper appen kan kalle
    window.__pbTryLocalFilePath = tryFromLocalFilePath;
})();
