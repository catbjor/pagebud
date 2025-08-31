/* ============================================================
   PageBud – add-book.js (user/{uid}/books) with half-star widgets
============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const db = firebase.firestore();

(function initChips() {
    const C = window.PB_CONST || {};
    function render(list, el) {
        if (el && Array.isArray(list)) {
            el.innerHTML = list.map(x => `<span class="category" data-val="${x}">${x}</span>`).join("");
        }
    }
    document.addEventListener("DOMContentLoaded", () => {
        render(C.GENRES, $("#genres"));
        render(C.MOODS, $("#moods"));
        render(C.TROPES, $("#tropes"));
    });
})();

document.addEventListener("DOMContentLoaded", () => {
    // Default placeholder for cover preview (square with text)
    const cover = $("#coverPreview");
    if (cover && !cover.getAttribute("src")) {
        cover.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">
         <rect width="100%" height="100%" rx="12" fill="#e5e7eb"/>
         <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
               font-size="16" fill="#9aa3af" font-family="system-ui, -apple-system, Segoe UI, Roboto">Cover image</text>
       </svg>`
        );
    }

    // Mount rating widgets
    PB_Rating.renderStars($("#ratingBar"), 0, 6);
    PB_Rating.renderChilis($("#spiceBar"), 0, 5);

    // Click cover → open file picker (optional later)
    $("#coverPreview")?.addEventListener("click", () => $("#bookFile")?.click());

    $("#saveBtn")?.addEventListener("click", async () => {
        const u = firebase.auth().currentUser;
        if (!u) { alert("Please sign in."); return; }

        const title = $("#title")?.value.trim();
        const author = $("#author")?.value.trim();
        const started = $("#started")?.value || null;
        const finished = $("#finished")?.value || null;
        const review = $("#review")?.value || "";

        const rating = Number($("#ratingBar")?.dataset.value || 0); // halves supported
        const spice = Number($("#spiceBar")?.dataset.value || 0);

        if (!title || !author) { alert("Title and Author are required."); return; }

        try {
            await db.collection("users").doc(u.uid).collection("books").add({
                title, author, started, finished, review,
                rating, spice,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            location.href = "index.html";
        } catch (e) {
            console.error(e);
            alert("Save failed");
        }
    });
});
