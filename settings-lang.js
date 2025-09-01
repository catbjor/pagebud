// settings-lang.js – språkvalg (EN/NO) med Firebase
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
            if (user) {
                const db = window.fb?.db || firebase.firestore();
                const snap = await db.collection("users").doc(user.uid).get();
                const prof = snap.exists ? snap.data() : null;
                if (prof?.lang) lang = prof.lang;
            }
        } catch (e) {
            console.warn("loadLang fallback", e);
        }
        if (!lang) {
            const l = (navigator.language || "en").toLowerCase();
            lang = (l.startsWith("no") || l.startsWith("nb") || l.startsWith("nn")) ? "no" : "en";
        }
        localStorage.setItem("pb_lang", lang);
        return lang;
    }

    async function saveLang(lang) {
        // lokalt først for snappy UI
        localStorage.setItem("pb_lang", lang);
        try {
            const user = await getUser();
            if (!user) {
                // Ikke innlogget → bare behold lokalt og be om innlogging
                window.toast?.("Saved locally. Sign in to sync.");
                return;
            }
            const db = window.fb?.db || firebase.firestore();
            await db.collection("users").doc(user.uid).set({ lang }, { merge: true });
            window.toast?.("Language updated");
        } catch (e) {
            console.error(e);
            alert("Could not save language.");
        }
    }

    (async function init() {
        // sørg for at i18n er lastet (valgfritt)
        try { await window.PB_I18N?.loadUserLang?.(); } catch { }
        const lang = await loadLang();
        markActive(lang);
    })();

    chips.addEventListener("click", async (e) => {
        const btn = e.target.closest(".category");
        if (!btn) return;
        const lang = btn.dataset.lang;
        markActive(lang);
        await saveLang(lang);
    });
})();
