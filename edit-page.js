/* ============================================================
   PageBud – edit-page.js (user/{uid}/books) with half-star widgets
============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const db = firebase.firestore();

function renderChips(list, el, selected = []) {
  if (!el || !Array.isArray(list)) return;
  el.innerHTML = list
    .map(x => `<span class="category ${selected.includes(x) ? "active" : ""}" data-val="${x}">${x}</span>`)
    .join("");
}

async function loadBook(uid, id) {
  const ref = db.collection("users").doc(uid).collection("books").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const b = snap.data() || {};
  $("#title").value = b.title || "";
  $("#author").value = b.author || "";
  $("#started").value = b.started || "";
  $("#finished").value = b.finished || "";
  $("#review").value = b.review || "";

  // Hydrate rating widgets with saved values (half-stars supported)
  PB_Rating.renderStars($("#ratingBar"), Number(b.rating ?? 0), 6);
  PB_Rating.renderChilis($("#spiceBar"), Number(b.spice ?? 0), 5);

  const C = window.PB_CONST || {};
  renderChips(C.GENRES, $("#genres"), b.genres || []);
  renderChips(C.MOODS, $("#moods"), b.moods || []);
  renderChips(C.TROPES, $("#tropes"), b.tropes || []);

  return { ref };
}

document.addEventListener("DOMContentLoaded", () => {
  // Render widgets immediately so UI is visible before data loads
  PB_Rating.renderStars($("#ratingBar"), 0, 6);
  PB_Rating.renderChilis($("#spiceBar"), 0, 5);

  requireAuth(async (user) => {
    const id = new URLSearchParams(location.search).get("id");
    if (!id) { alert("Missing book id"); return; }

    const ctx = await loadBook(user.uid, id);
    if (!ctx) { alert("Book not found"); return; }

    $("#saveBtn")?.addEventListener("click", async () => {
      try {
        const patch = {
          title: $("#title")?.value.trim(),
          author: $("#author")?.value.trim(),
          started: $("#started")?.value || null,
          finished: $("#finished")?.value || null,
          review: $("#review")?.value || "",
          rating: Number($("#ratingBar")?.dataset.value || 0), // includes halves
          spice: Number($("#spiceBar")?.dataset.value || 0),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await ctx.ref.set(patch, { merge: true });
        location.href = "index.html";
      } catch (e) {
        console.error(e);
        alert("Update failed");
      }
    });

    $("#deleteBtn")?.addEventListener("click", async () => {
      if (!confirm("Delete this book?")) return;
      try {
        await ctx.ref.delete();
        location.href = "index.html";
      } catch (e) {
        console.error(e);
        alert("Delete failed");
      }
    });
  });
});
