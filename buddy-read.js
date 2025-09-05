// buddy-read.js — robust wiring: delegated clicks, lazy book load, live groups.
// Visual design unchanged.
(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    function auth() { return (window.fb?.auth) || (window.firebase?.auth?.()) || firebase.auth(); }
    function db() { return (window.fb?.db) || (window.firebase?.firestore?.()) || firebase.firestore(); }

    const els = {
        name: $("#brGroupName"),
        book: $("#brBookSelect"),
        groups: $("#brGroupsList"),
        openChat: $("#brOpenChatBtn"),
        detailCard: $("#brGroupDetail"),
        detailText: $("#brDetailText"),
    };

    const K = { lastBook: "pb:lastPickedBookId" };
    let booksLoaded = false;
    let unsubGroups = null;

    function toast(msg, ms = 1200) {
        try {
            const t = document.createElement("div");
            t.className = "toast"; t.textContent = msg;
            document.body.appendChild(t);
            requestAnimationFrame(() => t.classList.add("show"));
            setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, ms);
        } catch { alert(msg); }
    }

    async function populateBooksIfNeeded(user, force = false) {
        if (booksLoaded && !force) return;
        const u = user;
        if (!u) return;

        const database = db();
        if (!database || !els.book) return;

        try {
            const qs = await database
                .collection("users").doc(u.uid)
                .collection("books")
                .orderBy("createdAt", "desc")
                .limit(500)
                .get();

            // keep the first placeholder option
            const keepFirst = els.book.querySelector("option[value='']");
            els.book.innerHTML = "";
            if (keepFirst) els.book.appendChild(keepFirst);

            const frag = document.createDocumentFragment();
            qs.forEach(doc => {
                const d = doc.data() || {};
                const opt = document.createElement("option");
                opt.value = doc.id;
                opt.textContent = d.title || "(Untitled)";
                opt.dataset.author = d.author || "";
                opt.dataset.cover = d.coverUrl || d.coverDataUrl || "";
                frag.appendChild(opt);
            });
            els.book.appendChild(frag);
            booksLoaded = true;

            // Preselect via URL or last picked, otherwise first real title
            const p = new URLSearchParams(location.search);
            const want = p.get("book") || localStorage.getItem(K.lastBook) || "";
            const hasWant = want && els.book.querySelector(`option[value="${CSS.escape(want)}"]`);
            if (hasWant) els.book.value = want;
            else if (els.book.options.length > 1) els.book.selectedIndex = 1;

            els.book.addEventListener("change", () => {
                const id = els.book.value || "";
                if (id) localStorage.setItem(K.lastBook, id);
            }, { once: true });
        } catch (e) {
            console.warn("[buddy-read] populateBooks failed:", e);
        }
    }

    // ---------- Groups ----------
    function selectGroupUI(id, label) {
        els.detailCard.dataset.id = id || "";
        els.detailText.textContent = id ? `Selected: ${label || id}` : "Select a group above to view details.";
        els.openChat.disabled = !id;

        // New logic for ranking button
        const rankingBtn = $("#brOpenRankingBtn");
        if (rankingBtn) {
            if (id) {
                rankingBtn.href = `buddy-ranking.html?group=${encodeURIComponent(id)}`;
                rankingBtn.style.display = '';
            } else {
                rankingBtn.style.display = 'none';
            }
        }
    }

    function renderGroups(list, { autoPickId } = {}) {
        els.groups.innerHTML = "";
        if (!list.length) {
            els.groups.innerHTML = `<span class="muted">No groups yet.</span>`;
            selectGroupUI("", "");
            return;
        }
        let picked = false;
        list.forEach(g => {
            const chip = document.createElement("span");
            chip.className = "chip";
            chip.textContent = g.name || "(Untitled group)";
            chip.dataset.id = g.id;

            const pick = () => {
                $$(".chip", els.groups).forEach(c => c.classList.remove("active"));
                chip.classList.add("active");
                selectGroupUI(g.id, chip.textContent);
            };

            chip.addEventListener("click", pick);
            chip.addEventListener("dblclick", () => openChatForSelected(g.id));
            chip.tabIndex = 0;
            chip.addEventListener("keydown", (e) => { if (e.key === "Enter") openChatForSelected(g.id); });

            els.groups.appendChild(chip);

            if (!picked && (autoPickId ? g.id === autoPickId : true)) {
                picked = true;
                pick();
            }
        });
    }

    async function subscribeGroups(user) {
        const u = user;
        unsubGroups && unsubGroups(); unsubGroups = null;
        const database = db();
        // Live list of groups you own (matching your earlier schema)
        unsubGroups = database.collection("buddy_groups")
            .where("owner", "==", u.uid)
            .orderBy("createdAt", "desc")
            .onSnapshot(
                (snap) => {
                    const arr = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
                    // Respect URL ?group=… on first load
                    const p = new URLSearchParams(location.search);
                    const urlGroup = p.get("group") || undefined;
                    renderGroups(arr, { autoPickId: urlGroup });
                },
                (err) => { console.warn("[buddy-read] groups onSnapshot error:", err); renderGroups([]); }
            );
    }

    async function createGroup(user) {
        const u = user;
        const database = db();

        // ensure books are loaded (user may press Create before opening dropdown)
        await populateBooksIfNeeded(user);

        const bookId = els.book?.value || "";
        const opt = bookId ? els.book.querySelector(`option[value="${CSS.escape(bookId)}"]`) : null;
        const bookTitle = opt?.textContent || "";
        const bookAuthor = opt?.dataset?.author || "";
        const bookCover = opt?.dataset?.cover || "";

        let name = (els.name?.value || "").trim();
        if (!name) name = bookTitle || "Buddy Read";

        // Get spoiler and format settings from the new UI elements
        const spoilerAgreement = document.querySelector('input[name="spoiler-agreement"]:checked')?.value || 'none';
        const discussionFormats = Array.from(document.querySelectorAll('input[name="discussion-format"]:checked')).map(el => el.value);

        try {
            const ref = database.collection("buddy_groups").doc();
            await ref.set({
                name,
                owner: u.uid,
                members: { [u.uid]: true },
                bookId: bookId || null,
                ...(bookTitle ? { bookTitle } : {}),
                ...(bookAuthor ? { bookAuthor } : {}),
                ...(bookCover ? { bookCover } : {}),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                spoilerAgreement: spoilerAgreement,
                discussionFormats: discussionFormats
            }, { merge: true });

            // Put a chip instantly in UI for snappy feel
            const chip = document.createElement("span");
            chip.className = "chip active";
            chip.dataset.id = ref.id;
            chip.textContent = name;
            $$(".chip", els.groups).forEach(c => c.classList.remove("active"));
            if (!els.groups.querySelector(".chip")) els.groups.innerHTML = "";
            els.groups.prepend(chip);
            selectGroupUI(ref.id, name);

            // Jump straight to chat
            openChatForSelected(ref.id);
        } catch (e) {
            console.warn("[buddy-read] create failed:", e);
            toast("Could not create group.");
        }
    }

    function openChatForSelected(forceId) {
        const gid = forceId || els.detailCard?.dataset?.id || "";
        if (!gid) return toast("Pick a group first.");
        // Uses your existing buddy-chat.html + buddy-chat.js
        location.href = `buddy-chat.html?group=${encodeURIComponent(gid)}`;
    }

    // ---------- Event wiring (delegated → always clickable) ----------
    function wireDelegated() {
        document.addEventListener("click", async (e) => {
            const t = e.target.closest("#brCreateBtn, #brInviteBtn, #brRefreshBtn, #brOpenChatBtn, #brBookSelect");
            if (!t) return;

            const user = auth()?.currentUser;
            if (!user) { toast("Please sign in first."); return; }

            if (t.id === "brCreateBtn") { e.preventDefault(); await createGroup(user); return; }
            if (t.id === "brInviteBtn") { e.preventDefault(); location.href = "friends.html"; return; }
            if (t.id === "brRefreshBtn") { e.preventDefault(); await populateBooksIfNeeded(user, true); return; }
            if (t.id === "brOpenChatBtn") { e.preventDefault(); openChatForSelected(); return; }
            if (t.id === "brBookSelect") {
                if (!booksLoaded) { e.preventDefault(); await populateBooksIfNeeded(user, true); }
            }
        });

        // First focus on the select lazily loads books
        els.book?.addEventListener("focus", () => window.requireAuth(populateBooksIfNeeded), { once: true });
    }

    async function boot() {
        // Make absolutely sure no overlay blocks interaction here
        document.body.style.pointerEvents = "auto";

        wireDelegated();

        // Use requireAuth to safely load data after user is confirmed.
        window.requireAuth(async (user) => {
            try {
                await populateBooksIfNeeded(user);
                await subscribeGroups(user);
            } catch (e) {
                console.warn("Buddy read initialization failed:", e);
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }
})();
