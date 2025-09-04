// buddy-read.js — wire buttons, make choosing/creating/opening seamless (no design changes).
(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    function auth() { return (window.fb?.auth) || (window.firebase?.auth?.()) || firebase.auth(); }
    function db() { return (window.fb?.db) || (window.firebase?.firestore?.()) || firebase.firestore(); }

    const els = {
        name: $("#brGroupName"),
        book: $("#brBookSelect"),
        create: $("#brCreateBtn"),
        invite: $("#brInviteBtn"),
        refresh: $("#brRefreshBtn"),
        groups: $("#brGroupsList"),
        openChat: $("#brOpenChatBtn"),
        detailCard: $("#brGroupDetail"),
        detailText: $("#brDetailText"),
    };

    const K = {
        lastBook: "pb:lastPickedBookId",
    };

    // toast
    function toast(msg, ms = 1200) {
        try {
            const t = document.createElement("div");
            t.className = "toast"; t.textContent = msg;
            document.body.appendChild(t);
            requestAnimationFrame(() => t.classList.add("show"));
            setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, ms);
        } catch { alert(msg); }
    }

    async function requireUser() {
        const a = auth();
        if (a.currentUser) return a.currentUser;
        return new Promise((res, rej) => {
            const off = a.onAuthStateChanged(u => { off(); u ? res(u) : rej(new Error("Not signed in")); });
        });
    }

    // ---------- Books ----------
    async function populateBooks() {
        const u = await requireUser();
        const database = db();
        if (!database || !els.book) return;

        // keep the first "Pick a book…" option
        const first = els.book.querySelector("option[value='']");
        els.book.innerHTML = ""; if (first) els.book.appendChild(first);

        const qs = await database
            .collection("users").doc(u.uid)
            .collection("books")
            .orderBy("createdAt", "desc")
            .limit(500)
            .get();

        const frag = document.createDocumentFragment();
        const all = [];
        qs.forEach(doc => {
            const d = doc.data() || {};
            const opt = document.createElement("option");
            opt.value = doc.id;
            opt.textContent = d.title || "(Untitled)";
            opt.dataset.author = d.author || "";
            opt.dataset.cover = d.coverUrl || d.coverDataUrl || "";
            frag.appendChild(opt);
            all.push({ id: doc.id, title: d.title || "", author: d.author || "", cover: opt.dataset.cover });
        });
        els.book.appendChild(frag);

        // preselect via URL or last used
        const p = new URLSearchParams(location.search);
        const urlBook = p.get("book");
        const remembered = localStorage.getItem(K.lastBook);
        const want = urlBook || remembered || "";
        if (want && els.book.querySelector(`option[value="${CSS.escape(want)}"]`)) {
            els.book.value = want;
        } else if (all.length === 1) {
            els.book.value = all[0].id;
        }

        // remember selection
        els.book.addEventListener("change", () => {
            const id = els.book.value || "";
            if (id) localStorage.setItem(K.lastBook, id);
        });
    }

    // ---------- Groups ----------
    function selectGroupUI(id, label) {
        els.detailCard.dataset.id = id || "";
        els.detailText.textContent = id ? `Selected: ${label || id}` : "Select a group above to view details.";
        els.openChat.disabled = !id;
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

            const pickThis = () => {
                $$(".chip", els.groups).forEach(c => c.classList.remove("active"));
                chip.classList.add("active");
                selectGroupUI(g.id, chip.textContent);
            };

            chip.addEventListener("click", pickThis);

            // open on double-click or Enter
            chip.addEventListener("dblclick", () => openChatForSelected(g.id));
            chip.tabIndex = 0;
            chip.addEventListener("keydown", (e) => {
                if (e.key === "Enter") openChatForSelected(g.id);
            });

            els.groups.appendChild(chip);

            if (!picked && (autoPickId ? g.id === autoPickId : true)) {
                picked = true;
                pickThis();
            }
        });
    }

    async function loadGroups() {
        const u = await requireUser();
        const database = db();
        if (!database) { renderGroups([]); return; }

        const p = new URLSearchParams(location.search);
        const urlGroup = p.get("group") || "";

        try {
            const owned = await database
                .collection("buddy_groups")
                .where("owner", "==", u.uid)
                .orderBy("createdAt", "desc")
                .get();

            const arr = owned.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
            renderGroups(arr, { autoPickId: urlGroup || undefined });
        } catch (e) {
            console.warn("[buddy-read] loadGroups failed:", e);
            renderGroups([]);
        }
    }

    async function createGroup() {
        const u = await requireUser();
        const database = db();

        // book snapshot (optional but nice)
        const bookId = els.book?.value || "";
        let bookTitle = "", bookAuthor = "", bookCover = "";
        if (bookId) {
            const opt = els.book.querySelector(`option[value="${CSS.escape(bookId)}"]`);
            bookTitle = opt?.textContent || "";
            bookAuthor = opt?.dataset?.author || "";
            bookCover = opt?.dataset?.cover || "";
        }

        // default name from input OR book title
        let name = (els.name?.value || "").trim();
        if (!name) name = bookTitle || "Buddy Read";

        try {
            const ref = database.collection("buddy_groups").doc();
            await ref.set({
                name,
                owner: u.uid,
                members: { [u.uid]: true },
                bookId: bookId || null,
                // snapshot so the group can show the book even if you later edit your library card
                ...(bookTitle ? { bookTitle } : {}),
                ...(bookAuthor ? { bookAuthor } : {}),
                ...(bookCover ? { bookCover } : {}),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            // Update UI quickly
            const chip = document.createElement("span");
            chip.className = "chip active";
            chip.dataset.id = ref.id;
            chip.textContent = name;
            $$(".chip", els.groups).forEach(c => c.classList.remove("active"));
            if (!els.groups.querySelector(".chip")) els.groups.innerHTML = "";
            els.groups.prepend(chip);
            selectGroupUI(ref.id, name);

            // Jump straight to chat — fastest path
            openChatForSelected(ref.id);
        } catch (e) {
            console.warn("[buddy-read] create failed:", e);
            toast("Could not create group.");
        }
    }

    function openChatForSelected(forceId) {
        const gid = forceId || els.detailCard?.dataset?.id || "";
        if (!gid) return toast("Pick a group first.");
        location.href = `buddy-chat.html?group=${encodeURIComponent(gid)}`;
    }

    function wire() {
        els.create?.addEventListener("click", (e) => { e.preventDefault(); createGroup(); });
        els.invite?.addEventListener("click", (e) => { e.preventDefault(); location.href = "friends.html"; });
        els.refresh?.addEventListener("click", (e) => { e.preventDefault(); loadGroups(); });
        els.openChat?.addEventListener("click", (e) => { e.preventDefault(); openChatForSelected(); });
    }

    async function boot() {
        wire();
        await populateBooks();
        await loadGroups();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }
})();
