// progress-modal.js
(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const db = () => window.fb?.db;
    const auth = () => window.fb?.auth;

    let modalBackdrop = null;
    let modalSheet = null;
    let currentBookId = null;

    function ensureModal() {
        if (modalBackdrop) return;

        modalBackdrop = document.createElement('div');
        modalBackdrop.className = 'progress-modal-backdrop';
        modalBackdrop.innerHTML = `
            <div class="progress-modal-sheet">
                <h3>Update Progress</h3>
                <p class="muted small">Enter your current page or percentage.</p>
                <form id="progressUpdateForm">
                    <div class="form-row two-col">
                        <div>
                            <label for="progressPage">Page</label>
                            <input type="number" id="progressPage" placeholder="e.g., 150">
                        </div>
                        <div>
                            <label for="progressPercent">% Complete</label>
                            <input type="number" id="progressPercent" min="0" max="100" placeholder="e.g., 50">
                        </div>
                    </div>
                    <div class="modal-actions" style="margin-top: 16px;">
                        <button type="button" class="btn btn-secondary" id="progressCancelBtn">Cancel</button>
                        <button type="submit" class="btn btn-primary">Save</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modalBackdrop);
        modalSheet = modalBackdrop.querySelector('.progress-modal-sheet');

        modalBackdrop.addEventListener('click', (e) => {
            if (e.target === modalBackdrop) hide();
        });

        $('#progressCancelBtn', modalBackdrop).addEventListener('click', hide);

        $('#progressUpdateForm', modalBackdrop).addEventListener('submit', async (e) => {
            e.preventDefault();
            const page = $('#progressPage', modalSheet).value;
            const percent = $('#progressPercent', modalSheet).value;

            const progressData = {};
            if (page) progressData.page = Number(page);
            if (percent) progressData.percent = Number(percent);

            if (Object.keys(progressData).length > 0) {
                await saveProgress(currentBookId, progressData);
            }
            hide();
        });
    }

    async function saveProgress(bookId, progress) {
        const user = auth().currentUser;
        if (!user || !bookId) return;

        const bookRef = db().collection("users").doc(user.uid).collection("books").doc(bookId);

        try {
            const oldDoc = await bookRef.get();
            const oldData = oldDoc.exists ? oldDoc.data() : null;

            const newReadingData = { ...oldData?.reading, ...progress };
            const payload = { reading: newReadingData };

            await bookRef.update(payload);

            // Manually trigger activity log after successful save
            const fullNewData = { ...oldData, ...payload };
            await window.PBActivity?.handleBookUpdate(bookId, fullNewData, oldData);

            // Manually trigger a refresh of the homepage sections
            document.dispatchEvent(new CustomEvent("pb:booksChanged"));

        } catch (error) {
            console.error("Failed to save progress:", error);
            alert("Could not save progress. Please try again.");
        }
    }

    function show(bookId) {
        ensureModal();
        currentBookId = bookId;
        $('#progressUpdateForm', modalSheet).reset();
        modalBackdrop.classList.add('show');
    }

    function hide() {
        if (!modalBackdrop) return;
        modalBackdrop.classList.remove('show');
    }

    window.PB = window.PB || {};
    window.PB.ProgressModal = { show, hide };
})();