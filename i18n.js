/* i18n.js – superlett språkmodul (EN / NO) */
(function () {
    const dict = {
        en: {
            greetings: {
                morning: [
                    "Good morning, {name}!",
                    "Morning, {name} — ready to read?",
                    "Rise and shine, {name}."
                ],
                afternoon: [
                    "Good afternoon, {name}!",
                    "Nice to see you, {name}. Time for a chapter?",
                    "A perfect time to read, {name}."
                ],
                evening: [
                    "Good evening, {name}!",
                    "Cozy reading time, {name}?",
                    "Unwind with a book, {name}."
                ],
                fun: [
                    "Books > notifications, {name}.",
                    "One page is a tiny adventure, {name}.",
                    "Stories are brain cardio, {name}."
                ],
                wisdom: [
                    "Small pages add up, {name}.",
                    "Read a little, learn a lot, {name}.",
                    "Today’s words, tomorrow’s ideas, {name}."
                ]
            }
        },
        no: {
            greetings: {
                morning: [
                    "God morgen, {name}!",
                    "Morgen, {name} — klar for å lese?",
                    "Opp og hopp, {name}."
                ],
                afternoon: [
                    "God ettermiddag, {name}!",
                    "Hyggelig å se deg, {name}. En liten leseøkt?",
                    "Perfekt tidspunkt for et kapittel, {name}."
                ],
                evening: [
                    "God kveld, {name}!",
                    "Klar for kose-lesing, {name}?",
                    "Koble av med en bok, {name}."
                ],
                fun: [
                    "Bøker > varsler, {name}.",
                    "Én side er et lite eventyr, {name}.",
                    "Historier er hjernegym, {name}."
                ],
                wisdom: [
                    "Små sider blir til mye, {name}.",
                    "Les litt, lær mye, {name}.",
                    "Dagens ord, morgendagens ideer, {name}."
                ]
            }
        }
    };

    function browserLang() {
        const l = (navigator.language || "en").toLowerCase();
        if (l.startsWith("no") || l.startsWith("nb") || l.startsWith("nn")) return "no";
        return "en";
    }

    let current = localStorage.getItem("pb_lang") || null;

    async function loadUserLang() {
        try {
            const auth = (window.fb?.auth) || firebase.auth();
            const user = auth.currentUser || await new Promise((res) => {
                const unsub = auth.onAuthStateChanged(u => { unsub(); res(u); });
            });
            if (user) {
                const db = window.fb?.db || firebase.firestore();
                const snap = await db.collection("users").doc(user.uid).get();
                const prof = snap.exists ? snap.data() : null;
                if (prof?.lang) current = prof.lang;
            }
        } catch { }
        if (!current) current = browserLang();
        localStorage.setItem("pb_lang", current);
        return current;
    }

    function setLang(lang) {
        current = (lang === "no") ? "no" : "en";
        localStorage.setItem("pb_lang", current);
    }

    function getLang() {
        return current || browserLang();
    }

    function list(path) {
        // path: "greetings.morning"
        const [ns, key] = path.split(".");
        let arr = (((dict[getLang()] || {})[ns] || {})[key]) || [];
        if (!arr.length && getLang() !== "en") {
            arr = (((dict.en || {})[ns] || {})[key]) || [];
        }
        return arr;
    }

    window.PB_I18N = { loadUserLang, setLang, getLang, list };
})();
