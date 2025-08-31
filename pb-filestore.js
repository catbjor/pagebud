// pb-filestore.js (unified API: save, getURL, remove)
// Saves to IndexedDB; if Firebase Storage is available, uploads too and returns cloud URL.
(function () {
    "use strict";

    const DB_NAME = "pbLocalFiles";
    const STORE = "files";
    let dbp = null;

    function openDB() {
        if (dbp) return dbp;
        dbp = new Promise((res, rej) => {
            const rq = indexedDB.open(DB_NAME, 1);
            rq.onupgradeneeded = () => {
                const db = rq.result;
                if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
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
    function idbDel(id) {
        return openDB().then(db => new Promise((res, rej) => {
            const tx = db.transaction(STORE, "readwrite");
            tx.objectStore(STORE).delete(id);
            tx.oncomplete = () => res();
            tx.onerror = () => rej(tx.error);
        }));
    }

    const fileType = (name = "") => name.toLowerCase().endsWith(".pdf") ? "pdf"
        : name.toLowerCase().endsWith(".epub") ? "epub" : "";

    async function save({ file, uid = "anon", bookId = "temp" }) {
        if (!file) throw new Error("No file");
        // Always save locally (free)
        const localId = `${uid}_${bookId}_${Date.now()}`;
        await idbPut({ id: localId, name: file.name, size: file.size, type: file.type, blob: file, savedAt: Date.now() });

        // Try cloud if storage exists (optional)
        let cloud = null;
        try {
            if (window.fb?.storage) {
                const path = `uploads/${uid}/${bookId}/${Date.now()}_${file.name}`;
                const ref = fb.storage.ref(path);
                const snap = await ref.put(file);
                const url = await snap.ref.getDownloadURL();
                cloud = { path, url };
            }
        } catch { /* ignore; keep local */ }

        return cloud
            ? { mode: "cloud+local", type: fileType(file.name), path: cloud.path, url: cloud.url, localId }
            : { mode: "local", type: fileType(file.name), localId };
    }

    async function getURL(meta) {
        if (!meta) return null;
        if (meta.url) return meta.url;
        if (meta.localId) {
            const rec = await idbGet(meta.localId);
            return rec?.blob ? URL.createObjectURL(rec.blob) : null;
        }
        return null;
    }

    async function remove(meta) {
        if (!meta) return;
        if (meta.path && window.fb?.storage) {
            try { await fb.storage.ref(meta.path).delete(); } catch { }
        }
        if (meta.localId) { try { await idbDel(meta.localId); } catch { } }
    }

    window.PBFileStore = { save, getURL, remove };
})();
