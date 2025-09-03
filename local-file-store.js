// local-file-store.js – minimal IndexedDB store for per-device book files
(function () {
    "use strict";

    const DB_NAME = "pagebud";
    const DB_VER = 1;
    const STORE = "files";

    function openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VER);
            req.onupgradeneeded = (e) => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    const os = db.createObjectStore(STORE, { keyPath: "key" });
                    os.createIndex("byBook", "bookKey", { unique: true });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error("IDB open failed"));
        });
    }

    async function idbPut(record) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, "readwrite");
            tx.objectStore(STORE).put(record);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error("IDB put failed"));
        });
    }

    async function idbGet(key) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, "readonly");
            const req = tx.objectStore(STORE).get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error || new Error("IDB get failed"));
        });
    }

    async function blobToDataURL(blob) {
        if (!blob) return null;
        return new Promise((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => res(String(fr.result));
            fr.onerror = () => rej(fr.error);
            fr.readAsDataURL(blob);
        });
    }

    /**
     * Save a file locally for (uid, bookId). Returns a meta object you can merge into Firestore.
     * { hasFile, fileName, fileType, fileSize, filePath, coverDataUrl }
     */
    async function save(uid, bookId, file, coverBlob) {
        if (!file) return null;

        const key = `pb:file:${uid}:${bookId}`;
        const fileType = /\.pdf$/i.test(file.name) ? "pdf" : /\.epub$/i.test(file.name) ? "epub" : (file.type || "application/octet-stream");
        const fileExt = /\.([a-z0-9]+)$/i.test(file.name) ? RegExp.$1.toLowerCase() : "";

        const record = {
            key,
            bookKey: `${uid}:${bookId}`,
            name: file.name,
            type: fileType,
            size: file.size,
            ext: fileExt,
            blob: file,                // stored as Blob in IndexedDB
            cover: coverBlob || null,  // optional Blob
            updatedAt: Date.now()
        };
        await idbPut(record);

        const coverDataUrl = coverBlob ? await blobToDataURL(coverBlob) : null;

        // This is the “pointer” your reader can use to load from IDB later.
        const filePath = `idb://${key}`;

        return {
            hasFile: true,
            fileName: file.name,
            fileType,
            fileSize: file.size,
            filePath,
            ...(coverDataUrl ? { coverDataUrl } : {})
        };
    }

    // Optional: a tiny loader for your reader page
    async function loadByPath(filePath) {
        if (!filePath || !filePath.startsWith("idb://")) return null;
        const key = filePath.replace("idb://", "");
        const rec = await idbGet(key);
        return rec || null;
    }

    window.LocalFiles = { save, loadByPath };
})();
