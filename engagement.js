/* =========================================================
   PageBud — Engagement
   - Daily Reading Reminder (lokal klokke, notifikasjon)
   - Goal Progress Updates (25/50/75/100 %)
   - New Features (vis én gang per versjon)
   ---------------------------------------------------------
   Forventede element-IDer i settings:
     #reminderToggle  (checkbox)
     #reminderTime    (input[type="time"])
     #goalToggle      (checkbox)
     #newFeaturesToggle (checkbox)

   Bruk:
   <script src="engagement.js"></script>
   Kall window.pbNotifyProgress(percent) når du oppdaterer leseprosent.
   ========================================================= */

(function () {
    const APP_VERSION = "1.0.0"; // Oppdater når du shipper nytt

    // ---------- Notifikasjoner ----------
    async function ensureNotifPermission() {
        if (!("Notification" in window)) return false;
        if (Notification.permission === "granted") return true;
        if (Notification.permission === "denied") return false;
        try {
            const res = await Notification.requestPermission();
            return res === "granted";
        } catch {
            return false;
        }
    }

    function showNotification(title, body) {
        // SW, om tilgjengelig
        if (navigator.serviceWorker && navigator.serviceWorker.ready) {
            navigator.serviceWorker.ready.then((reg) => {
                if (reg.showNotification) {
                    reg.showNotification(title, {
                        body,
                        icon: "/icons/icon-192.png",
                        tag: "pagebud",
                        renotify: true
                    });
                } else if ("Notification" in window) {
                    new Notification(title, { body });
                }
            });
        } else if ("Notification" in window) {
            new Notification(title, { body });
        } else {
            console.log("[PB]", title, body); // fallback
        }
    }

    // ---------- Daily Reading Reminder ----------
    function initDailyReminder() {
        const toggle = document.getElementById("reminderToggle");
        const timeInput = document.getElementById("reminderTime");

        const enabled = JSON.parse(localStorage.getItem("pb:remind:enabled") || "false");
        const timeStr = localStorage.getItem("pb:remind:time") || "20:00";

        if (toggle) toggle.checked = enabled;
        if (timeInput) timeInput.value = timeStr;

        toggle?.addEventListener("change", async (e) => {
            const ok = await ensureNotifPermission();
            if (!ok) { e.target.checked = false; return; }
            localStorage.setItem("pb:remind:enabled", e.target.checked);
        });

        timeInput?.addEventListener("change", (e) => {
            localStorage.setItem("pb:remind:time", e.target.value || "20:00");
        });

        // Sjekk hvert 30. sekund
        clearInterval(window.__pbRemInterval);
        window.__pbRemInterval = setInterval(async () => {
            if (!JSON.parse(localStorage.getItem("pb:remind:enabled") || "false")) return;
            const now = new Date();
            const [hh, mm] = (localStorage.getItem("pb:remind:time") || "20:00").split(":").map(Number);
            if (now.getHours() === hh && now.getMinutes() === mm && now.getSeconds() < 10) {
                if (await ensureNotifPermission()) {
                    showNotification("Time to read 📖", "Open PageBud and log a few pages.");
                }
            }
        }, 30000);
    }

    // ---------- Goal Progress Updates ----------
    function initGoalUpdates() {
        const toggle = document.getElementById("goalToggle");
        const enabled = JSON.parse(localStorage.getItem("pb:goal:enabled") || "true");
        toggle && (toggle.checked = enabled);

        toggle?.addEventListener("change", (e) => {
            localStorage.setItem("pb:goal:enabled", e.target.checked);
        });

        // Kall denne fra timer/reader når progress endres
        window.pbNotifyProgress = function pbNotifyProgress(percent) {
            if (!JSON.parse(localStorage.getItem("pb:goal:enabled") || "true")) return;
            percent = Math.max(0, Math.min(100, Math.round(percent)));

            const milestones = [25, 50, 75, 100];
            const reached = new Set(JSON.parse(localStorage.getItem("pb:goal:reached") || "[]"));

            for (const m of milestones) {
                if (percent >= m && !reached.has(m)) {
                    reached.add(m);
                    localStorage.setItem("pb:goal:reached", JSON.stringify([...reached]));
                    const title = m === 100 ? "Book finished! 🎉" : `Nice! ${m}% done`;
                    const body = m === 100 ? "Mark it finished and leave a review." : "Keep going – you're on a roll.";
                    showNotification(title, body);
                }
            }
        };
    }

    // ---------- What's New ----------
    function initWhatsNew() {
        const toggle = document.getElementById("newFeaturesToggle");
        const enabled = JSON.parse(localStorage.getItem("pb:whatsnew:enabled") || "true");
        toggle && (toggle.checked = enabled);

        toggle?.addEventListener("change", (e) => {
            localStorage.setItem("pb:whatsnew:enabled", e.target.checked);
        });

        const last = localStorage.getItem("pb:lastSeenVersion");
        if (enabled && last !== APP_VERSION) {
            if (typeof window.openWhatsNewModal === "function") {
                window.openWhatsNewModal();
            } else {
                showNotification("What’s new in PageBud", "Check the latest updates in Settings.");
            }
            localStorage.setItem("pb:lastSeenVersion", APP_VERSION);
        }
    }

    // ---------- Boot ----------
    window.addEventListener("load", () => {
        initDailyReminder();
        initGoalUpdates();
        initWhatsNew();
    });
})();
