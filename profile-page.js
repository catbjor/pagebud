// profile-page.js
(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    function auth() { return (window.fb?.auth) || (window.firebase?.auth?.()) || firebase.auth(); }
    function db() { return (window.fb?.db) || (window.firebase?.firestore?.()) || firebase.firestore(); }
    function storage() { return (window.fb?.storage) || (window.firebase?.storage?.()) || firebase.storage(); }


    // helper: read file -> data URL
    function readAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result || ""));
            fr.onerror = reject;
            fr.readAsDataURL(file);
        });
    }

    // --- Card Rendering Helpers (from script.js) ---
    const phCover = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="100%" height="100%" rx="12" fill="#e5e7eb"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="22" fill="#9aa3af" font-family="system-ui,-apple-system,Segoe UI,Roboto">No cover</text></svg>`);

    function starsRow(val) {
        const full = Math.floor(Number(val) || 0);
        let out = "";
        for (let i = 1; i <= 6; i++) {
            out += `<span class="${i <= full ? "card-star--on" : "card-star"}"></span>`;
        }
        return out;
    }

    function chilisRow(val) {
        const full = Math.floor(Number(val) || 0);
        let out = "";
        for (let i = 1; i <= 5; i++) {
            out += `<span class="${i <= full ? "card-chili--on" : "card-chili"}"></span>`;
        }
        return out;
    }

    function createCardElement(doc, isMyProfile) {
        const cardTemplate = document.getElementById('book-card-template');
        if (!cardTemplate) return null;

        const card = cardTemplate.content.cloneNode(true).firstElementChild;
        const d = doc.data() || {};
        const id = doc.id;

        card.dataset.id = id;
        const cover = d.coverUrl || d.coverDataUrl || phCover;
        const title = d.title || "Untitled";

        const thumb = card.querySelector('.thumb');
        thumb.src = cover;
        thumb.alt = `Cover for ${title}`;

        card.querySelector('.title').textContent = title;
        card.querySelector('.author').textContent = d.author || "";

        const rating = Number(d.rating || 0);
        if (rating > 0) {
            const ratingBadge = card.querySelector('.rated-badge');
            const ratingLabel = Number.isInteger(rating) ? String(rating) : String(Math.round(rating * 10) / 10);
            ratingBadge.title = `Rated ${ratingLabel}`;
            ratingBadge.querySelector('.val').textContent = ratingLabel;
            ratingBadge.style.display = '';
        }

        const heartBtn = card.querySelector('.heart-btn');
        heartBtn.classList.toggle('active', !!d.favorite);
        heartBtn.dataset.id = id;

        card.querySelector('.rating-stars').innerHTML = starsRow(rating);
        card.querySelector('.spice-chilis').innerHTML = chilisRow(Number(d.spice || 0));

        const editBtn = card.querySelector('[data-action="open"]');
        if (isMyProfile) { editBtn.dataset.id = id; }
        else { editBtn.style.display = 'none'; }

        const readBtn = card.querySelector('[data-action="read"]');
        if (d.hasFile) { readBtn.dataset.id = id; readBtn.style.display = ''; }

        return card;
    }

    async function init(me) {
        const urlParams = new URLSearchParams(window.location.search);
        const profileUid = urlParams.get('uid') || me.uid;
        const isMyProfile = profileUid === me.uid;

        // --- DOM Elements ---
        const photoEl = $("#profilePhoto");
        const nameEl = $("#profileName");
        const usernameEl = $("#profileUsername");
        const bioEl = $("#profileBio");
        const quirksContainer = $("#quirksContainer");
        const myUserActions = $("#myUserActions");
        const btnEditProfile = $("#btnEditProfile");
        const otherUserActions = $("#otherUserActions");
        const editProfileSection = $("#editProfileSection");
        const btnChangePhoto = $("#btnChangePhoto");
        const photoInput = $("#photoInput");
        const editName = $("#editName");
        const editQuirksContainer = $("#editQuirks");
        const editBio = $("#editBio");
        const btnSaveChanges = $("#btnSaveChanges");
        const headerTitle = $("#profileHeaderTitle");
        const btnAddFriend = $("#btnAddFriend");
        const btnMessage = $("#btnMessage");

        // --- Load Profile Data ---
        let profileData = null;
        try {
            const userDoc = await db().collection("users").doc(profileUid).get();
            if (!userDoc.exists) {
                nameEl.textContent = "User not found";
                return;
            }
            profileData = userDoc.data();

            // Also get username from the dedicated collection
            const usernameSnap = await db().collection("usernames").where("uid", "==", profileUid).limit(1).get();
            if (!usernameSnap.empty) {
                profileData.username = usernameSnap.docs[0].id;
            }

            // --- Populate UI ---
            nameEl.textContent = profileData.displayName || "No name";
            usernameEl.textContent = profileData.username ? `@${profileData.username}` : '';
            photoEl.src = profileData.photoURL || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; // Placeholder
            bioEl.textContent = profileData.bio || (isMyProfile ? "You haven't written a bio yet. Click 'Edit Profile' to add one." : "This user hasn't written a bio yet.");
            renderQuirks(profileData.quirks || []);
            if (isMyProfile) {
                headerTitle.textContent = "My Profile";
            }

            loadAndDisplayStats(profileUid);
            calculateAndShowAchievements(profileUid);
            loadCurrentlyReading(profileUid, isMyProfile);
            loadFavoritesShelf(profileUid, isMyProfile);
            loadFinishedShelf(profileUid, isMyProfile);
            loadWishlistShelf(profileUid, isMyProfile);

            if (!isMyProfile) {
                checkFriendshipAndShowActions(me.uid, profileUid);
                calculateAndShowCompatibility(me, profileData);
            }

        } catch (error) {
            console.error("Failed to load profile:", error);
            nameEl.textContent = "Error loading profile";
            return;
        }

        // --- Conditional UI ---
        if (isMyProfile) {
            myUserActions.style.display = 'flex';
            btnChangePhoto.style.display = 'grid';
            editName.value = profileData.displayName || '';
            wireUpQuirksEditor(profileData.quirks || []);
            editBio.value = profileData.bio || '';

            // Wire up edit controls
            btnEditProfile.addEventListener('click', () => {
                const isHidden = editProfileSection.style.display === 'none';
                editProfileSection.style.display = isHidden ? 'block' : 'none';
            });
            btnChangePhoto.addEventListener('click', () => photoInput.click());
            photoInput.addEventListener('change', handlePhotoUpload);
            btnSaveChanges.addEventListener('click', saveChanges);

        } else {
            otherUserActions.style.display = 'flex';
        }

        // --- Functions for editing ---
        async function handlePhotoUpload() {
            const file = photoInput.files?.[0];
            if (!file) return;

            // Optimistic UI: show the selected photo immediately using a local URL.
            const localUrl = URL.createObjectURL(file);
            photoEl.src = localUrl;

            btnChangePhoto.disabled = true;
            btnChangePhoto.querySelector('i').className = 'fa fa-spinner fa-spin';

            try {
                // Convert file to data URL and save to Firestore/Auth
                const dataUrl = await readAsDataURL(file);

                await me.updateProfile({ photoURL: dataUrl });
                await db().collection("users").doc(me.uid).set({ photoURL: dataUrl }, { merge: true });
                try { window.PB?.logActivity?.({ action: "profile_updated", meta: { updated: 'photo' } }); } catch (e) { console.warn(e); }

                // The image is already showing the local version. We can now point to the permanent URL.
                photoEl.src = dataUrl;
                URL.revokeObjectURL(localUrl); // Clean up the local URL
                alert("Profile photo updated!");
            } catch (error) {
                console.error("Photo upload failed:", error);
                alert("Could not save photo. The file might be too large.");
                // Revert to the original photo on failure
                photoEl.src = profileData.photoURL || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            } finally {
                btnChangePhoto.disabled = false;
                btnChangePhoto.querySelector('i').className = 'fa fa-camera';
            }
        }

        async function saveChanges() {
            const newName = editName.value.trim();
            const newQuirks = getSelectedQuirks();
            const newBio = editBio.value.trim();
            btnSaveChanges.disabled = true;
            btnSaveChanges.textContent = 'Saving...';

            try {
                const updates = {
                    displayName: newName,
                    quirks: newQuirks,
                    bio: newBio,
                    displayName_lower: newName.toLowerCase()
                };
                await db().collection("users").doc(me.uid).set(updates, { merge: true });
                await me.updateProfile({ displayName: newName });
                try { window.PB?.logActivity?.({ action: "profile_updated", meta: { updated: 'details' } }); } catch { }
                nameEl.textContent = newName || "No name";
                renderQuirks(newQuirks);
                bioEl.textContent = newBio || "You haven't written a bio yet. Click 'Edit Profile' to add one.";
                alert("Profile saved!");
            } catch (error) {
                console.error("Failed to save bio:", error);
                alert("Could not save bio. Please try again.");
            } finally {
                btnSaveChanges.disabled = false;
                btnSaveChanges.textContent = 'Save Changes';
            }
        }

        async function addFriend(fromUid, toUid) {
            // This logic can be imported or copied from friends.js
            const reqId = [fromUid, toUid].sort().join("__");
            const ref = db().collection("friend_requests").doc(reqId);
            try {
                await ref.set({
                    from: fromUid,
                    to: toUid,
                    status: "pending",
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
                btnAddFriend.textContent = 'Request Sent ✓';
                btnAddFriend.disabled = true;
            } catch (error) {
                console.error("Failed to send friend request:", error);
                alert("Could not send friend request.");
            }
        }

        async function checkFriendshipAndShowActions(myUid, theirUid) {
            const friendDoc = await db().collection("users").doc(myUid).collection("friends").doc(theirUid).get();
            const isFriend = friendDoc.exists && friendDoc.data().status === 'accepted';

            btnMessage.addEventListener('click', () => location.href = `chat.html?buddy=${theirUid}`);

            if (isFriend) {
                btnAddFriend.textContent = 'Unfriend';
                btnAddFriend.onclick = () => unfriend(myUid, theirUid);
            } else {
                // Check if a request is pending
                const reqId = [myUid, theirUid].sort().join("__");
                const reqDoc = await db().collection("friend_requests").doc(reqId).get();
                if (reqDoc.exists && reqDoc.data().status === 'pending') {
                    btnAddFriend.textContent = 'Request Sent';
                    btnAddFriend.disabled = true;
                } else {
                    btnAddFriend.textContent = 'Add Friend';
                    btnAddFriend.onclick = () => addFriend(myUid, theirUid);
                }
            }
        }

        async function unfriend(myUid, theirUid) {
            if (!confirm("Are you sure you want to remove this friend?")) return;
            try {
                const batch = db().batch();
                batch.delete(db().collection("users").doc(myUid).collection("friends").doc(theirUid));
                batch.delete(db().collection("users").doc(theirUid).collection("friends").doc(myUid));
                await batch.commit();
                btnAddFriend.textContent = 'Add Friend';
                btnAddFriend.onclick = () => addFriend(myUid, theirUid);
                alert("Friend removed.");
            } catch (error) {
                console.error("Unfriend failed:", error);
                alert("Could not remove friend.");
            }
        }

        async function calculateAndShowCompatibility(me, them) {
            const container = $("#compatibilityScore");
            if (!container) return;

            const [myBooksSnap, theirBooksSnap] = await Promise.all([
                db().collection("users").doc(me.uid).collection("books").get(),
                db().collection("users").doc(them.uid).collection("books").get()
            ]);

            const myBooks = myBooksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const theirBooks = theirBooksSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            if (myBooks.length === 0 || theirBooks.length === 0) return;

            // --- Calculations ---
            // 1. Shared Books (40 points)
            const myTitles = new Set(myBooks.map(b => b.title.toLowerCase()));
            const sharedBooks = theirBooks.filter(b => myTitles.has(b.title.toLowerCase()));
            const sharedBooksScore = Math.min(40, (sharedBooks.length / 5) * 40); // Max score at 5 shared books

            // 2. Genre Overlap (40 points)
            const getTopGenres = (books) => {
                const counts = books.flatMap(b => b.genres || []).reduce((acc, genre) => {
                    acc[genre] = (acc[genre] || 0) + 1;
                    return acc;
                }, {});
                return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);
            };
            const myTopGenres = new Set(getTopGenres(myBooks));
            const theirTopGenres = getTopGenres(theirBooks);
            const genreOverlapCount = theirTopGenres.filter(g => myTopGenres.has(g)).length;
            const genreScore = (genreOverlapCount / 5) * 40;

            // 3. Rating Similarity (20 points)
            const myRatedBooks = new Map(myBooks.filter(b => b.rating > 0).map(b => [b.title.toLowerCase(), b.rating]));
            let totalRatingDiff = 0;
            let ratedSharedCount = 0;
            theirBooks.forEach(b => {
                if (b.rating > 0 && myRatedBooks.has(b.title.toLowerCase())) {
                    totalRatingDiff += Math.abs(b.rating - myRatedBooks.get(b.title.toLowerCase()));
                    ratedSharedCount++;
                }
            });
            const avgDiff = ratedSharedCount > 0 ? totalRatingDiff / ratedSharedCount : 4; // Max diff is 4 (5-1)
            const ratingScore = Math.max(0, (1 - avgDiff / 4)) * 20;

            const finalScore = Math.round(sharedBooksScore + genreScore + ratingScore);

            // --- Render ---
            $("#compFriendName").textContent = them.displayName.split(' ')[0];
            container.querySelector(".score-value").textContent = `${finalScore}%`;
            const breakdownEl = container.querySelector(".score-breakdown");
            let breakdownText = [];
            if (sharedBooks.length > 0) breakdownText.push(`📚 ${sharedBooks.length} shared books`);
            if (genreOverlapCount > 0) breakdownText.push(`🎨 ${genreOverlapCount} shared genres`);
            if (ratedSharedCount > 0) breakdownText.push(`⭐ Similar ratings`);

            if (breakdownText.length > 0) {
                breakdownEl.innerHTML = breakdownText.map(t => `<span class="breakdown-item">${t}</span>`).join(' • ');
            } else {
                breakdownEl.innerHTML = `<span class="breakdown-item">Discover your shared tastes!</span>`;
            }

            container.style.display = 'block';
        }

        function renderQuirks(quirks) {
            if (!quirksContainer) return;
            if (!quirks || quirks.length === 0) {
                quirksContainer.innerHTML = '';
                return;
            }
            quirksContainer.innerHTML = quirks.map(q => `<span class="quirk-chip">${q}</span>`).join('');
        }

        function wireUpQuirksEditor(selectedQuirks) {
            const quirks = window.PB_CONST?.QUIRKS || [];
            if (!editQuirksContainer || quirks.length === 0) return;

            const selected = new Set(selectedQuirks);
            editQuirksContainer.innerHTML = quirks.map(q => `
                <span class="category ${selected.has(q) ? 'active' : ''}" data-value="${q}">${q}</span>
            `).join('');

            editQuirksContainer.addEventListener('click', (e) => {
                const chip = e.target.closest('.category');
                if (chip) {
                    chip.classList.toggle('active');
                }
            });
        }

        function getSelectedQuirks() {
            if (!editQuirksContainer) return [];
            return Array.from(editQuirksContainer.querySelectorAll('.category.active')).map(c => c.dataset.value);
        }

        async function loadAndDisplayStats(uid) {
            const statsContainer = $("#readingStats");
            if (!statsContainer) return;

            try {
                const booksSnap = await db().collection("users").doc(uid).collection("books").get();
                if (booksSnap.empty) return;

                const books = booksSnap.docs.map(d => d.data());
                const currentYear = new Date().getFullYear();

                // --- Calculations ---
                const booksFinishedThisYear = books.filter(b =>
                    b.status === 'finished' && b.finished && new Date(b.finished).getFullYear() === currentYear
                ).length;

                const ratedBooks = books.filter(b => typeof b.rating === 'number' && b.rating > 0);
                const averageRating = ratedBooks.length > 0
                    ? (ratedBooks.reduce((sum, b) => sum + b.rating, 0) / ratedBooks.length).toFixed(1)
                    : 'N/A';

                const genreCounts = books.reduce((counts, book) => {
                    (book.genres || []).forEach(genre => {
                        counts[genre] = (counts[genre] || 0) + 1;
                    });
                    return counts;
                }, {});

                const favoriteGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

                // --- Rendering ---
                statsContainer.innerHTML = `
                    <div class="card-head">
                        <h3>Reading Stats</h3>
                    </div>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <div class="stat-value">${booksFinishedThisYear}</div>
                            <div class="stat-label">Finished This Year</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${averageRating}</div>
                            <div class="stat-label">Average Rating</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${favoriteGenre}</div>
                            <div class="stat-label">Favorite Genre</div>
                        </div>
                    </div>
                `;
                statsContainer.style.display = 'block';

            } catch (error) {
                console.warn("Could not load reading stats:", error);
            }
        }

        async function loadCurrentlyReading(uid, isMyProfile) {
            const shelf = $("#currentlyReadingShelf");
            const grid = shelf?.querySelector(".shelf-grid");
            if (!shelf || !grid) return;

            try {
                const snap = await db().collection("users").doc(uid).collection("books")
                    .where("status", "==", "reading").limit(10).get();

                if (snap.empty) return;

                const fragment = document.createDocumentFragment();
                snap.forEach(doc => {
                    const card = createCardElement(doc, isMyProfile);
                    if (card) fragment.appendChild(card);
                });

                grid.innerHTML = "";
                grid.appendChild(fragment);
                shelf.style.display = 'block';

                if (isMyProfile) {
                    const seeAllBtn = shelf.querySelector('.see-all-btn');
                    if (seeAllBtn) seeAllBtn.style.display = '';
                }

                wireShelfGridActions(grid, isMyProfile, 'currentlyReadingShelf');

            } catch (error) {
                console.warn("Could not load 'Currently Reading' shelf:", error);
            }
        }

        function wireShelfGridActions(grid, isMyProfile, shelfId) {
            grid.addEventListener('click', async (e) => {
                // Handle opening the edit page
                const openBtn = e.target.closest("[data-action='open']");
                if (openBtn) {
                    location.href = `edit-page.html?id=${openBtn.dataset.id}`;
                    return;
                }

                // Handle read button
                const readBtn = e.target.closest("[data-action='read']");
                if (readBtn) {
                    location.href = `reader.html?id=${readBtn.dataset.id}`;
                    return;
                }

                // Handle favorite button clicks
                const favBtn = e.target.closest("[data-action='fav']");
                if (favBtn && isMyProfile) {
                    const card = favBtn.closest('.book-card');
                    const id = card?.dataset.id;
                    if (!id) return;

                    const user = auth().currentUser;
                    if (!user) return;

                    try {
                        const ref = db().collection("users").doc(user.uid).collection("books").doc(id);
                        const snap = await ref.get();
                        const d = snap.data() || {};
                        const nextState = !d.favorite;

                        await ref.set({ favorite: nextState, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });

                        favBtn.classList.toggle("active", nextState);

                        if (shelfId === 'favoritesShelf' && !nextState) {
                            card.remove();
                            if (grid.children.length === 0) {
                                grid.closest('.profile-shelf').style.display = 'none';
                            }
                        }
                    } catch (err) {
                        console.warn("Favorite toggle failed", err);
                    }
                }
            });
        }

        async function loadFavoritesShelf(uid, isMyProfile) {
            const shelf = $("#favoritesShelf");
            const grid = shelf?.querySelector(".shelf-grid");
            if (!shelf || !grid) return;

            try {
                const snap = await db().collection("users").doc(uid).collection("books")
                    .where("favorite", "==", true).limit(10).get();

                if (snap.empty) return;

                const fragment = document.createDocumentFragment();
                snap.forEach(doc => {
                    const card = createCardElement(doc, isMyProfile);
                    if (card) fragment.appendChild(card);
                });

                grid.innerHTML = "";
                grid.appendChild(fragment);
                shelf.style.display = 'block';

                if (isMyProfile) {
                    const seeAllBtn = shelf.querySelector('.see-all-btn');
                    if (seeAllBtn) seeAllBtn.style.display = '';
                }

                wireShelfGridActions(grid, isMyProfile, 'favoritesShelf');

            } catch (error) {
                console.warn("Could not load 'Favorites' shelf:", error);
            }
        }

        async function loadFinishedShelf(uid, isMyProfile) {
            const shelf = $("#finishedShelf");
            const grid = shelf?.querySelector(".shelf-grid");
            if (!shelf || !grid) return;

            try {
                const snap = await db().collection("users").doc(uid).collection("books")
                    .where("status", "==", "finished").orderBy("finished", "desc").limit(10).get();

                if (snap.empty) return;

                const fragment = document.createDocumentFragment();
                snap.forEach(doc => {
                    const card = createCardElement(doc, isMyProfile);
                    if (card) fragment.appendChild(card);
                });

                grid.innerHTML = "";
                grid.appendChild(fragment);
                shelf.style.display = 'block';

                if (isMyProfile) {
                    const seeAllBtn = shelf.querySelector('.see-all-btn');
                    if (seeAllBtn) seeAllBtn.style.display = '';
                }

                wireShelfGridActions(grid, isMyProfile, 'finishedShelf');

            } catch (error) {
                console.warn("Could not load 'Finished Books' shelf:", error);
            }
        }

        async function loadWishlistShelf(uid, isMyProfile) {
            const shelf = $("#wishlistShelf");
            const grid = shelf?.querySelector(".shelf-grid");
            if (!shelf || !grid) return;

            try {
                const snap = await db().collection("users").doc(uid).collection("books")
                    .where("status", "==", "wishlist").limit(10).get();

                if (snap.empty) return;

                const fragment = document.createDocumentFragment();
                snap.forEach(doc => {
                    const card = createCardElement(doc, isMyProfile);
                    if (card) fragment.appendChild(card);
                });

                grid.innerHTML = "";
                grid.appendChild(fragment);
                shelf.style.display = 'block';

                if (isMyProfile) {
                    const seeAllBtn = shelf.querySelector('.see-all-btn');
                    if (seeAllBtn) seeAllBtn.style.display = '';
                }

                wireShelfGridActions(grid, isMyProfile, 'wishlistShelf');

            } catch (error) {
                console.warn("Could not load 'Wishlist' shelf:", error);
            }
        }

        async function calculateAndShowAchievements(uid) {
            const container = $("#achievementsSection");
            const grid = $("#achievementsGrid");
            if (!container || !grid) return;

            const booksSnap = await db().collection("users").doc(uid).collection("books").get();
            const books = booksSnap.docs.map(d => d.data());

            const achievements = [
                { id: 'bookworm', title: 'Bookworm', desc: 'Read 10 books', icon: 'fa-book-open-reader', unlocked: books.filter(b => b.status === 'finished').length >= 10 },
                { id: 'explorer', title: 'Genre Explorer', desc: 'Read from 5+ genres', icon: 'fa-compass', unlocked: new Set(books.flatMap(b => b.genres || [])).size >= 5 },
                { id: 'marathoner', title: 'The Marathoner', desc: 'Finish a 500+ page book', icon: 'fa-person-running', unlocked: books.some(b => b.status === 'finished' && b.pageCount >= 500) },
                { id: 'critic', title: 'The Critic', desc: 'Rate 5 books', icon: 'fa-star', unlocked: books.filter(b => (b.rating || 0) > 0).length >= 5 },
            ];

            grid.innerHTML = achievements.map(a => `
                <div class="achievement-item ${a.unlocked ? '' : 'locked'}">
                    <i class="fa-solid ${a.icon} achievement-icon"></i>
                    <div>
                        <div class="achievement-title">${a.title}</div>
                        <div class="achievement-desc">${a.desc}</div>
                    </div>
                </div>
            `).join('');

            container.style.display = 'block';
        }
    }

    // Use requireAuth to safely run the page logic and prevent race conditions
    window.requireAuth(init);
})();