/* =========================================================================
   reset-utils.js — Clear caches/PWA/IDB + optional sign-out
   Exposes: window.pbResetCaches({ full: boolean })
   - full:false  → clears caches + SW + stale storage, keeps login + theme
   - full:true   → also signs out + clears firebase IDBs and all LS except theme
   Also dispatches a small toast if available (#pb-toast), and posts a reload
   signal via BroadcastChannel so other tabs refresh.

   Safe to include on any page. Requires firebase-init.js only if full:true.
   ========================================================================= */

(function () {
    "use strict";

    const BC_NAME = "pb-reset";

    function toast(msg) {
        // inne i toast(msg)
        if (window.toast) { try { window.toast(msg); return; } catch { } }

        let n = document.getElementById("pb-toast");
        if (!n) {
            n = document.createElement("div");
            n.id = "pb-toast";
            n.style.cssText = `
        position:fixed;left:50%;bottom:24px;transform:translateX(-50%);
        background:rgba(20,20,20,.92);color:#fff;padding:10px 14px;border-radius:10px;
        font-size:.95rem;z-index:99999;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;
      `;
            document.body.appendChild(n);
        }
        n.textContent = msg;
        n.classList.add("show");
        n.style.opacity = "1";
        n.style.transform = "translateX(-50%) translateY(-4px)";
        setTimeout(() => {
            n.classList.remove("show");
            n.style.opacity = "0";
            n.style.transform = "translateX(-50%) translateY(0)";
        }, 1400);
    }

    async function clearAllCaches() {
        if (!("caches" in window)) return;
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
    }

    async function unregisterAllSW() {
        if (!("serviceWorker" in navigator)) return;
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
    }

    // Nuke common Firebase IDBs (names used by compat SDKs)
    async function deleteFirebaseIDBs() {
        if (!("indexedDB" in window)) return;
        const dbs = [
            "firebaseLocalStorageDb",
            "firebase-installations-database",
            "firebase-messaging-database",
            "firestore/[DEFAULT]/firebase-firestore",
            "firestore/[DEFAULT]/firestore-exp-client",
        ];
        await Promise.allSettled(dbs.map(name => indexedDB.deleteDatabase(name)));
    }

    function keepOnlyThemeInLocalStorage() {
        const theme = localStorage.getItem("pb:theme");
        localStorage.clear();
        if (theme) localStorage.setItem("pb:theme", theme);
    }

    async function signOutIfPossible() {
        try {
            if (window.fb?.auth) {
                await fb.auth.signOut();
            }
        } catch (e) {
            console.warn("[reset-utils] signOut failed:", e);
        }
    }

    function broadcastReload() {
        try {
            const bc = new BroadcastChannel(BC_NAME);
            bc.postMessage({ type: "reload" });
            // Other tabs can listen and refresh:
            // const bc = new BroadcastChannel("pb-reset");
            // bc.onmessage = (e) => { if (e.data?.type === "reload") location.reload(); };
        } catch { /* no-op */ }
    }

    async function pbResetCaches({ full = false } = {}) {
        try {
            toast(full ? "Full reset…" : "Resetting cache…");

            await clearAllCaches();
            await unregisterAllSW();

            if (full) {
                await signOutIfPossible();
                await deleteFirebaseIDBs();
                keepOnlyThemeInLocalStorage();
            }

            broadcastReload();
            toast("Done ✓ Reloading…");
            setTimeout(() => location.reload(), 300);
        } catch (e) {
            console.error("[reset-utils] failed:", e);
            toast("Reset failed");
            throw e;
        }
    }

    // Expose globally
    window.pbResetCaches = pbResetCaches;

    // Optional: listen to reload signal (so any tab with this file will refresh)
    try {
        const bc = new BroadcastChannel(BC_NAME);
        bc.onmessage = (e) => {
            if (e?.data?.type === "reload") {
                setTimeout(() => location.reload(), 150);
            }
        };
    } catch { /* no-op */ }

})();
