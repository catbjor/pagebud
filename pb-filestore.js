// pb-filestore.js — Lokal filstore m/ stabil nøkkel `${uid}:${bookId}`
// API: PBFileStore.save({file, uid, bookId, coverBlob?})
//      PBFileStore.getURL(meta)            // fra doc: {fileUrl|localId|filePath...} -> blob:URL
//      PBFileStore.getUrl(uid, bookId)     // direkte via uid+bookId
//      PBFileStore.get(uid, bookId)        // rå record (fallback-implementasjon)
//      PBFileStore.remove(meta)            // no-op lokalt (trygt å kalle)
(function () {
    "use strict";

    // ---------- 1) Bruk eksisterende LocalFiles hvis den finnes ----------
    // Din local-file-store.js eksponerer typisk:
    //   LocalFiles.save(uid, bookId, file, coverBlob?) -> { hasFile, fileName, fileType, fileSize, filePath, coverDataUrl }
    //   LocalFiles.loadByPath(path) -> { name, ext, type, size, blob }
    if (window.LocalFiles &&
        typeof window.LocalFiles.save === "function" &&
        typeof window.LocalFiles.loadByPath === "function") {

        async function save({ file, uid, bookId, coverBlob }) {
            if (!file) throw new Error("No file");
            const meta = await window.LocalFiles.save(uid, bookId, file, coverBlob);
            // Normaliser feltnavn for resten av appen
            return {
                hasFile: !!meta?.hasFile,
                fileName: meta?.fileName || file.name || "",
                fileType: meta?.fileType || guessType(file.name, file.type),
                fileSize: meta?.fileSize || file.size || 0,
                localId: `${uid}:${bookId}`,          // stabil nøkkel
                filePath: meta?.filePath || `idb://pb:file:${uid}:${bookId}`,
                coverDataUrl: meta?.coverDataUrl || null
            };
        }

        async function getURL(meta) {
            if (!meta) return null;
            if (meta.fileUrl) return meta.fileUrl;               // evt. cloud-url (ikke brukt hos deg nå)
            // Foretrekk eksplisitt filePath hvis finnes
            if (meta.filePath) {
                const rec = await window.LocalFiles.loadByPath(meta.filePath);
                return rec?.blob ? URL.createObjectURL(rec.blob) : null;
            }
            // Siste sjanse: prøv stabil nøkkel
            if (meta.localId) {
                const rec = await window.LocalFiles.loadByPath(`idb://pb:file:${meta.localId}`);
                return rec?.blob ? URL.createObjectURL(rec.blob) : null;
            }
            return null;
        }

        async function getUrl(uid, bookId) {
            const rec = await window.LocalFiles.loadByPath(`idb://pb:file:${uid}:${bookId}`);
            return rec?.blob ? URL.createObjectURL(rec.blob) : null;
        }

        async function get(uid, bookId) {
            return window.LocalFiles.loadByPath(`idb://pb:file:${uid}:${bookId}`);
        }

        async function remove(/*meta*/) {
            // Lokal sletting ikke nødvendig i din app; behold no-op for trygghet.
            return;
        }

        window.PBFileStore = { save, getURL, getUrl, get, remove };
        return; // <- FERDIG når LocalFiles finnes
    }

    // ---------- 2) Fallback: minimal egen IndexedDB-implementasjon ----------
    const DB_NAME = "pbLocalFiles";
    const STORE = "files";
    let dbp = null;

    function guessType(name = "", fallback = "") {
        const n = (name || "").toLowerCase();
        if (n.endsWith(".pdf")) return "pdf";
        if (n.endsWith(".epub")) return "epub";
        return (fallback || "");
    }

    function openDB() {
        if (dbp) return dbp;
        dbp = new Promise((res, rej) => {
            const rq = indexedDB.open(DB_NAME, 1);
            rq.onupgradeneeded = () => {
                const db = rq.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    db.createObjectStore(STORE, { keyPath: "id" }); // id = `${uid}:${bookId}`
                }
            };
            rq.onsuccess = () => res(rq.result);
            rq.onerror = () => rej(rq.error);
        });
        return dbp;
    }

    function idbPut(obj) {
        return openDB().then(db => new Promise((res, rej) => {
            const tx = db.transaction(STORE, "readwrite");
            tx.objectStore(STORE).put(obj);
            tx.oncomplete = () => res();
            tx.onerror = () => rej(tx.error);
        }));
    }

    function idbGet(id) {
        return openDB().then(db => new Promise((res, rej) => {
            const tx = db.transaction(STORE, "readonly");
            const rq = tx.objectStore(STORE).get(id);
            rq.onsuccess = () => res(rq.result || null);
            rq.onerror = () => rej(rq.error);
        }));
    }

    async function save({ file, uid, bookId, coverBlob }) {
        if (!file) throw new Error("No file");
        const id = `${uid}:${bookId}`;
        await idbPut({
            id,
            name: file.name,
            size: file.size,
            type: file.type || "application/octet-stream",
            ext: (/\.(\w+)$/i.exec(file.name)?.[1] || "").toLowerCase(),
            blob: file,
            cover: coverBlob || null,
            savedAt: Date.now()
        });

        let coverDataUrl = null;
        if (coverBlob) {
            coverDataUrl = await new Promise((res, rej) => {
                const fr = new FileReader();
                fr.onload = () => res(String(fr.result));
                fr.onerror = () => rej(fr.error);
                fr.readAsDataURL(coverBlob);
            });
        }

        return {
            hasFile: true,
            fileName: file.name,
            fileType: guessType(file.name, file.type),
            fileSize: file.size,
            localId: id,
            filePath: `idb://pb:file:${id}`,
            coverDataUrl
        };
    }

    async function getURL(meta) {
        if (!meta) return null;
        if (meta.fileUrl) return meta.fileUrl; // teoretisk hvis du senere aktiverer Storage
        const id = meta.localId || null;
        if (!id) return null;
        const rec = await idbGet(id);
        return rec?.blob ? URL.createObjectURL(rec.blob) : null;
    }

    async function getUrl(uid, bookId) {
        const rec = await idbGet(`${uid}:${bookId}`);
        return rec?.blob ? URL.createObjectURL(rec.blob) : null;
    }

    async function get(uid, bookId) {
        return idbGet(`${uid}:${bookId}`);
    }

    async function remove(/*meta*/) { /* no-op lokalt */ }

    window.PBFileStore = { save, getURL, getUrl, get, remove };
})();
