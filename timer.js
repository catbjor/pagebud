/* ============================================================
PageBud • timer.js (robust + dock)
- Tåler manglende/sein Firebase
- Offline-kø i localStorage, flusher når auth/online
- Dock-UI over FAB, kan flyttes venstre/høyre + "collapsed"
- Eksponerer PageBudTimer og PageBudTimerUI
============================================================ */
(function () {
  "use strict";

  // ---------- Små utiler ----------
  const now = () => Date.now();
  const fmt = (ms) => {
    const s = Math.floor(ms / 1000);
    const hh = String(Math.floor(s / 3600)).padStart(2, "0");
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  };

  // ---------- Konstanter ----------
  const LS_PREFIX = "pb:timer";
  const LS_ACTIVE = `${LS_PREFIX}:active`;     // aktiv økt snapshot
  const LS_QUEUE = `${LS_PREFIX}:queue`;      // offline-kø
  const LS_SIDE = "pb:timer:side";           // "left" | "right"
  const LS_COLL = "pb:timer:collapsed";      // "1" | "0"

  const FLUSH_INTERVAL_MS = 15_000;
  const MAX_BACKOFF_MS = 60_000;

  // ---------- State ----------
  let tickHandle = null;
  let active = null; // { bookId, startedAt, pausedMs, lastTickAt, segments: [{from,to}], notes? }

  // ---------- Firebase deteksjon (compat) ----------
  const hasFirebase = () => typeof window !== "undefined" && typeof window.firebase !== "undefined";
  const firebaseAppsCount = () => {
    try { return hasFirebase() && window.firebase.apps ? window.firebase.apps.length || 0 : 0; }
    catch { return 0; }
  };
  const hasFirestore = () => {
    try { return hasFirebase() && typeof window.firebase.firestore === "function"; }
    catch { return false; }
  };
  const hasAuth = () => {
    try { return hasFirebase() && typeof window.firebase.auth === "function"; }
    catch { return false; }
  };
  const currentUser = () => {
    try { return hasAuth() ? window.firebase.auth().currentUser : null; }
    catch { return null; }
  };

  async function waitForFirebaseReady({ requireAuth = false, maxWaitMs = 20_000 } = {}) {
    const t0 = now();
    let backoff = 200;
    while (now() - t0 < maxWaitMs) {
      if (firebaseAppsCount() > 0 && hasFirestore() && (!requireAuth || currentUser())) return true;
      await new Promise(r => setTimeout(r, backoff));
      backoff = Math.min(backoff * 1.7, MAX_BACKOFF_MS);
    }
    return false;
  }

  // ---------- LocalStorage helpers ----------
  const loadJSON = (k, f) => { try { const x = localStorage.getItem(k); return x ? JSON.parse(x) : f; } catch { return f; } };
  const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };
  const pushQueue = (s) => { const q = loadJSON(LS_QUEUE, []); q.push(s); saveJSON(LS_QUEUE, q); };
  const popQueue = () => { const q = loadJSON(LS_QUEUE, []); const it = q.shift(); saveJSON(LS_QUEUE, q); return it; };
  const queueLength = () => (loadJSON(LS_QUEUE, []) || []).length;

  // ---------- Aktiv økt persist ----------
  const saveActive = () => saveJSON(LS_ACTIVE, active);
  const loadActive = () => { active = loadJSON(LS_ACTIVE, null); };
  const clearActive = () => { active = null; try { localStorage.removeItem(LS_ACTIVE); } catch { } };

  // ---------- UI oppdatering ----------
  function updateDisplay() {
    const el = document.getElementById("timerDisplay"); // hentes dynamisk (dokking kan komme etterpå)
    if (!el) return;
    if (!active) { el.textContent = "00:00:00"; return; }
    let elapsed = active.pausedMs || 0;
    if (active.lastTickAt) elapsed += now() - active.lastTickAt; // inkluder pågående segment
    el.textContent = fmt(elapsed);
  }
  function startTicking() { stopTicking(); tickHandle = setInterval(updateDisplay, 1000); }
  function stopTicking() { if (tickHandle) { clearInterval(tickHandle); tickHandle = null; } }

  // ---------- Kjerne: start/pause/resume/stop ----------
  function startTimer({ bookId = "unknown", notes = "" } = {}) {
    if (active) return; // allerede i gang
    const t = now();
    active = { bookId, startedAt: t, pausedMs: 0, lastTickAt: t, segments: [], notes };
    saveActive(); startTicking(); updateDisplay();
  }
  function pauseTimer() {
    if (!active || !active.lastTickAt) return;
    const t = now();
    active.segments.push({ from: active.lastTickAt, to: t });
    active.pausedMs += (t - active.lastTickAt);
    active.lastTickAt = null;
    saveActive(); updateDisplay();
  }
  function resumeTimer() {
    if (!active || active.lastTickAt) return;
    active.lastTickAt = now();
    saveActive(); startTicking(); updateDisplay();
  }
  function stopTimerAndBuildSession() {
    if (!active) return null;
    const t = now();
    if (active.lastTickAt) {
      active.segments.push({ from: active.lastTickAt, to: t });
      active.pausedMs += (t - active.lastTickAt);
    }
    const totalMs = active.pausedMs;
    const session = {
      bookId: active.bookId,
      startedAt: active.startedAt,
      endedAt: t,
      durationMs: totalMs,
      segments: active.segments,
      notes: active.notes || "",
      device: navigator.userAgent,
      createdAt: new Date().toISOString(),
      source: "pagebud.timer.v1"
    };
    clearActive(); stopTicking(); updateDisplay();
    return session;
  }

  // ---------- Persister økt ----------
  async function persistSession(session) {
    const ready = await waitForFirebaseReady({ requireAuth: true, maxWaitMs: 8_000 });
    if (!ready || !currentUser()) {
      pushQueue(session);
      dispatchSaved("queued", session);
      return { stored: "queued" };
    }
    try {
      const db = window.firebase.firestore();
      await db.collection("readingSessions").doc(currentUser().uid).collection("sessions").add(session);
      dispatchSaved("cloud", session);
      return { stored: "cloud" };
    } catch (err) {
      pushQueue(session);
      dispatchSaved("queued", session, String(err));
      return { stored: "queued", error: String(err) };
    }
  }
  function dispatchSaved(where, session, error) {
    try {
      document.dispatchEvent(new CustomEvent("pb:timer-session-saved", { detail: { where, session, error } }));
    } catch { }
  }

  // ---------- Flush kø ----------
  let flushTimer = null;
  async function tryFlushQueueOnce() {
    if (queueLength() === 0) return;
    const ready = await waitForFirebaseReady({ requireAuth: true, maxWaitMs: 5_000 });
    if (!ready) return;
    let safety = 25;
    while (queueLength() > 0 && safety-- > 0) {
      const sess = popQueue(); if (!sess) break;
      const res = await persistSession(sess);
      if (res.stored === "queued") { pushQueue(sess); break; }
    }
  }
  function startFlushLoop() { if (!flushTimer) flushTimer = setInterval(tryFlushQueueOnce, FLUSH_INTERVAL_MS); }

  // ---------- Init & lifecycle ----------
  loadActive();
  if (active) { if (active.lastTickAt) startTicking(); updateDisplay(); }
  window.addEventListener("online", tryFlushQueueOnce);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") tryFlushQueueOnce(); });
  if (hasAuth()) try { window.firebase.auth().onAuthStateChanged(() => setTimeout(tryFlushQueueOnce, 500)); } catch { }
  startFlushLoop();

  // ---------- Eksponer ----------
  window.PageBudTimer = {
    start: startTimer,
    pause: pauseTimer,
    resume: resumeTimer,
    stopAndSave: async () => { const s = stopTimerAndBuildSession(); if (s) return persistSession(s); return null; },
    _debug: { queueLength, tryFlushQueueOnce }
  };

  /* ===== Timer Dock UI (venstre/høyre + collapsed) ===== */
  (function () {
    function readSide() { return (localStorage.getItem(LS_SIDE) || "right"); }
    function readCollapsed() { return localStorage.getItem(LS_COLL) === "1"; }
    function saveSide(v) { try { localStorage.setItem(LS_SIDE, v); } catch { } }
    function saveCollapsed(v) { try { localStorage.setItem(LS_COLL, v ? "1" : "0"); } catch { } }

    let dock;
    function ensureDock() {
      if (dock && document.body.contains(dock)) return dock;
      dock = document.createElement("div");
      dock.className = "timer-dock";
      dock.innerHTML = `
        <button class="timer-btn" data-role="collapse" title="Toggle"><i class="fa-regular fa-clock"></i></button>
        <span class="timer-time" id="timerDisplay">00:00:00</span>
        <button class="timer-btn primary" data-role="start" title="Start"><i class="fa-solid fa-play"></i></button>
        <button class="timer-btn" data-role="pause" title="Pause"><i class="fa-solid fa-pause"></i></button>
        <button class="timer-btn" data-role="resume" title="Resume"><i class="fa-solid fa-play"></i></button>
        <button class="timer-btn" data-role="stop" title="Stop & Save"><i class="fa-solid fa-square"></i></button>
      `;
      document.body.appendChild(dock);
      applySide(readSide());
      applyCollapsed(readCollapsed());

      dock.addEventListener("click", (e) => {
        const btn = e.target.closest(".timer-btn"); if (!btn) return;
        const role = btn.getAttribute("data-role");
        if (role === "collapse") { const c = !dock.classList.contains("collapsed"); applyCollapsed(c); saveCollapsed(c); return; }
        if (role === "start") { window.PageBudTimer?.start({ bookId: currentContextBookId() }); return; }
        if (role === "pause") { window.PageBudTimer?.pause(); return; }
        if (role === "resume") { window.PageBudTimer?.resume(); return; }
        if (role === "stop") { window.PageBudTimer?.stopAndSave(); return; }
      });
      return dock;
    }

    function currentContextBookId() {
      return document.querySelector("[data-current-book-id]")?.getAttribute("data-current-book-id")
        || document.querySelector("#bookId")?.value
        || "unknown";
    }
    function applySide(side) { ensureDock(); dock.classList.toggle("right", side === "right"); if (side !== "right") dock.classList.remove("right"); }
    function applyCollapsed(coll) { ensureDock(); dock.classList.toggle("collapsed", !!coll); }

    // Lag dokken når DOM er klar
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureDock);
    else ensureDock();

    // Eksponer for Settings
    window.PageBudTimerUI = {
      apply: ({ side, collapsed }) => {
        if (side) { saveSide(side); applySide(side); }
        if (typeof collapsed === "boolean") { saveCollapsed(collapsed); applyCollapsed(collapsed); }
      }
    };
  })();
})();
