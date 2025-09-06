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
        if (typeof meta.author === "string") out.author = meta.author.slice(0, 100);
        if (typeof meta.coverUrl === "string") out.coverUrl = meta.coverUrl;
        // (legg til korte, ufarlige felter ved behov)
        return out;
    }

    async function writePrivate(uid, id, doc) {
        const ref = db().collection("users").doc(uid).collection("activity").doc(id);
        await ref.set(nowFields(doc));
        return id;
    }

    async function writePublic(uid, id, doc) {
        // owner felt brukes for queries (collectionGroup + owner in [...])
        const ref = db().collection("users").doc(uid).collection("public_activity").doc(id);
        await ref.set(nowFields({ owner: uid, ...doc }));
        return id;
    }

    // ---------- Public API ----------
    // 1) Low-level: PB.logActivity({ uid, action, targetId, meta })
    window.PB = window.PB || {};
    window.PB.logActivity = async function ({ uid, action, targetId = null, meta = {} }) {
        try {
            const me = uid || auth().currentUser?.uid;
            if (!me) return;

            // Generate one ID to be used for both private and public documents
            const activityId = db().collection("users").doc(me).collection("activity").doc().id;

            // Private (full meta)
            await writePrivate(me, activityId, { action, targetId, meta, likeCount: 0, commentCount: 0 });

            // Public (sanitized)
            const safeMeta = sanitizeMeta(meta);
            await writePublic(me, activityId, { action, targetId, meta: safeMeta });
        } catch (e) {
            console.warn("[activity] logActivity failed:", e);
        }
    };

    // 2) Back-compat helper set (samme navn som du hadde)
    window.PBActivity = {
        /**
         * A smart handler to log the correct activity when a book is saved.
         * It compares the new data with the old data to see what changed.
         * @param {string} bookId - The ID of the book being saved.
         * @param {object} newData - The complete new data object for the book.
         * @param {object|null} oldData - The book's data before the save. Pass null for new books.
         */
        async handleBookUpdate(bookId, newData, oldData = null) {
            const justProgressUpdated = (
                (newData.reading?.page && newData.reading.page !== oldData?.reading?.page) ||
                (newData.reading?.percent && newData.reading.percent !== oldData?.reading?.percent)
            );

            if (justProgressUpdated) {
                await this.progress_updated({
                    bookId: bookId,
                    title: newData.title,
                    page: newData.reading.page,
                    percent: newData.reading.percent,
                });
            }

            const u = auth().currentUser; if (!u) return;

            const isNewBook = !oldData;
            const justFinished = newData.status === 'finished' && oldData?.status !== 'finished';
            const justRated = newData.rating && newData.rating !== oldData?.rating;

            // Log when a book is first created/saved
            if (isNewBook) {
                await this.started({
                    bookId: bookId,
                    title: newData.title,
                    author: newData.author,
                    coverUrl: newData.coverUrl,
                });
            }

            // Log when a book is marked as finished for the first time
            if (justFinished) {
                await this.finished({
                    bookId: bookId,
                    title: newData.title,
                    author: newData.author,
                    coverUrl: newData.coverUrl
                });
            }

            // Log when a book is rated
            if (justRated) {
                await this.rated({
                    bookId: bookId, title: newData.title, author: newData.author,
                    coverUrl: newData.coverUrl, rating: newData.rating
                });
            }
        },
        progress_updated: async (p = {}) => {
            const u = auth().currentUser; if (!u) return;
            await window.PB.logActivity({
                uid: u.uid,
                action: "progress_updated",
                targetId: p.bookId || null,
                meta: { title: p.title, page: p.page, percent: p.percent }
            });
        },
        // started/finished/rated/note skriver både privat og public
        started: async (p = {}) => {
            const u = auth().currentUser; if (!u) return;
            await window.PB.logActivity({
                uid: u.uid,
                action: "book_saved",           // mer meningsfylt i feeden
                targetId: p.bookId || null,
                meta: { title: p.title, author: p.author, coverUrl: p.coverUrl, kind: p.kind, page: p.page, percent: p.percent }
            });
        },
        finished: async (p = {}) => {
            const u = auth().currentUser; if (!u) return;
            await window.PB.logActivity({
                uid: u.uid,
                action: "book_finished",
                targetId: p.bookId || null,
                meta: { title: p.title, author: p.author, coverUrl: p.coverUrl }
            });
        },
        rated: async (p = {}) => {
            const u = auth().currentUser; if (!u) return;
            await window.PB.logActivity({
                uid: u.uid,
                action: "book_rated",
                targetId: p.bookId || null,
                meta: { title: p.title, author: p.author, coverUrl: p.coverUrl, rating: p.rating }
            });
        },
        note: async (p = {}) => {
            const u = auth().currentUser; if (!u) return;
            // Notater er private i fulltekst, public får kun en kort “note added”
            // (ingen tekst leak)
            const activityId = db().collection("users").doc(u.uid).collection("activity").doc().id;

            await writePrivate(u.uid, activityId, {
                action: "note_added",
                targetId: p.bookId || null,
                meta: { title: p.title, text: String(p.text || "").slice(0, 2000) },
                likeCount: 0, commentCount: 0
            });

            await writePublic(u.uid, activityId, {
                action: "note_added",
                targetId: p.bookId || null,
                meta: sanitizeMeta({ title: p.title, author: p.author, coverUrl: p.coverUrl })
            });
        },

        // likes/comments er kun på PRIVATE activity-innlegg (ikke i public stream)
        async like(itemOwnerUid, itemId) {
            const me = auth().currentUser; if (!me) return;
            const privateRef = db().collection("users").doc(itemOwnerUid).collection("activity").doc(itemId);
            const publicRef = db().collection("users").doc(itemOwnerUid).collection("public_activity").doc(itemId);
            const likeRef = privateRef.collection("likes").doc(me.uid);

            const snap = await likeRef.get();
            const increment = snap.exists ? -1 : 1;

            if (snap.exists) {
                await likeRef.delete();
            } else {
                await likeRef.set({ uid: me.uid, at: firebase.firestore.FieldValue.serverTimestamp() });
            }

            // Update counts on both private and public docs
            const batch = db().batch();
            const updatePayload = {
                likeCount: firebase.firestore.FieldValue.increment(increment),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            batch.update(privateRef, updatePayload);
            batch.update(publicRef, updatePayload);
            await batch.commit();

            return !snap.exists;
        },

        async comment(itemOwnerUid, itemId, text) {
            const me = auth().currentUser; if (!me || !text) return;
            const privateRef = db().collection("users").doc(itemOwnerUid).collection("activity").doc(itemId);
            const publicRef = db().collection("users").doc(itemOwnerUid).collection("public_activity").doc(itemId);

            await privateRef.collection("comments").add({
                uid: me.uid,
                text,
                at: firebase.firestore.FieldValue.serverTimestamp()
            });
            const updatePayload = {
                commentCount: firebase.firestore.FieldValue.increment(1),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            const batch = db().batch();
            batch.update(privateRef, updatePayload);
            batch.update(publicRef, updatePayload);
            await batch.commit();
        }
    };
})();
