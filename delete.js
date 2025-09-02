// delete.js — Book deletion with confirmation
(function () {
    "use strict";

    // Utility to get URL query parameters
    function getQueryParam(param) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(param);
    }

    document.addEventListener("DOMContentLoaded", () => {
        const deleteBtn = document.getElementById("deleteBtn");
        if (!deleteBtn) return;

        const bookId = getQueryParam("id");

        // If there's no book ID in the URL, there's nothing to delete.
        // Hide the button to prevent errors.
        if (!bookId) {
            deleteBtn.style.display = "none";
            return;
        }

        deleteBtn.addEventListener("click", async () => {
            // For a better confirmation message, find the book's title.
            const books = window.PBSync?.getLocalBooks() || [];
            const book = books.find(b => b.id === bookId);
            const bookTitle = book?.title || "this book";

            // Show a confirmation dialog
            if (confirm(`Are you sure you want to delete "${bookTitle}"? This cannot be undone.`)) {
                try {
                    // Use PBSync to delete the book from LocalStorage and Firestore
                    if (window.PBSync && typeof window.PBSync.deleteBook === 'function') {
                        await window.PBSync.deleteBook(bookId);
                    } else {
                        // Fallback for older structure or if PBSync isn't ready
                        document.dispatchEvent(new CustomEvent('pb:bookDeleted', { detail: { id: bookId } }));
                    }
                    
                    // Redirect to the library page after deletion
                    window.location.href = 'index.html';
                } catch (error) {
                    console.error("Failed to delete book:", error);
                    alert("There was an error deleting the book. Please try again.");
                }
            }
        });
    });
})();
