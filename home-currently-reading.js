// home-currently-reading.js
(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const db = () => window.fb?.db;
    const auth = () => window.fb?.auth;

    const phCover =
        "data:image/svg+xml;utf8," +
        encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600">
             <rect width="100%" height="100%" rx="12" fill="#e5e7eb"/>
             <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
                   font-size="22" fill="#9aa3af" font-family="system-ui,-apple-system,Segoe UI,Roboto">No cover</text>
           </svg>`
        );

    function createBookCard(book) {
        const coverUrl = book.coverUrl || book.coverDataUrl || phCover;
        const title = book.title || 'Untitled';
        const author = book.author || 'Unknown Author';

        // Calculate progress percentage
        let progressPercent = 0;
        if (book.reading && typeof book.reading.percent === 'number') {
            progressPercent = book.reading.percent;
        } else if (book.reading && typeof book.reading.page === 'number' && book.pageCount > 0) {
            progressPercent = (book.reading.page / book.pageCount) * 100;
        }
        progressPercent = Math.min(100, Math.max(0, progressPercent));

        const card = document.createElement('div');
        card.className = 'book-card';
        card.dataset.bookId = book.id; // Add book id for event listeners
        card.innerHTML = `
            <div class="thumb-wrap">
                <img class="thumb" src="${coverUrl}" alt="Cover for ${title}">
            </div>
            <div class="title">${title}</div>
            <div class="author">${author}</div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${progressPercent}%;"></div>
            </div>
            <div class="actions">
                <button class="btn btn-secondary small quick-update-btn"><i class="fa-solid fa-bookmark"></i> Update</button>
                <a href="edit.html?id=${book.id}" class="btn small"><i class="fa-solid fa-pen"></i> Details</a>
            </div>
        `;
        return card;
    }

    function createSkeletonCard() {
        const card = document.createElement('div');
        card.className = 'skeleton-card';
        card.innerHTML = `
            <div class="skeleton-thumb"></div>
            <div class="skeleton-line w-80"></div>
            <div class="skeleton-line w-50"></div>
        `;
        return card;
    }

    async function loadAndRender() {
        const container = $("#currentlyReadingContainer");
        if (!container) return;

        // Show skeletons while loading
        container.innerHTML = ''; // Clear previous content
        for (let i = 0; i < 5; i++) {
            container.appendChild(createSkeletonCard());
        }

        window.requireAuth(async (user) => {
            try {
                const booksRef = db().collection("users").doc(user.uid).collection("books");
                const snap = await booksRef.where('statuses', 'array-contains', 'Reading').limit(10).get();

                container.innerHTML = ''; // Clear skeletons
                if (snap.empty) {
                    container.innerHTML = '<p class="muted" style="scroll-snap-align: none;">You are not currently reading any books.</p>';
                    return;
                }

                snap.forEach(doc => container.appendChild(createBookCard({ id: doc.id, ...doc.data() })));
            } catch (error) {
                console.error("Failed to load currently reading books:", error);
                container.innerHTML = '<p class="muted" style="scroll-snap-align: none;">Could not load your books.</p>';
            }
        });
    }

    function init() {
        const container = $("#currentlyReadingContainer");
        if (!container) return;

        loadAndRender(); // Initial load

        // Listen for changes to re-render
        document.addEventListener("pb:booksChanged", loadAndRender);

        // Single event listener for all cards
        container.addEventListener('click', (e) => {
            const updateBtn = e.target.closest('.quick-update-btn');
            if (updateBtn) {
                window.PB?.ProgressModal?.show(updateBtn.closest('.book-card').dataset.bookId);
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();