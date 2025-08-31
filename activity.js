// activity.js — write activity events into each user's own activity feed
// Read by social-feed.js across friends (no schema change to design)
(function () {
    "use strict";
    const ok = () => !!(window.fb && fb.db && fb.auth);

    function baseDoc(extra) {
        return {
            ...extra,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    async function write(type, payload) {
        if (!ok()) return;
        const u = fb.auth.currentUser; if (!u) return;
        const col = fb.db.collection("users").doc(u.uid).collection("activity");
        await col.add(baseDoc({ type, uid: u.uid, ...payload, likeCount: 0, commentCount: 0 }));
    }

    window.PBActivity = {
        started: (p) => write("started", p),
        finished: (p) => write("finished", p),
        rated: (p) => write("rated", p),
        note: (p) => write("note", p),
        // likes
        async like(itemOwnerUid, itemId) {
            const me = fb.auth.currentUser; if (!me) return;
            const itemRef = fb.db.collection("users").doc(itemOwnerUid).collection("activity").doc(itemId);
            const likeRef = itemRef.collection("likes").doc(me.uid);
            const snap = await likeRef.get();
            if (snap.exists) {
                await likeRef.delete();
                await itemRef.update({ likeCount: firebase.firestore.FieldValue.increment(-1) });
                return false;
            } else {
                await likeRef.set({ uid: me.uid, at: new Date() });
                await itemRef.update({ likeCount: firebase.firestore.FieldValue.increment(1) });
                return true;
            }
        },
        async comment(itemOwnerUid, itemId, text) {
            const me = fb.auth.currentUser; if (!me || !text) return;
            const itemRef = fb.db.collection("users").doc(itemOwnerUid).collection("activity").doc(itemId);
            await itemRef.collection("comments").add({ uid: me.uid, text, at: new Date() });
            await itemRef.update({ commentCount: firebase.firestore.FieldValue.increment(1) });
        }
    };
})();
