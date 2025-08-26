/* =========================================================================
   PageBud • script.js  (PWA + UI)
   - SW-registrering med "Update Available" prompt
   - Force Update API (window.forceUpdateNow)
   - FAB (+) klikk fikset
   - Horisontal scroll-chips håndteres av CSS
   - Resten av app-logikken din er bevart (tilpass om du ønsker)
   ====================================================================== */

/* ---------------- PWA: Service Worker + Update prompt ----------------- */
(function setupSW(){
  if (!('serviceWorker' in navigator)) return;

  let latestReg = null;
  let pendingWorker = null;

  function showUpdatePrompt(worker){
    // Liten toast med knapper
    const wrap = document.createElement('div');
    wrap.style.cssText = `
      position: fixed; left: 50%; transform: translateX(-50%);
      bottom: calc(env(safe-area-inset-bottom, 0) + 16px);
      z-index: 9999; background: #1c1c1c; color: #fff;
      padding: 12px; border-radius: 14px; box-shadow: 0 6px 20px rgba(0,0,0,.35);
      font: 600 14px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      display:flex; gap:12px; align-items:center;
    `;
    wrap.innerHTML = `
      <span>Update available</span>
      <button id="pbUpdNow" style="background:#6C63FF;color:#fff;border:0;border-radius:10px;padding:8px 10px;font-weight:700;cursor:pointer">Update now</button>
      <button id="pbUpdLater" style="background:#fff;color:#1c1c1c;border:0;border-radius:10px;padding:8px 10px;font-weight:700;cursor:pointer">Later</button>
    `;
    document.body.appendChild(wrap);

    const cleanup = ()=> wrap.remove();
    document.getElementById('pbUpdLater').onclick = cleanup;
    document.getElementById('pbUpdNow').onclick = ()=>{
      try { worker.postMessage({ type:'SKIP_WAITING' }); } catch {}
      cleanup();
    };
  }

  navigator.serviceWorker.register('./sw.js', { scope: './' })
    .then(reg => {
      latestReg = reg;

      // Oppdage ny worker
      reg.addEventListener('updatefound', () => {
        pendingWorker = reg.installing;
        pendingWorker?.addEventListener('statechange', () => {
          if (pendingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // Ny versjon klar – vis prompt
            showUpdatePrompt(pendingWorker);
          }
        });
      });

      // Pek på en allerede ventende worker (side reloadet før prompt)
      if (reg.waiting) {
        pendingWorker = reg.waiting;
        showUpdatePrompt(pendingWorker);
      }
    })
    .catch(()=>{ /* ignore */ });

  // Når ny SW tar over: reload
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });

  // Valgfritt: hvis SW sender "SW_ACTIVATED", kan vi vise lite hint
  navigator.serviceWorker.addEventListener('message', (e)=>{
    if (e.data && e.data.type === 'SW_ACTIVATED') {
      // could log or toast
    }
  });

  // Force Update-API for UI
  async function checkForUpdatesNow(){
    try {
      const reg = latestReg || await navigator.serviceWorker.getRegistration();
      if (!reg) { location.reload(); return; }
      await reg.update();
      const w = reg.waiting || reg.installing;
      if (w) {
        // Update prompt – men vi kan også auto-skippe om du vil
        showUpdatePrompt(w);
      } else {
        // Ingen ny – men ta en reload for å treffe ferske assets
        location.reload();
      }
    } catch {
      location.reload();
    }
  }
  window.forceUpdateNow = checkForUpdatesNow;
})();

/* -------------------- Små DOM hjelpere -------------------- */
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);

/* ---------------- FAB: Add Book (robust bind) -------------- */
(function bindFab(){
  const btn = document.getElementById('add-book-btn');
  if (!btn) return;
  const go = ()=> location.href = 'add-book.html';

  btn.setAttribute('role','button');
  btn.setAttribute('aria-label','Add Book');
  btn.tabIndex = 0;

  ['click','pointerup','touchend'].forEach(ev=>{
    btn.addEventListener(ev, (e)=>{
      e.preventDefault(); e.stopPropagation(); go();
    }, {passive:false});
  });
  btn.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter' || e.key === ' ') go();
  });
})();

/* ----------------- Din eksisterende app-kode ----------------
   NB: Under her setter du resten av app-logikken (render library,
   filters, stats-helpers, reader, osv.). Hvis du allerede har mye
   i script.js, legg det videre her.  Jeg lar selve bibliotek-logikken
   din stå urørt, siden du har den fra før – denne fila erstatter
   SW/force-update og FAB-klikking.
---------------------------------------------------------------- */
