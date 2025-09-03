// edit-page.js — robust prefill + chips rebuilt when missing
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const norm = v => String(v || "").trim().toLowerCase();

  // --- Firebase helpers ---
  function auth() { return (window.fb?.auth) || (window.firebase?.auth?.()) || firebase.auth(); }
  function db() { return (window.fb?.db) || (window.firebase?.firestore?.()) || firebase.firestore(); }

  // --- Lists (from your constants) ---
  function getLists() {
    const C = (window.PB_CONST) || (window.CONSTANTS) || (window.PB && {
      GENRES: window.PB.GENRES, MOODS: window.PB.MOODS, TROPES: window.PB.TROPES,
      STATUSES: window.PB.STATUSES, FORMATS: window.PB.FORMATS
    }) || {};
    return {
      genres: C.GENRES || window.GENRES || [],
      moods: C.MOODS || window.MOODS || [],
      tropes: C.TROPES || window.TROPES || [],
      statuses: C.STATUSES || window.STATUSES || ["To Read", "Reading", "Finished", "DNF", "Owned", "Wishlist"],
      formats: C.FORMATS || window.FORMATS || ["eBook", "Audiobook", "Paperback", "Hardcover"],
    };
  }

  // --- Hidden input helper ---
  function ensureHidden(form, name) {
    let el = form.querySelector(`input[name="${name}"]`);
    if (!el) { el = document.createElement("input"); el.type = "hidden"; el.name = name; form.appendChild(el); }
    return el;
  }

  // --- Chip building + value helpers ---
  function buildChipsIfMissing(container, items) {
    if (!container || !Array.isArray(items) || !items.length) return;
    if (container.querySelector(".category")) return; // already present
    const frag = document.createDocumentFragment();
    items.forEach(label => {
      const el = document.createElement("span");
      el.className = "category";
      el.dataset.value = String(label);
      el.textContent = String(label);
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      frag.appendChild(el);
    });
    container.appendChild(frag);
  }
  const chipRaw = chip => (chip.dataset.value ?? chip.dataset.val ?? chip.textContent).trim();
  const chipKey = chip => norm(chipRaw(chip));

  function activateChips(container, rawValuesArray) {
    if (!container) return;
    const keys = new Set((rawValuesArray || []).map(norm));
    $$(".category", container).forEach(ch => ch.classList.toggle("active", keys.has(chipKey(ch))));
  }

  function getActiveChipsRaw(container) {
    if (!container) return [];
    return $$(".category.active", container).map(chipRaw);
  }

  function wireChipGroup(container, { multi, onChange }) {
    if (!container) return;
    function commit() {
      const picked = getActiveChipsRaw(container);
      onChange(multi ? picked : (picked[0] || ""));
    }
    container.addEventListener("click", (e) => {
      const chip = e.target.closest(".category"); if (!chip) return;
      if (multi) {
        chip.classList.toggle("active");
      } else {
        $$(".category", container).forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
      }
      commit();
    });
    container.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const chip = e.target.closest(".category"); if (!chip) return;
      e.preventDefault();
      if (multi) chip.classList.toggle("active");
      else {
        $$(".category", container).forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
      }
      commit();
    });
  }

  // --- Load book and hydrate form ---
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

    $("#title") && ($("#title").value = d.title || "");
    $("#author") && ($("#author").value = d.author || "");
    $("#started") && ($("#started").value = typeof d.started === "string" ? d.started : "");
    $("#finished") && ($("#finished").value = typeof d.finished === "string" ? d.finished : "");
    $("#review") && ($("#review").value = d.review || "");

    if ($("#coverPreview")) {
      if (d.coverUrl) $("#coverPreview").src = d.coverUrl;
      else if (d.coverDataUrl) $("#coverPreview").src = d.coverDataUrl;
    }
    if ($("#fileName")) {
      $("#fileName").textContent = (d.fileName || (d.storagePath ? String(d.fileName || "Existing file attached") : ""));
    }

    // Hidden inputs mirror (raw, not lowercased)
    const inpGenres = ensureHidden(form, "genres");
    const inpMoods = ensureHidden(form, "moods");
    const inpTropes = ensureHidden(form, "tropes");
    const inpStatus = ensureHidden(form, "status");     // legacy single
    const inpStatuses = ensureHidden(form, "statuses");   // new array
    const inpFormat = ensureHidden(form, "format");

    const genresArr = Array.isArray(d.genres) ? d.genres : [];
    const moodsArr = Array.isArray(d.moods) ? d.moods : [];
    const tropesArr = Array.isArray(d.tropes) ? d.tropes : [];
    const statusesArr = Array.isArray(d.statuses) ? d.statuses : (d.status ? [d.status] : []);
    const formatStr = d.format || "";

    inpGenres.value = JSON.stringify(genresArr);
    inpMoods.value = JSON.stringify(moodsArr);
    inpTropes.value = JSON.stringify(tropesArr);
    inpStatuses.value = JSON.stringify(statusesArr);
    inpStatus.value = d.status || (statusesArr[0] || "");
    inpFormat.value = formatStr;

    // Rebuild chips if HTML didn’t have them, then activate
    const { genres, moods, tropes, statuses, formats } = getLists();
    const genresBox = $("#genresBox .categories") || $('[data-chips="genres"]');
    const moodsBox = $("#moodsBox .categories") || $('[data-chips="moods"]');
    const tropesBox = $("#tropesBox .categories") || $('[data-chips="tropes"]');
    const statusBox = $("#statusChips") || $('[data-chips="status"]');
    const formatBox = $("#formatChips") || $('[data-chips="format"]');

    buildChipsIfMissing(genresBox, genres);
    buildChipsIfMissing(moodsBox, moods);
    buildChipsIfMissing(tropesBox, tropes);
    buildChipsIfMissing(statusBox, statuses);
    buildChipsIfMissing(formatBox, formats);

    activateChips(genresBox, genresArr);
    activateChips(moodsBox, moodsArr);
    activateChips(tropesBox, tropesArr);
    activateChips(statusBox, statusesArr);
    activateChips(formatBox, [formatStr].filter(Boolean));

    // Wire groups to keep hidden inputs up-to-date (store RAW labels)
    wireChipGroup(genresBox, { multi: true, onChange: vals => { inpGenres.value = JSON.stringify(vals); } });
    wireChipGroup(moodsBox, { multi: true, onChange: vals => { inpMoods.value = JSON.stringify(vals); } });
    wireChipGroup(tropesBox, { multi: true, onChange: vals => { inpTropes.value = JSON.stringify(vals); } });
    wireChipGroup(statusBox, {
      multi: true, onChange: vals => {
        inpStatuses.value = JSON.stringify(vals);
        inpStatus.value = vals[0] || ""; // keep legacy single in sync
      }
    });
    wireChipGroup(formatBox, { multi: false, onChange: val => { inpFormat.value = val || ""; } });

    return { ref, data: d, uid: u.uid };
  }

  async function save(form) {
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
    const format = (form.querySelector('input[name="format"]')?.value || null);

    const ratingVal = $('input[name="rating"]')?.value ?? "";
    const spiceVal = $('input[name="spice"]')?.value ?? "";

    const payload = {
      title, author,
      started: $("#started")?.value || null,
      finished: $("#finished")?.value || null,
      review: $("#review")?.value || "",
      genres, moods, tropes,
      statuses, status, format,
      ...(ratingVal !== "" ? { rating: Number(ratingVal) || 0 } : {}),
      ...(spiceVal !== "" ? { spice: Number(spiceVal) || 0 } : {}),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    await ref.set(payload, { merge: true });

    // Tiny toast
    try {
      const t = document.createElement("div");
      t.className = "toast"; t.textContent = "Saved ✓";
      document.body.appendChild(t);
      requestAnimationFrame(() => t.classList.add("show"));
      setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 900);
    } catch { }

    // Back to home with cache-bust
    setTimeout(() => location.replace(`index.html?refresh=${Date.now()}`), 120);
  }

  async function init() {
    const form = $("#bookForm") || $("form");
    if (!form) return;

    let ctx;
    try { ctx = await loadBook(form); }
    catch (e) { console.warn("[edit] load failed:", e); alert(e.message || "Could not load book."); return; }

    const saveBtn = $("#saveBtn") || $('[data-role="save-book"]') || $('[data-action="save"]');
    saveBtn?.addEventListener("click", (e) => { e.preventDefault(); save(form); });

    const pickBtn = $("#btnPickFile");
    const fileInp = $("#bookFile");
    const fileName = $("#fileName");
    if (pickBtn && fileInp) {
      if (!pickBtn.getAttribute("type")) pickBtn.setAttribute("type", "button");
      pickBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); fileInp.click(); });
      fileInp.addEventListener("change", () => {
        const f = fileInp.files?.[0];
        if (fileName) fileName.textContent = f ? f.name : (ctx?.data?.fileName || "");
      });
    }

    const delBtn = $("#deleteBtn") || $("#deleteBookBtn") || $('[data-role="delete-book"]');
    if (delBtn) {
      delBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!confirm("Delete this book?")) return;
        await ctx.ref.delete();
        location.replace(`index.html?refresh=${Date.now()}`);
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
