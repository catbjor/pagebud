/* sync.js
   PageBud – Firestore <-> LocalStorage sync for books
   Exposes: window.PBSync with subscribe(), pushAll(), saveBook(), deleteBook()
   Requires: firebase-init.js (window.fb with fb.auth, fb.db)
*/
(function () {
    "use strict";

    // ------------- Utilities -------------
    const LS_KEY = "pb:books";
    const $on = (em, ev, fn) => em && em.addEventListener(ev, fn);

    function getLocalBooks() {
        try {
            return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
        } catch {
            return [];
        }
    }
    function setLocalBooks(arr) {
        localStorage.setItem(LS_KEY, JSON.stringify(arr || []));
        // Notify UI (index.html, edit/add pages) to re-render
        document.dispatchEvent(new CustomEvent("pb:booksChanged", { detail: { count: (arr || []).length } }));
        // If you have a global renderer, call it
        if (window.PB && typeof PB.renderLibrary === "function") {
            try { PB.renderLibrary(localStorage.getItem("pb:libFilter") || "all"); } catch { }
        }
    }

    function nowISO() {
        try { return new Date().toISOString(); } catch { return "" }
    }

    function getUser() {
        return window.fb?.auth?.currentUser || null;
    }

    function userBooksCol() {
        const u = getUser();
        if (!u) throw new Error("Not signed in.");
        return fb.db.collection("users").doc(u.uid).collection("books");
    }

    // Debounce helper (for bursty updates)
    function debounce(fn, ms = 300) {
        let t;
        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...args), ms);
        };
    }

    // Merge rule: remote is truth if updated later, otherwise keep local
    // **Correction**: The remote list is the source of truth for *existence*.
    // A book present locally but not remotely has been deleted and should be removed.
    function mergeBooks(local, remote) {
        const remoteMap = new Map(remote.map(b => [b.id, b]));
        const mergedMap = new Map(remoteMap); // Start with all remote books as the source of truth.
        const now = Date.now();

        local.forEach(lb => {
            const rb = remoteMap.get(lb.id);
            if (!rb) {
                // This book is local-only. It might be a new book that hasn't
                // appeared in the remote snapshot yet. We'll keep it for a short
                // time to handle this race condition.
                const lTime = Date.parse(lb.updatedAt || 0) || 0;
                if (now - lTime < 10000) { // 10-second grace period
                    mergedMap.set(lb.id, lb);
                }
            } else {
                // The book exists in both. Keep the one with the later timestamp.
                const lTime = Date.parse(lb.updatedAt || 0) || 0;
                const rTime = Date.parse(rb.updatedAt?.toDate?.() || rb.updatedAt || 0) || 0;
                if (lTime > rTime) {
                    mergedMap.set(lb.id, lb);
                }
            }
        });
        return Array.from(mergedMap.values());
    }

    // ------------- Core API -------------
    const PBSync = {
        _unsubBooks: null,
        _pendingDeletes: new Set(),
        _bootstrapped: false,
        getLocalBooks,
        setLocalBooks,

        /**
         * Start listening to remote changes and keep LocalStorage in sync.
         * Safe to call multiple times; it will re-bind if user changes.
         */
        subscribe() {
            try {
                // Tear down previous listener
                if (this._unsubBooks) { this._unsubBooks(); this._unsubBooks = null; }

                const u = getUser();
                if (!u) return; // requireAuth() should call us after login

                // Initial remote pull + ongoing updates
                const col = userBooksCol().orderBy("updatedAt", "desc");
                this._unsubBooks = col.onSnapshot((snap) => {
                    // If the snapshot has pending writes, it's likely because we just
                    // performed a local action (like a delete). The snapshot might
                    // contain stale data from the cache. By ignoring this snapshot,
                    // we prevent a race condition where a deleted book is re-added.
                    // A second guard checks against a set of recently deleted IDs.
                    if (snap.metadata.hasPendingWrites) {
                        return;
                    }

                    const remoteBooks = [];
                    snap.forEach(doc => {
                        const data = doc.data();
                        // Normalize Firestore timestamp to ISO string for consistency
                        if (data.updatedAt?.toDate) {
                            data.updatedAt = data.updatedAt.toDate().toISOString();
                        }
                        remoteBooks.push({ id: doc.id, ...data });
                    });
                    const merged = mergeBooks(getLocalBooks(), remoteBooks);
                    // Final guard: filter out any books that are pending deletion.
                    const finalBooks = merged.filter(b => !this._pendingDeletes.has(b.id));
                    setLocalBooks(finalBooks);
                }, (err) => {
                    console.warn("[PBSync] onSnapshot error:", err);
                });

                this._bootstrapped = true;
            } catch (e) {
                console.error("[PBSync] subscribe failed:", e);
            }
        },

        /**
         * Push all local books up to Firestore (merge).
         * Useful after login or after local-only batch changes.
         */
        async pushAll() {
            const u = getUser();
            if (!u) return;
            const books = getLocalBooks();

            if (!books.length) return;

            const batch = fb.db.batch();
            const col = userBooksCol();

            books.forEach(b => {
                const id = b.id || fb.db.collection("_").doc().id;
                const docRef = col.doc(id);
                const payload = {
                    ...b,
                    id,
                    updatedAt: b.updatedAt || b.lastUpdated || nowISO()
                };
                batch.set(docRef, payload, { merge: true });
            });

            try {
                await batch.commit();
            } catch (e) {
                console.error("[PBSync] pushAll failed:", e);
            }
        },

        /**
         * Save (upsert) a single book both locally and in Firestore.
         * Returns the saved book object (with id).
         */
        async saveBook(book) {
            const u = getUser();
            if (!book) return null;

            // Ensure id
            const id = book.id || fb.db.collection("_").doc().id;
            // For optimistic update, use a client-side timestamp.
            const optimisticBook = { ...book, id, updatedAt: nowISO() };

            // Update local first (optimistic)
            const all = getLocalBooks();
            const idx = all.findIndex(b => b.id === id);
            if (idx >= 0) all[idx] = optimisticBook; else all.push(optimisticBook);
            setLocalBooks(all);

            // For remote, use the server timestamp for consistency.
            if (u) {
                try {
                    const remotePayload = { ...book, id, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
                    await userBooksCol().doc(id).set(remotePayload, { merge: true });
                } catch (e) {
                    console.error("[PBSync] saveBook remote failed, keeping local:", e);
                }
            }
            return optimisticBook;
        },

        /**
         * Delete a book locally and from Firestore.
         */
        async deleteBook(bookId) {
            if (!bookId) return;
            this._pendingDeletes.add(bookId);

            // Remove from local (optimistic)
            const all = getLocalBooks();
            const filtered = all.filter(b => b.id !== bookId);
            setLocalBooks(filtered);

            // Remove from remote if signed in
            const u = getUser();
            if (u) {
                try {
                    await userBooksCol().doc(bookId).delete();
                } catch (e) {
                    console.error("[PBSync] deleteBook remote failed:", e);
                    // Note: local is already deleted. We could try to re-add it,
                    // but for now we'll accept the inconsistency and let the next
                    // sync potentially fix it.
                } finally {
                    // Clean up the pending set after a delay to allow snapshots to settle.
                    setTimeout(() => this._pendingDeletes.delete(bookId), 7000);
                }
            }
        },

        /**
         * Wipes all local book data.
         * Typically used on sign-out.
         */
        clearLocal() {
            setLocalBooks([]);
        },

        /**
         * Get current user's book collection reference.
         * Throws if not signed in.
         */
        getUserBooksCol() {
            return userBooksCol();
        }
    };

    // ------------- Glue: react to login changes -------------
    // If firebase-init.js exposes fb.auth.onAuthStateChanged already,
    // it likely redirects on logout. We just (re)subscribe on login.
    if (window.fb?.auth) {
        fb.auth.onAuthStateChanged((u) => {
            if (u) {
                // User is signed in.
                // The most reliable way to sync is to pull the server's state,
                // which is the single source of truth. `subscribe` does this.
                // We will NOT push local changes on login, as the local cache
                // could be stale and cause "undeletion" of books.
                PBSync.subscribe();
            } else {
                // User out: keep local data; no remote listener
                if (PBSync._unsubBooks) { PBSync._unsubBooks(); PBSync._unsubBooks = null; }
                PBSync.clearLocal();
            }
        });
    }

    // ------------- Expose -------------
    window.PBSync = PBSync;

    // ------------- Optional: wire UI events -------------
    // If your add/edit pages dispatch these events, we hook them:
    // document.dispatchEvent(new CustomEvent('pb:bookSaved', { detail: { book }}))
    // document.dispatchEvent(new CustomEvent('pb:bookDeleted', { detail: { id }}))
    $on(document, "pb:bookSaved", (e) => {
        if (e?.detail?.book) PBSync.saveBook(e.detail.book);
    });
    $on(document, "pb:bookDeleted", (e) => {
        if (e?.detail?.id) PBSync.deleteBook(e.detail.id);
    });

    // Debounced mass-push when many local edits happen quickly
    const debouncedPush = debounce(() => PBSync.pushAll(), 1000);
    $on(document, "pb:booksChanged", debouncedPush);

})();
