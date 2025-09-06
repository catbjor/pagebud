// edit-page.js — Unified logic for editing a book with advanced features.
// Adds Upload Cover button support (#btnPickCover + #coverFile → coverDataUrl)
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function getLists() {
    const C = (window.PB_CONST) || (window.CONSTANTS) || (window.PB && {
      GENRES: window.PB.GENRES, MOODS: window.PB.MOODS, TROPES: window.PB.TROPES,
      STATUSES: window.PB.STATUSES, FORMATS: window.PB.FORMATS
    }) || { MOODS: [] }; // Add fallback for MOODS
    return {
      genres: C.GENRES || window.GENRES || [],
      moods: C.MOODS || window.MOODS || [],
      tropes: C.TROPES || window.TROPES || [],
      statuses: C.STATUSES || window.STATUSES || [],
      formats: C.FORMATS || window.FORMATS || []
    };
  }

  function populateChips(container, items) {
    if (!container || container.querySelector('.category') || !Array.isArray(items)) return;
    items.forEach((label) => {
      const el = document.createElement("span");
      el.className = "category"; el.textContent = label; el.dataset.value = String(label);
      container.appendChild(el);
    });
  }

  function ensureHidden(form, name) {
    let el = form.querySelector(`input[name="${name}"]`);
    if (!el) { el = document.createElement("input"); el.type = "hidden"; el.name = name; form.appendChild(el); }
    return el;
  }

  function auth() { return (window.fb?.auth) || (window.firebase?.auth?.()) || firebase.auth(); }
  function db() { return (window.fb?.db) || (window.firebase?.firestore?.()) || firebase.firestore(); }

  const norm = v => String(v || "").trim().toLowerCase();
  function chipVal(chip) { return norm(chip.dataset.value ?? chip.dataset.val ?? chip.textContent); }

  function activateChips(container, values) {
    if (!container) return;
    const want = new Set((values || []).map(norm));
    $$(".category", container).forEach(ch => ch.classList.toggle("active", want.has(chipVal(ch))));
  }

  function getActiveChips(container) {
    if (!container) return [];
    return $$(".category.active", container).map(chipVal);
  }

  function wireChipGroup(container, { multi, onChange }) {
    if (!container) return;
    const commit = () => onChange(multi ? getActiveChips(container) : (getActiveChips(container)[0] || ""));
    container.addEventListener("click", (e) => {
      const chip = e.target.closest(".category"); if (!chip) return;
      if (multi) chip.classList.toggle("active");
      else { $$(".category", container).forEach(c => c.classList.remove("active")); chip.classList.add("active"); }
      commit();
    });
    container.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const chip = e.target.closest(".category"); if (!chip) return;
      e.preventDefault();
      if (multi) chip.classList.toggle("active");
      else { $$(".category", container).forEach(c => c.classList.remove("active")); chip.classList.add("active"); }
      commit();
    });
  }

  // read image file → data URL
  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ""));
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  async function loadBook(form) {
    const a = auth();
    const u = a.currentUser || await new Promise(res => { const off = a.onAuthStateChanged(x => { off(); res(x); }); });
    if (!u) throw new Error("Not signed in.");

    const id = new URLSearchParams(location.search).get("id") || form.dataset.id || "";
    if (!id) throw new Error("Missing book id.");

    const ref = db().collection("users").doc(u.uid).collection("books").doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new Error("Book not found.");

    const d = snap.data() || {};
    form.dataset.id = id;

    // Basic fields
    $("#title") && ($("#title").value = d.title || "");
    $("#author") && ($("#author").value = d.author || "");
    $("#started") && ($("#started").value = typeof d.started === "string" ? d.started : "");
    $("#pageCount") && ($("#pageCount").value = d.pageCount || "");
    $("#finished") && ($("#finished").value = typeof d.finished === "string" ? d.finished : "");
    $("#review") && ($("#review").value = d.review || "");
    $("#quotesTextArea") && ($("#quotesTextArea").value = d.quotesText || ""); // Load quotes text

    // Load notes for multi-dimensional ratings
    $("#plotNotes") && ($("#plotNotes").value = d.plotNotes || "");
    $("#charNotes") && ($("#charNotes").value = d.charNotes || "");
    $("#writingNotes") && ($("#writingNotes").value = d.writingNotes || "");
    $("#impactNotes") && ($("#impactNotes").value = d.impactNotes || "");

    // Pre-fill rating/spice hidden inputs so controls can pick them up
    const inpPlot = ensureHidden(form, "plotRating");
    const inpChar = ensureHidden(form, "charRating");
    const inpWriting = ensureHidden(form, "writingRating");
    const inpImpact = ensureHidden(form, "impactRating");

    // Set values for the new multi-dimensional ratings
    inpPlot.value = d.plotRating || "0";
    inpChar.value = d.charRating || "0";
    inpWriting.value = d.writingRating || "0";
    inpImpact.value = d.impactRating || "0";

    // Existing ratings
    const inpRating = ensureHidden(form, "rating");
    const inpSpice = ensureHidden(form, "spice");
    inpRating.value = d.rating || "0";
    inpSpice.value = d.spice || "0";

    // Reread value checkbox
    $("#rereadValue") && ($("#rereadValue").checked = !!d.rereadValue);

    // Cover preview (existing)
    if ($("#coverPreview")) {
      // CSS should handle hiding this if src is empty, and hiding placeholder if src is present
      if (d.coverUrl) $("#coverPreview").src = d.coverUrl;
      else if (d.coverDataUrl) $("#coverPreview").src = d.coverDataUrl;
      else $("#coverPreview").removeAttribute("src");
    }

    // Show existing file name
    if ($("#fileName")) {
      const hasFile = d.fileName || d.storagePath || d.downloadURL;
      $("#fileName").textContent = hasFile ? (d.fileName || "Existing file attached") : "";
    }

    // Hidden inputs for chips
    const inpGenres = ensureHidden(form, "genres");
    const inpMoods = ensureHidden(form, "moods");
    const inpTropes = ensureHidden(form, "tropes");
    const inpStatus = ensureHidden(form, "status");     // legacy single
    const inpStatuses = ensureHidden(form, "statuses");   // new array
    const inpFormat = ensureHidden(form, "format");

    inpGenres.value = JSON.stringify(Array.isArray(d.genres) ? d.genres : []);
    inpMoods.value = JSON.stringify(Array.isArray(d.moods) ? d.moods : []);
    inpTropes.value = JSON.stringify(Array.isArray(d.tropes) ? d.tropes : []);
    inpStatuses.value = JSON.stringify(Array.isArray(d.statuses) ? d.statuses : (d.status ? [d.status] : []));
    inpStatus.value = d.status || "";
    inpFormat.value = d.format || "";

    // Get chip definitions
    const { genres, moods, tropes, statuses, formats } = getLists();

    // Populate chip containers if they are empty
    populateChips($("#genresBox .categories"), genres);
    populateChips($("#moodsBox .categories"), moods);
    populateChips($("#tropesBox .categories"), tropes);
    // Also populate status and format if they are empty
    populateChips($("#statusChips"), statuses);
    populateChips($("#formatChips"), formats);

    // Activate chips visually
    activateChips($("#genresBox .categories"), JSON.parse(inpGenres.value || "[]"));
    activateChips($("#moodsBox  .categories"), JSON.parse(inpMoods.value || "[]"));
    activateChips($("#tropesBox .categories"), JSON.parse(inpTropes.value || "[]"));
    activateChips($("#statusChips"), JSON.parse(inpStatuses.value || "[]")); // multi
    activateChips($("#formatChips"), [inpFormat.value].filter(Boolean)); // single

    // Keep hidden inputs in sync
    wireChipGroup($("#genresBox .categories"), { multi: true, onChange: vals => inpGenres.value = JSON.stringify(vals) });
    wireChipGroup($("#moodsBox  .categories"), { multi: true, onChange: vals => inpMoods.value = JSON.stringify(vals) });
    wireChipGroup($("#tropesBox .categories"), { multi: true, onChange: vals => inpTropes.value = JSON.stringify(vals) });
    wireChipGroup($("#statusChips"), {
      multi: true,
      onChange: vals => { inpStatuses.value = JSON.stringify(vals); inpStatus.value = vals[0] || ""; }
    });
    wireChipGroup($("#formatChips"), { multi: false, onChange: val => inpFormat.value = val || "" });

    // Render existing quotes
    renderQuotes(d.quotes || []);

    return { ref, data: d, uid: u.uid };
  }

  async function save(form, ctx, newCoverDataUrl, extractedCoverBlob) {
    const u = auth().currentUser;
    if (!u) return alert("Not signed in.");
    const id = new URLSearchParams(location.search).get("id") || form.dataset.id || "";
    if (!id) return alert("Missing book id.");

    const ref = db().collection("users").doc(u.uid).collection("books").doc(id);

    const title = ($("#title")?.value || "").trim();
    const author = ($("#author")?.value || "").trim();

    const genres = JSON.parse((form.querySelector('input[name="genres"]')?.value || "[]"));
    const moods = JSON.parse((form.querySelector('input[name="moods"]')?.value || "[]"));
    const tropes = JSON.parse((form.querySelector('input[name="tropes"]')?.value || "[]"));
    const statuses = JSON.parse((form.querySelector('input[name="statuses"]')?.value || "[]"));
    const status = (form.querySelector('input[name="status"]')?.value || (statuses[0] || ""));

    // Get quotes from the UI
    const quotes = $$('#quotesContainer .quote-entry').map(entry => ({
      text: entry.querySelector('textarea')?.value || '',
      imageUrl: entry.querySelector('img')?.src || ''
    })).filter(q => q.text || q.imageUrl);
    const format = (form.querySelector('input[name="format"]')?.value || null);

    const ratingVal = $('input[name="rating"]')?.value ?? "";
    const spiceVal = $('input[name="spice"]')?.value ?? "";

    const payload = {
      title, author,
      started: $("#started")?.value || null,
      pageCount: Number($("#pageCount")?.value) || null,
      finished: $("#finished")?.value || null,
      review: $("#review")?.value || "",
      quotesText: $("#quotesTextArea")?.value || "", // Save quotes text
      reviewHasSpoilers: $("#reviewHasSpoilers")?.checked || false,
      genres, moods, tropes,
      plotNotes: $("#plotNotes")?.value || "",
      charNotes: $("#charNotes")?.value || "",
      writingNotes: $("#writingNotes")?.value || "",
      impactNotes: $("#impactNotes")?.value || "",
      statuses, status, format,
      quotes, // Save the quotes array
      ...(ratingVal !== "" ? { rating: Number(ratingVal) || 0 } : {}),
      ...(spiceVal !== "" ? { spice: Number(spiceVal) || 0 } : {}),
      rereadValue: $("#rereadValue")?.checked || false,
      plotRating: Number($('input[name="plotRating"]')?.value) || 0,
      charRating: Number($('input[name="charRating"]')?.value) || 0,
      writingRating: Number($('input[name="writingRating"]')?.value) || 0,
      impactRating: Number($('input[name="impactRating"]')?.value) || 0,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    if (newCoverDataUrl) {
      payload.coverDataUrl = newCoverDataUrl;
    } else if (extractedCoverBlob) {
      try {
        payload.coverDataUrl = await readAsDataURL(extractedCoverBlob);
      } catch (e) {
        console.warn("Failed to convert extracted cover blob to data URL", e);
      }
    }

    await ref.set(payload, { merge: true });

    // Log the appropriate activity based on what changed.
    await window.PBActivity?.handleBookUpdate?.(id, payload, ctx.data);

    // If the book was marked as finished, check for challenge progress.
    if (payload.status === 'finished') {
      window.PBChallenges?.updateChallengeProgress?.(u.uid, { id, ...payload });
    }

    // Toast
    try {
      const t = document.createElement("div");
      t.className = "toast"; t.textContent = "Saved ✓";
      document.body.appendChild(t);
      requestAnimationFrame(() => t.classList.add("show"));
      setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 900);
    } catch { }

    setTimeout(() => location.replace(`index.html?refresh=${Date.now()}`), 120);
  }

  // --- Quotes Section Logic ---
  function renderQuotes(quotes = []) {
    const container = $("#quotesContainer");
    if (!container) return;
    container.innerHTML = quotes.map(quote => createQuoteEntry(quote)).join('');
  }

  function createQuoteEntry(quote = { text: '', imageUrl: '' }) {
    const textContent = quote.text ? `<textarea>${quote.text}</textarea>` : '<textarea placeholder="Type or paste quote..."></textarea>';
    const imageContent = quote.imageUrl ? `<img src="${quote.imageUrl}" alt="Quote image">` : '';

    return `
      <div class="quote-entry">
        <div class="quote-content">
          ${imageContent || textContent}
        </div>
        <button type="button" class="btn-remove-quote" title="Remove quote">&times;</button>
      </div>
    `;
  }

  function wireQuotesSection() {
    const container = $("#quotesContainer");
    if (!container) return;

    $("#addQuoteTextBtn")?.addEventListener('click', () => {
      container.insertAdjacentHTML('beforeend', createQuoteEntry());
    });

    const quotePhotoInput = $("#quotePhotoInput");
    $("#addQuotePhotoBtn")?.addEventListener('click', () => {
      quotePhotoInput.click();
    });

    quotePhotoInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await readAsDataURL(file);
        container.insertAdjacentHTML('beforeend', createQuoteEntry({ imageUrl: dataUrl }));
      } catch (err) {
        alert("Could not load image.");
      }
      e.target.value = ''; // Reset input
    });

    container.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-remove-quote')) {
        e.target.closest('.quote-entry').remove();
      }
    });
  }

  // --- Init -------------------------------------------------------
  async function init() {
    const form = $("#bookForm") || $("form");
    if (!form) return;

    let ctx = null;
    try { ctx = await loadBook(form); }
    catch (e) { console.warn("[edit] load failed:", e); alert(e.message || "Could not load book."); return; }

    // Wire header buttons
    const delBtn = $("#deleteBtn");
    const cancelBtn = $("#cancelBtn");

    if (delBtn) {
      delBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        const bookId = ctx?.data?.id;
        const bookTitle = ctx?.data?.title || "this book";
        if (!bookId) return;

        if (confirm(`Are you sure you want to delete "${bookTitle}"? This cannot be undone.`)) {
          try {
            if (window.PBSync?.deleteBook) {
              await window.PBSync.deleteBook(bookId);
              alert("Book deleted successfully.");
              window.location.href = 'index.html';
            } else {
              alert("Deletion service is not available.");
            }
          } catch (error) {
            console.error("Failed to delete book:", error);
            alert("There was an error deleting the book. Please try again.");
          }
        }
      });
    }
    cancelBtn?.addEventListener("click", () => history.back());

    const saveBtn = $("#saveBtn") || $('[data-role="save-book"]') || $('[data-action="save"]');
    let extractedCoverBlob = null;

    // --- "I'm Finished" Button ---
    const finishedBtn = document.createElement('button');
    finishedBtn.type = 'button';
    finishedBtn.id = 'imFinishedBtn';
    finishedBtn.className = 'btn'; // Use a generic class and style it in CSS
    finishedBtn.innerHTML = '<i class="fa-solid fa-flag-checkered"></i> I\'m Finished!';

    // Place it next to the save button if it exists
    if (saveBtn) {
      const saveBtnContainer = saveBtn.closest('.form-row') || saveBtn.parentElement;
      saveBtnContainer.style.display = 'flex';
      saveBtnContainer.style.gap = '8px';
      saveBtn.after(finishedBtn);
    }

    finishedBtn.addEventListener('click', (e) => {
      e.preventDefault();

      // 1. Set status to "Finished"
      const statusContainer = $('#statusChips');
      const finishedChip = $$('.category', statusContainer).find(c => chipVal(c) === 'finished');
      if (finishedChip && !finishedChip.classList.contains('active')) {
        finishedChip.click(); // This triggers the wireChipGroup logic
      }

      // 2. Set finished date to today if it's empty
      const finishedDateInput = $('#finished');
      if (finishedDateInput && !finishedDateInput.value) {
        finishedDateInput.valueAsDate = new Date();
      }

      // 3. Trigger the main save action
      saveBtn.click();
    });

    // Book file UI (existing)
    const pickBtn = $("#btnPickFile");
    const fileInp = $("#bookFile");
    const fileName = $("#fileName");
    const coverPrev = $("#coverPreview"); // need this for the handler
    let newCoverDataUrl = ""; // defined here to be in scope for fileInp handler

    if (pickBtn && fileInp) {
      if (!pickBtn.getAttribute("type")) pickBtn.setAttribute("type", "button");
      pickBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); fileInp.click(); });
      fileInp.addEventListener("change", async () => {
        const f = fileInp.files?.[0];
        if (fileName) fileName.textContent = f ? f.name : (ctx?.data?.fileName || "");
        if (!f) { extractedCoverBlob = null; return; }

        const extractor = window.PB?.extractBookMetadata;
        if (!extractor) {
          console.warn("Metadata extractor not available.");
          return;
        }

        const data = await extractor(f);

        if (data.title && !$("#title").value) {
          $("#title").value = data.title;
        }
        if (data.author && !$("#author").value) {
          $("#author").value = data.author;
        }

        extractedCoverBlob = data.coverBlob;
        if (extractedCoverBlob && !newCoverDataUrl && coverPrev) {
          coverPrev.src = URL.createObjectURL(extractedCoverBlob);
        }
      });
    }

    // NEW: Cover upload on Edit
    const coverBtn = $("#btnPickCover");
    const coverInp = $("#coverFile");

    if (coverBtn && coverInp) {
      if (!coverBtn.getAttribute("type")) coverBtn.setAttribute("type", "button");
      coverBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); coverInp.click(); });
      coverInp.addEventListener("change", async () => {
        const f = coverInp.files?.[0];
        if (!f) return;
        if (!/^image\//i.test(f.type)) { alert("Please choose an image file."); return; }
        try {
          newCoverDataUrl = await readAsDataURL(f);
          if (coverPrev) coverPrev.src = newCoverDataUrl;
          extractedCoverBlob = null; // User-picked cover takes priority
        } catch (err) {
          console.warn("Cover read failed", err);
          alert("Could not read the cover image.");
        }
      });
    }

    saveBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      save(form, ctx, newCoverDataUrl, extractedCoverBlob);
    });

    // Wire up the new quotes section
    wireQuotesSection();

    // Wire up multi-dimensional rating controls
    window.PB_RatingControls?.init?.($("#plotRatingBar"), ensureHidden(form, "plotRating"));
    window.PB_RatingControls?.init?.($("#charRatingBar"), ensureHidden(form, "charRating"));
    window.PB_RatingControls?.init?.($("#writingRatingBar"), ensureHidden(form, "writingRating"));
    window.PB_RatingControls?.init?.($("#impactRatingBar"), ensureHidden(form, "impactRating"));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
