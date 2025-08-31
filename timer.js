/* ============================================================
PageBud • timer.js (dock + offline queue + goal events)
- Live mål-sjekk mens timeren går
- Engangs "goal reached" pr. dag
============================================================ */
(function () {
  "use strict";

  const now = () => Date.now();
  const fmt = (ms) => {
    const s = Math.floor(ms / 1000);
    const hh = String(Math.floor(s / 3600)).padStart(2, "0");
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  };

  const LS_PREFIX = "pb:timer";
  const LS_ACTIVE = `${LS_PREFIX}:active`;
  const LS_QUEUE = `${LS_PREFIX}:queue`;
  const LS_SIDE = "pb:timer:side";
  const LS_COLL = "pb:timer:collapsed";
  const LS_VIS = "pb:timer:visible";

  /* ==== DAGLIG AKKUMULATOR + GOAL-EVENTS ================================== */
  const LS_ACCUM_PREFIX = "pb:timer:accum:";  // per-dag minutter
  const LS_GOAL_HIT_PREFIX = "pb:timer:hit:";    // per-dag engangsflagg

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const accumKey = () => LS_ACCUM_PREFIX + todayKey();
  const goalHitKey = () => LS_GOAL_HIT_PREFIX + todayKey();

  function getAccum() {
    try { return Math.max(0, Number(localStorage.getItem(accumKey()) || "0")); } catch { return 0; }
  }
  function setAccum(mins) {
    try { localStorage.setItem(accumKey(), String(Math.max(0, Math.round(mins || 0)))); } catch { }
  }
  function addAccum(mins) { const next = getAccum() + Math.max(0, Math.round(mins || 0)); setAccum(next); return next; }

  function maybeFireGoal(totalMinutes) {
    try {
      const goal = Math.max(0, Number(localStorage.getItem("pb:timer:goalMin") || "20"));
      const hitKey = goalHitKey();
      const already = localStorage.getItem(hitKey) === "1";
      const hit = goal > 0 && totalMinutes >= goal;
      if (hit && !already) {
        localStorage.setItem(hitKey, "1");
        window.dispatchEvent(new CustomEvent("pb:timer:goalReached", { detail: { minutes: totalMinutes, goal } }));
      }
      if (!hit && already) localStorage.removeItem(hitKey);
    } catch { }
  }

  // Re-sjekk når mål endres (i Settings) eller i annen fane
  window.addEventListener("pb:timer:goalChanged", () => maybeFireGoal(getAccum()));
  window.addEventListener("storage", (e) => { if (e.key === "pb:timer:goalMin") maybeFireGoal(getAccum()); });
  /* ======================================================================= */

  let tickHandle = null;
  let active = null;
  let dock;

  const hasFirebase = () => { try { return !!window.firebase; } catch { return false; } };
  const firebaseApps = () => { try { return (firebase?.apps || []).length; } catch { return 0; } };
  const hasFirestore = () => { try { return !!firebase.firestore; } catch { return false; } };
  const hasAuth = () => { try { return hasFirebase() && typeof firebase.auth === "function"; } catch { return false; } };
  const currentUser = () => { try { return hasAuth() ? firebase.auth().currentUser : null; } catch { return null; } };

  async function waitForFirebaseReady({ requireAuth = false, maxWaitMs = 20000 } = {}) {
    const t0 = now(); let backoff = 200;
    while (now() - t0 < maxWaitMs) {
      if (firebaseApps() > 0 && hasFirestore() && (!requireAuth || currentUser())) return true;
      await new Promise(r => setTimeout(r, backoff));
      backoff = Math.min(backoff * 1.7, 60000);
    }
    return false;
  }

  const loadJSON = (k, f) => { try { const x = localStorage.getItem(k); return x ? JSON.parse(x) : f; } catch { return f; } };
  const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };
  const pushQueue = (s) => { const q = loadJSON(LS_QUEUE, []); q.push(s); saveJSON(LS_QUEUE, q); };
  const popQueue = () => { const q = loadJSON(LS_QUEUE, []); const it = q.shift(); saveJSON(LS_QUEUE, q); return it; };
  const queueLen = () => (loadJSON(LS_QUEUE, []) || []).length;

  const saveActive = () => saveJSON(LS_ACTIVE, active);
  const loadActive = () => { active = loadJSON(LS_ACTIVE, null); };
  const clearActive = () => { active = null; try { localStorage.removeItem(LS_ACTIVE); } catch { } };

  function updateDisplay() {
    const el = document.getElementById("timerDisplay");
    let elapsed = 0;
    if (active) {
      elapsed = active.pausedMs || 0;
      if (active.lastTickAt) elapsed += now() - active.lastTickAt;
    }
    if (el) el.textContent = fmt(elapsed);

    // Live mål-sjekk mens timeren går (akkumulert i dag + pågående økt)
    try {
      const acc = getAccum();
      const runMin = Math.floor(elapsed / 60000);
      maybeFireGoal(acc + runMin);
    } catch { }
  }
  function startTicking() { stopTicking(); tickHandle = setInterval(updateDisplay, 1000); }
  function stopTicking() { if (tickHandle) { clearInterval(tickHandle); tickHandle = null; } }

  function startTimer({ bookId = "unknown", notes = "" } = {}) {
    if (active) return;
    const t = now();
    active = { bookId, startedAt: t, pausedMs: 0, lastTickAt: t, segments: [], notes };
    saveActive(); startTicking(); updateDisplay(); pulse();
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
    saveActive(); startTicking(); updateDisplay(); pulse();
  }
  function stopTimerAndBuildSession() {
    if (!active) return null;
    const t = now();
    if (active.lastTickAt) {
      active.segments.push({ from: active.lastTickAt, to: t });
      active.pausedMs += (t - active.lastTickAt);
    }
    const session = {
      bookId: active.bookId, startedAt: active.startedAt, endedAt: t,
      durationMs: active.pausedMs, segments: active.segments, notes: active.notes || "",
      device: navigator.userAgent, createdAt: new Date().toISOString(), source: "pagebud.timer.v1"
    };
    clearActive(); stopTicking(); updateDisplay(); pulse();
    return session;
  }

  async function persistSession(session) {
    // Oppdater lokal akkumulering umiddelbart (før cloud), så mål kan trigges selv offline
    try {
      const addMin = Math.round((session?.durationMs || 0) / 60000);
      const total = addAccum(addMin);
      maybeFireGoal(total);
      session.__accumAdded = 1;
    } catch { }

    const ready = await waitForFirebaseReady({ requireAuth: true, maxWaitMs: 8000 });
    if (!ready || !currentUser()) {
      pushQueue(session);
      dispatchSaved("queued", session);
      return { stored: "queued" };
    }
    try {
      const db = firebase.firestore();
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
    try { document.dispatchEvent(new CustomEvent("pb:timer-session-saved", { detail: { where, session, error } })) } catch { }
  }

  let flushTimer = null;
  async function tryFlushQueueOnce() {
    if (queueLen() === 0) return;
    const ready = await waitForFirebaseReady({ requireAuth: true, maxWaitMs: 5000 });
    if (!ready) return;
    let safety = 25;
    while (queueLen() > 0 && safety-- > 0) {
      const sess = popQueue(); if (!sess) break;
      const res = await persistSession(sess);
      if (res.stored === "queued") { pushQueue(sess); break; } // gi opp nå
    }
  }
  function startFlushLoop() { if (!flushTimer) flushTimer = setInterval(tryFlushQueueOnce, 15000); }

  function ensureDock() {
    if (dock && document.body.contains(dock)) return dock;
    dock = document.createElement("div");
    dock.className = "timer-dock";
    dock.innerHTML = `
      <button class="timer-btn timer-toggle" data-role="collapse" title="Toggle timer" aria-label="Toggle timer">
        <span class="btn-inner">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 11H7v-2h4V6h2z" fill="currentColor"/>
          </svg>
          <span class="btn-label">Timer</span>
        </span>
      </button>
      <div class="timer-readout"><span id="timerDisplay">00:00:00</span></div>
      <div class="timer-controls">
        <button class="timer-btn" data-role="start"  title="Start"><span class="btn-inner">▶</span></button>
        <button class="timer-btn" data-role="pause"  title="Pause"><span class="btn-inner">⏸</span></button>
        <button class="timer-btn" data-role="resume" title="Resume"><span class="btn-inner">⏵</span></button>
        <button class="timer-btn" data-role="stop"   title="Stop & save"><span class="btn-inner">⏹</span></button>
      </div>`;
    document.body.appendChild(dock);

    function refreshEnabled() {
      const hasA = !!active, ticking = !!(active && active.lastTickAt);
      dock.querySelector('[data-role="start"]')?.toggleAttribute("disabled", hasA);
      dock.querySelector('[data-role="pause"]')?.toggleAttribute("disabled", !ticking);
      dock.querySelector('[data-role="resume"]')?.toggleAttribute("disabled", !hasA || ticking);
      dock.querySelector('[data-role="stop"]')?.toggleAttribute("disabled", !hasA);
    }

    const readSide = () => localStorage.getItem(LS_SIDE) || "left";
    const readCollapsed = () => localStorage.getItem(LS_COLL) === "1";
    const readVisible = () => localStorage.getItem(LS_VIS) !== "0";

    function applySide(s) { dock.classList.toggle("right", s === "right"); dock.classList.toggle("left", s !== "right"); }
    function applyCollapsed(c) { dock.classList.toggle("collapsed", !!c); }
    function applyVisible(v) { dock.style.display = v ? "" : "none"; }

    applySide(readSide()); applyCollapsed(readCollapsed()); applyVisible(readVisible()); refreshEnabled();

    dock.addEventListener("click", async (e) => {
      const btn = e.target.closest(".timer-btn"); if (!btn) return;
      const role = btn.getAttribute("data-role");
      if (role === "collapse") { const c = !dock.classList.contains("collapsed"); applyCollapsed(c); localStorage.setItem(LS_COLL, c ? "1" : "0"); return; }
      if (role === "start") { startTimer({ bookId: currentContextBookId() }); refreshEnabled(); return; }
      if (role === "pause") { pauseTimer(); refreshEnabled(); return; }
      if (role === "resume") { resumeTimer(); refreshEnabled(); return; }
      if (role === "stop") { const s = stopTimerAndBuildSession(); if (s) await persistSession(s); refreshEnabled(); return; }
    });

    // Hard reset ved langtrykk på klokke
    let pressT = 0;
    dock.querySelector(".timer-toggle")?.addEventListener("mousedown", () => pressT = Date.now());
    window.addEventListener("mouseup", () => {
      if (pressT && Date.now() - pressT > 2000) {
        try { localStorage.removeItem(LS_ACTIVE); } catch { }
        clearActive(); stopTicking(); updateDisplay(); refreshEnabled();
      }
      pressT = 0;
    });

    // Små kontroll-events uten UI-endring
    window.addEventListener("pb:timer:apply", (ev) => {
      const side = ev?.detail?.side || readSide();
      const coll = (typeof ev?.detail?.collapsed === "boolean") ? ev.detail.collapsed : readCollapsed();
      applySide(side); applyCollapsed(coll);
    });
    window.addEventListener("pb:timer:toggleVisible", () => {
      const v = !(localStorage.getItem(LS_VIS) === "1");
      localStorage.setItem(LS_VIS, v ? "1" : "0"); applyVisible(v);
    });

    return dock;

    function currentContextBookId() {
      const el = document.querySelector("[data-current-book]");
      return el?.getAttribute("data-current-book") || "unknown";
    }
  }

  // Public liten API for Settings
  function applyTimerSettingsNow({ goalMin, side, collapsed }) {
    if (typeof goalMin === "number") {
      try { localStorage.setItem("pb:timer:goalMin", String(goalMin)); } catch { }
      window.dispatchEvent(new CustomEvent("pb:timer:goalChanged", { detail: { minutes: goalMin } }));
    }
    try {
      if (side) localStorage.setItem(LS_SIDE, side);
      if (typeof collapsed === "boolean") localStorage.setItem(LS_COLL, collapsed ? "1" : "0");
    } catch { }
    window.dispatchEvent(new Event("pb:timer:apply"));
  }

  // Boot
  function pulse() { /* left empty on purpose; CSS handles transitions */ }
  loadActive(); ensureDock();
  if (active) { if (active.lastTickAt) startTicking(); updateDisplay(); }
  window.addEventListener("online", tryFlushQueueOnce);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") tryFlushQueueOnce(); });
  if (hasAuth()) try { firebase.auth().onAuthStateChanged(() => setTimeout(tryFlushQueueOnce, 500)); } catch { }
  let flushTimer = null; function startFlushLoop() { if (!flushTimer) flushTimer = setInterval(tryFlushQueueOnce, 15000); } startFlushLoop();

  // Live sync når mål endres
  window.addEventListener("pb:timer:goalChanged", () => updateDisplay());
  window.addEventListener("storage", (e) => { if (e.key === "pb:timer:goalMin") updateDisplay(); });

  window.PageBudTimer = {
    start: startTimer, pause: pauseTimer, resume: resumeTimer,
    stopAndSave: async () => { const s = stopTimerAndBuildSession(); if (s) return persistSession(s); return null; },
    applySettings: applyTimerSettingsNow
  };
})();
