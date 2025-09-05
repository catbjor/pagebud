// shelf-actions.js
(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const db = () => window.fb?.db;
    const auth = () => window.fb?.auth;

    function showShelfModal(user) {
        const modal = $("#shelfSelectModal");
        const listEl = $("#shelfSelectList");
        if (!modal || !listEl) return;

        listEl.innerHTML = `<p class="muted">Loading shelves...</p>`;
        modal.style.display = 'flex';

        db().collection("users").doc(user.uid).collection("shelves").orderBy("name", "asc").get()
            .then(snap => {
                if (snap.empty) {
                    listEl.innerHTML = `<p class="muted">You haven't created any custom shelves yet.</p>`;
                    return;
                }
                listEl.innerHTML = snap.docs.map(doc => {
                    const shelf = doc.data();
                    return `<div class="friend-row" data-shelf-id="${doc.id}" style="cursor: pointer;">
                                <div class="friend-left">
                                    <div class="friend-avatar" style="font-size: 1.2rem;"><i class="fa-solid fa-swatchbook"></i></div>
                                    <div class="friend-name">${shelf.name}</div>
                                </div>
                            </div>`;
                }).join('');
            })
            .catch(err => {
                console.warn("Could not load shelves:", err);
                listEl.innerHTML = `<p class="muted" style="color: red;">Could not load shelves.</p>`;
            });
    }

    async function addBooksToShelf(shelfId, bookIds) {
        const user = auth()?.currentUser;
        if (!user || !shelfId || !bookIds || bookIds.length === 0) return;

        const shelfRef = db().collection("users").doc(user.uid).collection("shelves").doc(shelfId);

        try {
            await shelfRef.update({
                bookIds: firebase.firestore.FieldValue.arrayUnion(...bookIds)
            });
            window.toast?.(`Added ${bookIds.length} book(s) to shelf.`);
        } catch (error) {
            console.error("Failed to add books to shelf:", error);
            alert("Could not add books to the shelf. Please try again.");
        }
    }

    async function removeBooksFromShelf(shelfId, bookIds) {
        const user = auth()?.currentUser;
        if (!user || !shelfId || !bookIds || bookIds.length === 0) return;

        const shelfRef = db().collection("users").doc(user.uid).collection("shelves").doc(shelfId);

        try {
            await shelfRef.update({
                bookIds: firebase.firestore.FieldValue.arrayRemove(...bookIds)
            });
            window.toast?.(`Removed ${bookIds.length} book(s) from shelf.`);
            // Remove cards from the DOM for instant feedback
            bookIds.forEach(id => document.querySelector(`.book-card[data-id="${id}"]`)?.remove());
        } catch (error) {
            console.error("Failed to remove books from shelf:", error);
            alert("Could not remove books from the shelf. Please try again.");
        }
    }

    function boot() {
        const addToShelfBtn = $("#addToShelfBtn");
        const removeFromShelfBtn = $("#removeFromShelfBtn");
        const modal = $("#shelfSelectModal");
        const shelfId = new URLSearchParams(window.location.search).get('shelf');

        addToShelfBtn?.addEventListener('click', () => {
            const user = auth()?.currentUser;
            if (user) {
                showShelfModal(user);
            }
        });

        // Logic for shelf management view
        if (shelfId) {
            // Show remove button, hide add/delete buttons
            if (addToShelfBtn) addToShelfBtn.style.display = 'none';
            if ($("#deleteSelectedBtn")) $("#deleteSelectedBtn").style.display = 'none';
            if (removeFromShelfBtn) removeFromShelfBtn.style.display = 'inline-flex';

            removeFromShelfBtn?.addEventListener('click', async () => {
                const selectedBookIds = window.PB_MultiSelect?.getSelectedIds?.();
                if (confirm(`Remove ${selectedBookIds.length} book(s) from this shelf?`)) {
                    await removeBooksFromShelf(shelfId, selectedBookIds);
                    window.PB_MultiSelect?.clearSelection?.();
                }
            });
        }

        modal?.addEventListener('click', async (e) => {
            const shelfRow = e.target.closest('[data-shelf-id]');
            if (shelfRow) {
                const shelfId = shelfRow.dataset.shelfId;
                const selectedBookIds = window.PB_MultiSelect?.getSelectedIds?.();
                await addBooksToShelf(shelfId, selectedBookIds);
                window.PB_MultiSelect?.clearSelection?.();
                modal.style.display = 'none';
            }

            if (e.target.id === 'closeShelfModalBtn' || e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }

    document.addEventListener('DOMContentLoaded', boot);

    // Expose functions for other scripts if needed
    window.PB_ShelfActions = { addBooksToShelf, removeBooksFromShelf };

})();