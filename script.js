/* ============================================================
   PageBud • script.js
   - PWA update banner + Force Update
   - LocalStorage (books) + IndexedDB (book files)
   - Library (index.html): render, search, filter (+mini stars)
   - Add/Edit: form, 6★ med halv-steg, chips, quotes, cover extraction
   - Reader overlay: PDF/EPUB
   - Stats: mål + charts + range-knapper
   - Buddy Read: lokale grupper + “chat”
   ============================================================ */

/* ===========================
   Utilities
=========================== */
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const byId = id => document.getElementById(id);
const on   = (el, ev, fn, opt) => el && el.addEventListener(ev, fn, opt);

const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));
const uid   = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const LS_BOOKS_KEY    = "pb:books";
const LS_GOALS_KEY    = "pb:goals";
const LS_GROUPS_KEY   = "pb:groups";
const LS_CHAT_PREFIX  = "pb:chat:";

function loadBooks(){ try { return JSON.parse(localStorage.getItem(LS_BOOKS_KEY)||"[]"); } catch { return []; } }
function saveBooks(v){ localStorage.setItem(LS_BOOKS_KEY, JSON.stringify(v)); }

function getGoals(){ try { return JSON.parse(localStorage.getItem(LS_GOALS_KEY)||"{}"); } catch { return {}; } }
function setGoals(v){ localStorage.setItem(LS_GOALS_KEY, JSON.stringify(v)); }

function getGroups(){ try { return JSON.parse(localStorage.getItem(LS_GROUPS_KEY)||"[]"); } catch { return []; } }
function setGroups(v){ localStorage.setItem(LS_GROUPS_KEY, JSON.stringify(v)); }

function getChat(id){ try { return JSON.parse(localStorage.getItem(LS_CHAT_PREFIX+id)||"[]"); } catch { return []; } }
function setChat(id, arr){ localStorage.setItem(LS_CHAT_PREFIX+id, JSON.stringify(arr)); }

function qParam(name){ return new URL(location.href).searchParams.get(name); }
function escapeHTML(s){ return (s||"").replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

/* ===========================
   PWA: Service Worker + Update
=========================== */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").then((reg)=>{
    if (reg.waiting) showUpdateBanner(reg.waiting);
    reg.addEventListener("updatefound", ()=>{
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener("statechange", ()=>{
        if (nw.state==="installed" && navigator.serviceWorker.controller) showUpdateBanner(nw);
      });
    });
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", ()=>{
    if (refreshing) return;
    refreshing = true; location.reload();
  });
}

function showUpdateBanner(worker){
  if (byId("pbUpdateBanner")) return;
  const btn = document.createElement("button");
  btn.id = "pbUpdateBanner";
  btn.className = "pb-update-banner";
  btn.textContent = "✨ New version available — tap to update";
  btn.onclick = ()=> worker.postMessage({action:"skipWaiting"});
  document.body.appendChild(btn);
}

// Force update (med “nuclear” fallback)
window.forceUpdateNow = async () => {
  try{
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) { location.reload(); return; }
    if (reg.waiting) { reg.waiting.postMessage({action:"skipWaiting"}); return; }
    await reg.update();
    if (reg.waiting) { reg.waiting.postMessage({action:"skipWaiting"}); return; }
    await reg.unregister();
    location.reload();
  }catch{ location.reload(); }
};

/* ===========================
   IndexedDB for book files
=========================== */
const DB_NAME = "pagebud-db";
const DB_STORE = "files";

function idbOpen(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath:"id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbPutFile(id, type, blob){
  const db = await idbOpen();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(DB_STORE,"readwrite");
    tx.objectStore(DB_STORE).put({id, type, blob});
    tx.oncomplete = ()=> resolve(true);
    tx.onerror = ()=> reject(tx.error);
  });
}
async function idbGetFile(id){
  const db = await idbOpen();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(DB_STORE,"readonly");
    const r  = tx.objectStore(DB_STORE).get(id);
    r.onsuccess = ()=> resolve(r.result || null);
    r.onerror = ()=> reject(r.error);
  });
}
async function idbDeleteFile(id){
  const db = await idbOpen();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(DB_STORE,"readwrite");
    tx.objectStore(DB_STORE).delete(id);
    tx.oncomplete = ()=> resolve(true);
    tx.onerror = ()=> reject(tx.error);
  });
}

/* ===========================
   Stars (6 med halv)
=========================== */
function makeStars(container, initial = 0, onChange = ()=>{}){
  container.innerHTML = "";
  const total = 6;
  const state = { v: clamp(Number(initial)||0, 0, 6) };

  for (let i=1;i<=total;i++){
    const wrap = document.createElement("span");
    wrap.className = "star-container" + (i===6 ? " special" : "");
    wrap.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.74 1.59 8.267L12 18.896l-7.526 4.417 1.59-8.267L0 9.306l8.332-1.151z"/>
      </svg>
    `;
    container.appendChild(wrap);
  }

  function sync(){
    const whole = Math.floor(state.v);
    const half  = (state.v - whole) >= 0.5;
    $$(".star-container", container).forEach((node, idx)=>{
      const i = idx+1;
      if (i<=whole) node.style.opacity = "1";
      else if (i===whole+1 && half) node.style.opacity = "0.65";
      else node.style.opacity = "0.3";
    });
  }
  sync();

  $$(".star-container", container).forEach((wrap, idx)=>{
    const i = idx+1;
    wrap.addEventListener("click", (ev)=>{
      const rect = wrap.getBoundingClientRect();
      const leftHalf = (ev.clientX - rect.left) < rect.width/2;
      state.v = clamp(leftHalf ? i-0.5 : i, 0, 6);
      sync();
      onChange(state.v);
      if (i===6 && Math.round(state.v*2)/2 === 6){
        wrap.style.animation = "pb-pulse .3s ease";
        setTimeout(()=>wrap.style.animation="none", 320);
      }
    });
  });

  return {
    get value(){ return state.v; },
    set value(v){ state.v = clamp(Number(v)||0,0,6); sync(); }
  };
}

/* Mini-stjerner for kort (6 tegn, halv-støtte) */
function miniStarsHTML(v){
  v = Number(v||0);
  const whole = Math.floor(v);
  const half  = (v - whole) >= 0.5;
  let html = "";
  for (let i=1;i<=6;i++){
    if (i<=whole) html += `<span class="mini-star full">★</span>`;
    else if (i===whole+1 && half) html += `<span class="mini-star half">★</span>`;
    else html += `<span class="mini-star">★</span>`;
  }
  return html;
}

/* ===========================
   Chips
=========================== */
function enableChipGroup(container){
  if (!container) return;
  $$(".toggle-option", container).forEach(opt=>{
    opt.addEventListener("click", ()=> opt.classList.toggle("selected"));
  });
}
function getSelectedChips(container){
  return $$(".toggle-option.selected", container).map(el => el.dataset.val || el.textContent.trim());
}
function setSelectedChips(container, values){
  if (!container) return;
  $$(".toggle-option", container).forEach(el=>{
    const v = el.dataset.val || el.textContent.trim();
    el.classList.toggle("selected", values?.includes(v));
  });
}

/* ===========================
   Cover helpers
=========================== */
async function fileToDataURL(file){
  return new Promise((resolve,reject)=>{
    const fr = new FileReader();
    fr.onload = ()=> resolve(fr.result);
    fr.onerror = ()=> reject(fr.error);
    fr.readAsDataURL(file);
  });
}
async function extractCoverFromPDF(file){
  try{
    const data = await file.arrayBuffer();
    const pdf  = await pdfjsLib.getDocument({data}).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({scale: 1.5});
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({canvasContext: canvas.getContext("2d"), viewport}).promise;
    return canvas.toDataURL("image/jpeg", 0.8);
  }catch{ return null; }
}
async function extractCoverFromEPUB(file){
  try{
    const book = ePub(file);
    await book.ready;
    let url = await book.coverUrl();
    if (url){
      const res = await fetch(url);
      const blob = await res.blob();
      return await fileToDataURL(blob);
    }
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entry = Object.keys(zip.files).find(k=>{
      const low = k.toLowerCase();
      return low.includes("cover") && (low.endsWith(".jpg")||low.endsWith(".jpeg")||low.endsWith(".png"));
    }) || Object.keys(zip.files).find(k=>{
      const low = k.toLowerCase();
      return low.endsWith(".jpg")||low.endsWith(".jpeg")||low.endsWith(".png");
    });
    if (entry){
      const blob = await zip.files[entry].async("blob");
      return await fileToDataURL(blob);
    }
    return null;
  }catch{ return null; }
}
function guessMimeFromName(name=""){
  if (/\.pdf$/i.test(name)) return "application/pdf";
  if (/\.epub$/i.test(name)) return "application/epub+zip";
  return "application/octet-stream";
}

/* ===========================
   LIBRARY (index.html)
=========================== */
function initLibrary(){
  const grid   = byId("book-grid");
  const empty  = byId("empty-state");
  const search = byId("search-input");
  const addBtn = byId("add-book-btn");
  const chipRow= byId("filter-chips");

  on(addBtn, "click", ()=> location.href = "add-book.html");

  let filter = "all";
  chipRow && chipRow.addEventListener("click",(e)=>{
    const btn = e.target.closest(".category");
    if (!btn) return;
    $$(".category", chipRow).forEach(c=>c.classList.remove("active"));
    btn.classList.add("active");
    filter = btn.dataset.filter || "all";
    render();
  });
  on(search, "input", render);

  function render(){
    const books = loadBooks();
    const q = (search?.value||"").trim().toLowerCase();

    let list = books.slice();
    if (filter !== "all"){
      if (filter==="favorites") list = list.filter(b => (b.rating||0) >= 6);
      else list = list.filter(b => (b.status||"").toLowerCase()===filter);
    }
    if (q){
      list = list.filter(b =>
        (b.title||"").toLowerCase().includes(q) ||
        (b.author||"").toLowerCase().includes(q)
      );
    }

    if (!list.length){
      empty.style.display = "block";
      grid.innerHTML = "";
      return;
    }
    empty.style.display = "none";

    grid.innerHTML = list.map(b=>{
      const cover = b.coverDataURL
        ? `<img src="${b.coverDataURL}" alt="" class="book-cover">`
        : `<div class="book-cover"><i class="fas fa-book"></i></div>`;
      const stars = (b.rating||0) ? miniStarsHTML(b.rating) : "";
      return `
        <div class="book-card" data-id="${b.id}">
          ${cover}
          <div class="book-info">
            <div class="book-title">${escapeHTML(b.title||"Untitled")}</div>
            <div class="book-author">${escapeHTML(b.author||"")}</div>
            <div class="book-rating">${stars}</div>
          </div>
        </div>
      `;
    }).join("");

    $$(".book-card", grid).forEach(card=>{
      card.addEventListener("click", ()=>{
        const id = card.dataset.id;
        location.href = `edit-page.html?id=${encodeURIComponent(id)}`;
      });
    });
  }

  render();
}

/* ===========================
   ADD BOOK (add-book.html)
=========================== */
async function initAdd(){
  const coverBox  = byId("cover");
  const pickCover = byId("pickCover");
  const coverInput= byId("coverInput");

  const titleEl = byId("title");
  const authorEl= byId("author");
  const statusEl= byId("status");

  const starsWrap = byId("stars");
  const ratingVal = byId("ratingVal");
  const starCtl   = makeStars(starsWrap, 0, v=>{
    ratingVal.textContent = `Selected: ${v.toFixed(1)}`;
    ratingVal.dataset.value = v;
  });

  enableChipGroup(byId("genres"));
  enableChipGroup(byId("moods"));
  enableChipGroup(byId("tropes"));

  const quotesUI = wireQuoteUI();

  const fileBtn   = byId("upload-file-btn");
  const fileInput = byId("bookFile");
  const fileName  = byId("fileName");

  let coverDataURL = "";
  let pendingFile  = null;

  function showCover(url){
    coverBox.innerHTML = `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:12px">`;
  }

  on(pickCover, "click", ()=> coverInput.click());
  on(coverInput, "change", async ()=>{
    const f = coverInput.files?.[0];
    if (!f) return;
    coverDataURL = await fileToDataURL(f);
    showCover(coverDataURL);
  });

  on(fileBtn, "click", ()=> fileInput.click());
  on(fileInput, "change", async ()=>{
    const f = fileInput.files?.[0];
    if (!f) return;
    pendingFile = f;
    fileName.textContent = f.name;

    // Extract cover if possible
    let extracted = null;
    if (f.type==="application/pdf" || /\.pdf$/i.test(f.name)) extracted = await extractCoverFromPDF(f);
    else if (f.type==="application/epub+zip" || /\.epub$/i.test(f.name)) extracted = await extractCoverFromEPUB(f);

    if (extracted){ coverDataURL = extracted; showCover(extracted); }
  });

  on(byId("save-book-btn"), "click", async ()=>{
    const book = {
      id: uid(),
      title:  titleEl.value?.trim() || "Untitled",
      author: authorEl.value?.trim() || "",
      status: statusEl.value || "reading",
      rating: Number(ratingVal.dataset.value||0),
      genres: getSelectedChips(byId("genres")),
      moods:  getSelectedChips(byId("moods")),
      tropes: getSelectedChips(byId("tropes")),
      review: byId("review").value || "",
      notes:  byId("notes").value || "",
      quotes: getQuotesFromUI().map(q=>q), // via wireQuoteUI
      coverDataURL: coverDataURL || "",
      hasFile: !!pendingFile
    };

    const books = loadBooks(); books.push(book); saveBooks(books);
    if (pendingFile) await idbPutFile(book.id, pendingFile.type || guessMimeFromName(pendingFile.name), pendingFile);
    location.href = "index.html";
  });

  // wireQuoteUI impl (returns accessors used above)
  function wireQuoteUI(){
    const addBtn   = byId("addQuote");
    const textArea = byId("quoteText");
    const grid     = byId("quotes");

    on(addBtn, "click", ()=>{
      const txt = (textArea.value||"").trim();
      if (!txt) return;
      grid.appendChild(renderQuote(txt));
      textArea.value = "";
    });

    on(grid, "click", (e)=>{
      const act = e.target.closest(".quote-action");
      if (!act) return;
      e.target.closest(".quote-item")?.remove();
    });

    function renderQuote(txt){
      const item = document.createElement("div");
      item.className = "quote-item";
      item.innerHTML = `
        <div class="quote-text">${escapeHTML(txt)}</div>
        <div class="quote-actions"><span class="quote-action" data-act="del">Delete</span></div>
      `;
      return item;
    }
    function getQuotes(){ return $$(".quote-text", grid).map(n=>n.textContent.trim()).filter(Boolean); }

    window.getQuotesFromUI = getQuotes; // small bridge
    return { getQuotes };
  }
}

/* ===========================
   EDIT BOOK (edit-page.html)
=========================== */
async function initEdit(){
  const id = qParam("id");
  if (!id) { location.href="index.html"; return; }

  const books = loadBooks();
  const idx = books.findIndex(b=>b.id===id);
  if (idx===-1){ location.href="index.html"; return; }
  const book = books[idx];

  const coverBox  = byId("cover");
  const pickCover = byId("pickCover");
  const coverInput= byId("coverInput");

  const titleEl = byId("title");
  const authorEl= byId("author");
  const statusEl= byId("status");

  const starsWrap = byId("stars");
  const ratingVal = byId("ratingVal");
  const starCtl   = makeStars(starsWrap, book.rating||0, v=>{
    ratingVal.textContent = `Selected: ${v.toFixed(1)}`;
  });
  ratingVal.textContent = `Selected: ${(book.rating||0).toFixed(1)}`;

  enableChipGroup(byId("genres"));
  enableChipGroup(byId("moods"));
  enableChipGroup(byId("tropes"));
  setSelectedChips(byId("genres"), book.genres||[]);
  setSelectedChips(byId("moods"),  book.moods||[]);
  setSelectedChips(byId("tropes"), book.tropes||[]);

  byId("review").value = book.review||"";
  byId("notes").value  = book.notes||"";

  // quotes
  (function setQuotes(){
    const grid = byId("quotes");
    grid.innerHTML = "";
    (book.quotes||[]).forEach(txt=>{
      const item = document.createElement("div");
      item.className = "quote-item";
      item.innerHTML = `
        <div class="quote-text">${escapeHTML(txt)}</div>
        <div class="quote-actions"><span class="quote-action" data-act="del">Delete</span></div>
      `;
      grid.appendChild(item);
    });
    on(byId("addQuote"), "click", ()=>{
      const txt = (byId("quoteText").value||"").trim();
      if (!txt) return;
      const item = document.createElement("div");
      item.className = "quote-item";
      item.innerHTML = `
        <div class="quote-text">${escapeHTML(txt)}</div>
        <div class="quote-actions"><span class="quote-action" data-act="del">Delete</span></div>
      `;
      grid.appendChild(item);
      byId("quoteText").value = "";
    });
    on(grid, "click", (e)=>{
      const act = e.target.closest(".quote-action");
      if (act) e.target.closest(".quote-item")?.remove();
    });
  })();

  // populate fields
  titleEl.value = book.title||"";
  authorEl.value= book.author||"";
  statusEl.value= book.status||"reading";

  if (book.coverDataURL){
    coverBox.innerHTML = `<img src="${book.coverDataURL}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:12px">`;
  }
  on(pickCover,"click",()=> coverInput.click());
  on(coverInput,"change", async ()=>{
    const f = coverInput.files?.[0];
    if (!f) return;
    const dataURL = await fileToDataURL(f);
    book.coverDataURL = dataURL;
    coverBox.innerHTML = `<img src="${dataURL}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:12px">`;
  });

  // file handling
  const fileBtn   = byId("upload-file-btn");
  const fileInput = byId("bookFile");
  const fileName  = byId("fileName");
  on(fileBtn, "click", ()=> fileInput.click());
  on(fileInput, "change", async ()=>{
    const f = fileInput.files?.[0];
    if (!f) return;
    fileName.textContent = f.name;
    await idbPutFile(book.id, f.type || guessMimeFromName(f.name), f);
    book.hasFile = true;

    if (!book.coverDataURL){
      let extracted = null;
      if (f.type==="application/pdf" || /\.pdf$/i.test(f.name)) extracted = await extractCoverFromPDF(f);
      else if (f.type==="application/epub+zip" || /\.epub$/i.test(f.name)) extracted = await extractCoverFromEPUB(f);
      if (extracted){
        book.coverDataURL = extracted;
        coverBox.innerHTML = `<img src="${extracted}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:12px">`;
      }
    }
  });

  // actions
  on(byId("delete-book-btn"), "click", async ()=>{
    if (!confirm("Delete this book?")) return;
    books.splice(idx,1); saveBooks(books);
    await idbDeleteFile(book.id);
    location.href = "index.html";
  });

  on(byId("update-book-btn"), "click", ()=>{
    book.title  = titleEl.value?.trim()||"Untitled";
    book.author = authorEl.value?.trim()||"";
    book.status = statusEl.value||"reading";
    book.rating = starCtl.value;

    book.genres = getSelectedChips(byId("genres"));
    book.moods  = getSelectedChips(byId("moods"));
    book.tropes = getSelectedChips(byId("tropes"));

    book.review = byId("review").value||"";
    book.notes  = byId("notes").value||"";
    book.quotes = $$(".quote-text", byId("quotes")).map(n=>n.textContent.trim());

    books[idx] = book; saveBooks(books);
    alert("Updated.");
  });

  on(byId("read-book-btn"), "click", ()=> openReader(book.id, book.title));
}

/* ===========================
   Reader overlay
=========================== */
async function openReader(bookId, title){
  const overlay = byId("reader");
  const rTitle  = byId("rTitle");
  const rClose  = byId("rClose");
  const rAminus = byId("rAminus");
  const rAplus  = byId("rAplus");
  const rSlider = byId("rSlider");
  const rCount  = byId("rCount");
  const pdfWrap = byId("pdfWrap");
  const epubWrap= byId("epubWrap");
  const pdfCanvas = byId("pdfCanvas");
  const tapLeft = byId("tapLeft");
  const tapRight= byId("tapRight");

  rTitle.textContent = title || "Book";
  overlay.classList.add("show");
  overlay.setAttribute("aria-hidden","false");

  const rec = await idbGetFile(bookId);
  if (!rec){ alert("No file attached to this book yet."); return; }

  if ((rec.type||"").includes("pdf")){
    epubWrap.style.display="none"; pdfWrap.style.display="block";
    const pdf = await pdfjsLib.getDocument(await rec.blob.arrayBuffer()).promise;
    let pageNum = 1;
    const total = pdf.numPages;
    rSlider.max = total; rSlider.value = 1; rCount.textContent = `1 / ${total}`;

    async function render(){
      const page = await pdf.getPage(pageNum);
      const vw = pdfCanvas.parentElement.clientWidth;
      const scale = vw / page.getViewport({scale:1}).width;
      const viewport = page.getViewport({scale});
      pdfCanvas.width = viewport.width; pdfCanvas.height = viewport.height;
      await page.render({canvasContext: pdfCanvas.getContext("2d"), viewport}).promise;
      rSlider.value = pageNum; rCount.textContent = `${pageNum} / ${total}`;
    }
    await render();

    on(rSlider,"input", ()=>{ pageNum = Number(rSlider.value); render(); });
    on(tapLeft,"click", ()=>{ if (pageNum>1){ pageNum--; render(); }});
    on(tapRight,"click",()=>{ if (pageNum<total){ pageNum++; render(); }});
    on(rClose,"click", closeReader);

  } else {
    pdfWrap.style.display="none"; epubWrap.style.display="block";
    const book = ePub(rec.blob);
    const rendition = book.renderTo(epubWrap, { width:"100%", height:"100%" });
    await rendition.display();

    const count = book.spine?.length || 1;
    rSlider.max = count; rSlider.value = 1; rCount.textContent = `1 / ${count}`;

    rendition.on("relocated", (loc)=>{
      const idx = (loc?.start?.index ?? 0) + 1;
      rSlider.value = idx; rCount.textContent = `${idx} / ${count}`;
    });

    on(rSlider, "input", async ()=>{
      const idx = Number(rSlider.value)-1;
      const item = book.spine.get(idx);
      if (item) await rendition.display(item.cfiBase);
    });

    let fontScale = 100;
    on(rAplus,  "click", ()=>{ fontScale = clamp(fontScale+10, 60, 200); rendition.themes.fontSize(fontScale+"%"); });
    on(rAminus, "click", ()=>{ fontScale = clamp(fontScale-10, 60, 200); rendition.themes.fontSize(fontScale+"%"); });

    on(tapLeft, "click", ()=> rendition.prev());
    on(tapRight,"click", ()=> rendition.next());
    on(rClose,  "click", closeReader);
  }

  function closeReader(){
    overlay.classList.remove("show");
    overlay.setAttribute("aria-hidden","true");
  }
}

/* ===========================
   Stats (stats.html)
=========================== */
function initStats(){
  const books = loadBooks();

  // Ratings (all-time)
  const ratings = books.map(b=>Number(b.rating||0)).filter(n=>n>0);
  const avg = ratings.length ? (ratings.reduce((a,b)=>a+b,0)/ratings.length) : 0;
  byId("avg-rating").textContent = avg.toFixed(2);
  byId("total-ratings").textContent = String(ratings.length);
  byId("favorite-books").textContent = String(books.filter(b=> (b.rating||0) >= 6).length);

  // Goals (Minutes)
  const goals = getGoals();
  const minutesGoal = Number(goals.minutes?.year || 0);
  const minsNow = 0; // hook timer senere
  byId("goalInput").value = minutesGoal || "";
  byId("progress-goal").textContent = String(minutesGoal);
  byId("progress-mins").textContent = String(minsNow);
  const pct = minutesGoal>0 ? Math.round(minsNow*100/minutesGoal) : 0;
  byId("progress-percent").textContent = `${pct}% Complete`;
  byId("progress-fill").style.width = clamp(pct,0,100)+"%";
  byId("rt-sessions").textContent = "0";
  on(byId("goalSave"), "click", ()=>{
    const g = getGoals(); g.minutes = g.minutes || {};
    g.minutes.year = Number(byId("goalInput").value||0);
    setGoals(g); alert("Saved.");
  });

  // Goals (Books)
  const booksGoal = Number(goals.books?.year || 0);
  const finished = books.filter(b=> (b.status||"") === "finished").length;
  byId("bookGoalInput").value = booksGoal || "";
  byId("book-progress-goal").textContent = String(booksGoal);
  byId("book-progress-now").textContent = String(finished);
  const bpct = booksGoal>0 ? Math.round(finished*100/booksGoal) : 0;
  byId("book-progress-percent").textContent = `${bpct}% Complete`;
  byId("book-progress-fill").style.width = clamp(bpct,0,100)+"%";
  on(byId("bookGoalSave"), "click", ()=>{
    const g = getGoals(); g.books = g.books || {};
    g.books.year = Number(byId("bookGoalInput").value||0);
    setGoals(g); alert("Saved.");
  });

  // Range buttons og pickers
  const btns = { day:byId("btnDay"), week:byId("btnWeek"), month:byId("btnMonth"), year:byId("btnYear") };
  const picks= { day:byId("dayPick"), week:byId("weekPick"), month:byId("monthPick"), year:byId("yearPick") };

  // Populate pickers
  const now = new Date(), yNow = now.getFullYear();
  picks.year.innerHTML = ""; for (let y=yNow; y>=yNow-10; y--){ const o=document.createElement("option"); o.value=o.textContent=y; picks.year.appendChild(o); }
  picks.month.innerHTML= ""; for (let m=1;m<=12;m++){ const o=document.createElement("option"); o.value=m; o.textContent=new Date(yNow,m-1,1).toLocaleString(undefined,{month:"long"}); picks.month.appendChild(o); }
  picks.week.innerHTML = ""; for (let w=1; w<=53; w++){ const o=document.createElement("option"); o.value=w; o.textContent=`Week ${w}`; picks.week.appendChild(o); }

  function activate(which){
    Object.values(btns).forEach(b=>b.classList.remove("active"));
    btns[which].classList.add("active");
    picks.day.style.display   = which==="day"   ? "inline-block":"none";
    picks.week.style.display  = which==="week"  ? "inline-block":"none";
    picks.month.style.display = which==="month" ? "inline-block":"none";
    picks.year.style.display  = which==="year"  ? "inline-block":"none";
  }
  on(btns.day,  "click", ()=>activate("day"));
  on(btns.week, "click", ()=>activate("week"));
  on(btns.month,"click", ()=>activate("month"));
  on(btns.year, "click", ()=>activate("year"));
  activate("year");

  // Charts (lazy render når details åpnes)
  const chartOnce = (id, maker)=>{
    const details = byId(id).closest("details");
    if (!details) return;
    let rendered = false;
    details.addEventListener("toggle", ()=>{
      if (details.open && !rendered){ rendered = true; maker(); }
    });
  };

  chartOnce("chartGenres", ()=>{
    const ctx = byId("chartGenres");
    const counts = {};
    books.forEach(b=> (b.genres||[]).forEach(g=> counts[g]=(counts[g]||0)+1 ));
    new Chart(ctx, {
      type:"doughnut",
      data:{ labels:Object.keys(counts), datasets:[{ data:Object.values(counts) }] },
      options:{ plugins:{legend:{position:"bottom"}} }
    });
  });

  chartOnce("chartStatus", ()=>{
    const ctx = byId("chartStatus");
    const groups = {};
    books.forEach(b=>{ const s=(b.status||"unknown"); groups[s]=(groups[s]||0)+1; });
    new Chart(ctx, {
      type:"bar",
      data:{ labels:Object.keys(groups), datasets:[{ label:"Books", data:Object.values(groups) }] },
      options:{ responsive:true, scales:{ y:{ beginAtZero:true } } }
    });
  });

  chartOnce("chartAuthors", ()=>{
    const ctx = byId("chartAuthors");
    const counts = {};
    books.forEach(b=>{ const a=(b.author||"Unknown"); counts[a]=(counts[a]||0)+1; });
    const top = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10);
    new Chart(ctx, {
      type:"bar",
      data:{ labels: top.map(e=>e[0]), datasets:[{ label:"Books", data: top.map(e=>e[1]) }] },
      options:{ indexAxis:"y", scales:{ x:{ beginAtZero:true } } }
    });
  });
}

/* ===========================
   Buddy Read (local demo)
=========================== */
function initBuddy(){
  const books = loadBooks();
  const sel = byId("group-book");
  if (sel){
    sel.innerHTML = `<option value="">Choose a book from your library</option>` +
      books.map(b=>`<option value="${b.id}">${escapeHTML(b.title)} — ${escapeHTML(b.author||"")}</option>`).join("");
  }

  const listWrap = byId("groups-list");
  const empty = byId("empty-groups");
  const detail = byId("group-detail");

  const refresh = ()=>{
    const groups = getGroups();
    if (!groups.length){
      empty.style.display="block"; listWrap.innerHTML="";
    } else {
      empty.style.display="none";
      listWrap.innerHTML = groups.map(g=>{
        const bk = books.find(b=>b.id===g.bookId);
        const title = bk ? `${escapeHTML(bk.title)} — ${escapeHTML(bk.author||"")}` : "Unknown book";
        return `
          <div class="card" data-id="${g.id}">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
              <div>
                <div style="font-weight:800">${escapeHTML(g.name)}</div>
                <div class="muted" style="font-size:.9rem">${title}</div>
              </div>
              <button class="btn btn-secondary" data-act="open" style="width:auto;padding:8px 12px">Open</button>
            </div>
          </div>
        `;
      }).join("");
    }
  };
  refresh();
  on(byId("refresh-btn"), "click", refresh);

  on(byId("create-btn"), "click", ()=>{
    const name = byId("group-name").value.trim();
    const bookId = byId("group-book").value;
    const schedule = byId("group-schedule").value.trim();
    if (!name || !bookId){ alert("Give it a name and choose a book."); return; }
    const groups = getGroups();
    groups.push({ id:uid(), name, bookId, schedule, members:["You"], progress:0 });
    setGroups(groups);
    byId("group-name").value=""; byId("group-schedule").value=""; sel.value="";
    refresh();
  });

  on(listWrap, "click", (e)=>{
    const btn = e.target.closest("[data-act='open']");
    if (!btn) return;
    openGroup(btn.closest(".card")?.dataset.id);
  });

  function openGroup(groupId){
    const groups = getGroups();
    const g = groups.find(x=>x.id===groupId);
    if (!g) return;

    const book = loadBooks().find(b=>b.id===g.bookId);
    $("#detail-name").textContent = g.name;
    $("#detail-members").textContent = `Members: ${g.members.join(", ")}`;
    $("#detail-book-title").textContent = book ? book.title : "Unknown";
    $("#detail-book-author").textContent = book ? (book.author||"") : "";
    $("#detail-progress").style.width = `${clamp(g.progress||0,0,100)}%`;
    $("#detail-progress-text").textContent = `Group progress: ${clamp(g.progress||0,0,100)}%`;

    const chatList = byId("chat-messages");
    chatList.innerHTML = getChat(groupId).map(m=>`
      <div style="padding:6px 8px;margin-bottom:6px;background:#f7f7f7;border-radius:8px"><b>${escapeHTML(m.from)}:</b> ${escapeHTML(m.text)}</div>
    `).join("");

    detail.style.display="block";
    document.documentElement.scrollTop = 0;

    on(byId("send-btn"), "click", ()=>{
      const input = byId("chat-input");
      const text = input.value.trim();
      if (!text) return;
      const arr = getChat(groupId);
      arr.push({from:"You", text, ts:Date.now()});
      setChat(groupId, arr);
      input.value = "";
      chatList.innerHTML += `<div style="padding:6px 8px;margin-bottom:6px;background:#eaf4ff;border-radius:8px"><b>You:</b> ${escapeHTML(text)}</div>`;
      chatList.scrollTop = chatList.scrollHeight;
    });

    on(byId("start-session"), "click", ()=>{
      alert("Local demo: reading session started. (Real-time sync requires a backend later.)");
    });

    on(byId("back-to-list"), "click", ()=>{
      detail.style.display="none";
    }, { once:true });

    on(byId("delete-group"), "click", ()=>{
      if (!confirm("Delete this group?")) return;
      const gs = getGroups().filter(x=>x.id!==groupId);
      setGroups(gs);
      detail.style.display="none";
      refresh();
    }, { once:true });
  }
}

/* ===========================
   Router
=========================== */
document.addEventListener("DOMContentLoaded", ()=>{
  const ttl = (document.title||"").toLowerCase();
  if (ttl.includes("stats"))      initStats();
  else if (ttl.includes("buddy")) initBuddy();
  else if (ttl.includes("add"))   initAdd();
  else if (ttl.includes("edit"))  initEdit();
  else                            initLibrary();

  // touch shim
  document.body.addEventListener("touchstart", ()=>{}, {passive:true});
});
