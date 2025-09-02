/* stats.js — PageBud
   Reads users/{uid}/sessions (type:"timer") and renders:
   - Today ring + labels (#todayRing, #todayPct, #todayMinutes, #todayGoal)
   - Month calendar heat (#calendarLabels, #calendarGrid)
   No layout changes to stats.html required.
*/
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);

  // Firestore handles (fb.* first, then compat)
  const DB = () => (window.fb?.db) || (window.firebase?.firestore?.() || null);
  const USER = () => (window.fb?.auth?.currentUser) || (window.firebase?.auth?.().currentUser) || null;

  // Date helpers
  const pad = n => String(n).padStart(2, "0");
  const toDayStr = (d) => {
    const x = (d instanceof Date) ? d : new Date(d);
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  };
  const firstOfMonth = (y, m) => new Date(y, m, 1);
  const lastOfMonth = (y, m) => new Date(y, m + 1, 0);

  // State
  let minutesByDay = {}; // { "YYYY-MM-DD": number }
  let ym = { y: new Date().getFullYear(), m: new Date().getMonth() };

  /* ---------------- Firestore fetch ---------------- */
  async function fetchTimerMinutes(u) {
    const db = DB(); if (!db) return (minutesByDay = {});
    const ref = db.collection("users").doc(u.uid).collection("sessions");

    // Try: last 365 days by startAt (needs composite index type+startAt if you also filter range)
    const since = new Date(); since.setDate(since.getDate() - 365);
    let snap = null;
    try {
      snap = await ref
        .where("type", "==", "timer")
        .where("startAt", ">=", since)
        .orderBy("startAt", "desc")
        .get();
    } catch {
      // Fallback: no range filter; order by createdAt (safe for small/medium libs)
      try {
        snap = await ref
          .where("type", "==", "timer")
          .orderBy("createdAt", "desc")
          .limit(2000)
          .get();
      } catch {
        snap = null;
      }
    }

    const map = {};
    if (snap) {
      snap.forEach(d => {
        const x = d.data() || {};
        const day = x.day || toDayStr(x.startAt?.toDate?.() || x.startAt || Date.now());
        const min = Number(x.minutes || 0);
        map[day] = (map[day] || 0) + min;
      });
    }
    minutesByDay = map;
  }

  /* ---------------- Today ring ---------------- */
  function renderToday() {
    const rEl = $("#todayRing");      // <circle id="todayRing" r="24">
    const pctEl = $("#todayPct");
    const mEl = $("#todayMinutes");
    const gEl = $("#todayGoal");

    const R = Number(rEl?.getAttribute("r") || 24);
    const C = 2 * Math.PI * R;

    const goal = Math.max(1, Number(localStorage.getItem("pb:timer:goalMin") || "20"));
    const today = toDayStr(new Date());

    // Prefer server value; if local cache for today is bigger (because of eventual consistency),
    // use the maximum so the UI feels instant.
    const serverMin = Number(minutesByDay[today] || 0);
    const localDay = localStorage.getItem("pb:timer:_localDay");
    const localMin = (localDay === today) ? Number(localStorage.getItem("pb:timer:_localMin") || "0") : 0;
    const mins = Math.max(serverMin, localMin);

    const pct = Math.min(100, Math.round((mins / goal) * 100));
    if (rEl) rEl.setAttribute("stroke-dasharray", `${(pct / 100) * C} ${C}`);
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (mEl) mEl.textContent = `${mins}m`;
    if (gEl) gEl.textContent = `Goal: ${goal}m`;
  }

  /* ---------------- Calendar ---------------- */
  function renderCalendar() {
    const labels = $("#calendarLabels");
    const grid = $("#calendarGrid");
    if (!labels || !grid) return;

    // Weekday labels (Mon..Sun)
    const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    labels.innerHTML = names.map(n => `<div class="calendar-day-label">${n}</div>`).join("");

    // Current month header
    const monthLabel = $("#currentMonth");
    const yearLabel = $("#currentYear");
    if (monthLabel) monthLabel.textContent = new Date(ym.y, ym.m, 1).toLocaleString(undefined, { month: "long" });
    if (yearLabel) yearLabel.textContent = String(ym.y);

    grid.innerHTML = "";
    const first = firstOfMonth(ym.y, ym.m);
    const last = lastOfMonth(ym.y, ym.m);

    // Start on Monday
    const start = new Date(first);
    const mondayIndex = (first.getDay() + 6) % 7; // 0..6 (Mon..Sun)
    start.setDate(first.getDate() - mondayIndex);

    const end = new Date(last);
    const tail = 6 - ((last.getDay() + 6) % 7);
    end.setDate(last.getDate() + tail);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = toDayStr(d);
      const inMonth = d.getMonth() === ym.m;
      const mins = Number(minutesByDay[ds] || 0);

      const cell = document.createElement("div");
      cell.className = "calendar-day" + (inMonth ? "" : " other-month");
      cell.title = `${ds} — ${mins} min`;
      cell.textContent = String(d.getDate());

      // Heat: tint background intensity by minutes
      if (mins > 0) {
        const max = 60; // 60+ minutes = full tint
        const strength = Math.min(1, mins / max);
        // light surface + mix primary
        cell.style.background = `color-mix(in oklab, var(--surface) ${Math.max(0, 70 - strength * 40)}%, var(--primary))`;
        cell.style.borderColor = `color-mix(in oklab, var(--border) 60%, var(--primary))`;
        cell.style.color = "var(--text)";
      }
      grid.appendChild(cell);
    }
  }

  /* ---------------- Totals (optional quick stats) ---------------- */
  function renderQuickTotals() {
    // If you later want to populate #booksRead/#avgRating/#readingTime/#pagesRead from Firestore,
    // hook it here. For now we only ensure they aren't blank.
    $("#booksRead") && ($("#booksRead").textContent ||= "0");
    $("#avgRating") && ($("#avgRating").textContent ||= "0.0");
    $("#readingTime") && ($("#readingTime").textContent ||= "0");
    $("#pagesRead") && ($("#pagesRead").textContent ||= "0");
  }

  /* ---------------- Boot ---------------- */
  async function boot() {
    const u = USER(); if (!u) return;
    await fetchTimerMinutes(u);
    renderToday();
    renderCalendar();
    renderQuickTotals();
  }

  document.addEventListener("DOMContentLoaded", () => {
    // Month & year nav (uses IDs in your HTML)
    $("#prevMonth")?.addEventListener("click", () => { ym.m--; if (ym.m < 0) { ym.m = 11; ym.y--; } renderCalendar(); });
    $("#nextMonth")?.addEventListener("click", () => { ym.m++; if (ym.m > 11) { ym.m = 0; ym.y++; } renderCalendar(); });
    $("#prevYear")?.addEventListener("click", () => { ym.y--; renderCalendar(); });
    $("#nextYear")?.addEventListener("click", () => { ym.y++; renderCalendar(); });

    // React to timer saves + goal changes + storage updates
    window.addEventListener("pb:sessions:updated", async () => { await boot(); });
    window.addEventListener("pb:settings:update", (e) => { if (e.detail?.timer?.goalMin != null) renderToday(); });
    window.addEventListener("storage", (e) => {
      if (["pb:timer:_localMin", "pb:timer:_localDay", "pb:timer:goalMin"].includes(e.key)) renderToday();
    });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) renderToday(); });

    // Auth-ready
    if (typeof requireAuth === "function") {
      requireAuth(() => boot());
    } else {
      const t = setInterval(() => { if (USER() && DB()) { clearInterval(t); boot(); } }, 300);
    }
  });
})();

// stats.js – most active days, total minutes, etc.
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const statsEl = $("#statsContent");

  firebase.auth().onAuthStateChanged(async user => {
    if (!user) return location.href = "auth.html";

    const snap = await fb.db.collection("users").doc(user.uid).collection("sessions").get();
    const days = {};

    snap.forEach(doc => {
      const d = doc.data();
      if (!d.day || !d.minutes) return;
      days[d.day] = (days[d.day] || 0) + d.minutes;
    });

    const sorted = Object.entries(days).sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((sum, [_, min]) => sum + min, 0);

    statsEl.innerHTML = `
      <p>Total reading time: <strong>${total} min</strong></p>
      <h3>Most active days:</h3>
      <ul>${sorted.slice(0, 7).map(([day, min]) => `<li>${day}: ${min} min</li>`).join("")}</ul>
    `;
  });
})();
