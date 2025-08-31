/* ============================================================
PageBud • timer.js (polished UI + clock FAB when collapsed)
- Works even if Firebase is late; queues sessions offline
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

  /* ==== DAGLIG AKKUMULATOR + GOAL-EVENTS (liten, lokal) =================== */
  const LS_ACCUM_PREFIX = "pb:timer:accum:";  // per-dag minutter (lokal cache)
  const LS_GOAL_HIT_PREFIX = "pb:timer:hit:"; // per-dag engangsflagg

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function accumKey() { return LS_ACCUM_PREFIX + todayKey(); }
  function goalHitKey() { return LS_GOAL_HIT_PREFIX + todayKey(); }

  function getAccum() {
    try { return Math.max(0, Number(localStorage.getItem(accumKey()) || "0")); } catch { return 0; }
  }
  function addAccum(mins) {
    try {
      const cur = getAccum();
      const next = Math.max(0, Math.round(cur + Math.max(0, mins || 0)));
      localStorage.setItem(accumKey(), String(next));
      return next;
    } catch { return 0; }
  }
  function maybeFireGoal(accum) {
    try {
      const goal = Math.max(0, Number(localStorage.getItem("pb:timer:goalMin") || "20"));
      const hk = goalHitKey();
      const already = localStorage.getItem(hk) === "1";
      if (goal > 0 && accum >= goal && !already) {
        localStorage.setItem(hk, "1");
        window.dispatchEvent(new CustomEvent("pb:timer:goalReached", { detail: { minutes: accum, goal } }));
      }
    } catch { }
  }
  // Hvis mål senkes under dagens oppnådde verdi → fyr event én gang
  window.addEventListener("pb:timer:goalChanged", () => maybeFireGoal(getAccum()));
  window.addEventListener("storage", (e) => { if (e.key === "pb:timer:goalMin") maybeFireGoal(getAccum()); });
  /* ======================================================================= */

  let tickHandle = null;
  let active = null;
  let dock;

  const hasFirebase = () => {
    try { return !!window.firebase; } catch { return false; }
  };
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
    if (!el) return;
    if (!active) { el.textContent = "00:00:00"; return; }
    let elapsed = active.pausedMs || 0;
    if (active.lastTickAt) elapsed += now() - active.lastTickAt;
    el.textContent = fmt(elapsed);
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
    const ready = await waitForFirebaseReady({ requireAuth: true, maxWaitMs: 8000 });
    if (!ready || !currentUser()) {
      // offline -> queue
      pushQueue(session);
      dispatchSaved("queued", session);
      try {
        const mins = Math.round((session?.durationMs || 0) / 60000);
        const acc = addAccum(mins);
        maybeFireGoal(acc);
        if (session) session.__accumAdded = 1; // mark for later flush dedupe
      } catch { }
      return { stored: "queued" };
    }
    try {
      const db = firebase.firestore();
      await db.collection("readingSessions").doc(currentUser().uid).collection("sessions").add(session);
      dispatchSaved("cloud", session);
      try {
        if (!session || !session.__accumAdded) {
          const mins = Math.round((session?.durationMs || 0) / 60000);
          const acc = addAccum(mins);
          maybeFireGoal(acc);
        }
      } catch { }
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
      if (res.stored === "queued") { pushQueue(sess); break; }
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
          <!-- clock svg -->
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M12 1a11 11 0 1 0 11 11A11 11 0 0 0 12 1Zm0 20a9 9 0 1 1 9-9 9 9 0 0 1-9 9Zm-1 4h2v6l4 2-1 1.73L11 13Z" fill="currentColor"/>
          </svg>
          <span class="btn-label">Timer</span>
        </span>
      </button>

      <div class="timer-readout">
        <span id="timerDisplay">00:00:00</span>
      </div>

      <div class="timer-controls">
        <button class="timer-btn" data-role="start" title="Start"><span class="btn-inner">▶</span></button>
        <button class="timer-btn" data-role="pause" title="Pause"><span class="btn-inner">⏸</span></button>
        <button class="timer-btn" data-role="resume" title="Resume"><span class="btn-inner">⏵</span></button>
        <button class="timer-btn" data-role="stop" title="Stop & save"><span class="btn-inner">⏹</span></button>
      </div>
    `;
    document.body.appendChild(dock);

    function pulse(el = dock) {
      try {
        el.classList.remove("pulse");
        void el.offsetWidth;
        el.classList.add("pulse");
      } catch { }
    }

    const refreshEnabled = () => {
      const hasA = !!active, ticking = !!(active && active.lastTickAt);
      dock.querySelector('[data-role="start"]')?.toggleAttribute("disabled", hasA);
      dock.querySelector('[data-role="pause"]')?.toggleAttribute("disabled", !ticking);
      dock.querySelector('[data-role="resume"]')?.toggleAttribute("disabled", !hasA || ticking);
      dock.querySelector('[data-role="stop"]')?.toggleAttribute("disabled", !hasA);
    };

    // Side/collapsed/visible state
    const readSide = () => localStorage.getItem(LS_SIDE) || "left";
    const readCollapsed = () => localStorage.getItem(LS_COLL) === "1";
    const readVisible = () => localStorage.getItem(LS_VIS) !== "0";

    function applySide(s) {
      dock.classList.toggle("right", s === "right");
      dock.classList.toggle("left", s !== "right");
    }
    function applyCollapsed(c) {
      dock.classList.toggle("collapsed", !!c);
    }
    function applyVisible(v) {
      dock.style.display = v ? "" : "none";
    }

    applySide(readSide());
    applyCollapsed(readCollapsed());
    applyVisible(readVisible());
    refreshEnabled();

    dock.addEventListener("click", async (e) => {
      const btn = e.target.closest(".timer-btn"); if (!btn) return;
      const role = btn.getAttribute("data-role");
      if (role === "collapse") {
        const c = !dock.classList.contains("collapsed");
        applyCollapsed(c); saveCollapsed(c); pulse(btn); return;
      }
      if (role === "start") { startTimer({ bookId: currentContextBookId() }); refreshEnabled(); return; }
      if (role === "pause") { pauseTimer(); refreshEnabled(); return; }
      if (role === "resume") { resumeTimer(); refreshEnabled(); return; }
      if (role === "stop") { const s = stopTimerAndBuildSession(); if (s) await persistSession(s); refreshEnabled(); return; }
    });

    // long-press clock to hard-reset local state
    let pressT = 0;
    dock.querySelector(".timer-toggle")?.addEventListener("mousedown", () => pressT = Date.now());
    window.addEventListener("mouseup", () => {
      if (pressT && Date.now() - pressT > 2000) {
        try { localStorage.removeItem(LS_ACTIVE); } catch { }
        clearActive(); stopTicking(); updateDisplay(); refreshEnabled(); pulse();
      }
      pressT = 0;
    });

    return dock;

    function saveSide(v) { try { localStorage.setItem(LS_SIDE, v); } catch { } }
    function saveCollapsed(v) { try { localStorage.setItem(LS_COLL, v ? "1" : "0"); } catch { } }
    function saveVisible(v) { try { localStorage.setItem(LS_VIS, v ? "1" : "0"); } catch { } }
    function currentContextBookId() {
      const el = document.querySelector("[data-current-book]"); // optional hook
      return el?.getAttribute("data-current-book") || "unknown";
    }
  }

  function ensureDockButtons() {
    const el = ensureDock();
    // Expose a few tiny controls via custom events
    window.addEventListener("pb:timer:toggleVisible", () => { const v = !(localStorage.getItem(LS_VIS) === "1"); try { localStorage.setItem(LS_VIS, v ? "1" : "0"); } catch { }; el.style.display = v ? "" : "none"; });
    window.addEventListener("pb:timer:apply", (ev) => {
      const side = ev?.detail?.side || localStorage.getItem(LS_SIDE) || "left";
      const coll = (typeof ev?.detail?.collapsed === "boolean") ? ev.detail.collapsed : (localStorage.getItem(LS_COLL) === "1");
      el.classList.toggle("right", side === "right");
      el.classList.toggle("left", side !== "right");
      el.classList.toggle("collapsed", !!coll);
    });
  }

  // Public tiny API for Settings
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
  loadActive(); ensureDock(); ensureDockButtons();
  if (active) { if (active.lastTickAt) startTicking(); updateDisplay(); }
  window.addEventListener("online", tryFlushQueueOnce);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") tryFlushQueueOnce(); });
  if (hasAuth()) try { firebase.auth().onAuthStateChanged(() => setTimeout(tryFlushQueueOnce, 500)); } catch { }
  startFlushLoop();

  /* ==== LIVE SYNC OF DAILY GOAL (fra Settings) ============================ */
  window.addEventListener("pb:timer:goalChanged", (ev) => {
    try {
      const mins = Number(ev?.detail?.minutes);
      if (!Number.isNaN(mins)) {
        localStorage.setItem("pb:timer:goalMin", String(mins));
      }
    } catch { }
    try { /* no UI to recalc here beyond display */ updateDisplay(); } catch { }
  });
  window.addEventListener("storage", (e) => {
    if (e.key === "pb:timer:goalMin") {
      try { updateDisplay(); } catch { }
    }
  });
  /* ======================================================================= */

  window.PageBudTimer = {
    start: startTimer, pause: pauseTimer, resume: resumeTimer,
    stopAndSave: async () => { const s = stopTimerAndBuildSession(); if (s) return persistSession(s); return null; }
  };
  window.PageBudTimerUI = {
    apply: ({ side, collapsed }) => { if (side) applySide(side); /* eslint-disable-line no-undef */ if (typeof collapsed === "boolean") applyCollapsed(collapsed); }
  };
})();
