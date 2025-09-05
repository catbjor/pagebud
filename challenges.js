// challenges.js
(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const db = () => window.fb?.db;
    const auth = () => window.fb?.auth;

    // Define the global challenges available to all users.
    // In a real app, this would live in your Firestore `challenges` collection.
    const GLOBAL_CHALLENGES = [
        { id: 'tbr_5_2024', title: 'Tackle Your TBR', description: 'Read 5 books from your TBR list this year.', goal: 5, type: 'status', criteria: 'tbr' },
        { id: 'genre_explorer_2024', title: 'Genre Explorer', description: 'Read books from 5 different genres.', goal: 5, type: 'genre' },
        { id: 'big_book_2024', title: 'The Marathoner', description: 'Finish a book over 500 pages long.', goal: 1, type: 'pages', criteria: 500 },
        { id: 'new_author_2024', title: 'New Horizons', description: 'Read a book by an author you\'ve never read before.', goal: 1, type: 'new_author' }
    ];

    function renderChallenge(challenge, userProgress = null) {
        const progress = userProgress?.progress || 0;
        const goal = challenge.goal;
        const isJoined = userProgress !== null;
        const isCompleted = isJoined && progress >= goal;

        const progressPercent = Math.min(100, (progress / goal) * 100);

        let actionButton;
        if (isCompleted) {
            actionButton = `<button class="btn" disabled><i class="fa-solid fa-check"></i> Completed!</button>`;
        } else if (isJoined) {
            actionButton = `<button class="btn btn-secondary" disabled>Joined</button>`;
        } else {
            actionButton = `<button class="btn btn-primary" data-action="join" data-challenge-id="${challenge.id}">Join Challenge</button>`;
        }

        return `
            <div class="challenge-card">
                <div class="challenge-title">${challenge.title}</div>
                <p class="challenge-desc">${challenge.description}</p>
                ${isJoined ? `
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progressPercent}%;"></div>
                    </div>
                    <p class="muted small">${progress} of ${goal} completed</p>
                ` : ''}
                <div class="row between" style="margin-top: 12px;">
                    <div></div>
                    ${actionButton}
                </div>
            </div>
        `;
    }

    async function joinChallenge(userId, challengeId) {
        const challenge = GLOBAL_CHALLENGES.find(c => c.id === challengeId);
        if (!challenge) return;

        const challengeRef = db().collection('users').doc(userId).collection('active_challenges').doc(challengeId);

        try {
            await challengeRef.set({
                challengeId: challenge.id,
                title: challenge.title,
                progress: 0,
                goal: challenge.goal,
                startedAt: new Date(),
                completedAt: null,
                books: []
            });
            // Re-render the UI after joining
            boot();
        } catch (error) {
            console.error("Failed to join challenge:", error);
            alert("Could not join the challenge. Please try again.");
        }
    }

    async function boot() {
        const myChallengesContainer = $("#myChallenges");
        const availableChallengesContainer = $("#availableChallenges");
        if (!myChallengesContainer || !availableChallengesContainer) return;

        myChallengesContainer.innerHTML = '<h2>My Challenges</h2>';
        availableChallengesContainer.innerHTML = '<h2>Available Challenges</h2>';

        window.requireAuth(async (user) => {
            const userId = user.uid;

            // Fetch the user's active challenges
            const activeChallengesSnap = await db().collection('users').doc(userId).collection('active_challenges').get();
            const myChallenges = new Map(activeChallengesSnap.docs.map(doc => [doc.id, doc.data()]));

            // Render joined challenges
            let hasJoinedChallenges = false;
            GLOBAL_CHALLENGES.forEach(challenge => {
                if (myChallenges.has(challenge.id)) {
                    myChallengesContainer.insertAdjacentHTML('beforeend', renderChallenge(challenge, myChallenges.get(challenge.id)));
                    hasJoinedChallenges = true;
                }
            });
            if (!hasJoinedChallenges) {
                myChallengesContainer.insertAdjacentHTML('beforeend', `<p class="muted">You haven't joined any challenges yet.</p>`);
            }

            // Render available challenges
            GLOBAL_CHALLENGES.forEach(challenge => {
                if (!myChallenges.has(challenge.id)) {
                    availableChallengesContainer.insertAdjacentHTML('beforeend', renderChallenge(challenge));
                }
            });

            // Wire up join buttons
            document.body.addEventListener('click', e => {
                const joinBtn = e.target.closest('[data-action="join"]');
                if (joinBtn) {
                    joinBtn.disabled = true;
                    joinChallenge(userId, joinBtn.dataset.challengeId);
                }
            });
        });
    }

    /**
     * Checks a newly finished book against a user's active challenges and updates progress.
     * @param {string} userId The user's ID.
     * @param {object} finishedBook The book data object that was just marked as finished.
     */
    async function updateChallengeProgress(userId, finishedBook) {
        if (!userId || !finishedBook || finishedBook.status !== 'finished') return;

        const activeChallengesSnap = await db().collection('users').doc(userId).collection('active_challenges').where('completedAt', '==', null).get();
        if (activeChallengesSnap.empty) return;

        // For challenges that need context, fetch the user's library once.
        const librarySnap = await db().collection('users').doc(userId).collection('books').get();
        const allBooks = librarySnap.docs.map(d => d.data());
        const finishedAuthors = new Set(allBooks.filter(b => b.status === 'finished' && b.author !== finishedBook.author).map(b => b.author));

        for (const doc of activeChallengesSnap.docs) {
            const challengeProgress = doc.data();
            const challengeDef = GLOBAL_CHALLENGES.find(c => c.id === challengeProgress.challengeId);

            if (!challengeDef) continue;

            // Prevent counting the same book twice for a challenge
            if (challengeProgress.books?.some(b => b.bookId === finishedBook.id)) {
                continue;
            }

            let qualifies = false;
            let contributingValue = null; // To store what made the book qualify (e.g., the specific genre)

            switch (challengeDef.type) {
                case 'status':
                    // Check if the book was on the TBR list.
                    if (Array.isArray(finishedBook.statuses) && finishedBook.statuses.includes(challengeDef.criteria)) {
                        qualifies = true;
                    }
                    break;
                case 'genre':
                    // Check if the book adds a *new* genre to the challenge progress.
                    const readGenres = new Set(challengeProgress.books?.map(b => b.contributingValue));
                    const newGenre = (finishedBook.genres || []).find(g => !readGenres.has(g));
                    if (newGenre) {
                        qualifies = true;
                        contributingValue = newGenre;
                    }
                    break;
                case 'pages':
                    if (finishedBook.pageCount && finishedBook.pageCount >= challengeDef.criteria) {
                        qualifies = true;
                    }
                    break;
                case 'new_author':
                    if (finishedBook.author && !finishedAuthors.has(finishedBook.author)) {
                        qualifies = true;
                    }
                    break;
            }

            if (qualifies) {
                const newProgress = (challengeProgress.progress || 0) + 1;
                const isNowComplete = newProgress >= challengeDef.goal;
                await doc.ref.update({
                    progress: newProgress,
                    completedAt: isNowComplete ? new Date() : null,
                    books: firebase.firestore.FieldValue.arrayUnion({ bookId: finishedBook.id, title: finishedBook.title, ...(contributingValue && { contributingValue }) })
                });
            }
        }
    }

    // Expose the update function globally so other scripts can call it.
    window.PBChallenges = { updateChallengeProgress };

    boot();

})();