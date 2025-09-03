// activity.js — private + public activity logging (friends feed safe)
// - Private:  /users/{uid}/activity            (full payload)
// - Public:   /users/{uid}/public_activity     (sanitized, friends can read per rules)
(function () {
    "use strict";

    function auth() {
        return (window.fb?.auth) || (window.firebase?.auth?.()) || firebase.auth();
    }
    function db() {
        return (window.fb?.db) || (window.firebase?.firestore?.()) || firebase.firestore();
    }

    function nowFields(extra = {}) {
        return {
            ...extra,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };
    }

    // --- sanitize meta for public feed (no sensitive data) ---
    function sanitizeMeta(meta = {}) {
        const out = {};
        if (typeof meta.title === "string") out.title = meta.title.slice(0, 140);
        if (typeof meta.page === "number") out.page = meta.page;
        if (typeof meta.percent === "number") out.percent = Math.round(meta.percent);
        if (typeof meta.kind === "string") out.kind = meta.kind;        // "pdf" | "epub"
        if (typeof meta.rating === "number") out.rating = meta.rating;  // short
        // (legg til korte, ufarlige felter ved behov)
        return out;
    }

    async function writePrivate(uid, doc) {
        const ref = db().collection("users").doc(uid).collection("activity").doc();
        await ref.set(nowFields(doc));
        return ref.id;
    }

    async function writePublic(uid, doc) {
        // owner felt brukes for queries (collectionGroup + owner in [...])
        const ref = db().collection("users").doc(uid).collection("public_activity").doc();
        await ref.set(nowFields({ owner: uid, ...doc }));
        return ref.id;
    }

    // ---------- Public API ----------
    // 1) Low-level: PB.logActivity({ uid, action, targetId, meta })
    window.PB = window.PB || {};
    window.PB.logActivity = async function ({ uid, action, targetId = null, meta = {} }) {
        try {
            const me = uid || auth().currentUser?.uid;
            if (!me) return;

            // Private (full meta)
            await writePrivate(me, { action, targetId, meta, likeCount: 0, commentCount: 0 });

            // Public (sanitized)
            const safeMeta = sanitizeMeta(meta);
            await writePublic(me, { action, targetId, meta: safeMeta });
        } catch (e) {
            console.warn("[activity] logActivity failed:", e);
        }
    };

    // 2) Back-compat helper set (samme navn som du hadde)
    window.PBActivity = {
        // started/finished/rated/note skriver både privat og public
        started: async (p = {}) => {
            const u = auth().currentUser; if (!u) return;
            await window.PB.logActivity({
                uid: u.uid,
                action: "book_saved",           // mer meningsfylt i feeden
                targetId: p.bookId || null,
                meta: { title: p.title, kind: p.kind, page: p.page, percent: p.percent }
            });
        },
        finished: async (p = {}) => {
            const u = auth().currentUser; if (!u) return;
            await window.PB.logActivity({
                uid: u.uid,
                action: "book_finished",
                targetId: p.bookId || null,
                meta: { title: p.title }
            });
        },
        rated: async (p = {}) => {
            const u = auth().currentUser; if (!u) return;
            await window.PB.logActivity({
                uid: u.uid,
                action: "book_rated",
                targetId: p.bookId || null,
                meta: { title: p.title, rating: p.rating }
            });
        },
        note: async (p = {}) => {
            const u = auth().currentUser; if (!u) return;
            // Notater er private i fulltekst, public får kun en kort “note added”
            // (ingen tekst leak)
            await writePrivate(u.uid, {
                action: "note_added",
                targetId: p.bookId || null,
                meta: { title: p.title, text: String(p.text || "").slice(0, 2000) },
                likeCount: 0, commentCount: 0
            });
            await writePublic(u.uid, {
                action: "note_added",
                targetId: p.bookId || null,
                meta: sanitizeMeta({ title: p.title })
            });
        },

        // likes/comments er kun på PRIVATE activity-innlegg (ikke i public stream)
        async like(itemOwnerUid, itemId) {
            const me = auth().currentUser; if (!me) return;
            const itemRef = db().collection("users").doc(itemOwnerUid).collection("activity").doc(itemId);
            const likeRef = itemRef.collection("likes").doc(me.uid);
            const snap = await likeRef.get();
            if (snap.exists) {
                await likeRef.delete();
                await itemRef.update({
                    likeCount: firebase.firestore.FieldValue.increment(-1),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                return false;
            } else {
                await likeRef.set({ uid: me.uid, at: firebase.firestore.FieldValue.serverTimestamp() });
                await itemRef.update({
                    likeCount: firebase.firestore.FieldValue.increment(1),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                return true;
            }
        },

        async comment(itemOwnerUid, itemId, text) {
            const me = auth().currentUser; if (!me || !text) return;
            const itemRef = db().collection("users").doc(itemOwnerUid).collection("activity").doc(itemId);
            await itemRef.collection("comments").add({
                uid: me.uid,
                text,
                at: firebase.firestore.FieldValue.serverTimestamp()
            });
            await itemRef.update({
                commentCount: firebase.firestore.FieldValue.increment(1),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    };
})();
