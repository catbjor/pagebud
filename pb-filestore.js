/* pb-filestore.js
   Local-only file storage (covers + book files) using IndexedDB.
   Returns lightweight metadata; blobs are retrieved when needed.
*/
(function () {
    "use strict";

    const DB_NAME = "pb-files.v1";
    const STORE = "files";

    function withDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    const os = db.createObjectStore(STORE, { keyPath: "id" });
                    os.createIndex("byBook", ["uid", "bookId"], { unique: false });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function put(rec) {
        const db = await withDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, "readwrite");
            tx.objectStore(STORE).put(rec);
            tx.oncomplete = () => resolve(rec.id);
            tx.onerror = () => reject(tx.error);
        });
    }

    async function get(id) {
        const db = await withDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, "readonly");
            const req = tx.objectStore(STORE).get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    async function del(id) {
        const db = await withDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, "readwrite");
            tx.objectStore(STORE).delete(id);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    }

    function toMeta(id, file) {
        return {
            id,
            name: file.name,
            size: file.size,
            type: file.type,
            ext: (file.name.match(/\.[^.]+$/) || [""])[0].slice(1).toLowerCase(),
            updatedAt: Date.now()
        };
    }

    async function save({ file, uid = "anon", bookId = "temp", kind = "book" }) {
        if (!file) throw new Error("No file");
        const id = `${uid}_${bookId}_${kind}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const rec = {
            id,
            uid,
            bookId,
            kind,                 // "cover" | "book" | other
            name: file.name,
            size: file.size,
            type: file.type,
            ext: (file.name.match(/\.[^.]+$/) || [""])[0].slice(1).toLowerCase(),
            blob: file,
            createdAt: Date.now()
        };
        await put(rec);
        return toMeta(id, file);
    }

    async function getBlobUrl(id) {
        const rec = await get(id);
        if (!rec) return "";
        const url = URL.createObjectURL(rec.blob);
        // Call revokeObjectURL yourself when done showing.
        return url;
    }

    window.PBFileStore = { save, get, getBlobUrl, delete: del };
})();
