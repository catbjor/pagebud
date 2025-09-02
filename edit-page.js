// edit-page.js – full working version

(async function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);

  // Ensure user
  const auth = (window.fb?.auth ? window.fb.auth() : firebase.auth());
  const user = await new Promise(res => auth.onAuthStateChanged(res));
  if (!user) return location.href = "auth.html";

  const uid = user.uid;

  const params = new URLSearchParams(location.search);
  const bookId = params.get("id");
  if (!bookId) return alert("Missing book ID");

  const docRef = fb.db.collection("users").doc(uid).collection("books").doc(bookId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) return alert("Book not found");

  const book = docSnap.data();

  // Populate fields
  $("#title").value = book.title || "";
  $("#author").value = book.author || "";
  $("#started").value = book.started || "";
  $("#finished").value = book.finished || "";
  $("#review").value = book.review || "";

  if (book.coverURL) $("#coverPreview").src = book.coverURL;

  window.setRating?.(book.rating || 0);
  window.setSpice?.(book.spice || 0);

  function selectChips(containerId, values) {
    const container = $(containerId);
    if (!container || !Array.isArray(values)) return;
    values.forEach(val => {
      const el = container.querySelector(`[data-val="${val}"]`);
      if (el) el.classList.add("selected");
    });
  }

  selectChips("#statusChips", [book.status]);
  selectChips("#formatChips", [book.format]);
  selectChips("#genres", book.genres);
  selectChips("#moods", book.moods);
  selectChips("#tropes", book.tropes);

  const fileInput = $("#bookFile");
  const fileName = $("#fileName");
  const btnPickFile = $("#btnPickFile");

  btnPickFile?.addEventListener("click", () => fileInput.click());
  fileInput?.addEventListener("change", () => {
    if (fileInput.files.length) {
      fileName.textContent = fileInput.files[0].name;
    }
  });

  $("#saveBtn").addEventListener("click", async () => {
    const title = $("#title").value.trim();
    const author = $("#author").value.trim();
    if (!title || !author) return alert("Title and Author are required");

    const started = $("#started").value;
    const finished = $("#finished").value;
    const review = $("#review").value.trim();
    const rating = window.getRating?.() || 0;
    const spice = window.getSpice?.() || 0;

    const getSelected = id =>
      Array.from($(id)?.querySelectorAll(".selected") || []).map(x => x.dataset.val);

    const status = getSelected("#statusChips")[0] || "";
    const format = getSelected("#formatChips")[0] || "";
    const genres = getSelected("#genres");
    const moods = getSelected("#moods");
    const tropes = getSelected("#tropes");

    const updated = {
      title,
      author,
      started,
      finished,
      review,
      rating,
      spice,
      status,
      format,
      genres,
      moods,
      tropes,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
      if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const ext = file.name.split(".").pop().toLowerCase();
        if (!["pdf", "epub"].includes(ext)) throw new Error("Only PDF and EPUB supported");

        const path = `users/${uid}/books/${bookId}/book.${ext}`;
        const ref = fb.storage.ref(path);
        await ref.put(file);
        const url = await ref.getDownloadURL();

        updated.fileUrl = url;
        if (ext === "pdf") updated.pdfUrl = url;
        if (ext === "epub") updated.epubUrl = url;
        updated.fileType = ext;
      }

      await docRef.set(updated, { merge: true });
      location.href = "index.html";
    } catch (e) {
      console.error(e);
      alert("Failed to save book.");
    }
  });

  // Delete handled in delete.js
})();
