// sync.js
const LS_BOOKS_KEY = "pb:books";
const nowIso = () => new Date().toISOString();
const safeLoad = () => { try { return JSON.parse(localStorage.getItem(LS_BOOKS_KEY) || "[]"); } catch { return []; } };
const saveLocal = (arr) => localStorage.setItem(LS_BOOKS_KEY, JSON.stringify(arr));
const byUserBooks = (uid) => fb.db.collection("users").doc(uid).collection("books");

function mergeByUpdated(localArr, cloudArr) {
    const map = new Map(localArr.map(x => [x.id, x]));
    for (const c of cloudArr) {
        const a = map.get(c.id);
        if (!a) map.set(c.id, c);
        else {
            const la = Date.parse(a.lastUpdated || 0), lb = Date.parse(c.lastUpdated || 0);
            map.set(c.id, la >= lb ? a : c);
        }
    }
    return [...map.values()];
}

window.PBSync = {
    _unsub: null,
    subscribe() {
        const u = fb.auth.currentUser; if (!u) return;
        this._unsub && this._unsub();
        this._unsub = byUserBooks(u.uid).onSnapshot(s => {
            const cloud = []; s.forEach(d => cloud.push({ id: d.id, ...d.data() }));
            const merged = mergeByUpdated(safeLoad(), cloud);
            saveLocal(merged);
            document.dispatchEvent(new CustomEvent("pb:booksSynced"));
            console.log("[sync] pulled", cloud.length);
        }, err => console.error("[sync] sub error", err));
    },
    async pushAll() {
        const u = fb.auth.currentUser; if (!u) return;
        const batch = fb.db.batch();
        const col = byUserBooks(u.uid);
        for (const b of safeLoad()) {
            const id = b.id || Math.random().toString(36).slice(2);
            batch.set(col.doc(id), { ...b, id, lastUpdated: b.lastUpdated || nowIso() }, { merge: true });
        }
        await batch.commit();
        console.log("[sync] pushed all");
    },
    async pushOne(book) {
        const u = fb.auth.currentUser; if (!u || !book) return;
        const id = book.id || Math.random().toString(36).slice(2);
        await byUserBooks(u.uid).doc(id).set({ ...book, id, lastUpdated: nowIso() }, { merge: true });
    }
};