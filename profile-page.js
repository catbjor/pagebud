// profile-page.js — shelves manager + per-card "Add to Shelf", photo save (no Storage)
// with Edit Profile as a mobile bottom sheet
(function () {
    "use strict";

    // ------------------ helpers ------------------
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from((r || document).querySelectorAll(s));
    const phCover =
        "data:image/svg+xml;utf8," +
        encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="100%" height="100%" rx="12" fill="#e5e7eb"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="22" fill="#9aa3af" font-family="system-ui,-apple-system,Segoe UI,Roboto">No cover</text></svg>`
        );
    const esc = (s) =>
        String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

    function auth() {
        if (window.fb?.auth) return window.fb.auth;
        if (window.firebase?.auth) return window.firebase.auth();
        return firebase.auth();
    }
    function db() {
        if (window.fb?.db) return window.fb.db;
        if (window.firebase?.firestore) return window.firebase.firestore();
        return firebase.firestore();
    }

    // file -> objectURL -> canvas compress -> dataURL (JPEG)
    function fileToCompressedDataURL(file, maxW = 360, maxH = 360, quality = 0.85) {
        return new Promise((resolve, reject) => {
            try {
                const img = new Image();
                const url = URL.createObjectURL(file);
                img.onload = () => {
                    try {
                        const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
                        const w = Math.max(1, Math.round(img.naturalWidth * ratio));
                        const h = Math.max(1, Math.round(img.naturalHeight * ratio));
                        const canvas = document.createElement("canvas");
                        canvas.width = w;
                        canvas.height = h;
                        const ctx = canvas.getContext("2d");
                        ctx.drawImage(img, 0, 0, w, h);
                        const dataUrl = canvas.toDataURL("image/jpeg", quality);
                        URL.revokeObjectURL(url);
                        resolve(dataUrl);
                    } catch (e) {
                        URL.revokeObjectURL(url);
                        reject(e);
                    }
                };
                img.onerror = () => {
                    URL.revokeObjectURL(url);
                    reject(new Error("Image load failed"));
                };
                img.src = url;
            } catch (e) {
                reject(e);
            }
        });
    }

    // ------------- card widgets -------------
    function starsRow(val) {
        const full = Math.floor(Number(val) || 0);
        let out = "";
        for (let i = 1; i <= 6; i++)
            out += `<span class="${i <= full ? "card-star--on" : "card-star"}"></span>`;
        return out;
    }
    function chilisRow(val) {
        const full = Math.floor(Number(val) || 0);
        let out = "";
        for (let i = 1; i <= 5; i++)
            out += `<span class="${i <= full ? "card-chili--on" : "card-chili"}"></span>`;
        return out;
    }
    function createCardElement(doc, isMyProfile) {
        const tpl = document.getElementById("book-card-template");
        if (!tpl) return null;
        const card = tpl.content.cloneNode(true).firstElementChild;

        const d = doc.data ? (doc.data() || {}) : doc;
        const id = doc.id || d.id;
        card.dataset.id = id;

        const cover = d.coverUrl || d.coverDataUrl || phCover;
        const title = d.title || "Untitled";
        const author = d.author || "";

        const thumb = card.querySelector(".thumb");
        if (thumb) {
            thumb.src = cover;
            thumb.alt = `Cover for ${title}`;
            thumb.onerror = () => {
                thumb.onerror = null;
                thumb.src = phCover;
            };
        }

        const ttl = card.querySelector(".title");
        const aut = card.querySelector(".author");
        if (ttl) ttl.textContent = title;
        if (aut) aut.textContent = author;

        const rating = Number(d.rating || 0);
        if (rating > 0) {
            const badge = card.querySelector(".rated-badge");
            if (badge) {
                const label = Number.isInteger(rating)
                    ? String(rating)
                    : String(Math.round(rating * 10) / 10);
                badge.title = `Rated ${label}`;
                badge.querySelector(".val").textContent = label;
                badge.style.display = "";
            }
        }

        const heartBtn = card.querySelector(".heart-btn");
        if (heartBtn) {
            heartBtn.classList.toggle("active", !!d.favorite);
            heartBtn.dataset.id = id;
        }

        const stars = card.querySelector(".rating-stars");
        const chilis = card.querySelector(".spice-chilis");
        if (stars) stars.innerHTML = starsRow(rating);
        if (chilis) chilis.innerHTML = chilisRow(Number(d.spice || 0));

        const editBtn = card.querySelector('[data-action="open"]');
        const readBtn = card.querySelector('[data-action="read"]');
        const addBtn = card.querySelector('[data-action="addtoshelf"]'); // optional

        if (isMyProfile) {
            if (editBtn) editBtn.dataset.id = id;
            if (addBtn) {
                addBtn.dataset.id = id;
                addBtn.style.display = "";
            }
        } else {
            if (editBtn) editBtn.style.display = "none";
            if (addBtn) addBtn.style.display = "none";
        }
        if (d.hasFile && readBtn) {
            readBtn.dataset.id = id;
            readBtn.style.display = "";
        }

        return card;
    }

    // ------------------ init ------------------
    async function init(me) {
        const urlParams = new URLSearchParams(window.location.search);
        const profileUid = urlParams.get("uid") || me.uid;
        const isMyProfile = profileUid === me.uid;

        // DOM
        const photoEl = $("#profilePhoto");
        const nameEl = $("#profileName");
        const usernameEl = $("#profileUsername");
        const bioEl = $("#profileBio");
        const btnEditProfile = $("#btnEditProfile");
        const otherUserActions = $("#otherUserActions");
        const editProfileSection = $("#editProfileSection");
        const btnCreateShelf = $("#btnCreateShelf");
        const btnChangePhoto = $("#btnChangePhoto");
        const photoInput = $("#photoInput");
        const editName = $("#editName");
        const editBio = $("#editBio");
        const headerTitle = $("#profileHeaderTitle");
        const btnAddFriend = $("#btnAddFriend");
        const btnMessage = $("#btnMessage");
        const btnMoreOptions = $("#btnMoreOptions");
        const btnSaveChanges = $("#btnSaveChanges");

        // Add "Save Photo" button dynamically (so HTML doesn’t need to change)
        let btnSavePhoto = $("#btnSavePhoto");
        if (!btnSavePhoto) {
            btnSavePhoto = document.createElement("button");
            btnSavePhoto.id = "btnSavePhoto";
            btnSavePhoto.className = "btn btn-primary small";
            btnSavePhoto.style.display = "none";
            btnSavePhoto.style.marginTop = "10px";
            btnSavePhoto.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save Photo`;
            const photoWrap = $(".profile-photo-wrap");
            (photoWrap?.parentElement || $(".profile-card"))?.insertBefore(
                btnSavePhoto,
                photoWrap?.nextSibling || null
            );
        }

        let profileData = null;

        try {
            const userDoc = await db().collection("users").doc(profileUid).get();
            if (!userDoc.exists) {
                if (nameEl) nameEl.textContent = "User not found";
                return;
            }
            profileData = userDoc.data() || {};
            profileData.uid = profileUid;

            // username (non-fatal)
            try {
                const uSnap = await db()
                    .collection("usernames")
                    .where("uid", "==", profileUid)
                    .limit(1)
                    .get();
                if (!uSnap.empty) profileData.username = uSnap.docs[0].id;
            } catch (e) {
                console.warn("Username lookup skipped:", e);
            }

            // populate UI
            if (nameEl) nameEl.textContent = profileData.displayName || "No name";
            if (usernameEl) usernameEl.textContent = profileData.username ? `@${profileData.username}` : "";
            if (photoEl)
                photoEl.src =
                    profileData.photoURL ||
                    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
            if (bioEl)
                bioEl.textContent =
                    profileData.bio ||
                    (isMyProfile
                        ? "You haven't written a bio yet. Click 'Edit Profile' to add one."
                        : "This user hasn't written a bio yet.");
            renderQuirks(profileData.quirks || []);
            if (isMyProfile && headerTitle) headerTitle.textContent = "My Profile";

            // sections (fire and forget; each has its own try/catch)
            const streak = await calculateStreak(profileUid);
            await calculateAndShowAchievements(profileUid, streak);
            await loadAndDisplayBadges(profileUid);

            await Promise.all([
                loadCurrentlyReading(profileUid, isMyProfile),
                loadFavoritesShelf(profileUid, isMyProfile),
                loadFinishedShelf(profileUid, isMyProfile),
                loadWishlistShelf(profileUid, isMyProfile),
                loadAndRenderCustomShelves(profileUid, isMyProfile),
            ]);

            if (isMyProfile) {
                await loadNotesAndQuotes(me.uid);
            } else {
                await checkFriendshipAndShowActions(me.uid, profileUid);
                if (typeof calculateAndShowCompatibility === "function") {
                    try {
                        await calculateAndShowCompatibility(me, profileData);
                    } catch { }
                }
            }
        } catch (error) {
            console.error("Failed to load profile:", error);
            if (nameEl) nameEl.textContent = "Error loading profile";
            return;
        }

        // --------- own profile controls ---------
        let pendingPhotoDataURL = null;

        if (isMyProfile) {
            if (btnEditProfile) btnEditProfile.style.display = "inline-flex";
            if (btnCreateShelf) btnCreateShelf.style.display = "inline-flex";
            if (btnChangePhoto) btnChangePhoto.style.display = "grid";

            if (editName) editName.value = profileData.displayName || "";
            wireUpQuirksEditor(profileData.quirks || []);
            if (editBio) editBio.value = profileData.bio || "";

            // ======== Edit Profile as a mobile bottom sheet ========
            const editSection = editProfileSection;

            // create a backdrop once (for mobile sheet)
            let editBackdrop = $("#editBackdrop");
            if (!editBackdrop) {
                editBackdrop = document.createElement("div");
                editBackdrop.id = "editBackdrop";
                editBackdrop.className = "sheet-backdrop";
                document.body.appendChild(editBackdrop);
            }

            // add a close (×) button to the section if it doesn't exist
            let editCloseBtn = $("#editCloseBtn");
            if (!editCloseBtn && editSection) {
                editCloseBtn = document.createElement("button");
                editCloseBtn.id = "editCloseBtn";
                editCloseBtn.className = "btn btn-icon sheet-close";
                editCloseBtn.innerHTML = `<i class="fa fa-times"></i>`;
                editSection.prepend(editCloseBtn);
            }

            const isPhone = () => window.matchMedia("(max-width: 768px)").matches;

            function openEdit() {
                if (!editSection) return;

                if (isPhone()) {
                    document.body.classList.add("no-scroll");
                    editBackdrop.classList.add("show");
                    editSection.classList.add("sheet-open");
                    setTimeout(() => editSection.querySelector("input,textarea,select,button")?.focus(), 120);
                } else {
                    editSection.style.display = "block";
                    editSection.scrollIntoView({ behavior: "smooth", block: "start" });
                }
            }

            function closeEdit() {
                if (!editSection) return;

                if (isPhone()) {
                    document.body.classList.remove("no-scroll");
                    editBackdrop.classList.remove("show");
                    editSection.classList.remove("sheet-open");
                } else {
                    editSection.style.display = "none";
                }
            }

            btnEditProfile?.addEventListener("click", () => {
                if (!isPhone()) {
                    const visible = editSection && editSection.style.display === "block";
                    if (visible) closeEdit();
                    else openEdit();
                } else {
                    openEdit();
                }
            });
            editBackdrop.addEventListener("click", closeEdit);
            editCloseBtn?.addEventListener("click", closeEdit);
            // ======== end bottom sheet wiring ========

            btnChangePhoto?.addEventListener("click", () => photoInput?.click());
            photoInput?.addEventListener("change", async () => {
                const file = photoInput.files?.[0];
                if (!file) return;
                try {
                    pendingPhotoDataURL = await fileToCompressedDataURL(file, 360, 360, 0.85);
                    if (photoEl) photoEl.src = pendingPhotoDataURL;
                    btnSavePhoto.style.display = "";
                } catch (e) {
                    console.error(e);
                    alert("Could not prepare the photo. Try a different image.");
                    pendingPhotoDataURL = null;
                    btnSavePhoto.style.display = "none";
                }
            });

            btnSavePhoto.addEventListener("click", async () => {
                if (!pendingPhotoDataURL) return;
                btnSavePhoto.disabled = true;
                btnSavePhoto.innerHTML = `<i class="fa fa-spinner fa-spin"></i> Saving...`;
                try {
                    await db()
                        .collection("users")
                        .doc(me.uid)
                        .set(
                            {
                                photoURL: pendingPhotoDataURL,
                                photoUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                            },
                            { merge: true }
                        );
                    alert("Profile photo saved!");
                    pendingPhotoDataURL = null;
                    btnSavePhoto.style.display = "none";
                } catch (e) {
                    console.error("Photo save failed:", e);
                    alert("Could not save the photo. Try another photo.");
                } finally {
                    btnSavePhoto.disabled = false;
                    btnSavePhoto.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save Photo`;
                }
            });

            btnSaveChanges?.addEventListener("click", saveChanges);
            btnCreateShelf?.addEventListener("click", createNewShelf);

            async function saveChanges() {
                const newName = (editName?.value || "").trim();
                const newQuirks = getSelectedQuirks();
                const newBio = (editBio?.value || "").trim();

                if (btnSaveChanges) {
                    btnSaveChanges.disabled = true;
                    btnSaveChanges.textContent = "Saving...";
                }

                try {
                    const updates = {
                        displayName: newName,
                        quirks: newQuirks,
                        bio: newBio,
                        displayName_lower: (newName || "").toLowerCase(),
                    };
                    await db().collection("users").doc(me.uid).set(updates, { merge: true });

                    if (nameEl) nameEl.textContent = newName || "No name";
                    renderQuirks(newQuirks);
                    if (bioEl)
                        bioEl.textContent =
                            newBio || "You haven't written a bio yet. Click 'Edit Profile' to add one.";
                    alert("Profile saved!");

                    // close the sheet on mobile after save
                    if (window.matchMedia("(max-width: 768px)").matches) {
                        setTimeout(() => {
                            document.body.classList.remove("no-scroll");
                            $("#editBackdrop")?.classList.remove("show");
                            editProfileSection?.classList.remove("sheet-open");
                        }, 150);
                    }
                } catch (error) {
                    console.error("Failed to save profile:", error);
                    alert("Could not save. Please try again.");
                } finally {
                    if (btnSaveChanges) {
                        btnSaveChanges.disabled = false;
                        btnSaveChanges.textContent = "Save Changes";
                    }
                }
            }
        } else {
            if (otherUserActions) otherUserActions.style.display = "flex";
            btnMoreOptions?.addEventListener("click", () =>
                showMoreOptions(profileData.uid, profileData.displayName || "this user")
            );
            btnMessage?.addEventListener("click", () => (location.href = `chat.html?buddy=${profileData.uid}`));
        }

        // ---------- shelves (create + render custom) ----------
        async function createNewShelf() {
            const shelfName = prompt("Name your new shelf:", "");
            if (!shelfName || !shelfName.trim()) return;
            try {
                await db()
                    .collection("users")
                    .doc(me.uid)
                    .collection("shelves")
                    .add({
                        name: shelfName.trim(),
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        bookIds: [],
                    });
                await loadAndRenderCustomShelves(me.uid, true);
            } catch (error) {
                console.error("Failed to create shelf:", error);
                alert("Could not create the shelf. Please try again.");
            }
        }

        function renderSkeletons(host, count = 3) {
            const tpl = $("#skeleton-card-template");
            if (!tpl || !host) return;
            const frag = document.createDocumentFragment();
            for (let i = 0; i < count; i++) frag.appendChild(tpl.content.cloneNode(true));
            host.appendChild(frag);
        }

        async function loadAndRenderCustomShelves(uid, isMy) {
            const container = $("#customShelvesContainer");
            if (!container) return;
            container.innerHTML = "";

            try {
                const snap = await db()
                    .collection("users")
                    .doc(uid)
                    .collection("shelves")
                    .orderBy("order", "asc")
                    .orderBy("createdAt", "desc")
                    .get();

                if (snap.empty) return;

                for (const shelfDoc of snap.docs) {
                    const shelf = shelfDoc.data() || {};
                    const shelfId = shelfDoc.id;
                    const name = shelf.name || "Untitled Shelf";
                    const bookIds = Array.isArray(shelf.bookIds) ? shelf.bookIds.slice(0, 24) : [];

                    const sec = document.createElement("section");
                    sec.className = "profile-shelf card";
                    sec.dataset.shelfId = shelfId;

                    const head = document.createElement("div");
                    head.className = "card-head";
                    head.innerHTML = `<h3><span class="shelf-handle" style="display:none; cursor:grab; margin-right:8px;">☰</span>${esc(
                        name
                    )}</h3>`;

                    if (isMy) {
                        const actions = document.createElement("div");
                        actions.className = "shelf-actions";
                        actions.innerHTML = `
              <button class="btn btn-icon" title="Rename shelf" data-rename="${esc(
                            shelfId
                        )}"><i class="fa fa-pen"></i></button>
              <button class="btn btn-icon" title="Manage books in this shelf" data-manage="${esc(
                            shelfId
                        )}"><i class="fa-solid fa-list-check"></i></button>
              <button class="btn btn-icon" title="Delete shelf" data-delete="${esc(
                            shelfId
                        )}"><i class="fa fa-trash"></i></button>
            `;
                        head.appendChild(actions);
                        head.querySelector(".shelf-handle").style.display = "inline-block";
                    }

                    const grid = document.createElement("div");
                    grid.className = "shelf-grid";
                    sec.appendChild(head);
                    sec.appendChild(grid);
                    container.appendChild(sec);

                    if (bookIds.length) {
                        renderSkeletons(grid, Math.min(bookIds.length, 5));
                        const refs = bookIds.map((id) =>
                            db().collection("users").doc(uid).collection("books").doc(id).get()
                        );
                        const bookSnaps = await Promise.all(refs);
                        const frag = document.createDocumentFragment();
                        bookSnaps.forEach((bs) => {
                            if (!bs.exists) return;
                            const card = createCardElement(bs, isMy);
                            if (card) frag.appendChild(card);
                        });
                        grid.innerHTML = "";
                        grid.appendChild(frag);
                        wireShelfGridActions(grid, isMy, "customShelf");
                    } else {
                        grid.innerHTML = `<div class="muted">No books yet.</div>`;
                    }
                }

                // Drag-and-drop reordering (optional)
                if (isMy && typeof Sortable !== "undefined") {
                    Sortable.create(container, {
                        animation: 150,
                        handle: ".shelf-handle",
                        onEnd: async () => {
                            const shelfElements = $$("[data-shelf-id]", container);
                            const batch = db().batch();
                            shelfElements.forEach((el, index) => {
                                const id = el.dataset.shelfId;
                                if (id) {
                                    const ref = db().collection("users").doc(uid).collection("shelves").doc(id);
                                    batch.update(ref, { order: index });
                                }
                            });
                            try {
                                await batch.commit();
                            } catch (e) {
                                console.error("Shelf reorder failed", e);
                            }
                        },
                    });
                }

                // delegated actions
                container.onclick = async (e) => {
                    const renameBtn = e.target.closest("[data-rename]");
                    const delBtn = e.target.closest("[data-delete]");
                    const manageBtn = e.target.closest("[data-manage]");

                    if (renameBtn) {
                        const id = renameBtn.getAttribute("data-rename");
                        const newName = prompt("New shelf name:");
                        if (!newName || !newName.trim()) return;
                        await db()
                            .collection("users")
                            .doc(uid)
                            .collection("shelves")
                            .doc(id)
                            .set({ name: newName.trim() }, { merge: true });
                        await loadAndRenderCustomShelves(uid, isMy);
                    }
                    if (delBtn) {
                        const id = delBtn.getAttribute("data-delete");
                        if (!confirm("Delete this shelf? This does NOT delete your books.")) return;
                        await db().collection("users").doc(uid).collection("shelves").doc(id).delete();
                        await loadAndRenderCustomShelves(uid, isMy);
                    }
                    if (manageBtn) {
                        const id = manageBtn.getAttribute("data-manage");
                        const name =
                            manageBtn.closest("section")?.querySelector(".card-head h3")?.textContent || "Shelf";
                        await openShelfPicker(uid, id, name);
                        await loadAndRenderCustomShelves(uid, isMy);
                    }
                };
            } catch (e) {
                console.warn("Custom shelves failed:", e);
            }
        }

        // ---------- Shelf Picker (manage one shelf’s books at once) ----------
        async function openShelfPicker(uid, shelfId, shelfName = "Shelf") {
            const modal = $("#shelfPickerModal");
            const nameEl = $("#spShelfName");
            const listEl = $("#spList");
            const searchEl = $("#spSearch");
            const countEl = $("#spCount");
            const btnSave = $("#spSave");
            const btnCancel = $("#spCancel");

            if (!modal) return;

            nameEl.textContent = shelfName;
            listEl.innerHTML = `<div class="muted">Loading your books…</div>`;
            countEl.textContent = "0";
            modal.classList.add("show");

            const shelfRef = db().collection("users").doc(uid).collection("shelves").doc(shelfId);
            const shelfSnap = await shelfRef.get();
            const selected = new Set(
                shelfSnap.exists && Array.isArray(shelfSnap.data().bookIds)
                    ? shelfSnap.data().bookIds
                    : []
            );

            let booksSnap;
            try {
                booksSnap = await db()
                    .collection("users")
                    .doc(uid)
                    .collection("books")
                    .orderBy("createdAt", "desc")
                    .limit(300)
                    .get();
            } catch {
                booksSnap = await db().collection("users").doc(uid).collection("books").limit(300).get();
            }

            const books = booksSnap.docs.map((d) => {
                const b = d.data() || {};
                return {
                    id: d.id,
                    title: b.title || "Untitled",
                    author: b.author || "",
                    cover: b.coverUrl || b.coverDataUrl || "",
                    search: ((b.title || "") + " " + (b.author || "")).toLowerCase(),
                };
            });

            function render(items) {
                if (!items.length) {
                    listEl.innerHTML = `<div class="muted">No books found.</div>`;
                    return;
                }
                listEl.innerHTML = items
                    .map(
                        (b) => `
          <div class="shelf-picker-item ${selected.has(b.id) ? "selected" : ""}" data-id="${esc(
                            b.id
                        )}" data-search="${esc(b.search)}" title="${esc(b.title)} — ${esc(b.author)}">
            <img class="cover" src="${esc(
                            b.cover
                        )}" onerror="this.src='';this.style.background='#eee'">
            <div class="col">
              <div class="t">${esc(b.title)}</div>
              <div class="a">${esc(b.author)}</div>
            </div>
            <div class="check" aria-hidden="true"></div>
          </div>`
                    )
                    .join("");
                countEl.textContent = String(selected.size);
            }
            render(books);

            listEl.onclick = (e) => {
                const item = e.target.closest(".shelf-picker-item");
                if (!item) return;
                const id = item.getAttribute("data-id");
                if (selected.has(id)) {
                    selected.delete(id);
                    item.classList.remove("selected");
                } else {
                    selected.add(id);
                    item.classList.add("selected");
                }
                countEl.textContent = String(selected.size);
            };

            searchEl.oninput = (e) => {
                const q = (e.target.value || "").toLowerCase().trim();
                if (!q) return render(books);
                render(books.filter((b) => b.search.includes(q)));
            };

            const closeModal = () => modal.classList.remove("show");
            btnCancel.onclick = closeModal;
            modal.addEventListener("click", (e) => {
                if (e.target === modal) closeModal();
            });

            btnSave.onclick = async () => {
                btnSave.disabled = true;
                btnSave.textContent = "Saving…";
                try {
                    await shelfRef.set(
                        {
                            name: shelfName,
                            bookIds: Array.from(selected),
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        },
                        { merge: true }
                    );
                    closeModal();
                } catch (e) {
                    console.warn(e);
                    alert("Could not save shelf.");
                } finally {
                    btnSave.disabled = false;
                    btnSave.textContent = "Save to Shelf";
                }
            };
        }

        // ---------- Quick chooser: add a single book to shelves ----------
        async function openAddToShelfForBook(uid, bookId, bookTitle) {
            const modal = $("#shelfChooserModal");
            const listEl = $("#scList");
            const titleEl = $("#scBookTitle");
            const newNameInput = $("#scNewName");
            const btnCreate = $("#scCreate");
            const btnCancel = $("#scCancel");
            const btnSave = $("#scSave");

            if (!modal) return;
            titleEl.textContent = `“${bookTitle}”`;
            newNameInput.value = "";

            // load shelves
            const shelvesSnap = await db()
                .collection("users")
                .doc(uid)
                .collection("shelves")
                .orderBy("createdAt", "desc")
                .get();
            const shelves = shelvesSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
            const membership = new Set(
                shelves.filter((s) => Array.isArray(s.bookIds) && s.bookIds.includes(bookId)).map((s) => s.id)
            );

            function render() {
                if (!shelves.length) {
                    listEl.innerHTML = `<div class="muted">No shelves yet. Create one below.</div>`;
                    return;
                }
                listEl.innerHTML = shelves
                    .map(
                        (s) => `
          <div class="shelf-chooser-item" data-id="${esc(s.id)}">
            <label>
              <input type="checkbox" ${membership.has(s.id) ? "checked" : ""}>
              ${esc(s.name || "Untitled Shelf")}
            </label>
            <span class="count">${Array.isArray(s.bookIds) ? s.bookIds.length : 0}</span>
          </div>`
                    )
                    .join("");
            }
            render();
            modal.classList.add("show");

            btnCreate.onclick = async () => {
                const name = newNameInput.value.trim();
                if (!name) return;
                try {
                    const ref = await db()
                        .collection("users")
                        .doc(uid)
                        .collection("shelves")
                        .add({
                            name,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                            bookIds: [],
                        });
                    shelves.unshift({ id: ref.id, name, bookIds: [] });
                    membership.add(ref.id); // pre-select
                    newNameInput.value = "";
                    render();
                } catch (e) {
                    console.warn(e);
                    alert("Could not create shelf.");
                }
            };

            const closeModal = () => modal.classList.remove("show");
            btnCancel.onclick = closeModal;
            modal.addEventListener("click", (e) => {
                if (e.target === modal) closeModal();
            });

            btnSave.onclick = async () => {
                btnSave.disabled = true;
                btnSave.textContent = "Saving…";
                try {
                    // read current checkbox state
                    const updates = [];
                    $$(".shelf-chooser-item", listEl).forEach((row) => {
                        const id = row.getAttribute("data-id");
                        const checked = row.querySelector("input[type=checkbox]").checked;
                        const was = membership.has(id);
                        if (checked && !was) {
                            updates.push(
                                db()
                                    .collection("users")
                                    .doc(uid)
                                    .collection("shelves")
                                    .doc(id)
                                    .update({ bookIds: firebase.firestore.FieldValue.arrayUnion(bookId) })
                            );
                        }
                        if (!checked && was) {
                            updates.push(
                                db()
                                    .collection("users")
                                    .doc(uid)
                                    .collection("shelves")
                                    .doc(id)
                                    .update({ bookIds: firebase.firestore.FieldValue.arrayRemove(bookId) })
                            );
                        }
                    });
                    await Promise.all(updates);
                    closeModal();
                } catch (e) {
                    console.warn(e);
                    alert("Could not update shelves.");
                } finally {
                    btnSave.disabled = false;
                    btnSave.textContent = "Save";
                }
            };
        }

        // ---------- notes & quotes ----------
        let allQuotes = [];
        function renderNotes(quotes) {
            const listEl = $("#notesAndQuotesList");
            if (!listEl) return;
            if (!quotes.length) {
                listEl.innerHTML = `<p class="muted">No matching notes found.</p>`;
                return;
            }
            listEl.innerHTML = quotes
                .map((quote) => {
                    const noteHtml = quote.note ? `<div class="note-body">${quote.note}</div>` : "";
                    const quoteData = encodeURIComponent(JSON.stringify(quote));
                    return `
          <div class="quote-item" data-search-text="${(quote.text + " " + (quote.note || "")).toLowerCase()}">
            <blockquote class="quote-text">“${quote.text}”</blockquote>
            ${noteHtml}
            <div class="quote-meta">
              <span>From <strong>${quote.bookTitle || "a book"}</strong></span>
              <button class="btn btn-secondary small" data-action="share-quote" data-quote='${quoteData}'>
                <i class="fa-solid fa-share-nodes"></i> Share
              </button>
            </div>
          </div>`;
                })
                .join("");
        }

        async function generateQuoteCard(quote) {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            const width = 1080,
                height = 1080;
            canvas.width = width;
            canvas.height = height;

            ctx.fillStyle = "#111827";
            ctx.fillRect(0, 0, width, height);

            const bookCoverUrl = quote.bookCoverUrl;
            if (bookCoverUrl) {
                try {
                    const img = new Image();
                    img.crossOrigin = "anonymous";
                    img.src = bookCoverUrl;
                    await new Promise((res) => (img.onload = res));
                    ctx.globalAlpha = 0.2;
                    ctx.filter = "blur(20px)";
                    ctx.drawImage(img, -50, -50, width + 100, height + 100);
                    ctx.globalAlpha = 1;
                    ctx.filter = "none";
                } catch { }
            }

            ctx.fillStyle = "#e5e7eb";
            ctx.textAlign = "center";
            ctx.font = 'italic bold 60px Georgia, serif';
            const lines = wrapText(ctx, `“${quote.text}”`, width - 120);
            let y = height / 2 - (lines.length / 2) * 70;
            lines.forEach((line) => {
                ctx.fillText(line, width / 2, y);
                y += 70;
            });

            ctx.font = '50px "system-ui", sans-serif';
            ctx.fillText(`— ${quote.bookTitle}`, width / 2, y + 50);

            ctx.font = '30px "system-ui", sans-serif';
            ctx.fillStyle = "rgba(255,255,255,.5)";
            ctx.fillText("Shared from PageBud", width / 2, height - 60);

            return canvas;
        }
        function wrapText(context, text, maxWidth) {
            const words = text.split(" ");
            const lines = [];
            let current = words[0];
            for (let i = 1; i < words.length; i++) {
                const w = words[i];
                const width = context.measureText(current + " " + w).width;
                if (width < maxWidth) current += " " + w;
                else {
                    lines.push(current);
                    current = w;
                }
            }
            lines.push(current);
            return lines;
        }

        async function loadNotesAndQuotes(uid) {
            const section = $("#notesAndQuotesSection");
            if (!section) return;
            try {
                const snap = await db()
                    .collection("users")
                    .doc(uid)
                    .collection("quotes")
                    .orderBy("createdAt", "desc")
                    .limit(20)
                    .get();
                if (snap.empty) return;

                const bookIds = [...new Set(snap.docs.map((d) => d.data().bookId))];
                const bookSnaps = await Promise.all(
                    bookIds.map((id) => db().collection("users").doc(uid).collection("books").doc(id).get())
                );
                const coverMap = new Map(bookSnaps.map((s) => [s.id, (s.data() || {}).coverUrl]));
                allQuotes = snap.docs.map((doc) => ({ ...doc.data(), bookCoverUrl: coverMap.get(doc.data().bookId) }));
                renderNotes(allQuotes);
                section.style.display = "block";
            } catch (e) {
                console.warn("Notes/quotes load skipped:", e);
            }
        }

        $("#notesAndQuotesList")?.addEventListener("click", async (e) => {
            const shareBtn = e.target.closest('[data-action="share-quote"]');
            if (!shareBtn) return;
            const quote = JSON.parse(decodeURIComponent(shareBtn.dataset.quote));
            const modal = $("#quoteCardModal");
            const wrap = $("#quoteCardCanvasWrap");
            const dl = $("#downloadQuoteCardBtn");
            wrap.innerHTML = `<p class="muted">Generating card...</p>`;
            modal.classList.add("show");
            const canvas = await generateQuoteCard(quote);
            wrap.innerHTML = "";
            wrap.appendChild(canvas);
            dl.href = canvas.toDataURL("image/png");
            $("#closeQuoteCardBtn")?.addEventListener("click", () => modal.classList.remove("show"), {
                once: true,
            });
            modal.addEventListener(
                "click",
                (evt) => {
                    if (evt.target === modal) modal.classList.remove("show");
                },
                { once: true }
            );
        });
        $("#notesSearchInput")?.addEventListener("input", (e) => {
            const q = (e.target.value || "").toLowerCase().trim();
            if (!q) return renderNotes(allQuotes);
            renderNotes(
                allQuotes.filter(
                    (x) =>
                        x.text.toLowerCase().includes(q) ||
                        (x.note && x.note.toLowerCase().includes(q)) ||
                        (x.bookTitle || "").toLowerCase().includes(q)
                )
            );
        });

        // ---------- quirks ----------
        function renderQuirks(quirks) {
            const host = $("#quirksContainer");
            if (!host) return;
            host.innerHTML =
                Array.isArray(quirks) && quirks.length
                    ? quirks.map((q) => `<span class="quirk-chip">${q}</span>`).join("")
                    : "";
        }
        function wireUpQuirksEditor(selectedQuirks) {
            const quirksList =
                (window.PB_CONST && window.PB_CONST.QUIRKS) || [
                    "Annotator",
                    "DNF is okay",
                    "TBR mountain climber",
                    "Buddy reader",
                    "Audiobook lover",
                    "Re-reader",
                ];
            const host = $("#editQuirks");
            if (!host) return;
            const setSel = new Set(selectedQuirks || []);
            host.innerHTML = quirksList
                .map(
                    (q) =>
                        `<span class="category ${setSel.has(q) ? "active" : ""}" data-value="${q}">${q}</span>`
                )
                .join("");
            host.addEventListener("click", (e) => {
                const chip = e.target.closest(".category");
                if (chip) chip.classList.toggle("active");
            });
        }
        function getSelectedQuirks() {
            return Array.from($("#editQuirks")?.querySelectorAll(".category.active") || []).map(
                (el) => el.dataset.value
            );
        }

        // ---------- shelf cards ----------
        function wireShelfGridActions(grid, isMyProfile, shelfId) {
            grid.addEventListener("click", async (e) => {
                const openBtn = e.target.closest("[data-action='open']");
                if (openBtn) return (location.href = `edit-page.html?id=${openBtn.dataset.id}`);

                const readBtn = e.target.closest("[data-action='read']");
                if (readBtn) return (location.href = `reader.html?id=${readBtn.dataset.id}`);

                const addBtn = e.target.closest("[data-action='addtoshelf']");
                if (addBtn && isMyProfile) {
                    const id = addBtn.dataset.id;
                    const title =
                        addBtn.closest(".book-card")?.querySelector(".title")?.textContent || "This book";
                    await openAddToShelfForBook(auth().currentUser.uid, id, title);
                    return;
                }

                const favBtn = e.target.closest("[data-action='fav']");
                if (favBtn && isMyProfile) {
                    const card = favBtn.closest(".book-card");
                    const id = card && card.dataset.id;
                    if (!id) return;
                    const user = auth().currentUser;
                    if (!user) return;
                    try {
                        const ref = db().collection("users").doc(user.uid).collection("books").doc(id);
                        const snap = await ref.get();
                        const d = snap.data() || {};
                        const next = !d.favorite;
                        await ref.set(
                            { favorite: next, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
                            { merge: true }
                        );
                        favBtn.classList.toggle("active", next);
                        if (shelfId === "favoritesShelf" && !next) {
                            card.remove();
                            if (!grid.children.length) grid.closest(".profile-shelf").style.display = "none";
                        }
                    } catch (err) {
                        console.warn("Favorite toggle failed:", err);
                    }
                }
            });
        }

        async function loadCurrentlyReading(uid, isMyProfile) {
            const shelf = $("#currentlyReadingShelf");
            const grid = shelf?.querySelector(".shelf-grid");
            if (!shelf || !grid) return;
            try {
                const snap = await db()
                    .collection("users")
                    .doc(uid)
                    .collection("books")
                    .where("status", "==", "reading")
                    .limit(10)
                    .get();
                if (snap.empty) return;
                const frag = document.createDocumentFragment();
                snap.forEach((doc) => {
                    const card = createCardElement(doc, isMyProfile);
                    if (card) frag.appendChild(card);
                });
                grid.innerHTML = "";
                grid.appendChild(frag);
                shelf.style.display = "block";
                const seeAll = shelf.querySelector(".see-all-btn");
                if (isMyProfile && seeAll) seeAll.style.display = "";
                wireShelfGridActions(grid, isMyProfile, "currentlyReadingShelf");
            } catch (e) {
                console.warn("Currently Reading load failed:", e);
            }
        }
        async function loadFavoritesShelf(uid, isMyProfile) {
            const shelf = $("#favoritesShelf");
            const grid = shelf?.querySelector(".shelf-grid");
            if (!shelf || !grid) return;
            try {
                const snap = await db()
                    .collection("users")
                    .doc(uid)
                    .collection("books")
                    .where("favorite", "==", true)
                    .limit(10)
                    .get();
                if (snap.empty) return;
                const frag = document.createDocumentFragment();
                snap.forEach((doc) => {
                    const card = createCardElement(doc, isMyProfile);
                    if (card) frag.appendChild(card);
                });
                grid.innerHTML = "";
                grid.appendChild(frag);
                shelf.style.display = "block";
                const seeAll = shelf.querySelector(".see-all-btn");
                if (isMyProfile && seeAll) seeAll.style.display = "";
                wireShelfGridActions(grid, isMyProfile, "favoritesShelf");
            } catch (e) {
                console.warn("Favorites load failed:", e);
            }
        }
        async function loadFinishedShelf(uid, isMyProfile) {
            const shelf = $("#finishedShelf");
            const grid = shelf?.querySelector(".shelf-grid");
            if (!shelf || !grid) return;
            try {
                // Try the nice query (needs composite index if you see a console link)
                let snap;
                try {
                    snap = await db()
                        .collection("users")
                        .doc(uid)
                        .collection("books")
                        .where("status", "==", "finished")
                        .orderBy("finished", "desc")
                        .limit(10)
                        .get();
                } catch (err) {
                    // Fallback that never crashes: filter client-side
                    if (err && err.code === "failed-precondition") {
                        const raw = await db()
                            .collection("users")
                            .doc(uid)
                            .collection("books")
                            .where("status", "==", "finished")
                            .limit(50)
                            .get();
                        const docs = raw.docs
                            .map((d) => ({ id: d.id, ...d.data() }))
                            .sort(
                                (a, b) =>
                                    new Date(b.finished || b.updatedAt?.toDate?.() || 0) -
                                    new Date(a.finished || a.updatedAt?.toDate?.() || 0)
                            )
                            .slice(0, 10)
                            .map((d) => ({ data: () => d, id: d.id }));
                        snap = { empty: docs.length === 0, forEach: (fn) => docs.forEach((x) => fn(x)) };
                    } else {
                        throw err;
                    }
                }

                if (snap.empty) return;
                const frag = document.createDocumentFragment();
                snap.forEach((doc) => {
                    const card = createCardElement(doc, isMyProfile);
                    if (card) frag.appendChild(card);
                });
                grid.innerHTML = "";
                grid.appendChild(frag);
                shelf.style.display = "block";
                const seeAll = shelf.querySelector(".see-all-btn");
                if (isMyProfile && seeAll) seeAll.style.display = "";
                wireShelfGridActions(grid, isMyProfile, "finishedShelf");
            } catch (e) {
                console.warn("Finished load failed:", e);
            }
        }
        async function loadWishlistShelf(uid, isMyProfile) {
            const shelf = $("#wishlistShelf");
            const grid = shelf?.querySelector(".shelf-grid");
            if (!shelf || !grid) return;
            try {
                const snap = await db()
                    .collection("users")
                    .doc(uid)
                    .collection("books")
                    .where("status", "==", "wishlist")
                    .limit(10)
                    .get();
                if (snap.empty) return;
                const frag = document.createDocumentFragment();
                snap.forEach((doc) => {
                    const card = createCardElement(doc, isMyProfile);
                    if (card) frag.appendChild(card);
                });
                grid.innerHTML = "";
                grid.appendChild(frag);
                shelf.style.display = "block";
                const seeAll = shelf.querySelector(".see-all-btn");
                if (isMyProfile && seeAll) seeAll.style.display = "";
                wireShelfGridActions(grid, isMyProfile, "wishlistShelf");
            } catch (e) {
                console.warn("Wishlist load failed:", e);
            }
        }

        // ---------- achievements & badges ----------
        async function calculateAndShowAchievements(uid, streak) {
            const container = $("#achievementsSection");
            const grid = $("#achievementsGrid");
            if (!container || !grid) return;

            const booksSnap = await db().collection("users").doc(uid).collection("books").get();
            const books = booksSnap.docs.map((d) => d.data());

            const achievements = [
                {
                    id: "bookworm",
                    title: "Bookworm",
                    desc: "Read 10 books",
                    icon: "fa-book-open-reader",
                    unlocked: books.filter((b) => b.status === "finished").length >= 10,
                },
                {
                    id: "explorer",
                    title: "Genre Explorer",
                    desc: "Read from 5+ genres",
                    icon: "fa-compass",
                    unlocked: new Set(books.flatMap((b) => b.genres || [])).size >= 5,
                },
                {
                    id: "streak",
                    title: "Streak Keeper",
                    desc: "Read for 7 days in a row",
                    icon: "fa-fire",
                    unlocked: streak >= 7,
                },
                {
                    id: "marathoner",
                    title: "The Marathoner",
                    desc: "Finish a 500+ page book",
                    icon: "fa-person-running",
                    unlocked: books.some((b) => b.status === "finished" && b.pageCount >= 500),
                },
                {
                    id: "critic",
                    title: "The Critic",
                    desc: "Rate 5 books",
                    icon: "fa-star",
                    unlocked: books.filter((b) => (b.rating || 0) > 0).length >= 5,
                },
            ];

            grid.innerHTML = achievements
                .map(
                    (a) => `
        <div class="achievement-item ${a.unlocked ? "" : "locked"}">
          <i class="fa-solid ${a.icon} achievement-icon"></i>
          <div>
            <div class="achievement-title">${a.title}</div>
            <div class="achievement-desc">${a.desc}</div>
          </div>
        </div>`
                )
                .join("");

            container.style.display = "block";
        }

        async function loadAndDisplayBadges(uid) {
            const container = $("#badgesSection");
            const grid = $("#badgesGrid");
            if (!container || !grid) return;

            try {
                const snap = await db()
                    .collection("users")
                    .doc(uid)
                    .collection("active_challenges")
                    .where("completedAt", "!=", null)
                    .orderBy("completedAt", "desc")
                    .get();
                if (snap.empty) return;

                const iconMap = {
                    tbr_5_2024: "fa-list-check",
                    genre_explorer_2024: "fa-compass",
                    big_book_2024: "fa-book-journal-whills",
                    new_author_2024: "fa-feather-pointed",
                    default: "fa-trophy",
                };

                grid.innerHTML = snap.docs
                    .map((doc) => {
                        const ch = doc.data();
                        const icon = iconMap[ch.challengeId] || iconMap.default;
                        const date = ch.completedAt?.toDate ? ch.completedAt.toDate().toLocaleDateString() : "";
                        return `
            <div class="badge-item" title="Completed on ${date}">
              <div class="badge-icon-wrap"><i class="fa-solid ${icon} badge-icon"></i></div>
              <div class="badge-title">${ch.title || "Challenge Complete"}</div>
            </div>`;
                    })
                    .join("");

                container.style.display = "block";
            } catch (e) {
                console.warn("Badges load skipped:", e);
            }
        }

        // ---------- streak ----------
        async function calculateStreak(uid) {
            try {
                const ninety = new Date();
                ninety.setDate(ninety.getDate() - 90);
                const sessionsSnap = await db()
                    .collection("users")
                    .doc(uid)
                    .collection("sessions")
                    .where("at", ">=", ninety)
                    .orderBy("at", "desc")
                    .get();
                if (sessionsSnap.empty) return 0;

                const toDayStr = (d) => {
                    const x = new Date(d);
                    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(
                        x.getDate()
                    ).padStart(2, "0")}`;
                };
                const readingDays = [...new Set(sessionsSnap.docs.map((d) => d.data().date))]
                    .sort()
                    .reverse();
                if (!readingDays.length) return 0;

                let streak = 0;
                const today = new Date();
                const yesterday = new Date(today);
                yesterday.setDate(today.getDate() - 1);

                if (readingDays[0] === toDayStr(today) || readingDays[0] === toDayStr(yesterday)) {
                    streak = 1;
                    for (let i = 0; i < readingDays.length - 1; i++) {
                        const diff =
                            new Date(readingDays[i]).getTime() - new Date(readingDays[i + 1]).getTime();
                        if (Math.round(diff / (1000 * 60 * 60 * 24)) === 1) streak++;
                        else break;
                    }
                }
                return streak;
            } catch (e) {
                console.warn("Streak calc skipped:", e);
                return 0;
            }
        }

        // ---------- friends ----------
        async function addFriend(fromUid, toUid) {
            const reqId = [fromUid, toUid].sort().join("__");
            const ref = db().collection("friend_requests").doc(reqId);
            const snap = await ref.get();
            if (snap.exists) {
                const cur = snap.data() || {};
                if (cur.status === "accepted") return alert("You’re already friends.");
                if (cur.status === "pending") return alert("Request already pending.");
            }
            try {
                await ref.set(
                    {
                        from: fromUid,
                        to: toUid,
                        status: "pending",
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    },
                    { merge: true }
                );
                if (btnAddFriend) {
                    btnAddFriend.textContent = "Request Sent ✓";
                    btnAddFriend.disabled = true;
                }
            } catch (error) {
                console.error("Friend request failed:", error);
                alert("Could not send friend request.");
            }
        }
        function showMoreOptions(theirUid, theirName) {
            const action = prompt(`More options for ${theirName}:\n\nType "block" to block this user.`, "");
            if ((action || "").toLowerCase() === "block")
                blockUser(auth().currentUser.uid, theirUid, theirName);
        }
        async function blockUser(myUid, theirUid, theirName) {
            if (!confirm(`Block ${theirName}?`)) return;
            try {
                await db().collection("users").doc(myUid).collection("blocked").doc(theirUid).set({ at: new Date() });
                alert(`${theirName} has been blocked.`);
                location.href = "index.html";
            } catch {
                alert("Could not block user. Please try again.");
            }
        }
        async function checkFriendshipAndShowActions(myUid, theirUid) {
            const friendDoc = await db()
                .collection("users")
                .doc(myUid)
                .collection("friends")
                .doc(theirUid)
                .get();
            const isFriend = friendDoc.exists && friendDoc.data().status === "accepted";
            if (isFriend) {
                if (btnAddFriend) {
                    btnAddFriend.textContent = "Friends ✓";
                    btnAddFriend.disabled = true;
                }
            } else {
                const reqId = [myUid, theirUid].sort().join("__");
                const reqDoc = await db().collection("friend_requests").doc(reqId).get();
                if (reqDoc.exists && reqDoc.data().status === "pending") {
                    if (btnAddFriend) {
                        btnAddFriend.textContent = "Request Pending...";
                        btnAddFriend.disabled = true;
                    }
                } else {
                    if (btnAddFriend) {
                        btnAddFriend.textContent = "Add Friend";
                        btnAddFriend.onclick = () => addFriend(myUid, theirUid);
                    }
                }
            }
        }
    } // end init

    // ------------------ boot ------------------
    // Prefer your existing requireAuth helper if present
    if (typeof window.requireAuth === "function") {
        window.requireAuth(() => {
            const u = auth().currentUser;
            if (u) init(u);
            else location.href = "auth.html";
        });
    } else if (window.onAuthReady && typeof window.onAuthReady.then === "function") {
        window.onAuthReady.then((user) => {
            if (user) init(user);
            else location.href = "auth.html";
        });
    } else {
        const unsub = firebase.auth().onAuthStateChanged((user) => {
            unsub();
            if (user) init(user);
            else location.href = "auth.html";
        });
    }
})();