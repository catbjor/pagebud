/* timer.js — circle toggle + drawer for timer (collapse-safe) */
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const K = { side: "pb:timer:side", coll: "pb:timer:collapsed", active: "pb:timer:active", goal: "pb:timer:goal" };

  const CLOCK_SVG = `
  <svg class="clock-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true">
    <path fill="currentColor" d="M528 320C528 434.9 434.9 528 320 528C205.1 528 112 434.9 112 320C112 205.1 205.1 112 320 112C434.9 112 528 205.1 528 320zM64 320C64 461.4 178.6 576 320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320zM296 184L296 320C296 328 300 335.5 306.7 340L402.7 404C413.7 411.4 428.6 408.4 436 397.3C443.4 386.2 440.4 371.4 429.3 364L344 307.2L344 184C344 170.7 333.3 160 320 160C306.7 160 296 170.7 296 184z"/>
  </svg>`;

  // utils
  const now = () => Date.now();
  const pad = n => String(n).padStart(2, "0");
  const fmt = s => `${pad(Math.floor(s / 60))}:${pad(Math.floor(s % 60))}`;
  const toDayStr = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };

  const loadState = () => { try { return JSON.parse(localStorage.getItem(K.active) || "null"); } catch { return null; } };
  const saveState = (s) => localStorage.setItem(K.active, JSON.stringify(s || null));
  const clearState = () => localStorage.removeItem(K.active);

  // local day counter (for ring)
  function bumpLocalDay(minutes) {
    const dKey = "pb:timer:_localDay", vKey = "pb:timer:_localMin";
    const today = toDayStr(Date.now());
    if (localStorage.getItem(dKey) !== today) { localStorage.setItem(dKey, today); localStorage.setItem(vKey, "0"); }
    const next = Number(localStorage.getItem(vKey) || "0") + Number(minutes || 0);
    localStorage.setItem(vKey, String(next)); return next;
  }
  function getMinutesToday() {
    const dKey = "pb:timer:_localDay", vKey = "pb:timer:_localMin";
    const today = toDayStr(Date.now());
    if (localStorage.getItem(dKey) !== today) return 0;
    return Number(localStorage.getItem(vKey) || "0");
  }

  // dock
  function ensureDock() {
    let d = $("#pb-timer-dock");
    if (d) return d;
    d = document.createElement("div");
    d.id = "pb-timer-dock";
    d.className = "timer-dock collapsed right";
    d.innerHTML = `
      <button class="timer-circle" id="pb-timer-toggle"></button>
      <div class="timer-drawer">
        <div class="timer-time" id="pb-timer-time">00:00</div>
        <button class="timer-btn" id="pb-timer-start"><i class="fa-solid fa-play"></i> Start</button>
        <button class="timer-btn" id="pb-timer-pause" disabled><i class="fa-solid fa-pause"></i> Pause</button>
        <button class="timer-btn" id="pb-timer-resume" disabled><i class="fa-solid fa-play"></i> Resume</button>
        <button class="timer-btn primary" id="pb-timer-stop" disabled><i class="fa-solid fa-stop"></i> Stop</button>
      </div>`;
    document.body.appendChild(d);
    return d;
  }

  // buttons
  function setButtonsState({ running, paused }) {
    $("#pb-timer-start").disabled = !!running;
    $("#pb-timer-pause").disabled = !running || !!paused;
    $("#pb-timer-resume").disabled = !paused;
    $("#pb-timer-stop").disabled = !running && !paused;
  }

  // --- Goal Check (called during the timer loop) ---
  function checkAndCelebrateGoal(sessionState) {
    if (!sessionState || sessionState.pausedAt) return;

    const todayStr = toDayStr(new Date());
    const goalReachedKey = `pb:goal_reached:${todayStr}`;

    // If we've already shown the celebration for today, do nothing.
    if (sessionStorage.getItem(goalReachedKey)) {
      return;
    }

    const goal = Math.max(1, Number(localStorage.getItem(K.goal) || "20"));
    const minutesAlreadyReadToday = getMinutesToday();
    const currentSessionMinutes = currentElapsedMs(sessionState) / 60000;

    const totalMinutesSoFar = minutesAlreadyReadToday + currentSessionMinutes;

    if (totalMinutesSoFar >= goal) {
      showGoalCelebration();
      // Mark that we've shown it for today so it doesn't pop up again during this session.
      sessionStorage.setItem(goalReachedKey, 'true');
    }
  }

  // --- Goal Celebration ---
  function showGoalCelebration() {
    let celebrationEl = document.getElementById('pb-goal-celebration');
    if (!celebrationEl) {
      celebrationEl = document.createElement('div');
      celebrationEl.id = 'pb-goal-celebration';
      celebrationEl.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.5);
            display: grid; place-items: center; z-index: 10000;
            opacity: 0; transition: opacity 0.3s ease;
        `;
      celebrationEl.innerHTML = `
            <div style="background: var(--card); color: var(--text); padding: 40px; border-radius: 16px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.2); transform: scale(0.8); transition: transform 0.3s ease; max-width: 90vw;">
                <div style="font-size: 48px;">🎉</div>
                <h2 style="margin-top: 16px; font-size: 1.5rem;">Goal Reached!</h2>
                <p style="color: var(--muted); margin-top: 8px;">You've met your daily reading goal. Great job!</p>
                <button id="pb-goal-celebration-close" style="margin-top: 24px; padding: 10px 20px; border: none; background: var(--primary); color: var(--btn-text); border-radius: 8px; cursor: pointer; font-weight: 700;">Continue</button>
            </div>
        `;
      document.body.appendChild(celebrationEl);

      celebrationEl.addEventListener('click', (e) => {
        if (e.target === celebrationEl || e.target.closest('#pb-goal-celebration-close')) {
          const inner = celebrationEl.querySelector('div');
          inner.style.transform = 'scale(0.8)';
          celebrationEl.style.opacity = '0';
          setTimeout(() => { celebrationEl.style.display = 'none'; }, 300);
        }
      });
    }

    celebrationEl.style.display = 'grid';
    requestAnimationFrame(() => {
      celebrationEl.style.opacity = '1';
      celebrationEl.querySelector('div').style.transform = 'scale(1)';
    });
  }

  // time + loop
  let tick = null;
  const drawTime = (ms) => { const el = $("#pb-timer-time"); if (el) el.textContent = fmt(ms / 1000); };
  const currentElapsedMs = (s) => {
    if (!s) return 0;
    const base = Number(s.accumMs || 0);
    return s.pausedAt ? base : base + Math.max(0, now() - Number(s.startAt || now()));
  };
  function loop() {
    const s = loadState();
    const elapsed = currentElapsedMs(s);
    drawTime(elapsed);

    // New: Check for goal completion during the session
    checkAndCelebrateGoal(s);

    updateCollapsedCircle();
    if (!s || s.pausedAt) stopLoop();
  }
  const startLoop = () => { stopLoop(); tick = setInterval(loop, 1000); };
  const stopLoop = () => { if (tick) { clearInterval(tick); tick = null; } };

  // normalize
  function normalizeState(s) {
    if (!s) return null;
    if (!s.startAt && !s.accumMs) { clearState(); return null; }
    if (s.pausedAt && toDayStr(s.pausedAt) !== toDayStr(Date.now())) { clearState(); drawTime(0); return null; }
    return s;
  }

  // collapse/open (force the drawer display inline too)
  function setCollapsed(flag) {
    const dock = ensureDock();
    dock.classList.toggle("collapsed", flag);
    dock.classList.toggle("open", !flag);
    localStorage.setItem(K.coll, flag ? "1" : "0");
    const drawer = dock.querySelector(".timer-drawer");
    if (drawer) drawer.style.display = flag ? "none" : "flex";  // hard sync with CSS
    updateCollapsedCircle();
  }

  // collapsed UI (icon or ring + time)
  function updateCollapsedCircle() {
    const circle = $("#pb-timer-toggle"); if (!circle) return;
    const s = normalizeState(loadState());

    if (!s) { circle.innerHTML = CLOCK_SVG; return; }

    const elapsed = currentElapsedMs(s);
    const timeStr = fmt(elapsed / 1000);
    const minutesToday = getMinutesToday();
    const goal = Math.max(1, Number(localStorage.getItem(K.goal) || "20"));
    const r = 34, circ = 2 * Math.PI * r;
    const percent = Math.min(100, (minutesToday / goal) * 100);
    const offset = circ * (1 - percent / 100);

    circle.innerHTML = `
      <div class="collapsed-ring">
        <div class="mini-time">${timeStr}</div>
        <svg viewBox="0 0 80 80" aria-hidden="true">
          <circle class="ring-bg" r="${r}" cx="40" cy="40"></circle>
          <circle class="ring-fg" r="${r}" cx="40" cy="40"
                  stroke-dasharray="${circ}" stroke-dashoffset="${offset}"></circle>
        </svg>
      </div>`;
  }

  // actions
  function start() {
    let s = loadState();
    if (s && !s.pausedAt) return;
    if (!s) s = { startAt: now(), accumMs: 0, pausedAt: null };
    else { s.startAt = now(); s.pausedAt = null; }
    saveState(s); startLoop();
    setButtonsState({ running: true, paused: false }); updateCollapsedCircle();
    setCollapsed(false);
  }

  function pause() {
    const s = loadState(); if (!s || s.pausedAt) return;
    s.accumMs = currentElapsedMs(s); s.pausedAt = now(); saveState(s);
    setButtonsState({ running: true, paused: true }); updateCollapsedCircle();
  }

  function resume() {
    const s = loadState(); if (!s || !s.pausedAt) return;
    s.startAt = now(); s.pausedAt = null; saveState(s); startLoop();
    setButtonsState({ running: true, paused: false }); updateCollapsedCircle();
  }

  function stopAndPersist() {
    const s = loadState();
    if (s) {
      const totalMs = s.pausedAt ? s.accumMs : currentElapsedMs(s);
      const min = Math.max(0, Math.round(totalMs / 60000));
      if (min > 0) {
        // The celebration is now handled in the loop. We just need to save the minutes.
        bumpLocalDay(min);
      }
    }
    clearState(); stopLoop(); drawTime(0);
    setButtonsState({ running: false, paused: false });
    updateCollapsedCircle();
    setCollapsed(true); // close drawer so only the circle shows
  }

  // placement (always above the add-book FAB)
  function cssNumber(val, fallback) { const n = parseFloat(val); return Number.isFinite(n) ? n : fallback; }
  function placeDock() {
    const dock = $("#pb-timer-dock"); if (!dock) return;
    const side = localStorage.getItem(K.side) || "right";
    dock.classList.toggle("right", side === "right");
    dock.classList.toggle("left", side === "left");

    const root = document.documentElement;
    const navH = cssNumber(getComputedStyle(root).getPropertyValue("--bottom-nav-h"), 64);
    const fab = document.querySelector(".add-book");

    let bottomPx;
    if (fab) {
      const cs = getComputedStyle(fab);
      const fabBottom = cssNumber(cs.bottom, navH + 16);
      const fabH = fab.getBoundingClientRect().height || cssNumber(cs.height, 56);
      bottomPx = fabBottom + fabH + 12; // 12px clearance
    } else {
      bottomPx = navH + 24;
    }

    dock.style.setProperty("bottom", bottomPx + "px", "important");
    if (side === "right") { dock.style.setProperty("right", "20px", "important"); dock.style.removeProperty("left"); }
    else { dock.style.setProperty("left", "20px", "important"); dock.style.removeProperty("right"); }
  }

  // bind
  function bind() {
    const dock = ensureDock();

    $("#pb-timer-toggle").addEventListener("click", () => {
      const isCollapsed = dock.classList.contains("collapsed");
      setCollapsed(!isCollapsed);
    });

    $("#pb-timer-start").addEventListener("click", start);
    $("#pb-timer-pause").addEventListener("click", pause);
    $("#pb-timer-resume").addEventListener("click", resume);
    $("#pb-timer-stop").addEventListener("click", stopAndPersist);

    // initial side
    const side = localStorage.getItem(K.side) || "right";
    dock.classList.toggle("right", side === "right");
    dock.classList.toggle("left", side === "left");

    // normalize state and set buttons
    const s = normalizeState(loadState());
    if (!s) { drawTime(0); setButtonsState({ running: false, paused: false }); }
    else if (s.pausedAt) { drawTime(currentElapsedMs(s)); setButtonsState({ running: true, paused: true }); }
    else { startLoop(); setButtonsState({ running: true, paused: false }); }

    // collapsed init + first render
    setCollapsed(localStorage.getItem(K.coll) !== "0");
    updateCollapsedCircle();

    // keep it parked above FAB
    placeDock();
    window.addEventListener("resize", placeDock);
    document.addEventListener("pb:nav-ready", placeDock);
    new MutationObserver(placeDock).observe(document.body, { childList: true, subtree: true });
  }

  // --- Public API ---
  window.PBTimer = {
    applySettings: placeDock,
    toggleDock: () => {
      const dock = ensureDock();
      const isCollapsed = dock.classList.contains("collapsed");
      setCollapsed(!isCollapsed);
    },
    reset: stopAndPersist,
    _getState: loadState, // Expose for debugging or advanced use
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();
})();
