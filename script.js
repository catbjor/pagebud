/* =========================================================================
   PageBud • script.js
   - covers/files persist (IndexedDB)
   - 6-star rating with darker 6th + pulse
   - quotes (text + gallery)
   - in-app PDF/EPUB reader with progress + resume
   - delete working
   - finishedAt timestamp when status becomes “Finished”
   - helpers exported for Stats page
   ====================================================================== */
   // Put near the top of script.js so all pages get it
(function setupPWAUpdates(){
  if (!('serviceWorker' in navigator)) return;

  // Optional: nudge the SW to check hourly
  navigator.serviceWorker.getRegistration().then(reg => {
    if (reg) setInterval(() => reg.update(), 60 * 60 * 1000);
  });

  let shown = false;
  function showUpdateBar(){
    if (shown) return; shown = true;
    const bar = document.createElement('div');
    bar.className = 'pb-update-banner';
    bar.innerHTML = `
      <span>Update available</span>
      <button class="pb-update-btn">Reload</button>
    `;
    document.body.appendChild(bar);
    requestAnimationFrame(()=> bar.classList.add('show'));
    bar.querySelector('.pb-update-btn').onclick = () => location.reload();
  }

  // Fired when the new SW takes control
  navigator.serviceWorker.addEventListener('controllerchange', showUpdateBar);

  // Fired from the SW's activate broadcast (see sw.js)
  navigator.serviceWorker.addEventListener('message', (e)=>{
    if (e.data && e.data.type === 'SW_ACTIVATED') showUpdateBar();
  });
})();


/* ----------------------------- helpers -------------------------------- */
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const on = (el, ev, fn) => el && el.addEventListener(ev, fn, {passive:true});
const setText = (el, t) => { if (el) el.textContent = t; };
const escapeHTML = s => String(s).replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));

/* LocalStorage wrapper */
const LS = {
  get(k, d=null){ try{ const v = localStorage.getItem(k); return v?JSON.parse(v):d; }catch{ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} }
};

/* Ensure bottom padding equals bottom nav height so buttons never hide */
function applyBottomNavPadding(){
  const nav = document.querySelector('.bottom-nav');
  const app = document.querySelector('.app-container');
  if (!nav || !app) return;
  const h = nav.offsetHeight || 0;
  app.style.setProperty('--pb-bottompad', `${h+8}px`);
  app.style.paddingBottom = `calc(var(--pb-bottompad, ${h+8}px))`;
}
window.addEventListener('resize', applyBottomNavPadding);

/* ----------------------- IndexedDB for files -------------------------- */
const PBFiles = (() => {
  let dbp;
  function open(){
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject)=>{
      const req = indexedDB.open('pagebud-db', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('files')) {
          db.createObjectStore('files', { keyPath:'bookId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
    return dbp;
  }
  async function put(bookId, blob, name){
    const db = await open();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction('files','readwrite');
      tx.objectStore('files').put({ bookId, blob, name, updatedAt: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror    = () => reject(tx.error);
    });
  }
  async function get(bookId){
    const db = await open();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction('files','readonly');
      const rq = tx.objectStore('files').get(bookId);
      rq.onsuccess = () => resolve(rq.result || null);
      rq.onerror   = () => reject(rq.error);
    });
  }
  async function del(bookId){
    const db = await open();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction('files','readwrite');
      tx.objectStore('files').delete(bookId);
      tx.oncomplete = () => resolve(true);
      tx.onerror    = () => reject(tx.error);
    });
  }
  return { put, get, del };
})();

/* ------------------------- globals & boot ------------------------------ */
let books = LS.get('pb:books', []);

function boot(){
  applyBottomNavPadding();
  const isHome = !!document.getElementById('book-grid');
  const isAdd  = !!(document.getElementById('save-book-btn') || document.getElementById('save'));
  const isEdit = !!(document.getElementById('update-book-btn') || document.getElementById('update'));
  if (isHome) initHomePage();
  if (isAdd)  initAddPage();
  if (isEdit) initEditPage();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

/* Exports for stats page */
window.getAllBooks = () => LS.get('pb:books', []);
window.exportBooksJSON = function(){
  const data = JSON.stringify(window.getAllBooks(), null, 2);
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([data], {type:'application/json'})),
    download: 'pagebud-books.json'
  });
  a.click();
};
window.exportBooksCSV = function(){
  const rows = [['id','title','author','status','rating','fileName','createdAt','finishedAt']];
  window.getAllBooks().forEach(b=>rows.push([
    b.id,b.title,b.author,b.status,b.rating,b.fileName||'',b.createdAt||'',b.finishedAt||''
  ]));
  const csv = rows.map(r=>r.map(x=>`"${String(x??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], {type:'text/csv'})),
    download: 'pagebud-books.csv'
  });
  a.click();
};

/* ======================================================================
   INDEX.HTML
   ====================================================================== */
function initHomePage(){
  renderLibrary();
  wireFilters();
  on(document.getElementById('add-book-btn'),'click',()=>location.href='add-book.html');
}

function renderLibrary(){
  const grid  = document.getElementById('book-grid');
  const empty = document.getElementById('empty-state');
  grid.innerHTML = '';

  if (!books.length){ if (empty) empty.style.display='block'; return; }
  if (empty) empty.style.display='none';

  books.forEach(b=>{
    const card = document.createElement('div');
    card.className = 'book-card';
    card.dataset.id     = b.id;
    card.dataset.status = (b.status || '').toLowerCase();
    card.dataset.rating = b.rating || 0;

    const style = coverStyleFromValue(b.cover);
    const stars = renderStars(+b.rating || 0);

    card.innerHTML = `
      <div class="book-cover" style="${style}">${style ? '' : '<i class="fas fa-book"></i>'}</div>
      <div class="book-info">
        <div class="book-title">${escapeHTML(b.title||'')}</div>
        <div class="book-author">${escapeHTML(b.author||'')}</div>
        <div class="book-rating">${stars}</div>
      </div>
    `;
    grid.appendChild(card);
  });

  $$('.book-card', grid).forEach(c=>{
    on(c,'click',()=>location.href=`edit-page.html?id=${encodeURIComponent(c.dataset.id)}`);
  });

  applyFilters();
}

/* cover style from stored value */
function coverStyleFromValue(val){
  if (!val) return '';
  if (typeof val === 'string' && val.startsWith('background-image')) {
    return `${val}; background-size:cover; background-position:center`;
  }
  return `background-image:url('${val}'); background-size:cover; background-position:center`;
}

function renderStars(r){
  let out = '';
  for (let i=1;i<=6;i++){
    const full = i<=Math.floor(r);
    out += `<span class="star${i===6?' special':''}"><i class="${full?'fas':'far'} fa-star"></i></span>`;
  }
  return out;
}

/* filters */
let currentCategory = 'all';
function wireFilters(){
  $$('.categories .category').forEach(chip=>{
    on(chip,'click', function(){
      $$('.categories .category').forEach(c=>c.classList.remove('active'));
      this.classList.add('active');
      currentCategory = this.dataset.filter || 'all';
      applyFilters();
    });
  });
  on(document.getElementById('search-input'), 'input', applyFilters);
}
function applyFilters(){
  const term = (document.getElementById('search-input')?.value || '').toLowerCase();
  let visible = 0;
  $$('.book-card').forEach(card=>{
    const status = card.dataset.status||'';
    const rating = +card.dataset.rating || 0;
    const title  = card.querySelector('.book-title')?.textContent.toLowerCase() || '';
    const author = card.querySelector('.book-author')?.textContent.toLowerCase() || '';
    const catOK = currentCategory==='all' ? true : (currentCategory==='favorites' ? rating>=5 : status===currentCategory);
    const txtOK = !term || title.includes(term) || author.includes(term);
    const show  = catOK && txtOK;
    card.style.display = show ? 'block' : 'none';
    if (show) visible++;
  });
  const empty = document.getElementById('empty-state');
  if (empty) empty.style.display = visible ? 'none' : 'block';
}

/* ======================================================================
   ADD-BOOK.HTML
   ====================================================================== */
function initAddPage(){
  applyBottomNavPadding();

  const cEl = document.getElementById('cover');
  const cIcon = document.getElementById('coverIcon');
  let coverData = ''; // persistent data URL

  on(document.getElementById('pickCover'),'click',()=>document.getElementById('coverInput').click());
  on(document.getElementById('coverInput'),'change', async (e)=>{
    const f = e.target.files?.[0]; if (!f) return;
    coverData = await fileToDataURL(f);
    paintCover(cEl, cIcon, coverData);
  });

  wireStars(document.getElementById('stars'), document.getElementById('ratingVal'));

  /* Quotes */
  const QUOTES = [];
  const qList = document.getElementById('quotes');
  on(document.getElementById('addQuote'),'click',()=>{
    const t = (document.getElementById('quoteText').value||'').trim();
    if (!t) return;
    QUOTES.unshift({type:'text', content:t});
    document.getElementById('quoteText').value='';
    renderQuotesList(QUOTES, qList);
  });
  on(document.getElementById('qGallery'),'click',()=>{
    const inp = document.createElement('input');
    inp.type='file'; inp.accept='image/*'; inp.style.display='none';
    document.body.appendChild(inp);
    inp.click();
    inp.onchange = async (e)=>{
      const f = e.target.files?.[0]; if(!f){ inp.remove(); return; }
      const url = await fileToDataURL(f);
      QUOTES.unshift({type:'image', content:url});
      renderQuotesList(QUOTES, qList);
      inp.remove();
    };
  });
  on(qList,'click',e=>{
    const del = e.target.closest('.delete'); if (!del) return;
    const wrap = del.closest('[data-idx]'); if (!wrap) return;
    const idx = +wrap.dataset.idx;
    QUOTES.splice(idx,1);
    renderQuotesList(QUOTES, qList);
  });

  /* Chips (optional if present) */
  $$('#genres .toggle-option').forEach(ch => on(ch,'click',()=>ch.classList.toggle('selected')));
  $$('#moods  .toggle-option').forEach(ch => on(ch,'click',()=>ch.classList.toggle('selected')));

  /* File upload + auto-cover */
  let localFile = null;
  const pickBtn   = document.getElementById('upload-file-btn');
  const fileInput = document.getElementById('bookFile');
  const fileName  = document.getElementById('fileName');

  if (pickBtn && fileInput){
    on(pickBtn,'click',()=>fileInput.click());
    on(fileInput,'change', async (e)=>{
      const f = e.target.files?.[0]; if (!f) return;
      localFile = f; setText(fileName, f.name);
      const auto = await autoExtractCoverDataURL(f);
      if (auto){ coverData = auto; paintCover(cEl, cIcon, coverData); }
    });
  }

  /* Save book */
  const saveBtn = document.getElementById('save-book-btn') || document.getElementById('save');
  on(saveBtn,'click', async ()=>{
    const title  = document.getElementById('title').value.trim();
    const author = document.getElementById('author').value.trim();
    if (!title || !author) return alert('Please fill in title and author');

    const rating = +(document.getElementById('ratingVal').dataset.value || 0);
    const status = document.getElementById('status').value;

    const genres = $$('#genres .toggle-option.selected').map(x=>x.textContent.trim());
    const moods  = $$('#moods  .toggle-option.selected').map(x=>x.textContent.trim());

    const book = {
      id: String(Date.now()),
      title, author,
      status,
      cover: coverData || '',
      rating,
      review: document.getElementById('review').value,
      notes:  document.getElementById('notes').value,
      genres, moods,
      quotes: QUOTES,
      fileName: localFile ? localFile.name : null,
      createdAt: new Date().toISOString(),
      finishedAt: status.toLowerCase()==='finished' ? new Date().toISOString() : null
    };

    const all = LS.get('pb:books', []); all.push(book); LS.set('pb:books', all); books = all;

    if (localFile){
      try { await PBFiles.put(book.id, localFile, localFile.name); } catch(e){ console.warn('IDB put failed', e); }
    }

    location.href = 'index.html';
  });
}

/* ======================================================================
   EDIT-PAGE.HTML + In-app Reader
   ====================================================================== */
function initEditPage(){
  applyBottomNavPadding();

  const id = new URL(location.href).searchParams.get('id');
  if (!id) return location.replace('index.html');

  let list = LS.get('pb:books', []);
  let book = list.find(b=>b.id===id);
  if (!book) return location.replace('index.html');

  /* Cover */
  let coverData = book.cover || '';
  const cEl = document.getElementById('cover');
  const cIcon = document.getElementById('coverIcon');
  paintCover(cEl, cIcon, coverData);

  /* Fields */
  $('#title').value  = book.title || '';
  $('#author').value = book.author || '';
  $('#status').value = book.status || 'reading';
  $('#review').value = book.review || '';
  $('#notes').value  = book.notes || '';
  wireStars($('#stars'), $('#ratingVal'), +book.rating || 0);

  /* Chips if present */
  $$('#genres .toggle-option').forEach(ch=>{
    if ((book.genres||[]).includes(ch.textContent.trim())) ch.classList.add('selected');
    on(ch,'click',()=>ch.classList.toggle('selected'));
  });
  $$('#moods  .toggle-option').forEach(ch=>{
    if ((book.moods||[]).includes(ch.textContent.trim())) ch.classList.add('selected');
    on(ch,'click',()=>ch.classList.toggle('selected'));
  });

  /* Change cover */
  on($('#pickCover'),'click',()=>$('#coverInput').click());
  on($('#coverInput'),'change', async (e)=>{
    const f = e.target.files?.[0]; if (!f) return;
    coverData = await fileToDataURL(f);
    paintCover(cEl, cIcon, coverData);
  });

  /* Quotes per-book */
  const QKEY = (bid)=>`pb:quotes:${bid}`;
  if (Array.isArray(book.quotes) && !LS.get(QKEY(id))) LS.set(QKEY(id), book.quotes);
  renderQuotesList(LS.get(QKEY(id), []), $('#quotes'));

  on($('#addQuote'),'click',()=>{
    const t = ($('#quoteText').value||'').trim(); if (!t) return;
    const arr = LS.get(QKEY(id), []); arr.unshift({type:'text', content:t});
    LS.set(QKEY(id), arr);
    $('#quoteText').value='';
    renderQuotesList(arr, $('#quotes'));
  });
  on($('#quotes'),'click',e=>{
    const del = e.target.closest('.delete'); if (!del) return;
    const wrap = del.closest('[data-idx]'); if (!wrap) return;
    const idx = +wrap.dataset.idx;
    const arr = LS.get(QKEY(id), []);
    arr.splice(idx,1); LS.set(QKEY(id), arr);
    renderQuotesList(arr, $('#quotes'));
  });

  /* Show stored file name if exists */
  PBFiles.get(id).then(stored=>{
    if (stored?.name) setText($('#fileName'), stored.name);
  }).catch(()=>{});

  /* Upload/replace file */
  let localFile = null;
  const pickBtn   = $('#upload-file-btn');
  const fileInput = $('#bookFile');
  if (pickBtn && fileInput){
    on(pickBtn,'click',()=>fileInput.click());
    on(fileInput,'change', async (e)=>{
      const f = e.target.files?.[0]; if (!f) return;
      localFile = f;
      setText($('#fileName'), f.name);
      try { await PBFiles.put(id, f, f.name); } catch(e){ console.warn('IDB put failed', e); }
      if (!coverData){
        const auto = await autoExtractCoverDataURL(f);
        if (auto){ coverData = auto; paintCover(cEl, cIcon, coverData); }
      }
    });
  }

  /* Update (with finishedAt stamping) */
  on($('#update-book-btn') || $('#update'), 'click', () => {
    const idx = list.findIndex(b => b.id === id);
    if (idx < 0) return;

    const newStatus = $('#status').value;

    const updated = {
      ...book,
      title:  $('#title').value.trim(),
      author: $('#author').value.trim(),
      status: newStatus,
      review: $('#review').value,
      notes:  $('#notes').value,
      rating: +($('#ratingVal').dataset.value || 0),
      cover:  coverData || '',
      genres: $$('#genres .toggle-option.selected').map(x=>x.textContent.trim()),
      moods:  $$('#moods  .toggle-option.selected').map(x=>x.textContent.trim()),
      fileName: localFile ? localFile.name : (book.fileName || null),
      finishedAt: book.finishedAt || null
    };

    if (newStatus.toLowerCase() === 'finished' && !book.finishedAt) {
      updated.finishedAt = new Date().toISOString();
    } else if (newStatus.toLowerCase() !== 'finished') {
      updated.finishedAt = null; // remove this line if you prefer to keep old date
    }

    list[idx] = updated;
    LS.set('pb:books', list);
    books = list;
    book  = updated;

    alert('Updated!');
  });

  /* Delete */
  on($('#delete-book-btn'),'click', async ()=>{
    if (!confirm('Delete this book?')) return;
    const idx = list.findIndex(b=>b.id===id);
    if (idx>=0){ list.splice(idx,1); LS.set('pb:books', list); books=list; }
    try { await PBFiles.del(id); } catch {}
    location.href = 'index.html';
  });

  /* Read button -> open in-app overlay */
  on($('#read-book-btn') || $('#read'),'click', async ()=>{
    await openReaderOverlay({ bookId:id, title: book.title, fileName: book.fileName });
  });
}

/* ======================================================================
   Reader Overlay (PDF/EPUB)
   ====================================================================== */
async function openReaderOverlay({ bookId, title, fileName }) {
  const R = {
    root: $('#reader'),
    title: $('#rTitle'),
    close: $('#rClose'),
    body:  $('#rBody'),
    slider: $('#rSlider'),
    count:  $('#rCount'),
    Aplus:  $('#rAplus'),
    Aminus: $('#rAminus'),
    pdfWrap: $('#pdfWrap'),
    epubWrap: $('#epubWrap'),
    canvas: $('#pdfCanvas'),
    tapLeft: $('#tapLeft'),
    tapRight: $('#tapRight'),
  };
  if (!R.root) return alert('Reader UI not included on this page.');

  // show overlay
  R.title.textContent = title || 'Reader';
  R.root.classList.add('show');
  document.body.classList.add('reader-body--lock');

  // timer logging
  let t0 = Date.now();

  function closeAll(){
    R.root.classList.remove('show');
    document.body.classList.remove('reader-body--lock');
    try{
      const log = LS.get('pb:reading-log', []);
      const minutes = Math.max(1, Math.round((Date.now()-t0)/60000));
      log.push({ bookId, minutes, startedAt:new Date(t0).toISOString(), endedAt:new Date().toISOString() });
      LS.set('pb:reading-log', log);
    }catch{}
    document.removeEventListener('keydown', keyNav);
  }
  on(R.close,'click',closeAll);

  const stored = await PBFiles.get(bookId);
  if (!stored?.blob){ alert('Pick a local PDF/EPUB first.'); return; }
  const ext = (stored.name||fileName||'').toLowerCase().split('.').pop();
  const file = new File([stored.blob], stored.name || fileName || 'book');

  let mode=null, pdfDoc=null, pdfPage=1, rendition=null, bookObj=null, epubTotal=0;

  function keyNav(e){
    if (e.key==='Escape') closeAll();
    if (e.key==='ArrowLeft') prev();
    if (e.key==='ArrowRight') next();
  }
  document.addEventListener('keydown', keyNav);

  /* PDF */
  const pdfKey = `pb:pdf:${bookId}`;
  async function openPDF(file){
    mode='pdf';
    R.epubWrap.style.display='none'; R.pdfWrap.style.display='flex';

    const buf = await file.arrayBuffer();
    pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;

    const saved = LS.get(pdfKey, null);
    pdfPage = Math.min(pdfDoc.numPages, Math.max(1, saved?.page || 1));

    R.slider.min = 1;
    R.slider.max = pdfDoc.numPages;
    R.slider.value = pdfPage;

    await renderPDF();
  }
  async function renderPDF(){
    const page = await pdfDoc.getPage(pdfPage);

    const avail = R.body.clientWidth - 40;
    const base  = page.getViewport({ scale: 1 });
    const scale = Math.min(avail / base.width, 2.0);
    const viewport = page.getViewport({ scale });

    const dpr = window.devicePixelRatio || 1;
    const ctx = R.canvas.getContext('2d', { alpha: true });

    R.canvas.width  = Math.floor(viewport.width * dpr);
    R.canvas.height = Math.floor(viewport.height * dpr);
    R.canvas.style.width  = viewport.width + 'px';
    R.canvas.style.height = viewport.height + 'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);

    await page.render({ canvasContext: ctx, viewport }).promise;

    setText(R.count, `${pdfPage} / ${pdfDoc.numPages}`);
    try { LS.set(pdfKey, { page: pdfPage, total: pdfDoc.numPages, t: Date.now() }); } catch {}
  }

  /* EPUB */
  const epubKey = `pb:epub-cfi:${bookId}`;
  async function openEPUB(file){
    mode='epub';
    R.pdfWrap.style.display='none'; R.epubWrap.style.display='block';

    const buf = await file.arrayBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type:'application/epub+zip' }));

    bookObj = ePub(url);
    rendition = bookObj.renderTo('epubWrap', { width:'100%', height:'100%', spread:'none', manager:'continuous' });
    rendition.themes.default({ body:{ background:'#111', color:'#eee', 'font-size':'18px' } });

    const savedCFI = LS.get(epubKey, null);
    await rendition.display(savedCFI || undefined);

    await bookObj.ready;
    await bookObj.locations.generate(1200);
    epubTotal = bookObj.locations.length();

    R.slider.min = 1;
    R.slider.max = Math.max(1, epubTotal);
    if (savedCFI){
      const loc = bookObj.locations.locationFromCfi(savedCFI) || 1;
      R.slider.value = loc;
      setText(R.count, `${loc} / ${epubTotal}`);
    } else {
      R.slider.value = 1;
      setText(R.count, `1 / ${epubTotal}`);
    }

    rendition.on('relocated', (location)=>{
      const cfi = location?.start?.cfi;
      if (!cfi) return;
      const loc = bookObj.locations.locationFromCfi(cfi) || 1;
      R.slider.value = loc;
      setText(R.count, `${loc} / ${epubTotal}`);
      try { LS.set(epubKey, cfi); } catch {}
    });
  }

  /* zoom text size for EPUB only (A-/A+) */
  on($('#rAplus'),'click',()=>{
    if (mode!=='epub' || !rendition) return;
    rendition.themes.fontSize(incrementFont(rendition.themes.fontSize(), +2));
  });
  on($('#rAminus'),'click',()=>{
    if (mode!=='epub' || !rendition) return;
    rendition.themes.fontSize(incrementFont(rendition.themes.fontSize(), -2));
  });
  function incrementFont(curr, delta){
    const n = parseInt(String(curr||'18'),10) || 18;
    return Math.max(14, Math.min(28, n+delta)) + 'px';
  }

  /* slider + nav */
  R.slider.oninput = ()=>{
    if (mode==='pdf' && pdfDoc){
      pdfPage = Math.max(1, Math.min(Number(R.slider.value), pdfDoc.numPages));
      renderPDF();
    } else if (mode==='epub' && bookObj && epubTotal){
      const loc = Math.max(1, Math.min(epubTotal, Number(R.slider.value)));
      const cfi = bookObj.locations.cfiFromLocation(loc);
      if (cfi) rendition.display(cfi);
    }
  };
  function prev(){ if (mode==='pdf'){ if (pdfPage>1){ pdfPage--; R.slider.value=pdfPage; renderPDF(); } } else if (rendition){ rendition.prev(); } }
  function next(){ if (mode==='pdf'){ if (pdfPage<Number(R.slider.max)){ pdfPage++; R.slider.value=pdfPage; renderPDF(); } } else if (rendition){ rendition.next(); } }
  on(R.tapLeft,  'click', prev);
  on(R.tapRight, 'click', next);

  /* Start proper reader */
  if (ext === 'pdf') await openPDF(file);
  else if (ext === 'epub') await openEPUB(file);
  else alert('Unsupported file. Use PDF or EPUB.');
}

/* ======================================================================
   Cover helpers (persist as Data URL)
   ====================================================================== */
function paintCover(el, iconEl, dataUrl){
  if (!el) return;
  if (dataUrl){
    el.style.backgroundImage = `url('${dataUrl}')`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    if (iconEl) iconEl.style.display='none';
  } else {
    el.style.backgroundImage = '';
    if (iconEl) iconEl.style.display='';
  }
}
async function fileToDataURL(file){
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* Auto-cover that returns a Data URL */
async function autoExtractCoverDataURL(file){
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext==='pdf')  return await pdfCoverDataURL(file);
  if (ext==='epub') return await epubCoverDataURL(file);
  return '';
}
async function pdfCoverDataURL(file){
  try{
    if (!window.pdfjsLib) return '';
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({data:buf}).promise;
    const page = await pdf.getPage(1);
    const vp   = page.getViewport({scale:1.3});
    const c = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.floor(vp.width*dpr); c.height = Math.floor(vp.height*dpr);
    const ctx = c.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
    await page.render({canvasContext:ctx, viewport:vp}).promise;
    return c.toDataURL('image/jpeg', 0.9);
  }catch(e){ console.warn('pdf cover fail', e); return ''; }
}
async function epubCoverDataURL(file){
  try{
    if (window.JSZip){
      const buf = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(buf);
      const cx  = await zip.file('META-INF/container.xml').async('string');
      const opfPath = new DOMParser().parseFromString(cx,'text/xml')
                        .querySelector('rootfile')?.getAttribute('full-path');
      if (opfPath){
        const opf = await zip.file(opfPath).async('string');
        const doc = new DOMParser().parseFromString(opf,'text/xml');
        const manifest = {};
        doc.querySelectorAll('manifest > item').forEach(it => manifest[it.getAttribute('id')] = it.getAttribute('href'));
        const coverId = doc.querySelector('meta[name="cover"]')?.getAttribute('content');
        const base = opfPath.slice(0, opfPath.lastIndexOf('/')+1);
        const toDataURL = async (p) => {
          const blob = await zip.file(p).async('blob');
          return await fileToDataURL(new File([blob], 'img'));
        };
        if (coverId && manifest[coverId]) return await toDataURL(base + manifest[coverId]);

        let firstImg = null;
        zip.forEach(rel=>{ if (!firstImg && /\.(png|jpe?g)$/i.test(rel)) firstImg = rel; });
        if (firstImg) return await toDataURL(firstImg);
      }
    }
  }catch(e){ console.warn('epub cover fail', e); }
  return '';
}

/* ======================================================================
   Stars & Quotes UI
   ====================================================================== */
function wireStars(container, valueEl, initial=0){
  if (!container || !valueEl) return;

  if (!container.querySelector('.star-container')){
    for (let i=1;i<=6;i++){
      const d = document.createElement('div');
      d.className = 'star-container' + (i===6?' special':'');
      d.dataset.v = String(i);
      d.innerHTML = `<i class="far fa-star"></i>`;
      container.appendChild(d);
    }
  }

  let rating = initial || 0;
  paint();

  $$('.star-container', container).forEach(node=>{
    on(node,'click',()=>{
      rating = Number(node.dataset.v || node.getAttribute('data-value') || 0);
      node.classList.remove('pulse'); void node.offsetWidth; node.classList.add('pulse');
      paint();
    });
  });

  function paint(){
    valueEl.dataset.value = rating;
    valueEl.textContent = `Selected: ${rating}`;
    $$('.star-container', container).forEach(star=>{
      const v = Number(star.dataset.v || star.getAttribute('data-value') || 0);
      const icon = star.querySelector('i');
      if (!icon) return;
      if (v <= Math.floor(rating)) { icon.classList.add('fas'); icon.classList.remove('far'); }
      else { icon.classList.remove('fas'); icon.classList.add('far'); }
    });
  }
}

function renderQuotesList(arr, container){
  if (!container) return;
  container.innerHTML = '';
  arr.forEach((q, idx) => {
    const el = document.createElement('div');
    el.className = 'quote-item'; el.dataset.idx = String(idx);
    el.innerHTML = (q.type === 'image')
      ? `<img class="quote-image" src="${q.content}" alt="Quote image"><div class="quote-actions"><span class="quote-action delete">Delete</span></div>`
      : `<div class="quote-text">${escapeHTML(q.content)}</div><div class="quote-actions"><span class="quote-action delete">Delete</span></div>`;
    container.appendChild(el);
  });
}

// PWA: register service worker (no UI change)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  });
}
