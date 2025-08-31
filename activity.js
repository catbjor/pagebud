// activity.js — write activity events into each user's activity feed
// Read by social-feed.js across friends
(function () {
    "use strict";

    const ok = () => !!(window.fb && fb.db && fb.auth);

    function baseDoc(extra) {
        return {
            ...extra,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            likeCount: 0,
            commentCount: 0
        };
    }

    async function write(type, payload) {
        if (!ok()) return;
        const u = fb.auth.currentUser; if (!u) return;
        const col = fb.db.collection("users").doc(u.uid).collection("activity");
        await col.add(baseDoc({ type, uid: u.uid, ...payload }));
    }

    window.PBActivity = {
        started: (p) => write("started", p),   // { title, bookId, cover, ... }
        finished: (p) => write("finished", p),
        rated: (p) => write("rated", p),   // { title, rating, bookId, cover }
        note: (p) => write("note", p),   // { title, text, bookId }
        // likes
        async like(itemOwnerUid, itemId) {
            const me = fb.auth.currentUser; if (!me) return;
            const itemRef = fb.db.collection("users").doc(itemOwnerUid).collection("activity").doc(itemId);
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
            const me = fb.auth.currentUser; if (!me || !text) return;
            const itemRef = fb.db.collection("users").doc(itemOwnerUid).collection("activity").doc(itemId);
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
