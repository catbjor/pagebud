// social.js — unified friends flow (directory lookup + subcollection storage)
(function () {
    "use strict";
    const $ = (s, r = document) => r.querySelector(s);
    const esc = (s) => String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

    async function sha256(s) {
        const b = new TextEncoder().encode(s.trim().toLowerCase());
        const h = await crypto.subtle.digest("SHA-256", b);
        return Array.from(new Uint8Array(h)).map(x => x.toString(16).padStart(2, "0")).join("");
    }
    const fb = () => window.fb;
    const me = () => fb?.auth?.currentUser || null;

    async function findUidByEmail(email) {
        const key = await sha256(email);
        const doc = await fb.db.collection("directory").doc(key).get();
        return doc.exists ? (doc.data().uid) : null;
    }

    // Use the same top-level collection as friends.js and the security rules
    async function sendRequest(toEmail) {
        const from = me(); if (!from) throw new Error("Not signed in");
        const toUid = await findUidByEmail(toEmail);
        if (!toUid) throw new Error("User not found");
        if (toUid === from.uid) throw new Error("You can’t add yourself");

        const reqId = [from.uid, toUid].sort().join("__");
        const ref = fb().db.collection("friend_requests").doc(reqId);

        await ref.set({
            from: from.uid,
            to: toUid,
            status: "pending",
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return true;
    }

    async function acceptRequest(reqId, fromUid) {
        const u = me(); if (!u) throw new Error("Not signed in");
        await fb().db.collection("friend_requests").doc(reqId)
            .set({ status: "accepted", updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });

        const myRef = fb().db.collection("users").doc(u.uid).collection("friends").doc(fromUid);
        const yourRef = fb().db.collection("users").doc(fromUid).collection("friends").doc(u.uid);

        const payloadMine = { friendUid: fromUid, status: "accepted", createdAt: firebase.firestore.FieldValue.serverTimestamp() };
        const payloadTheirs = { friendUid: u.uid, status: "accepted", createdAt: firebase.firestore.FieldValue.serverTimestamp() };

        await Promise.all([myRef.set(payloadMine, { merge: true }), yourRef.set(payloadTheirs, { merge: true })]);
    }

    async function declineRequest(reqId) {
        const u = me(); if (!u) throw new Error("Not signed in");
        await fb().db.collection("friend_requests").doc(reqId)
            .set({ status: "declined", updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }

    // Helper to get user profile data for display
    const userCache = new Map();
    async function getUserInfo(uid) {
        if (userCache.has(uid)) return userCache.get(uid);
        try {
            const doc = await fb().db.collection("users").doc(uid).get();
            const data = doc.exists ? doc.data() : { displayName: "A user", photoURL: "" };
            userCache.set(uid, data);
            return data;
        } catch {
            return { displayName: "A user", photoURL: "" };
        }
    }

    async function startFriends() {
        const u = me(); if (!u) return;

        $("#send-req")?.addEventListener("click", async () => {
            const email = ($("#friend-email")?.value || "").trim();
            const status = $("#req-status"); if (status) status.textContent = "Sending…";
            try {
                await sendRequest(email);
                if (status) status.textContent = "Request sent ✓";
            } catch (e) {
                if (status) status.textContent = e?.message || "Failed";
            }
        });

        const incoming = $("#incoming");
        fb().db.collection("friend_requests")
            .where("to", "==", u.uid)
            .where("status", "==", "pending")
            .onSnapshot(async (snap) => {
                if (!incoming) return;
                incoming.innerHTML = "";
                if (snap.empty) { incoming.textContent = "No requests"; return; }
                for (const doc of snap.docs) {
                    const d = doc.data();
                    const fromUser = await getUserInfo(d.from);
                    const row = document.createElement("div");
                    row.className = "card";
                    row.style.marginBottom = "8px";
                    row.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
              <div>Request from <b>${esc(fromUser.displayName)}</b></div>
              <div style="display:flex;gap:6px">
                <button class="btn btn-primary" data-a="acc">Accept</button>
                <button class="btn" data-a="dec">Decline</button>
              </div>
            </div>`;
                    row.querySelector('[data-a="acc"]').addEventListener("click", () => acceptRequest(doc.id, d.from));
                    row.querySelector('[data-a="dec"]').addEventListener("click", () => declineRequest(doc.id));
                    incoming.appendChild(row);
                }
            });

        const list = $("#friend-list");
        fb().db.collection("users").doc(u.uid).collection("friends")
            .where("status", "==", "accepted")
            .onSnapshot(async (snap) => {
                if (!list) return;
                list.innerHTML = "";
                if (snap.empty) { list.textContent = "No friends yet."; return; }

                const ids = snap.docs.map(d => d.id);
                for (const fid of ids) {
                    const pd = await fb().db.collection("users").doc(fid).get();
                    const p = pd.data() || {};
                    const el = document.createElement("div");
                    el.className = "card";
                    el.style.marginBottom = "8px";
                    el.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
              <div style="display:flex;align-items:center;gap:10px">
                <img src="${p.photoURL || ""}" alt="" style="width:32px;height:32px;border-radius:999px;object-fit:cover;background:#333">
                <div>
                  <div style="font-weight:800">${esc(p.displayName || p.name || fid)}</div>
                  <div class="muted small">${esc(p.username ? `@${p.username}` : fid)}</div>
                </div>
              </div>
              <a class="btn" href="chat.html?friend=${encodeURIComponent(fid)}">Chat</a>
            </div>`;
                    list.appendChild(el);
                }
            });
    }

    window.startFriends = startFriends;
    window.PBSocial = { sendRequest, acceptRequest, declineRequest };

    // Auto-init if friends.html is loaded
    document.addEventListener("DOMContentLoaded", () => {
        if (document.getElementById("friend-list")) {
            window.requireAuth(startFriends);
        }
    });
})();
