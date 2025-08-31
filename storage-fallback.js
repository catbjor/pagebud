// storage-fallback.js
// Prøv Firebase Storage; hvis ikke tilgjengelig/ikke lov → lagre lokalt i IndexedDB.
// API:
//   const res = await PBFileStore.save({ file, uid, bookId });
//   -> res = { mode:"cloud", type, path, url }  ELLER { mode:"local", type, localId }
//   const url = await PBFileStore.getURL(meta); // funker for både cloud og local
//   await PBFileStore.remove(meta); // rydd opp ved delete

(function () {
    "use strict";

    const DB_NAME = "pbLocalFiles";
    const DB_STORE = "files";
    let dbPromise = null;

    function openDB() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const rq = indexedDB.open(DB_NAME, 1);
            rq.onupgradeneeded = (e) => {
                const db = rq.result;
                if (!db.objectStoreNames.contains(DB_STORE)) {
                    db.createObjectStore(DB_STORE, { keyPath: "id" });
                }
            };
            rq.onsuccess = () => resolve(rq.result);
            rq.onerror = () => reject(rq.error || new Error("IndexedDB failed"));
        });
        return dbPromise;
    }

    async function idbPut(obj) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DB_STORE, "readwrite");
            tx.objectStore(DB_STORE).put(obj);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }
    async function idbGet(id) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DB_STORE, "readonly");
            const rq = tx.objectStore(DB_STORE).get(id);
            rq.onsuccess = () => resolve(rq.result || null);
            rq.onerror = () => reject(rq.error);
        });
    }
    async function idbDel(id) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DB_STORE, "readwrite");
            tx.objectStore(DB_STORE).delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    function extToType(file) {
        const n = (file?.name || "").toLowerCase();
        if (n.endsWith(".pdf")) return "pdf";
        if (n.endsWith(".epub")) return "epub";
        return "";
    }

    async function uploadCloud({ file, uid, bookId }) {
        if (!window.firebase?.storage) throw new Error("no-storage-sdk");
        const bucket = firebase.app().options.storageBucket;
        if (!bucket) throw new Error("no-bucket");
        const path = `uploads/${uid}/${bookId}/${Date.now()}_${file.name}`;
        const ref = firebase.storage().ref(path); // compat
        const snap = await ref.put(file);
        const url = await snap.ref.getDownloadURL();
        return { mode: "cloud", type: extToType(file), path, url };
    }

    async function saveLocal({ file, uid, bookId }) {
        const id = `${uid}_${bookId}_${Date.now()}`;
        const rec = { id, name: file.name, type: file.type, size: file.size, blob: file, savedAt: Date.now() };
        await idbPut(rec);
        return { mode: "local", type: extToType(file), localId: id };
    }

    async function save(opts) {
        try {
            return await uploadCloud(opts);
        } catch (e) {
            // enhver feil → fallback lokalt
            console.warn("[PBFileStore] Cloud upload failed, using local:", e?.message || e);
            return saveLocal(opts);
        }
    }

    async function getURL(meta) {
        if (!meta) return null;
        if (meta.mode === "cloud" && meta.url) return meta.url;
        if (meta.mode === "local" && meta.localId) {
            const rec = await idbGet(meta.localId);
            if (!rec?.blob) return null;
            return URL.createObjectURL(rec.blob);
        }
        return null;
    }

    async function remove(meta) {
        if (!meta) return;
        try {
            if (meta.mode === "cloud" && meta.path && window.firebase?.storage) {
                await firebase.storage().ref(meta.path).delete();
            }
        } catch { /* ignore */ }
        if (meta.mode === "local" && meta.localId) {
            try { await idbDel(meta.localId); } catch { }
        }
    }

    window.PBFileStore = { save, getURL, remove };
})();
