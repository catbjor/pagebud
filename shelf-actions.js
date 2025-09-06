// shelf-actions.js
(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const db = () => window.fb?.db;
    const auth = () => window.fb?.auth;
    const esc = (s) => String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    function showShelfModal(user) {
        const modal = $("#shelfSelectModal");
        const listEl = $("#shelfSelectList");
        if (!modal || !listEl) return;

        listEl.innerHTML = `<p class="muted">Loading shelves...</p>`;
        modal.classList.add('show');

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
                                    <div class="friend-name">${esc(shelf.name)}</div>
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

    async function createAndAddShelf(shelfName, bookIds) {
        const user = auth()?.currentUser;
        if (!user || !shelfName || !bookIds || bookIds.length === 0) return null;

        try {
            // Create the new shelf and add the books in a single operation.
            const newShelfRef = await db().collection("users").doc(user.uid).collection("shelves").add({
                name: shelfName.trim(),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                bookIds: bookIds,
                order: -1 // Ensure new shelves appear first and are included in profile page queries.
            });
            window.toast?.(`Created shelf and added ${bookIds.length} book(s).`);
            return { id: newShelfRef.id, name: shelfName.trim() };
        } catch (error) {
            console.error("Failed to create and add to shelf:", error);
            alert("Could not create the shelf. Please try again.");
            return null;
        }
    }

    async function initShelfView(shelfId, user) {
        const header = $("#shelfManagementHeader");
        if (!header) return;

        try {
            const shelfRef = db().collection("users").doc(user.uid).collection("shelves").doc(shelfId);
            const shelfDoc = await shelfRef.get();

            if (!shelfDoc.exists) {
                header.innerHTML = `<p class="muted">Shelf not found.</p>`;
                header.style.display = 'block';
                return;
            }

            const shelf = shelfDoc.data();
            const shelfName = shelf.name || "Untitled Shelf";

            header.innerHTML = `
                <div class="card-head">
                    <h3>${esc(shelfName)}</h3>
                    <div class="shelf-actions">
                        <button class="btn btn-icon" title="Rename shelf" data-action="rename-shelf"><i class="fa fa-pen"></i></button>
                        <a href="profile.html?manageShelf=${shelfId}" class="btn btn-icon" title="Manage books in this shelf"><i class="fa-solid fa-list-check"></i></a>
                        <button class="btn btn-icon" title="Delete shelf" data-action="delete-shelf"><i class="fa fa-trash"></i></button>
                    </div>
                </div>
            `;
            header.style.display = 'block';

            // Wire up actions
            header.addEventListener('click', async (e) => {
                const renameBtn = e.target.closest('[data-action="rename-shelf"]');
                if (renameBtn) {
                    const newName = prompt("New shelf name:", shelfName);
                    if (newName && newName.trim()) {
                        await shelfRef.set({ name: newName.trim() }, { merge: true });
                        header.querySelector('h3').textContent = esc(newName.trim());
                        window.toast?.('Shelf renamed!');
                    }
                }

                const deleteBtn = e.target.closest('[data-action="delete-shelf"]');
                if (deleteBtn) {
                    if (confirm(`Delete shelf "${esc(shelfName)}"? This does NOT delete your books.`)) {
                        await shelfRef.delete();
                        window.toast?.('Shelf deleted.');
                        location.href = 'profile.html';
                    }
                }
            });

        } catch (error) {
            console.error("Failed to initialize shelf view:", error);
            header.innerHTML = `<p class="muted" style="color:red;">Could not load shelf details.</p>`;
            header.style.display = 'block';
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
        addToShelfBtn?.addEventListener('click', () => {
            const user = auth()?.currentUser;
            if (user) {
                showShelfModal(user);
            }
        });

        // Logic for shelf management view
        const shelfId = new URLSearchParams(window.location.search).get('shelf');
        if (shelfId) {
            // Wait for auth before initializing the shelf view header
            const authReady = window.onAuthReady || new Promise(res => {
                const unsub = auth().onAuthStateChanged(u => {
                    unsub();
                    res(u);
                });
            });

            authReady.then(user => {
                if (user) {
                    initShelfView(shelfId, user);
                }
            });
        }
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
                modal.classList.remove('show');
            }

            if (e.target.id === 'createAndAddShelfBtn') {
                const newNameInput = $("#newShelfName");
                const shelfName = newNameInput?.value.trim();
                if (shelfName) {
                    const selectedBookIds = window.PB_MultiSelect?.getSelectedIds?.();
                    const newShelf = await createAndAddShelf(shelfName, selectedBookIds);

                    if (newShelf) {
                        const listEl = $("#shelfSelectList");
                        const newShelfHtml = `<div class="friend-row" data-shelf-id="${newShelf.id}" style="cursor: pointer;">
                                    <div class="friend-left">
                                        <div class="friend-avatar" style="font-size: 1.2rem;"><i class="fa-solid fa-swatchbook"></i></div>
                                        <div class="friend-name">${esc(newShelf.name)}</div>
                                    </div>
                                </div>`;
                        const emptyMsg = listEl.querySelector('p.muted');
                        if (emptyMsg) listEl.innerHTML = newShelfHtml;
                        else listEl.insertAdjacentHTML('afterbegin', newShelfHtml);

                        window.PB_MultiSelect?.clearSelection?.();
                        if (newNameInput) newNameInput.value = "";
                    }
                }
            }

            if (e.target.id === 'closeShelfModalBtn' || e.target === modal) {
                modal.classList.remove('show');
            }
        });
    }

    document.addEventListener('DOMContentLoaded', boot);

    // Expose functions for other scripts if needed
    window.PB_ShelfActions = {
        addBooksToShelf e
    }) ();