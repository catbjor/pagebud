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
        const btnEditProfile = $("#btnEditProfile");
        const otherUserActions = $("#otherUserActions");
        const editProfileSection = $("#editProfileSection");
        const btnCreateShelf = $("#btnCreateShelf");
        const btnChangePhoto = $("#btnChangePhoto");
        const photoInput = $("#photoInput");
        const editName = $("#editName");
        const editQuirksContainer = $("#editQuirks");
        const editBio = $("#editBio");
        const btnSaveChanges = $("#btnSaveChanges");
        const headerTitle = $("#profileHeaderTitle");
        const btnAddFriend = $("#btnAddFriend");
        const btnMessage = $("#btnMessage");
        const btnMoreOptions = $("#btnMoreOptions");

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
            try {
                const usernameSnap = await db().collection("usernames").where("uid", "==", profileUid).limit(1).get();
                if (!usernameSnap.empty) {
                    profileData.username = usernameSnap.docs[0].id;
                }
            } catch (e) {
                console.warn("Could not fetch username, possibly missing index:", e);
                // Continue without the username, don't crash the page.
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

            const streak = await calculateStreak(profileUid); // This function was missing
            calculateAndShowAchievements(profileUid, streak);
            loadAndDisplayBadges(profileUid); // New function call

            loadCurrentlyReading(profileUid, isMyProfile);
            loadFavoritesShelf(profileUid, isMyProfile);
            loadFinishedShelf(profileUid, isMyProfile);
            loadWishlistShelf(profileUid, isMyProfile);
            loadAndRenderCustomShelves(profileUid, isMyProfile);
            if (isMyProfile) loadNotesAndQuotes(me.uid); // Load notes for own profile

            if (!isMyProfile) {
                checkFriendshipAndShowActions(me.uid, profileUid);
                calculateAndShowCompatibility(me, profileData);
            }

        } catch (error) {
            console.error("Failed to load profile:", error);
            nameEl.textContent = "Error loading profile";
            return; // Stop execution if the main profile doc fails to load
        }

        // --- Conditional UI ---
        if (isMyProfile) {
            btnEditProfile.style.display = 'inline-flex';
            btnCreateShelf.style.display = 'inline-flex';
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
            btnCreateShelf.addEventListener('click', createNewShelf);

        } else {
            otherUserActions.style.display = 'flex';
            btnMoreOptions.addEventListener('click', () => showMoreOptions(profileUid, profileData.displayName));
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

        async function createNewShelf() {
            const shelfName = prompt("Enter a name for your new shelf:", "");
            if (!shelfName || shelfName.trim().length === 0) {
                return;
            }

            try {
                await db().collection("users").doc(me.uid).collection("shelves").add({
                    name: shelfName.trim(),
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    bookIds: []
                });
                // Simple refresh to show the new shelf
                location.reload();
            } catch (error) {
                console.error("Failed to create shelf:", error);
                alert("Could not create the shelf. Please try again.");
            }
        }


        async function addFriend(fromUid, toUid) {
            // This logic is now aligned with friends.js and your security rules,
            // using the top-level /friend_requests collection.
            const reqId = [fromUid, toUid].sort().join("__");
            const ref = db().collection("friend_requests").doc(reqId);
            const snap = await ref.get();

            if (snap.exists) {
                const cur = snap.data() || {};
                if (cur.status === "accepted") { alert("You’re already friends."); return; }
                if (cur.status === "pending") { alert("Request already pending."); return; }
            }

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

        function showMoreOptions(theirUid, theirName) {
            // In a real app, this would open a proper menu. For now, we'll use a simple prompt.
            const action = prompt(`More options for ${theirName}:\n\nType "block" to block this user.`, "");
            if (action?.toLowerCase() === 'block') {
                blockUser(me.uid, theirUid, theirName);
            }
        }

        async function blockUser(myUid, theirUid, theirName) {
            if (!confirm(`Are you sure you want to block ${theirName}? You will no longer see each other's profiles or activity.`)) {
                return;
            }
            try {
                await db().collection("users").doc(myUid).collection("blocked").doc(theirUid).set({ at: new Date() });
                alert(`${theirName} has been blocked.`);
                location.href = 'index.html'; // Redirect away from their profile
            } catch (error) {
                alert("Could not block user. Please try again.");
            }
        }

        async function checkFriendshipAndShowActions(myUid, theirUid) {
            const friendDoc = await db().collection("users").doc(myUid).collection("friends").doc(theirUid).get();
            const isFriend = friendDoc.exists && friendDoc.data().status === 'accepted';

            btnMessage.addEventListener('click', () => location.href = `chat.html?buddy=${theirUid}`);

            if (isFriend) {
                btnAddFriend.textContent = 'Friends ✓';
                btnAddFriend.disabled = true; // Disable if already friends
                // Optionally, add an unfriend button if desired
                // btnAddFriend.onclick = () => unfriend(myUid, theirUid);
            } else {
                // Check the top-level collection for a pending request
                const reqId = [myUid, theirUid].sort().join("__");
                const reqDoc = await db().collection("friend_requests").doc(reqId).get();
                if (reqDoc.exists && reqDoc.data().status === 'pending') {
                    btnAddFriend.textContent = 'Request Pending...';
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

        // --- Notes & Quotes Section ---
        let allQuotes = []; // Cache for search functionality

        function renderNotes(quotesToRender) {
            const listEl = $("#notesAndQuotesList");
            if (!listEl) return;

            if (quotesToRender.length === 0) {
                listEl.innerHTML = `<p class="muted">No matching notes found.</p>`;
                return;
            }

            listEl.innerHTML = quotesToRender.map(quote => {
                const noteHtml = quote.note ? `<div class="note-body">${quote.note}</div>` : '';
                // Pass the full quote object to the share button
                const quoteData = encodeURIComponent(JSON.stringify(quote));
                return `
                    <div class="quote-item" data-search-text="${(quote.text + ' ' + quote.note).toLowerCase()}">
                        <blockquote class="quote-text">“${quote.text}”</blockquote>
                        ${noteHtml}
                        <div class="quote-meta">
                            <span>From <strong>${quote.bookTitle || 'a book'}</strong></span>
                            <button class="btn btn-secondary small" data-action="share-quote" data-quote='${quoteData}'>
                                <i class="fa-solid fa-share-nodes"></i> Share
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        async function generateQuoteCard(quote) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const width = 1080;
            const height = 1080;
            canvas.width = width;
            canvas.height = height;

            // Background
            ctx.fillStyle = '#111827'; // Dark theme background
            ctx.fillRect(0, 0, width, height);

            // Book Cover Image
            const bookCoverUrl = quote.bookCoverUrl; // Assuming you save this when creating a quote
            if (bookCoverUrl) {
                try {
                    const img = new Image();
                    img.crossOrigin = "anonymous"; // Important for cross-origin images
                    img.src = bookCoverUrl;
                    await new Promise(resolve => { img.onload = resolve; });
                    // Draw a blurred, full-canvas background
                    ctx.globalAlpha = 0.2;
                    ctx.filter = 'blur(20px)';
                    ctx.drawImage(img, -50, -50, width + 100, height + 100);
                    ctx.globalAlpha = 1.0;
                    ctx.filter = 'none';
                } catch (e) { console.warn("Could not load cover for quote card", e); }
            }

            // Quote Text
            ctx.fillStyle = '#e5e7eb';
            ctx.textAlign = 'center';
            ctx.font = 'italic bold 60px Georgia, serif';
            const quoteLines = wrapText(ctx, `“${quote.text}”`, width - 120);
            let y = height / 2 - (quoteLines.length / 2 * 70);
            quoteLines.forEach(line => {
                ctx.fillText(line, width / 2, y);
                y += 70; // Line height
            });

            // Book Title
            ctx.font = '50px "system-ui", sans-serif';
            ctx.fillText(`— ${quote.bookTitle}`, width / 2, y + 50);

            // App Watermark
            ctx.font = '30px "system-ui", sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.fillText('Shared from PageBud', width / 2, height - 60);

            return canvas;
        }

        // Helper to wrap text for canvas
        function wrapText(context, text, maxWidth) {
            const words = text.split(' ');
            const lines = [];
            let currentLine = words[0];
            for (let i = 1; i < words.length; i++) {
                const word = words[i];
                const width = context.measureText(currentLine + " " + word).width;
                if (width < maxWidth) {
                    currentLine += " " + word;
                } else {
                    lines.push(currentLine);
                    currentLine = word;
                }
            }
            lines.push(currentLine);
            return lines;
        }

        // New function to load and display all notes and quotes
        async function loadNotesAndQuotes(uid) {
            const section = $("#notesAndQuotesSection");
            if (!section) return;

            try {
                const snap = await db().collection("users").doc(uid).collection("quotes")
                    .orderBy("createdAt", "desc").limit(20).get();

                if (snap.empty) return;

                // Fetch book cover URLs for the quotes
                const bookIds = [...new Set(snap.docs.map(d => d.data().bookId))];
                const bookCoverPromises = bookIds.map(id => db().collection("users").doc(uid).collection("books").doc(id).get());
                const bookSnaps = await Promise.all(bookCoverPromises);
                const bookCoverMap = new Map(bookSnaps.map(s => [s.id, s.data()?.coverUrl]));

                allQuotes = snap.docs.map(doc => ({ ...doc.data(), bookCoverUrl: bookCoverMap.get(doc.data().bookId) }));
                renderNotes(allQuotes);
                section.style.display = 'block';

            } catch (error) {
                console.warn("Could not load notes and quotes:", error);
                section.style.display = 'none';
            }
        }

        // Wire up the new search and share functionality
        const notesSearchInput = $("#notesSearchInput");
        if (notesSearchInput) {
            notesSearchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                if (!query) {
                    renderNotes(allQuotes);
                    return;
                }
                const filtered = allQuotes.filter(q =>
                    q.text.toLowerCase().includes(query) ||
                    (q.note && q.note.toLowerCase().includes(query)) ||
                    q.bookTitle.toLowerCase().includes(query)
                );
                renderNotes(filtered);
            });
        }

        const notesList = $("#notesAndQuotesList");
        if (notesList) {
            notesList.addEventListener('click', async (e) => {
                const shareBtn = e.target.closest('[data-action="share-quote"]');
                if (!shareBtn) return;

                const quote = JSON.parse(decodeURIComponent(shareBtn.dataset.quote));
                const modal = $("#quoteCardModal");
                const canvasWrap = $("#quoteCardCanvasWrap");
                const downloadBtn = $("#downloadQuoteCardBtn");
                canvasWrap.innerHTML = `<p class="muted">Generating card...</p>`;
                modal.style.display = 'flex';
                const canvas = await generateQuoteCard(quote);
                canvasWrap.innerHTML = '';
                canvasWrap.appendChild(canvas);
                downloadBtn.href = canvas.toDataURL('image/png');
            });
        }
        $("#closeQuoteCardBtn")?.addEventListener('click', () => $("#quoteCardModal").style.display = 'none');

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

        // --- This function was missing ---
        async function calculateStreak(uid) {
            try {
                const ninetyDaysAgo = new Date();
                ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

                const sessionsSnap = await db().collection("users").doc(uid).collection("sessions")
                    .where("at", ">=", ninetyDaysAgo).orderBy("at", "desc").get();

                if (sessionsSnap.empty) return 0;

                const toDayStr = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
                const readingDays = [...new Set(sessionsSnap.docs.map(d => d.data().date))].sort().reverse();
                if (readingDays.length === 0) return 0;

                let streak = 0;
                const today = new Date();
                const yesterday = new Date(today);
                yesterday.setDate(today.getDate() - 1);

                if (readingDays[0] === toDayStr(today) || readingDays[0] === toDayStr(yesterday)) {
                    streak = 1;
                    for (let i = 0; i < readingDays.length - 1; i++) {
                        const diffTime = new Date(readingDays[i]).getTime() - new Date(readingDays[i + 1]).getTime();
                        if (Math.round(diffTime / (1000 * 60 * 60 * 24)) === 1) streak++;
                        else break;
                    }
                }
                return streak;
            } catch (error) {
                console.warn("Could not calculate streak:", error);
                return 0;
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

        async function calculateAndShowAchievements(uid, streak) {
            const container = $("#achievementsSection");
            const grid = $("#achievementsGrid");
            if (!container || !grid) return;

            const booksSnap = await db().collection("users").doc(uid).collection("books").get();
            const books = booksSnap.docs.map(d => d.data());

            const achievements = [
                { id: 'bookworm', title: 'Bookworm', desc: 'Read 10 books', icon: 'fa-book-open-reader', unlocked: books.filter(b => b.status === 'finished').length >= 10 },
                { id: 'explorer', title: 'Genre Explorer', desc: 'Read from 5+ genres', icon: 'fa-compass', unlocked: new Set(books.flatMap(b => b.genres || [])).size >= 5 },
                { id: 'streak', title: 'Streak Keeper', desc: 'Read for 7 days in a row', icon: 'fa-fire', unlocked: streak >= 7 },
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

    async function loadAndDisplayBadges(uid) {
        const container = $("#badgesSection");
        const grid = $("#badgesGrid");
        if (!container || !grid) return;

        try {
            const snap = await db().collection("users").doc(uid).collection("active_challenges")
                .where("completedAt", "!=", null)
                .orderBy("completedAt", "desc")
                .get();

            if (snap.empty) return;

            const badgeIconMap = {
                'tbr_5_2024': 'fa-list-check',
                'genre_explorer_2024': 'fa-compass',
                'big_book_2024': 'fa-book-journal-whills',
                'new_author_2024': 'fa-feather-pointed',
                'default': 'fa-trophy'
            };

            grid.innerHTML = snap.docs.map(doc => {
                const challenge = doc.data();
                const icon = badgeIconMap[challenge.challengeId] || badgeIconMap['default'];
                const completedDate = challenge.completedAt?.toDate ? challenge.completedAt.toDate().toLocaleDateString() : '';

                return `
                    <div class="badge-item" title="Completed on ${completedDate}">
                        <div class="badge-icon-wrap">
                            <i class="fa-solid ${icon} badge-icon"></i>
                        </div>
                        <div class="badge-title">${challenge.title || 'Challenge Complete'}</div>
                    </div>
                `;
            }).join('');

            container.style.display = 'block';
        } catch (error) {
            console.warn("Could not load badges:", error);
        }
    }

    // Use requireAuth to safely run the page logic and prevent race conditions
    window.onAuthReady.then(user => {
        if (user) {
            init(user);
        } else {
            // If no user, redirect to login. This is the safe way.
            location.href = 'auth.html';
        }
    });
})();