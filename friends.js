// friends.js — thin wrapper to boot the friends UI using social.js
(function () {
    "use strict";

    function boot() {
        if (!window.startFriends) return;
        const u = fb?.auth?.currentUser;
        if (u) startFriends();
        else fb?.auth?.onAuthStateChanged?.((x) => { if (x) startFriends(); });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
