const q = document.getElementById("q");
const results = document.getElementById("results");

q.addEventListener("input", debounce(search, 300));

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

async function search() {
    const s = (q.value || "").trim();
    if (!s) { results.innerHTML = ""; return; }
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(s)}&limit=20`;
    const res = await fetch(url);
    const data = await res.json();
    const items = (data.docs || []).map(d => ({
        key: d.key, title: d.title, author: (d.author_name || [])[0] || "",
        cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : ""
    }));
    results.innerHTML = items.map(b => `
    <div class="card" style="display:flex;gap:12px;align-items:center">
      <img src="${b.cover || ''}" alt="" style="width:48px;height:72px;object-fit:cover;border-radius:8px;background:#eee">
      <div style="flex:1">
        <div style="font-weight:800">${b.title}</div>
        <div style="color:#6b6b6b">${b.author}</div>
      </div>
      <button class="btn btn-primary" data-add='${JSON.stringify(b).replace(/'/g, "&apos;")}'>Add</button>
    </div>`).join("");

    results.querySelectorAll("[data-add]").forEach(btn => {
        btn.addEventListener("click", () => {
            const b = JSON.parse(btn.getAttribute("data-add").replace(/&apos;/g, "'"));
            const books = JSON.parse(localStorage.getItem("pb:books") || "[]");
            books.push({
                id: Math.random().toString(36).slice(2),
                title: b.title, author: b.author,
                status: "want", rating: 0,
                coverDataUrl: b.cover, fileId: "", fileType: "",
                genres: [], moods: [], tropes: [], review: "", notes: "",
                quotes: [], startedAt: "", finishedAt: ""
            });
            localStorage.setItem("pb:books", JSON.stringify(books));
            btn.textContent = "Added ✓";
            btn.disabled = true;
        });
    });
}
