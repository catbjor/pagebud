// friends.js — search users (@username, email, name), requests, local friends, modal (profile/chat)
(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const log = (...a) => console.log("[Friends]", ...a);
    const warn = (...a) => console.warn("[Friends]", ...a);

    function qsAny(list) { for (const s of list) { const el = $(s); if (el) return el; } return null; }

    function auth() { return (window.fb?.auth) || (window.firebase?.auth?.()) || firebase.auth(); }
    function db() { return (window.fb?.db) || (window.firebase?.firestore?.()) || firebase.firestore(); }

    async function requireUser() {
        const a = auth();
        if (a.currentUser) return a.currentUser;
        return new Promise((res, rej) => { const off = a.onAuthStateChanged(u => { off(); u ? res(u) : rej(new Error("Not signed in")); }); });
    }

    // --- Elements
    function getEls() {
        return {
            input: qsAny(["#friendSearch", "#searchUser", "#searchInput"]),
            searchBtn: qsAny(["#btnFriendSearch", "#btnSearchUser", "[data-action='search-user']"]),
            searchList: qsAny(["#searchResults", "[data-list='search']"]),
            incomingList: qsAny(["#incomingList", "[data-list='incoming']"]),
            outgoingList: qsAny(["#outgoingList", "[data-list='outgoing']"]),
            friendsList: qsAny(["#friendsList", "[data-list='friends']"]),
            // modal
            mBackdrop: $("#friendModalBackdrop"),
            mSheet: $("#friendModal"),
            mTitle: $("#friendModalTitle"),
            mProfile: $("#friendModalProfile"),
            mChat: $("#friendModalChat"),
        };
    }

    // --- tiny dom helpers
    function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
    function button(label, cls = "btn") { const b = el("button", cls, label); b.type = "button"; return b; }
    function clear(node) { if (node) node.innerHTML = ""; }

    // --- username helpers
    async function getUsernameByUid(uid) {
        try {
            const qs = await db().collection("usernames").where("uid", "==", uid).limit(1).get();
            if (!qs.empty) { const d = qs.docs[0]; return { username: d.id, ...(d.data() || {}) }; }
        } catch (e) { warn("getUsernameByUid failed:", e); }
        return { username: uid };
    }

    // --- friend requests helpers
    const reqId = (a, b) => [a, b].sort().join("__");

    async function sendRequest(fromUid, toUid) {
        if (fromUid === toUid) return;
        const id = reqId(fromUid, toUid);
        await db().collection("friend_requests").doc(id).set({
            from: fromUid, to: toUid, status: "pending",
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return id;
    }
    async function setRequestStatus(id, status) {
        await db().collection("friend_requests").doc(id).set({
            status, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }

    async function ensureLocalFriend(uid, otherUid, extra = {}) {
        try {
            await db().collection("users").doc(uid).collection("friends").doc(otherUid).set({
                uid: otherUid, ...extra,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } catch (e) { warn("ensureLocalFriend failed:", e); }
    }
    async function removeLocalFriend(uid, otherUid) {
        try { await db().collection("users").doc(uid).collection("friends").doc(otherUid).delete(); }
        catch (e) { warn("removeLocalFriend failed:", e); }
    }

    // --- renderer
    function renderUserRow(container, item, actions = [], onRowClick = null) {
        if (!container) return;
        const row = el("div", "friend-row");
        const left = el("div", "friend-left");
        const right = el("div", "friend-actions");

        const avatar = el("div", "friend-avatar");
        if (item.photoURL) {
            const img = el("img");
            img.src = item.photoURL; img.alt = item.displayName || item.username || item.uid || "";
            img.style.width = "32px"; img.style.height = "32px"; img.style.borderRadius = "50%";
            avatar.appendChild(img);
        } else {
            avatar.textContent = (item.displayName || item.username || item.uid || "?").slice(0, 1).toUpperCase();
            Object.assign(avatar.style, { width: "32px", height: "32px", borderRadius: "50%", display: "grid", placeItems: "center", border: "1px solid var(--border)" });
        }

        const name = el("div", "friend-name", item.displayName || item.username || item.uid || "");
        const sub = el("div", "friend-sub", item.username ? `@${item.username}` : (item.uid || ""));
        const textWrap = el("div", "friend-text-wrap"); textWrap.append(name, sub);
        left.append(avatar, textWrap);

        right.style.display = "flex"; right.style.gap = "8px";
        actions.forEach(b => right.appendChild(b));

        Object.assign(row.style, { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" });
        row.append(left, right);

        if (onRowClick) {
            row.style.cursor = "pointer";
            row.addEventListener("click", (e) => { if (e.target.closest("button")) return; onRowClick(e); });
        }
        container.appendChild(row);
    }

    // --- modal (profile/chat) ---
    function useFriendModal(els) {
        if (!els.mBackdrop || !els.mSheet) return { show: () => { }, hide: () => { } };
        let current = null;
        const show = (friend) => {
            current = friend;
            if (els.mTitle) els.mTitle.textContent = friend.displayName || friend.username || "Friend";
            els.mBackdrop.style.display = "block";
            els.mSheet.style.display = "block";
        };
        const hide = () => {
            els.mBackdrop.style.display = "none";
            els.mSheet.style.display = "none";
            current = null;
        };
        els.mBackdrop?.addEventListener("click", hide);
        els.mProfile?.addEventListener("click", () => { if (!current) return; location.href = `profiles.html?uid=${encodeURIComponent(current.uid)}`; });
        els.mChat?.addEventListener("click", () => { if (!current) return; location.href = `chat.html?buddy=${encodeURIComponent(current.uid)}`; });
        return { show, hide };
    }

    // --- search
    function wireSearch(me, els) {
        if (!els.input || !els.searchList) return;

        async function runSearch() {
            const raw = (els.input.value || "").trim();
            if (!raw) { clear(els.searchList); return; }
            const q = raw.replace(/^@/, "").toLowerCase();
            clear(els.searchList);

            const renderAddItem = (uid, userInfo) => {
                if (uid === me.uid) return;
                const addBtn = button("Add");
                addBtn.addEventListener("click", async () => {
                    addBtn.disabled = true;
                    try { await sendRequest(me.uid, uid); addBtn.textContent = "Sent ✓"; }
                    catch (e) { addBtn.textContent = "Error"; warn(e); }
                });
                renderUserRow(els.searchList, { uid, ...userInfo }, [addBtn]);
            };

            // Exact @username
            try {
                const d = await db().collection("usernames").doc(q).get();
                if (d.exists && d.data()?.uid) {
                    const data = d.data() || {};
                    renderAddItem(data.uid, { username: d.id, displayName: data.displayName, photoURL: data.photoURL });
                }
            } catch (e) { warn("exact username lookup failed:", e); }

            // Username prefix (docId)
            try {
                const FieldPath = firebase.firestore.FieldPath;
                const qs = await db().collection("usernames")
                    .orderBy(FieldPath.documentId()).startAt(q).endAt(q + "\uf8ff").limit(10).get();
                qs.forEach(doc => {
                    const data = doc.data() || {};
                    renderAddItem(data.uid, { username: doc.id, displayName: data.displayName, photoURL: data.photoURL });
                });
            } catch (e) { warn("prefix username search failed:", e); }

            // Email exact (if stored)
            if (q.includes("@")) {
                try {
                    const qs = await db().collection("usernames").where("emailLower", "==", q).limit(5).get();
                    qs.forEach(doc => {
                        const data = doc.data() || {};
                        renderAddItem(data.uid, { username: doc.id, displayName: data.displayName, photoURL: data.photoURL });
                    });
                } catch (e) { /* optional field */ }
            }

            // displayNameLower prefix (if stored)
            try {
                const ref = db().collection("usernames");
                const qs = await ref.orderBy("displayNameLower").startAt(q).endAt(q + "\uf8ff").limit(10).get();
                qs.forEach(doc => {
                    const data = doc.data() || {};
                    renderAddItem(data.uid, { username: doc.id, displayName: data.displayName, photoURL: data.photoURL });
                });
            } catch (e) { /* optional field / index */ }
        }

        els.input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } });
        els.searchBtn?.addEventListener("click", (e) => { e.preventDefault(); runSearch(); });
    }

    // --- requests listeners
    function wireRequests(me, els) {
        // incoming
        if (els.incomingList) {
            db().collection("friend_requests").where("to", "==", me.uid).where("status", "==", "pending")
                .onSnapshot(async (snap) => {
                    clear(els.incomingList);
                    for (const doc of snap.docs) {
                        const req = doc.data();
                        const other = await getUsernameByUid(req.from);
                        const acceptBtn = button("Accept");
                        const declineBtn = button("Decline", "btn btn-secondary");
                        acceptBtn.addEventListener("click", async () => {
                            acceptBtn.disabled = declineBtn.disabled = true;
                            try { await setRequestStatus(doc.id, "accepted"); await ensureLocalFriend(me.uid, req.from, { username: other.username }); }
                            catch (e) { warn("accept failed:", e); }
                        });
                        declineBtn.addEventListener("click", async () => {
                            declineBtn.disabled = acceptBtn.disabled = true;
                            try { await setRequestStatus(doc.id, "declined"); } catch (e) { warn("decline failed:", e); }
                        });
                        renderUserRow(els.incomingList, { uid: req.from, username: other.username }, [acceptBtn, declineBtn]);
                    }
                    if (snap.empty) els.incomingList.innerHTML = `<p class="muted">No incoming requests.</p>`;
                });
        }

        // outgoing
        if (els.outgoingList) {
            db().collection("friend_requests").where("from", "==", me.uid).where("status", "==", "pending")
                .onSnapshot(async (snap) => {
                    clear(els.outgoingList);
                    for (const doc of snap.docs) {
                        const req = doc.data();
                        const other = await getUsernameByUid(req.to);
                        const cancelBtn = button("Cancel", "btn btn-secondary");
                        cancelBtn.addEventListener("click", async () => {
                            cancelBtn.disabled = true;
                            try { await setRequestStatus(doc.id, "cancelled"); } catch (e) { warn("cancel failed:", e); }
                        });
                        renderUserRow(els.outgoingList, { uid: req.to, username: other.username }, [cancelBtn]);
                    }
                    if (snap.empty) els.outgoingList.innerHTML = `<p class="muted">No sent requests.</p>`;
                });
        }

        // accepted → mirror i /users/{me}/friends
        const acceptedFrom = db().collection("friend_requests").where("from", "==", me.uid).where("status", "==", "accepted");
        const acceptedTo = db().collection("friend_requests").where("to", "==", me.uid).where("status", "==", "accepted");
        const onAccepted = async (snap, meIsFrom) => {
            for (const doc of snap.docs) {
                const req = doc.data(); const otherUid = meIsFrom ? req.to : req.from;
                const other = await getUsernameByUid(otherUid);
                await ensureLocalFriend(me.uid, otherUid, { username: other.username });
            }
        };
        acceptedFrom.onSnapshot(s => onAccepted(s, true));
        acceptedTo.onSnapshot(s => onAccepted(s, false));
    }

    // --- friends list
    function wireFriendsList(me, els) {
        const modal = useFriendModal(els);
        if (!els.friendsList) return;

        db().collection("users").doc(me.uid).collection("friends")
            .orderBy("createdAt", "desc")
            .onSnapshot(async (snap) => {
                clear(els.friendsList);
                for (const doc of snap.docs) {
                    const f = { uid: doc.id, ...(doc.data() || {}) };
                    if (!f.username) {
                        const u = await getUsernameByUid(f.uid);
                        f.username = u.username;
                    }
                    const chatBtn = button("Chat");
                    chatBtn.addEventListener("click", () => { location.href = `chat.html?buddy=${encodeURIComponent(f.uid)}`; });
                    const rmBtn = button("Remove", "btn btn-secondary");
                    rmBtn.addEventListener("click", async () => {
                        rmBtn.disabled = true;
                        try { await removeLocalFriend(me.uid, f.uid); } catch (e) { warn(e); }
                    });
                    renderUserRow(els.friendsList, f, [chatBtn, rmBtn], () => modal.show(f));
                }
                if (snap.empty) els.friendsList.innerHTML = `<p class="muted">No friends yet.</p>`;
            });
    }

    // --- boot
    async function boot() {
        const me = await requireUser();
        const els = getEls();
        wireSearch(me, els);
        wireRequests(me, els);
        wireFriendsList(me, els);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();
})();
