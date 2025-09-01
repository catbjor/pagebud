/* sessions-writer.js
   Enkle "status-markører" inn i én konsolidert path:
   users/{uid}/sessions/{day}_{bookId}_{type}
   type: "start" | "finish"
*/
(function () {
    "use strict";
    const ok = () => !!((window.fb && fb.db) || (window.firebase && firebase.firestore));
    const db = () => (window.fb?.db) || firebase.firestore();

    function toDayStr(anyDate) {
        // anyDate: "YYYY-MM-DD" eller datostreng → normaliser til YYYY-MM-DD (lokal)
        try {
            if (!anyDate) return null;
            if (/^\d{4}-\d{2}-\d{2}$/.test(anyDate)) return anyDate;
            const d = new Date(anyDate);
            if (Number.isNaN(d.getTime())) return null;
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const da = String(d.getDate()).padStart(2, "0");
            return `${y}-${m}-${da}`;
        } catch { return null; }
    }

    async function writeMarker({ uid, bookId, title, coverUrl, day, type }) {
        if (!ok()) return;
        if (!uid || !bookId || !day || !type) return;
        const id = `${day}_${bookId}_${type}`;
        const ref = db().collection("users").doc(uid).collection("sessions").doc(id);
        const doc = {
            bookId, title: title || "", coverUrl: coverUrl || null,
            type,              // "start" | "finish"
            day,               // "YYYY-MM-DD"
            createdAt: (window.firebase?.firestore?.FieldValue?.serverTimestamp?.()) || new Date()
        };
        await ref.set(doc, { merge: true });
    }

    // High-level: logg basert på felt
    async function logMarkers({ uid, bookId, title, coverUrl, started, finished, status }) {
        const dStart = toDayStr(started);
        const dFinish = toDayStr(finished);

        if (dStart) await writeMarker({ uid, bookId, title, coverUrl, day: dStart, type: "start" });
        // Logg finish hvis eksplisitt eller hvis status === finished og started finnes
        if (dFinish || status === "finished") {
            const day = dFinish || toDayStr(new Date());
            await writeMarker({ uid, bookId, title, coverUrl, day, type: "finish" });
        }
    }

    window.PB_Sessions = { logMarkers };
})();
