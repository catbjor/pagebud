// stats-goals.js
(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const db = () => window.fb?.db;
    const auth = () => window.fb?.auth;

    async function displayYearlyGoalProgress() {
        const section = $("#readingGoalSection");
        if (!section) return;

        try {
            const user = auth().currentUser;
            if (!user) {
                section.innerHTML = '<p class="muted">Sign in to see your goal progress.</p>';
                section.style.display = 'block';
                return;
            }

            // 1. Get goal from localStorage
            const yearlyGoal = parseInt(localStorage.getItem("pb:goal:yearly") || "12", 10);

            // 2. Get books finished this year from Firestore
            const currentYear = new Date().getFullYear();
            const startOfYear = new Date(currentYear, 0, 1);

            const booksSnap = await db().collection("users").doc(user.uid).collection("books")
                .where("status", "==", "finished")
                .where("finished", ">=", startOfYear)
                .get();

            let booksReadThisYear = 0;
            let pagesReadThisYear = 0;
            booksSnap.forEach(doc => {
                const book = doc.data();
                // Double-check finished date is in this year, as Firestore where clauses can be tricky
                if (book.finished && book.finished.toDate().getFullYear() === currentYear) {
                    booksReadThisYear++;
                    pagesReadThisYear += parseInt(book.pageCount || 0, 10);
                }
            });

            // 3. Calculate progress
            const progressPercent = yearlyGoal > 0 ? Math.min(100, (booksReadThisYear / yearlyGoal) * 100) : 0;

            // 4. Update DOM
            const ring = $("#goalProgressRing");
            const ringValue = $("#goalProgressValue");
            const booksReadEl = $("#statsBooksRead");
            const pagesReadEl = $("#statsPagesRead");

            if (ring) {
                const radius = ring.r.baseVal.value;
                const circumference = 2 * Math.PI * radius;
                const offset = circumference - (progressPercent / 100) * circumference;
                ring.style.strokeDashoffset = offset;
            }

            if (ringValue) ringValue.textContent = `${Math.round(progressPercent)}%`;
            if (booksReadEl) booksReadEl.textContent = booksReadThisYear;
            if (pagesReadEl) pagesReadEl.textContent = pagesReadThisYear.toLocaleString();

            section.style.display = 'grid'; // Make it visible

        } catch (error) {
            console.error("Failed to display yearly goal progress:", error);
            if (error.code === 'failed-precondition') {
                section.innerHTML = '<p class="muted">Could not load goal progress. A database index is likely required. Check the console for a link to create it.</p>';
            } else {
                section.innerHTML = '<p class="muted">Could not load goal progress.</p>';
            }
            section.style.display = 'block';
        }
    }

    // Wait for auth to be ready
    if (window.onAuthReady && typeof window.onAuthReady.then === 'function') {
        window.onAuthReady.then(() => displayYearlyGoalProgress());
    } else {
        // Fallback if onAuthReady isn't available
        document.addEventListener('DOMContentLoaded', () => {
            const unsub = auth().onAuthStateChanged(user => {
                unsub();
                displayYearlyGoalProgress();
            });
        });
    }

})();