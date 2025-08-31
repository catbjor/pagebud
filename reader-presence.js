/* =========================================================================
   reader-presence.js
   Lightweight reading presence:
   - Start presence for a given bookId (auto-detect from ?bookId= if not passed)
   - Heartbeat every 20s (lastActive)
   - Stores currentlyReading: { bookId, title, cover, fileType, page, at }
   - Stop/cleanup on unload or when you call __pbPresenceStop()

   Requirements:
   - window.fb (from firebase-init.js) with auth + firestore
   - Your book docs at users/{uid}/books/{bookId}
   ======================================================================= */

(function () {
    "use strict";

    const HEARTBEAT_MS = 20000; // 20s
    let hbTimer = null;
    let current = {
        uid: null,
        bookId: null,
        page: 1, // you can update this via __pbPresenceUpdatePage(p)
    };

    const $ = (s, r = document) => r.querySelector(s);

    function getParam(name) {
        const u = new URL(location.href);
        return u.searchParams.get(name);
    }

    function presenceDoc(uid) {
        return fb.db.collection("users").doc(uid).collection("presence").doc("state");
    }

    async function getBookMeta(uid, bookId) {
        try {
            const snap = await fb.db.collection("users").doc(uid).collection("books").doc(bookId).get();
            if (!snap.exists) return {};
            const d = snap.data() || {};
            return {
                title: d.title || "",
                cover: d.coverUrl || "",
                fileType: d.fileType || "",
            };
        } catch {
            return {};
        }
    }

    // ---------------- Public: start ----------------
    async function startPresence(explicitBookId) {
        if (!window.fb?.auth || !window.fb?.db) {
            console.warn("[presence] Firebase not ready");
            return;
        }

        // Wait for user
        const user = fb.auth.currentUser || await new Promise((resolve) => {
            const unsub = fb.auth.onAuthStateChanged(u => { unsub(); resolve(u); });
        });
        if (!user) return;

        current.uid = user.uid;
        current.bookId = explicitBookId || getParam("bookId");
        if (!current.bookId) {
            console.warn("[presence] No bookId specified");
            return;
        }

        const meta = await getBookMeta(current.uid, current.bookId);
        const docRef = presenceDoc(current.uid);
        const payload = {
            currentlyReading: {
                bookId: current.bookId,
                title: meta.title || "",
                cover: meta.cover || "",
                fileType: meta.fileType || "",
                page: current.page || 1,
                at: new Date()
            },
            lastActive: new Date()
        };

        // Initial write
        await docRef.set(payload, { merge: true });

        // Heartbeat
        clearInterval(hbTimer);
        hbTimer = setInterval(async () => {
            try {
                await docRef.set({
                    lastActive: new Date(),
                    "currentlyReading.page": current.page || 1
                }, { merge: true });
            } catch (e) {
                console.warn("[presence] heartbeat failed", e);
            }
        }, HEARTBEAT_MS);

        // Clean up on unload
        window.addEventListener("beforeunload", handleUnload, { once: true });
        window.addEventListener("pagehide", handleUnload, { once: true });

        // Announce
        try { document.dispatchEvent(new CustomEvent("pb:presenceStarted", { detail: { bookId: current.bookId } })); } catch { }
    }

    // ---------------- Public: stop ----------------
    async function stopPresence() {
        clearInterval(hbTimer); hbTimer = null;
        if (!current.uid) return;
        try {
            await presenceDoc(current.uid).set({
                currentlyReading: firebase.firestore.FieldValue.delete(),
                lastActive: new Date()
            }, { merge: true });
        } catch (e) {
            console.warn("[presence] stop failed", e);
        } finally {
            try { document.dispatchEvent(new CustomEvent("pb:presenceStopped", { detail: { bookId: current.bookId } })); } catch { }
            current.uid = null;
            current.bookId = null;
            current.page = 1;
        }
    }

    async function handleUnload() {
        // Best-effort sync; no awaits that might block
        clearInterval(hbTimer); hbTimer = null;
        try {
            if (current.uid) {
                await presenceDoc(current.uid).set({
                    currentlyReading: firebase.firestore.FieldValue.delete(),
                    lastActive: new Date()
                }, { merge: true });
            }
        } catch { }
    }

    // ---------------- Public: update page (optional) ----------------
    async function updatePage(pageNum) {
        if (!current.uid || !current.bookId) return;
        current.page = Math.max(1, Number(pageNum || 1));
        try {
            await presenceDoc(current.uid).set({
                "currentlyReading.page": current.page,
                lastActive: new Date()
            }, { merge: true });
        } catch (e) {
            console.warn("[presence] updatePage failed", e);
        }
    }

    // ---------------- Auto-start in reader.html ----------------
    document.addEventListener("DOMContentLoaded", () => {
        // If we’re on reader.html and have ?bookId=, auto-start
        const isReaderPage = !!$("#viewer") || !!$("#pdfCanvas") || location.pathname.endsWith("reader.html");
        const paramId = getParam("bookId");
        if (isReaderPage && paramId) {
            // wait until fb is ready
            const maybeStart = () => {
                if (window.fb?.auth && window.fb?.db) startPresence(paramId);
                else setTimeout(maybeStart, 80);
            };
            maybeStart();
        }
    });

    // ---------------- Export API ----------------
    // Call these from add/edit pages before redirect:
    //   __pbPresenceStart(bookId?)  // optional bookId param
    //   __pbPresenceStop()
    //   __pbPresenceUpdatePage(n)
    window.__pbPresenceStart = startPresence;
    window.__pbPresenceStop = stopPresence;
    window.__pbPresenceUpdatePage = updatePage;

})();
