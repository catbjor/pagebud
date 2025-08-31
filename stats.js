// stats.js — PageBud Stats (calendar/streak/ring/charts) — robust + try-reload UI
(function () {
  "use strict";

  // ===== Firebase helpers (using your firebase-init.js window.fb shim) =====
  const hasFB = () => !!(window.fb && fb.auth && fb.db);

  function onFBReady(cb) {
    if (hasFB()) { try { cb(); } catch { } return; }
    document.addEventListener("firebase-ready", () => { if (hasFB()) try { cb(); } catch { } }, { once: true });
    // Fallback polling (in case the event is missed)
    let tries = 0;
    const t = setInterval(() => {
      if (hasFB() || ++tries > 60) {
        clearInterval(t);
        if (hasFB()) try { cb(); } catch { }
      }
    }, 200);
  }

  // ===== Globals =====
  let allBooks = [];
  let allSessions = [];
  let currentRange = "yearly";
  let currentYear = new Date().getFullYear();
  let currentMonth = new Date().getMonth(); // 0-11

  // Charts
  let genresChart, moodsChart, languagesChart, trendsChart;

  // ===== Boot wiring =====
  document.addEventListener("DOMContentLoaded", () => {
    // Range buttons
    document.querySelectorAll(".time-filter-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".time-filter-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        loadStats(btn.dataset.range);
      });
    });

    // Calendar nav
    document.getElementById("prevYear")?.addEventListener("click", () => { currentYear--; renderCalendar(); });
    document.getElementById("nextYear")?.addEventListener("click", () => { currentYear++; renderCalendar(); });
    document.getElementById("prevMonth")?.addEventListener("click", () => { currentMonth = (currentMonth + 11) % 12; renderCalendar(); });
    document.getElementById("nextMonth")?.addEventListener("click", () => { currentMonth = (currentMonth + 1) % 12; renderCalendar(); });

    // Selects
    document.getElementById("trendMetric")?.addEventListener("change", refreshTrends);
    document.getElementById("calendarMetric")?.addEventListener("change", renderCalendar);

    // Reset all
    document.getElementById("resetStatsBtn")?.addEventListener("click", async () => {
      if (!confirm("This will delete all your books & sessions. Continue?")) return;
      await resetAllData();
      alert("All data deleted");
      loadStats(currentRange);
    });

    // Header Reload button
    document.getElementById("btnReloadStats")?.addEventListener("click", () => loadStats(currentRange));

    // Click handler for inline "Try reload" buttons rendered in error UIs
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-retry='1']");
      if (btn) loadStats(currentRange);
    });

    // Start once Firebase is ready
    onFBReady(() => loadStats("yearly"));
  });

  // Re-run when auth changes (e.g., user signs in after landing here)
  try {
    fb?.auth?.onAuthStateChanged?.(() => loadStats(currentRange));
  } catch { }

  // ===== Data load =====
  async function loadStats(range = "yearly") {
    currentRange = range;
    clearErrorBanner();

    if (!hasFB()) {
      showError("Firebase not ready");
      return;
    }

    const user = fb.auth.currentUser;
    if (!user) {
      showError("You are not signed in.");
      return; // stay on page; button lets them retry after sign-in
    }

    try {
      showLoading();

      // Books
      const booksSnap = await fb.db.collection("users").doc(user.uid).collection("books").get();
      allBooks = booksSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Sessions — new path first, fallback to legacy
      let sessions = [];
      const newPath = await fb.db.collection("readingSessions").doc(user.uid).collection("sessions").get();
      sessions = newPath.docs.map(d => ({ id: d.id, ...d.data() }));
      if (!sessions.length) {
        const oldPath = await fb.db.collection("users").doc(user.uid).collection("sessions").get();
        sessions = oldPath.docs.map(d => ({ id: d.id, ...d.data() }));
      }

      // Normalize to minutes
      allSessions = sessions.map(s => ({
        ...s,
        minutes: s.minutes != null ? Number(s.minutes) : Math.round(Number(s.durationMs || 0) / 60000),
        startedAt: s.startedAt,
        endedAt: s.endedAt
      }));

      process(range);
      clearErrorBanner();
    } catch (e) {
      console.error(e);
      const msg = (e && e.code === "permission-denied")
        ? "Permission denied. Check Firestore rules."
        : "Failed to load data";
      showError(msg);
      renderErrorBanner(msg);
    }
  }

  function process(range) {
    const filteredBooks = filterBooksByRange(allBooks, range);
    const filteredSessions = filterSessionsByRange(allSessions, range);

    updateOverview(filteredBooks, filteredSessions);
    updateCharts(filteredBooks, filteredSessions);
    updateTopLists(filteredBooks);

    renderCalendar();
    updateStreakBadges(computeStreakDays());
  }

  // ===== Helpers =====
  function toDateSafe(v) {
    if (!v) return null;
    if (v.toDate) return v.toDate();          // Firestore Timestamp
    if (typeof v === "number") return new Date(v);
    if (v instanceof Date) return v;
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }

  function rangeWindow(range) {
    const end = new Date();
    const start = new Date(end);
    if (range === "daily") start.setDate(end.getDate() - 1);
    else if (range === "weekly") start.setDate(end.getDate() - 7);
    else if (range === "monthly") start.setMonth(end.getMonth() - 1);
    else start.setFullYear(end.getFullYear() - 1);
    return { start, end };
  }

  function filterBooksByRange(books, range) {
    const { start, end } = rangeWindow(range);
    return books.filter(b => {
      const f = toDateSafe(b.finishedAt);
      return f && f >= start && f <= end;
    });
  }

  function filterSessionsByRange(sessions, range) {
    const { start, end } = rangeWindow(range);
    return sessions.filter(s => {
      const d = toDateSafe(s.startedAt);
      return d && d >= start && d <= end && Number(s.minutes) > 0;
    });
  }

  const sumBy = (arr, fn) => arr.reduce((a, it) => a + (Number(fn(it)) || 0), 0);
  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const isoKey = (d) => d.toISOString().slice(0, 10);

  // ===== Overview =====
  async function updateOverview(filteredBooks, filteredSessions) {
    setText("#booksRead", filteredBooks.length);

    const ratings = filteredBooks.map(b => Number(b.rating)).filter(n => n > 0);
    setText("#avgRating", ratings.length ? avg(ratings).toFixed(1) : "0.0");

    const dayLens = filteredBooks
      .filter(b => b.startedAt && b.finishedAt)
      .map(b => {
        const s = toDateSafe(b.startedAt), f = toDateSafe(b.finishedAt);
        return s && f ? Math.max(1, Math.round((f - s) / 86400000)) : 0;
      }).filter(Boolean);
    setText("#readingTime", dayLens.length ? Math.round(avg(dayLens)) : 0);

    const knownPages = sumBy(filteredBooks, b => b.pages);
    setText("#pagesRead", (knownPages || filteredBooks.length * 300).toLocaleString());

    const { minutesToday, goalToday } = await loadTodayProgress();
    renderTodayRing(minutesToday, goalToday);

    updateStreakBadges(computeStreakDays());
  }

  const setText = (sel, val) => { const el = document.querySelector(sel); if (el) el.textContent = String(val); };

  async function loadTodayProgress() {
    const goalKey = "pb:timer:goalMin";
    if (!hasFB()) return {
      minutesToday: Number(localStorage.getItem("pb:todayMin") || 0),
      goalToday: Number(localStorage.getItem(goalKey) || 20)
    };
    const user = fb.auth.currentUser; if (!user) return { minutesToday: 0, goalToday: 20 };

    const todayKey = new Date().toISOString().slice(0, 10);
    let minutesToday = 0, goalToday = Number(localStorage.getItem(goalKey) || 20);

    try {
      const doc = await fb.db.collection("users").doc(user.uid).collection("daily").doc(todayKey).get();
      if (doc.exists) {
        const d = doc.data();
        minutesToday = Number(d.minutes || 0);
        goalToday = Number(d.goal || goalToday);
      } else {
        minutesToday = sumBy(allSessions.filter(s => isoKey(toDateSafe(s.startedAt)) === todayKey), s => s.minutes);
      }
    } catch {
      minutesToday = sumBy(allSessions.filter(s => isoKey(toDateSafe(s.startedAt)) === todayKey), s => s.minutes);
    }
    return { minutesToday, goalToday: goalToday || 20 };
  }

  function renderTodayRing(minutes, goal) {
    const pct = goal ? Math.min(100, Math.round((minutes / goal) * 100)) : 0;
    const ring = document.getElementById("todayRing");
    const pctEl = document.getElementById("todayPct");
    const minEl = document.getElementById("todayMinutes");
    const goalEl = document.getElementById("todayGoal");
    if (!ring || !pctEl) return;

    const r = 24, circ = 2 * Math.PI * r;
    const dash = (pct / 100) * circ;
    ring.setAttribute("stroke-dasharray", `${dash} ${circ - dash}`);
    pctEl.textContent = `${pct}%`;
    minEl.textContent = `${Math.round(minutes)}m`;
    goalEl.textContent = `Goal: ${goal}m`;
  }

  // ===== Charts =====
  function destroy(ch) { try { ch?.destroy?.(); } catch { } }

  function updateCharts(filteredBooks, filteredSessions) {
    const genres = countByArray(filteredBooks.flatMap(b => Array.isArray(b.genres) ? b.genres : (b.genre ? [b.genre] : []))).slice(0, 12);
    destroy(genresChart); genresChart = bar("genresChart", genres.map(([k]) => k), genres.map(([_, v]) => v));

    const moods = countByArray(filteredBooks.flatMap(b => Array.isArray(b.moods) ? b.moods : [])).slice(0, 12);
    destroy(moodsChart); moodsChart = bar("moodsChart", moods.map(([k]) => k), moods.map(([_, v]) => v));

    const langs = countByArray(filteredBooks.map(b => b.language || "Unknown"));
    destroy(languagesChart); languagesChart = pie("languagesChart", langs.map(([k]) => k), langs.map(([_, v]) => v));

    refreshTrends(filteredBooks, filteredSessions);
  }

  function countByArray(arr) {
    const m = new Map();
    for (const x of arr) {
      const k = (x ?? "Unknown").toString().trim();
      if (!k) continue;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }

  function bar(id, labels, data) {
    const ctx = document.getElementById(id); if (!ctx) return null;
    return new Chart(ctx, {
      type: "bar",
      data: { labels, datasets: [{ data, borderWidth: 1 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
        plugins: { legend: { display: false } }
      }
    });
  }

  function pie(id, labels, data) {
    const ctx = document.getElementById(id); if (!ctx) return null;
    return new Chart(ctx, {
      type: "pie",
      data: { labels, datasets: [{ data }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
    });
  }

  function refreshTrends(filteredBooksParam, filteredSessionsParam) {
    const mode = document.getElementById("trendMetric")?.value || "books";
    const fbk = filteredBooksParam ?? filterBooksByRange(allBooks, currentRange);
    const fss = filteredSessionsParam ?? filterSessionsByRange(allSessions, currentRange);
    destroy(trendsChart);
    if (mode === "minutes") {
      const series = buildMinutesTrend(fss, currentRange);
      trendsChart = line("readingTrendsChart", series.labels, series.values, "Minutes");
    } else {
      const series = buildBooksTrend(fbk, currentRange);
      trendsChart = line("readingTrendsChart", series.labels, series.values, "Books");
    }
  }

  function line(id, labels, data, yLabel) {
    const ctx = document.getElementById(id); if (!ctx) return null;
    return new Chart(ctx, {
      type: "line",
      data: { labels, datasets: [{ data, fill: false, tension: .25 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: false, text: yLabel } } },
        plugins: { legend: { display: false } }
      }
    });
  }

  function buildBooksTrend(books, range) {
    const dates = books.map(b => toDateSafe(b.finishedAt)).filter(Boolean).sort((a, b) => a - b);
    if (!dates.length) return { labels: [], values: [] };
    const { start, end } = rangeWindow(range);
    const step = (range === "daily" || range === "weekly") ? "day" : (range === "monthly" ? "week" : "month");
    if (step === "day") {
      const labels = daysBetween(start, end).map(d => isoKey(d));
      const map = new Map(labels.map(k => [k, 0]));
      dates.forEach(d => { const k = isoKey(d); if (map.has(k)) map.set(k, map.get(k) + 1); });
      return { labels, values: labels.map(k => map.get(k)) };
    }
    if (step === "week") {
      const labels = weeksBetween(start, end);
      const map = new Map(labels.map(k => [k, 0]));
      dates.forEach(d => { const k = weekKey(d); if (map.has(k)) map.set(k, map.get(k) + 1); });
      return { labels, values: labels.map(k => map.get(k)) };
    }
    const labels = monthsBetween(start, end);
    const map = new Map(labels.map(k => [k, 0]));
    dates.forEach(d => { const k = monthKey(d); if (map.has(k)) map.set(k, map.get(k) + 1); });
    return { labels, values: labels.map(k => map.get(k)) };
  }

  function buildMinutesTrend(sessions, range) {
    if (!sessions.length) return { labels: [], values: [] };
    const { start, end } = rangeWindow(range);
    const step = (range === "daily" || range === "weekly") ? "day" : (range === "monthly" ? "week" : "month");

    if (step === "day") {
      const labels = daysBetween(start, end).map(d => isoKey(d));
      const map = new Map(labels.map(k => [k, 0]));
      sessions.forEach(s => { const k = isoKey(toDateSafe(s.startedAt)); if (map.has(k)) map.set(k, map.get(k) + (Number(s.minutes) || 0)); });
      return { labels, values: labels.map(k => map.get(k)) };
    }
    if (step === "week") {
      const labels = weeksBetween(start, end);
      const map = new Map(labels.map(k => [k, 0]));
      sessions.forEach(s => { const k = weekKey(toDateSafe(s.startedAt)); if (map.has(k)) map.set(k, map.get(k) + (Number(s.minutes) || 0)); });
      return { labels, values: labels.map(k => map.get(k)) };
    }
    const labels = monthsBetween(start, end);
    const map = new Map(labels.map(k => [k, 0]));
    sessions.forEach(s => { const k = monthKey(toDateSafe(s.startedAt)); if (map.has(k)) map.set(k, map.get(k) + (Number(s.minutes) || 0)); });
    return { labels, values: labels.map(k => map.get(k)) };
  }

  function daysBetween(a, b) { const out = []; const d = new Date(a); d.setHours(0, 0, 0, 0); const e = new Date(b); e.setHours(0, 0, 0, 0); while (d <= e) { out.push(new Date(d)); d.setDate(d.getDate() + 1); } return out; }
  function weekKey(d) { const w = isoWeekNumber(d); return `${d.getFullYear()}-W${String(w).padStart(2, "0")}`; }
  function weeksBetween(a, b) { const out = []; const d = new Date(a); d.setDate(d.getDate() - d.getDay() + 1); while (d <= b) { out.push(weekKey(d)); d.setDate(d.getDate() + 7); } return out; }
  const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).toString().padStart(2, "0")}`;
  function monthsBetween(a, b) { const out = []; const d = new Date(a.getFullYear(), a.getMonth(), 1); const e = new Date(b.getFullYear(), b.getMonth(), 1); while (d <= e) { out.push(monthKey(d)); d.setMonth(d.getMonth() + 1); } return out; }
  function isoWeekNumber(date) { const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())); const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day); const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return Math.ceil(((d - yearStart) / 86400000 + 1) / 7); }

  // ===== Top lists =====
  function updateTopLists(books) {
    renderPairs("#topAuthors", countByArray(books.map(b => b.author || "Unknown")).slice(0, 5));
    const gArr = books.flatMap(b => Array.isArray(b.genres) ? b.genres : (b.genre ? [b.genre] : []));
    renderPairs("#topGenres", countByArray(gArr).slice(0, 5));
    const rated = books.filter(b => Number(b.rating) > 0);
    rated.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0) || (Number(b.pages) || 0) - (Number(a.pages) || 0));
    renderPairs("#topBooks", rated.slice(0, 5).map(b => [b.title || "Untitled", Number(b.rating) || 0]), true);
  }

  function renderPairs(sel, pairs, isBooks = false) {
    const ul = document.querySelector(sel); if (!ul) return;
    ul.innerHTML = "";
    if (!pairs.length) {
      ul.innerHTML = `<li class="loading">No data</li>`;
      return;
    }
    const max = Math.max(...pairs.map(([, v]) => Number(isBooks ? v : v)));
    for (const [name, val] of pairs) {
      const li = document.createElement("li");
      li.className = "top-item";
      li.innerHTML = `
        <div class="top-item-name">${name}</div>
        <div class="top-item-count">${isBooks ? `${Number(val).toFixed(1)}★` : val}</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${max ? Math.round((Number(isBooks ? val : val) / max) * 100) : 0}%"></div></div>
      `;
      ul.appendChild(li);
    }
  }

  // ===== Calendar =====
  function renderCalendar() {
    const labels = document.getElementById("calendarLabels");
    const grid = document.getElementById("calendarGrid");
    const monthLabel = document.getElementById("currentMonth");
    const yearLabel = document.getElementById("currentYear");
    if (!labels || !grid) return;

    yearLabel.textContent = String(currentYear);
    monthLabel.textContent = new Date(currentYear, currentMonth, 1).toLocaleString(undefined, { month: "long", year: "numeric" });

    labels.innerHTML = "";
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach(d => {
      const el = document.createElement("div"); el.className = "calendar-day-label"; el.textContent = d; labels.appendChild(el);
    });

    grid.innerHTML = "";

    const first = new Date(currentYear, currentMonth, 1);
    const last = new Date(currentYear, currentMonth + 1, 0);
    let startIdx = first.getDay(); if (startIdx === 0) startIdx = 7; // Sunday -> 7
    const prevMonthLast = new Date(currentYear, currentMonth, 0).getDate();

    for (let i = 1; i < startIdx; i++) {
      const d = document.createElement("div");
      d.className = "calendar-day other-month";
      d.textContent = String(prevMonthLast - (startIdx - i) + 1);
      grid.appendChild(d);
    }

    const metric = document.getElementById("calendarMetric")?.value || "sessions";
    const minutesMap = computeMinutesPerDay(currentYear);
    const spans = allBooks.map(b => {
      const s = toDateSafe(b.startedAt), f = toDateSafe(b.finishedAt);
      return (s && f) ? { s, f } : null;
    }).filter(Boolean);

    for (let day = 1; day <= last.getDate(); day++) {
      const dateObj = new Date(currentYear, currentMonth, day);
      const cell = document.createElement("div");
      cell.className = "calendar-day";
      cell.textContent = String(day);

      if (metric === "sessions") {
        const key = dateObj.toISOString().slice(0, 10);
        const mins = minutesMap.get(key) || 0;
        if (mins > 0) {
          styleHeatCell(cell, mins);
          cell.title = `${mins} min`;
        }
      } else {
        if (spans.some(sp => sameDayInSpan(dateObj, sp.s, sp.f))) {
          cell.style.background = getBlend(0.35);
          cell.style.borderColor = getBlend(0.6);
          cell.style.color = "#fff";
          cell.title = "Reading day";
        }
      }
      grid.appendChild(cell);
    }

    const rem = (7 - (grid.children.length % 7)) % 7;
    for (let i = 0; i < rem; i++) {
      const d = document.createElement("div");
      d.className = "calendar-day other-month";
      d.textContent = String(i + 1);
      grid.appendChild(d);
    }
  }

  function computeMinutesPerDay(year) {
    const m = new Map();
    for (const s of allSessions) {
      const d = toDateSafe(s.startedAt); const mins = Number(s.minutes) || 0;
      if (!d || !mins || d.getFullYear() !== year) continue;
      const k = d.toISOString().slice(0, 10);
      m.set(k, (m.get(k) || 0) + mins);
    }
    return m;
  }

  const sameDayInSpan = (d, s, f) => {
    const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const ss = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    const ff = new Date(f.getFullYear(), f.getMonth(), f.getDate());
    return dd >= ss && dd <= ff;
  };

  function styleHeatCell(el, minutes) {
    const lvl = minutes >= 61 ? 4 : minutes >= 31 ? 3 : minutes >= 16 ? 2 : 1;
    const bg = getBlend(lvl * 0.18);
    el.style.background = bg;
    el.style.borderColor = getBlend(lvl * 0.32);
    el.style.color = "#fff";
  }

  // Blend --primary color over background
  const getBlend = (alpha) => {
    const primary = getCSS("--primary", "#4e73df");
    const bg = getCSS("--background", "#0f0f12");
    const pc = toRGB(primary), bc = toRGB(bg);
    const r = Math.round(pc.r * alpha + bc.r * (1 - alpha));
    const g = Math.round(pc.g * alpha + bc.g * (1 - alpha));
    const b = Math.round(pc.b * alpha + bc.b * (1 - alpha));
    return `rgb(${r},${g},${b})`;
  };

  const getCSS = (name, fallback) => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  };

  function toRGB(c) {
    if (!c) return { r: 78, g: 115, b: 223 };
    if (c.startsWith("rgb")) {
      const m = c.match(/rgb[a]?\((\d+),\s*(\d+),\s*(\d+)/i);
      return m ? { r: +m[1], g: +m[2], b: +m[3] } : { r: 78, g: 115, b: 223 };
    }
    let h = c.replace("#", "");
    if (h.length === 3) h = h.split("").map(x => x + x).join("");
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  // ===== Streak =====
  function computeStreakDays() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let streak = 0;
    for (let i = 0; i < 3650; i++) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const k = isoKey(d);
      const hadMinutes = allSessions.some(s => isoKey(toDateSafe(s.startedAt)) === k && Number(s.minutes) > 0);
      const hadSpan = allBooks.some(b => {
        const s = toDateSafe(b.startedAt), f = toDateSafe(b.finishedAt);
        return s && f && sameDayInSpan(d, s, f);
      });
      if (hadMinutes || hadSpan) streak++; else break;
    }
    return streak;
  }

  function updateStreakBadges(streak) {
    const sHead = document.getElementById("streakDays");
    if (sHead) sHead.textContent = String(streak);
    const navFlame = document.getElementById("navStreak");
    const navNum = document.getElementById("navStreakNum");
    if (navFlame && navNum) {
      if (streak > 0) { navNum.textContent = String(streak); navFlame.style.display = ""; }
      else { navFlame.style.display = "none"; }
    }
  }

  // ===== UI states & error banner =====
  const showLoading = () =>
    ["#topAuthors", "#topGenres", "#topBooks"].forEach(sel => {
      const ul = document.querySelector(sel);
      if (ul) ul.innerHTML = `<li class="loading">Loading…</li>`;
    });

  function showError(msg) {
    ["#topAuthors", "#topGenres", "#topBooks"].forEach(sel => {
      const ul = document.querySelector(sel);
      if (ul) {
        ul.innerHTML = `
          <li class="error" style="display:flex;align-items:center;gap:8px">
            <span style="flex:1">${msg}</span>
            <button class="month-btn" data-retry="1">Try reload</button>
          </li>`;
      }
    });
  }

  function renderErrorBanner(msg) {
    const bar = document.getElementById("statsErrorBar");
    if (!bar) return;
    bar.style.display = "";
    bar.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div style="font-weight:800">⚠️ ${msg}</div>
        <div style="display:flex;gap:6px">
          <button class="month-btn" data-retry="1">Try reload</button>
        </div>
      </div>`;
  }

  function clearErrorBanner() {
    const bar = document.getElementById("statsErrorBar");
    if (bar) { bar.style.display = "none"; bar.innerHTML = ""; }
  }

  // ===== Reset all =====
  async function resetAllData() {
    if (!hasFB()) return;
    const user = fb.auth.currentUser; if (!user) return;

    async function purge(colRef) {
      while (true) {
        const snap = await colRef.limit(300).get();
        if (snap.empty) break;
        const batch = fb.db.batch();
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    }

    const base = fb.db.collection("users").doc(user.uid);
    await Promise.all([
      purge(base.collection("books")),
      purge(base.collection("sessions")),
      purge(base.collection("daily"))
    ]);

    await purge(fb.db.collection("readingSessions").doc(user.uid).collection("sessions"));

    allBooks = [];
    allSessions = [];
  }

  /* === Live goal updates (from Settings) ================================== */
  window.addEventListener("pb:timer:goalChanged", async (ev) => {
    try {
      const val = Number(ev?.detail?.minutes);
      const newGoal = !Number.isNaN(val) ? val : Number(localStorage.getItem("pb:timer:goalMin") || 20);
      const { minutesToday } = await loadTodayProgress();
      renderTodayRing(minutesToday, newGoal);
    } catch (e) { /* ignore */ }
  });
  /* ======================================================================= */

})();
