// settings-lang.js – språkvalg (EN/NO) uten å endre design
(function () {
    "use strict";
    const chips = document.getElementById("langChips");
    if (!chips) return;

    function markActive(lang) {
        chips.querySelectorAll(".category").forEach(el => {
            el.classList.toggle("active", el.dataset.lang === lang);
        });
    }

    async function getUser() {
        const auth = (window.fb?.auth) || firebase.auth();
        const user = auth.currentUser || await new Promise((res) => {
            const unsub = auth.onAuthStateChanged(u => { unsub(); res(u); });
        });
        return user;
    }

    async function loadLang() {
        let lang = localStorage.getItem("pb_lang") || null;
        try {
            const user = await getUser();
            const db = window.fb?.db || firebase.firestore();
            const snap = await db.collection("users").doc(user.uid).get();
            const prof = snap.exists ? snap.data() : null;
            if (prof?.lang) lang = prof.lang;
        } catch { }
        if (!lang) lang = (navigator.language || "en").toLowerCase().startsWith("no") ? "no" : "en";
        localStorage.setItem("pb_lang", lang);
        return lang;
    }

    async function saveLang(lang) {
        try {
            const user = await getUser();
            const db = window.fb?.db || firebase.firestore();
            await db.collection("users").doc(user.uid).set({ lang }, { merge: true });
            localStorage.setItem("pb_lang", lang);
            window.toast?.("Language updated");
        } catch (e) {
            console.error(e);
            alert("Could not save language.");
        }
    }

    // Init
    (async function () {
        const lang = await loadLang();
        markActive(lang);
    })();

    // Clicks
    chips.addEventListener("click", async (e) => {
        const btn = e.target.closest(".category");
        if (!btn) return;
        const lang = btn.dataset.lang;
        markActive(lang);
        await saveLang(lang);
    });
})();
