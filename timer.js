/* timer.js — circle toggle + drawer for timer
   - Collapsed idle: klokke-SVG i en sirkel
   - Collapsed running/paused: tid + grønn progress-ring (mot dagsmål)
   - Expanded drawer: Start / Pause / Resume / Stop
   - Respekterer left/right og bretter motsatt vei
*/
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const K = {
    side: "pb:timer:side",
    coll: "pb:timer:collapsed",
    active: "pb:timer:active",
    goal: "pb:timer:goalMin"
  };

  // Din klokke-ikon (idle)
  const CLOCK_SVG = `
  <svg class="clock-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true">
    <path fill="currentColor" d="M528 320C528 434.9 434.9 528 320 528C205.1 528 112 434.9 112 320C112 205.1 205.1 112 320 112C434.9 112 528 205.1 528 320zM64 320C64 461.4 178.6 576 320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320zM296 184L296 320C296 328 300 335.5 306.7 340L402.7 404C413.7 411.4 428.6 408.4 436 397.3C443.4 386.2 440.4 371.4 429.3 364L344 307.2L344 184C344 170.7 333.3 160 320 160C306.7 160 296 170.7 296 184z"/>
  </svg>`;

  // ----- Utils -----
  const now = () => Date.now();
  const pad = n => String(n).padStart(2, "0");
  const fmt = s => `${pad(Math.floor(s / 60))}:${pad(Math.floor(s % 60))}`;
  const toDayStr = (d) => {
    const x = new Date(d);
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  };

  function loadState() { try { return JSON.parse(localStorage.getItem(K.active) || "null"); } catch { return null; } }
  function saveState(s) { localStorage.setItem(K.active, JSON.stringify(s || null)); }
  function clearState() { localStorage.removeItem(K.active); }

  // Lokalt dagsmåler for ring
  function bumpLocalDay(minutes) {
    const dKey = "pb:timer:_localDay";
    const vKey = "pb:timer:_localMin";
    const today = toDayStr(Date.now());
    if (localStorage.getItem(dKey) !== today) {
      localStorage.setItem(dKey, today);
      localStorage.setItem(vKey, "0");
    }
    const next = Number(localStorage.getItem(vKey) || "0") + Number(minutes || 0);
    localStorage.setItem(vKey, String(next));
    return next;
  }
  function getMinutesToday() {
    const dKey = "pb:timer:_localDay";
    const vKey = "pb:timer:_localMin";
    const today = toDayStr(Date.now());
    if (localStorage.getItem(dKey) !== today) return 0;
    return Number(localStorage.getItem(vKey) || "0");
  }

  // ----- Dock (sirkel + skuff) -----
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
      </div>
    `;
    document.body.appendChild(d);
    return d;
  }

  // ----- Knappestater -----
  function setButtonsState({ running, paused }) {
    $("#pb-timer-start").disabled = !!running;
    $("#pb-timer-pause").disabled = !running || !!paused;
    $("#pb-timer-resume").disabled = !paused;
    $("#pb-timer-stop").disabled = !running && !paused;
  }

  // ----- Tid + loop -----
  let tick = null;
  function drawTime(ms) { const el = $("#pb-timer-time"); if (el) el.textContent = fmt(ms / 1000); }
  function currentElapsedMs(s) {
    if (!s) return 0;
    const base = Number(s.accumMs || 0);
    return s.pausedAt ? base : base + Math.max(0, now() - Number(s.startAt || now()));
  }
  function loop() {
    const s = loadState();
    const elapsed = currentElapsedMs(s);
    drawTime(elapsed);
    updateCollapsedCircle();
    if (!s || s.pausedAt) stopLoop();
  }
  function startLoop() { stopLoop(); tick = setInterval(loop, 1000); }
  function stopLoop() { if (tick) { clearInterval(tick); tick = null; } }

  // ----- Normalisering av state -----
  function normalizeState(s) {
    if (!s) return null;
    // tom state
    if (!s.startAt && !s.accumMs) { clearState(); return null; }
    // Pauset fra tidligere dag → nullstill
    if (s.pausedAt && toDayStr(s.pausedAt) !== toDayStr(Date.now())) {
      clearState(); drawTime(0); return null;
    }
    return s;
  }

  // ----- Collapsed/expanded -----
  function setCollapsed(flag) {
    const dock = ensureDock();
    dock.classList.toggle("collapsed", flag);
    dock.classList.toggle("open", !flag); // for ev. z-index/pointer-styling
    localStorage.setItem(K.coll, flag ? "1" : "0");
    updateCollapsedCircle();
  }

  // ----- Collapsed UI (ikon eller ring+tid) -----
  function updateCollapsedCircle() {
    const circle = $("#pb-timer-toggle");
    if (!circle) return;

    const s = normalizeState(loadState());

    // Ingen gyldig sesjon → vis klokke-SVG
    if (!s) {
      circle.innerHTML = CLOCK_SVG;
      return;
    }

    // Ellers vis tid + progress-ring (mot dagsmål)
    const elapsed = currentElapsedMs(s);
    const timeStr = fmt(elapsed / 1000);

    const minutesToday = getMinutesToday();
    const goal = Math.max(1, Number(localStorage.getItem(K.goal) || "20"));
    const r = 34;
    const circ = 2 * Math.PI * r;
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

  // ----- Handlinger -----
  function start() {
    let s = loadState();
    if (s && !s.pausedAt) return;
    if (!s) s = { startAt: now(), accumMs: 0, pausedAt: null };
    else { s.startAt = now(); s.pausedAt = null; }
    saveState(s);
    startLoop();
    setButtonsState({ running: true, paused: false });
    updateCollapsedCircle();
  }

  function pause() {
    const s = loadState(); if (!s || s.pausedAt) return;
    s.accumMs = currentElapsedMs(s);
    s.pausedAt = now();
    saveState(s);
    setButtonsState({ running: true, paused: true });
    updateCollapsedCircle();
  }

  function resume() {
    const s = loadState(); if (!s || !s.pausedAt) return;
    s.startAt = now();
    s.pausedAt = null;
    saveState(s);
    startLoop();
    setButtonsState({ running: true, paused: false });
    updateCollapsedCircle();
  }

  function stopAndPersist() {
    const s = loadState();
    if (s) {
      const totalMs = s.pausedAt ? s.accumMs : currentElapsedMs(s);
      const min = Math.max(0, Math.round(totalMs / 60000));
      if (min > 0) bumpLocalDay(min);
    }
    clearState();
    stopLoop();
    drawTime(0);
    setButtonsState({ running: false, paused: false });
    updateCollapsedCircle();
  }

  // ----- Plassering over FAB -----
  function cssNumber(val, fallback) {
    const n = parseFloat(val);
    return Number.isFinite(n) ? n : fallback;
  }

  function placeDock() {
    const dock = document.getElementById("pb-timer-dock");
    if (!dock) return;

    // side (left/right)
    const side = localStorage.getItem(K.side) || "right";
    dock.classList.toggle("right", side === "right");
    dock.classList.toggle("left", side === "left");

    // Finn bottom-nav-h + add-book FAB
    const root = document.documentElement;
    const navH = cssNumber(getComputedStyle(root).getPropertyValue("--bottom-nav-h"), 64);
    const fab = document.querySelector(".add-book");

    let bottomPx;
    if (fab) {
      const fabStyles = getComputedStyle(fab);
      const fabBottom = cssNumber(fabStyles.bottom, navH + 16);
      const fabH = fab.getBoundingClientRect().height || cssNumber(fabStyles.height, 56);
      bottomPx = fabBottom + fabH + 12; // 12px klaring over FAB
    } else {
      bottomPx = navH + 24; // over bunnen når ingen FAB
    }

    // Sett inline — disse trumfer alt annet
    dock.style.setProperty("bottom", bottomPx + "px", "important");
    if (side === "right") {
      dock.style.setProperty("right", "20px", "important");
      dock.style.removeProperty("left");
    } else {
      dock.style.setProperty("left", "20px", "important");
      dock.style.removeProperty("right");
    }
  }

  // ----- Bind -----
  function bind() {
    const dock = ensureDock();

    // Toggle skuff via sirkelen (og kun der)
    $("#pb-timer-toggle").addEventListener("click", () =>
      setCollapsed(!dock.classList.contains("collapsed"))
    );

    // Kontroller
    $("#pb-timer-start").addEventListener("click", start);
    $("#pb-timer-pause").addEventListener("click", pause);
    $("#pb-timer-resume").addEventListener("click", resume);
    $("#pb-timer-stop").addEventListener("click", stopAndPersist);

    // Initial side
    const side = localStorage.getItem(K.side) || "right";
    dock.classList.toggle("right", side === "right");
    dock.classList.toggle("left", side === "left");

    // Normaliser state og sett knapper
    const s = normalizeState(loadState());
    if (!s) {
      drawTime(0);
      setButtonsState({ running: false, paused: false });
    } else if (s.pausedAt) {
      drawTime(currentElapsedMs(s));
      setButtonsState({ running: true, paused: true });
    } else {
      startLoop();
      setButtonsState({ running: true, paused: false });
    }

    // Collapsed init + første render
    setCollapsed(localStorage.getItem(K.coll) !== "0");
    updateCollapsedCircle();

    // Posisjoner over FAB (og hold den der)
    placeDock();
    window.addEventListener("resize", placeDock);
    document.addEventListener("pb:nav-ready", placeDock);
    const mo = new MutationObserver(placeDock);
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
