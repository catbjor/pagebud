/* timer.js — reading timer dock + Firestore sessions logger
   - users/{uid}/sessions docs: {type:"timer", startAt, endAt, minutes, day, bookId?, createdAt}
   - Respekterer Settings (pb:timer:goalMin/side/collapsed/visible)
   - Collapse/expand via knapp, dbl-klik på dock, eller "c"-tast
*/
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // Keys
  const K = {
    goal: "pb:timer:goalMin",
    side: "pb:timer:side",
    coll: "pb:timer:collapsed",
    vis: "pb:timer:visible",
    active: "pb:timer:active" // JSON {startAt, accumMs, pausedAt, bookId?}
  };

  // Utils
  const now = () => Date.now();
  const pad = n => String(n).padStart(2, "0");
  const fmt = s => `${pad(Math.floor(s / 60))}:${pad(Math.floor(s % 60))}`;
  function toDayStr(d) { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; }

  function loadState() { try { return JSON.parse(localStorage.getItem(K.active) || "null"); } catch { return null; } }
  function saveState(s) { localStorage.setItem(K.active, JSON.stringify(s || null)); }
  function clearState() { localStorage.removeItem(K.active); }

  // Firestore & auth (kompatibel med fb.* og compat SDK)
  const getDB = () => (window.fb?.db) || (window.firebase?.firestore?.() || null);
  const getUser = () => window.fb?.auth?.currentUser || window.firebase?.auth?.().currentUser || null;

  // Toast
  function toast(msg) {
    let t = $("#pb-toast");
    if (!t) { t = document.createElement("div"); t.id = "pb-toast"; t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 1600);
  }

  // FAB-avoid (flytt dock lenger opp når pluss-knappen finnes på høyre side)
  function pbUpdateFabAvoid() {
    const hasFab = !!document.querySelector(".add-book");
    document.body.classList.toggle("has-add-fab", hasFab);
  }

  // Dock
  function ensureDock() {
    let d = $("#pb-timer-dock");
    if (d) return d;
    d = document.createElement("div");
    d.id = "pb-timer-dock";
    d.className = "timer-dock right"; // side settes nedenfor

    d.innerHTML = `
      <div class="timer-time" id="pb-timer-time">00:00</div>

      <button class="timer-btn" id="pb-timer-start"  data-role="start"  title="Start">
        <div class="btn-inner"><i class="fa-solid fa-play"></i><span class="btn-label">Start</span></div>
      </button>
      <button class="timer-btn" id="pb-timer-pause"  data-role="pause"  title="Pause" disabled>
        <div class="btn-inner"><i class="fa-solid fa-pause"></i><span class="btn-label">Pause</span></div>
      </button>
      <button class="timer-btn" id="pb-timer-resume" data-role="resume" title="Resume" disabled>
        <div class="btn-inner"><i class="fa-solid fa-play"></i><span class="btn-label">Resume</span></div>
      </button>
      <button class="timer-btn primary" id="pb-timer-stop" data-role="stop" title="Stop" disabled>
        <div class="btn-inner"><i class="fa-solid fa-stop"></i><span class="btn-label">Stop</span></div>
      </button>

      <button class="timer-btn" id="pb-timer-toggle" data-role="toggle" title="Collapse / Expand">
        <div class="btn-inner"><i class="fa-regular fa-clock"></i></div>
      </button>
    `;
    document.body.appendChild(d);
    pbUpdateFabAvoid();
    return d;
  }

  // UI helpers
  let tick = null;
  function setButtons({ running, paused }) {
    $("#pb-timer-start").disabled = running;
    $("#pb-timer-pause").disabled = !running || paused;
    $("#pb-timer-resume").disabled = !paused;
    $("#pb-timer-stop").disabled = !running && !paused;
  }
  function drawTime(ms) { $("#pb-timer-time").textContent = fmt(ms / 1000); }
  function currentElapsedMs(s) {
    if (!s) return 0;
    const base = Number(s.accumMs || 0);
    return s.pausedAt ? base : base + Math.max(0, now() - Number(s.startAt || now()));
  }
  function loop() { const s = loadState(); drawTime(currentElapsedMs(s)); if (!s || s.pausedAt) stopLoop(); }
  function startLoop() { stopLoop(); tick = setInterval(loop, 250); }
  function stopLoop() { if (tick) { clearInterval(tick); tick = null; } }
  function pulse() { const d = ensureDock(); d.classList.remove("pulse"); void d.offsetWidth; d.classList.add("pulse"); }

  // Side / visible / collapsed
  function setSide(side) { ensureDock().classList.toggle("right", side === "right"); pbUpdateFabAvoid(); }
  function setVisible(flag) { ensureDock().classList.toggle("hidden", !flag); }
  function updateToggleIcon(collapsed) {
    const btn = $("#pb-timer-toggle");
    if (!btn) return;
    btn.innerHTML = collapsed
      ? `<div class="btn-inner"><i class="fa-regular fa-clock"></i></div>`
      : `<div class="btn-inner"><i class="fa-solid fa-chevron-down"></i></div>`;
  }
  function setCollapsed(flag) {
    ensureDock().classList.toggle("collapsed", !!flag);
    localStorage.setItem(K.coll, flag ? "1" : "0");
    updateToggleIcon(!!flag);
  }
  function toggleCollapsed(force) {
    const dock = ensureDock();
    const target = (typeof force === "boolean") ? force : !dock.classList.contains("collapsed");
    setCollapsed(target);
  }

  // Firestore write
  async function writeTimerSession({ startAt, endAt, minutes, bookId }) {
    const u = getUser(), _db = getDB(); if (!u || !_db) return;
    const day = toDayStr(startAt);
    const doc = {
      type: "timer",
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      minutes: Number(minutes) || 0,
      day, bookId: bookId || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await _db.collection("users").doc(u.uid).collection("sessions").add(doc);
    try { window.dispatchEvent(new CustomEvent("pb:sessions:updated")); } catch { }
  }

  // Lokal dagsteller for mål-toast
  function bumpLocalDay(minutes) {
    const dKey = "pb:timer:_localDay", vKey = "pb:timer:_localMin";
    const today = toDayStr(new Date());
    if (localStorage.getItem(dKey) !== today) { localStorage.setItem(dKey, today); localStorage.setItem(vKey, "0"); }
    const next = Number(localStorage.getItem(vKey) || "0") + Number(minutes || 0);
    localStorage.setItem(vKey, String(next));
    return next;
  }
  function checkGoalCongrats() {
    const goal = Number(localStorage.getItem(K.goal) || "20");
    const v = Number(localStorage.getItem("pb:timer:_localMin") || "0");
    const hitKey = "pb:timer:_congrats:" + toDayStr(new Date());
    if (goal > 0 && v >= goal && !localStorage.getItem(hitKey)) {
      toast(`Gratulerer! Dagens mål nådd (${v} m) 🎉`);
      localStorage.setItem(hitKey, "1");
    }
  }

  // Actions
  function start() {
    let s = loadState();
    if (s && !s.pausedAt) return;
    if (!s) s = { startAt: now(), accumMs: 0, pausedAt: null, bookId: null };
    else { s.startAt = now(); s.pausedAt = null; }
    saveState(s);
    startLoop();
    setButtons({ running: true, paused: false });
    pulse();
  }
  function pause() {
    const s = loadState(); if (!s || s.pausedAt) return;
    s.accumMs = currentElapsedMs(s);
    s.pausedAt = now();
    saveState(s);
    setButtons({ running: true, paused: true });
    drawTime(s.accumMs);
  }
  async function stopAndPersist() {
    const s = loadState(); if (!s) return;
    const endAt = now();
    const totalMs = s.pausedAt ? s.accumMs : currentElapsedMs(s);
    clearState();
    stopLoop();
    setButtons({ running: false, paused: false });
    drawTime(0);

    const min = Math.max(0, Math.round(totalMs / 60000));
    if (min >= 1) {
      await writeTimerSession({ startAt: s.startAt || endAt, endAt, minutes: min, bookId: s.bookId || null });
      bumpLocalDay(min);
      checkGoalCongrats();
    }
  }
  function resume() {
    const s = loadState(); if (!s || !s.pausedAt) return;
    s.startAt = now(); s.pausedAt = null;
    saveState(s);
    startLoop();
    setButtons({ running: true, paused: false });
    pulse();
  }

  // Bind
  function bind() {
    const dock = ensureDock();

    $("#pb-timer-start").addEventListener("click", start);
    $("#pb-timer-pause").addEventListener("click", pause);
    $("#pb-timer-resume").addEventListener("click", resume);
    $("#pb-timer-stop").addEventListener("click", stopAndPersist);

    // Collapse/expand
    $("#pb-timer-toggle").addEventListener("click", () => toggleCollapsed());
    dock.addEventListener("dblclick", (e) => {
      const isCtrl = e.target.closest(".timer-btn");
      if (isCtrl && isCtrl.id !== "pb-timer-toggle") return;
      e.preventDefault();
      toggleCollapsed();
    });
    document.addEventListener("keydown", (e) => {
      if ((e.key || "").toLowerCase() !== "c") return;
      const tag = (e.target.tagName || "").toLowerCase();
      if (["input", "textarea", "select"].includes(tag)) return;
      toggleCollapsed();
    });

    // Settings broadcasts
    window.addEventListener("pb:settings:update", (ev) => {
      const d = ev.detail || {};
      if (d.timer?.side) setSide(d.timer.side);
      if (typeof d.timer?.collapsed === "boolean") setCollapsed(d.timer.collapsed);
      if (d.timer?.toggleVisible) setVisible(ensureDock().classList.contains("hidden")); // toggle
      if (d.timer?.resetState) { clearState(); drawTime(0); setButtons({ running: false, paused: false }); }
    });

    // Init fra localStorage
    setSide(localStorage.getItem(K.side) || "right");
    setVisible(localStorage.getItem(K.vis) !== "0");
    setCollapsed(localStorage.getItem(K.coll) === "1");

    const s = loadState();
    if (s) {
      if (s.pausedAt) { drawTime(s.accumMs || 0); setButtons({ running: true, paused: true }); }
      else { startLoop(); setButtons({ running: true, paused: false }); }
    } else {
      setButtons({ running: false, paused: false });
    }

    // Observer for FAB-tilstedeværelse
    const obs = new MutationObserver(pbUpdateFabAvoid);
    obs.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", pbUpdateFabAvoid);
    pbUpdateFabAvoid();
  }

  document.addEventListener("DOMContentLoaded", bind);
})();
