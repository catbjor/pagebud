// social.js — unified friends flow (directory lookup + subcollection storage)
(function () {
    "use strict";
    const $ = (s, r = document) => r.querySelector(s);

    async function sha256(s) {
        const b = new TextEncoder().encode(s.trim().toLowerCase());
        const h = await crypto.subtle.digest("SHA-256", b);
        return Array.from(new Uint8Array(h)).map(x => x.toString(16).padStart(2, "0")).join("");
    }
    const me = () => fb?.auth?.currentUser || null;

    async function findUidByEmail(email) {
        const key = await sha256(email);
        const doc = await fb.db.collection("directory").doc(key).get();
        return doc.exists ? (doc.data().uid) : null;
    }

    async function sendRequest(toEmail) {
        const from = me(); if (!from) throw new Error("Not signed in");
        const toUid = await findUidByEmail(toEmail);
        if (!toUid) throw new Error("User not found");
        if (toUid === from.uid) throw new Error("You can’t add yourself");

        const req = {
            fromUid: from.uid,
            toUid,
            status: "pending",
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await fb.db.collection("users").doc(toUid).collection("friendRequests").add(req);
        return true;
    }

    async function acceptRequest(reqId, fromUid) {
        const u = me(); if (!u) throw new Error("Not signed in");
        await fb.db.collection("users").doc(u.uid).collection("friendRequests").doc(reqId)
            .set({ status: "accepted", handledAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });

        const myRef = fb.db.collection("users").doc(u.uid).collection("friends").doc(fromUid);
        const yourRef = fb.db.collection("users").doc(fromUid).collection("friends").doc(u.uid);

        const payloadMine = { friendUid: fromUid, status: "accepted", createdAt: firebase.firestore.FieldValue.serverTimestamp() };
        const payloadTheirs = { friendUid: u.uid, status: "accepted", createdAt: firebase.firestore.FieldValue.serverTimestamp() };

        await Promise.all([myRef.set(payloadMine, { merge: true }), yourRef.set(payloadTheirs, { merge: true })]);
    }

    async function declineRequest(reqId) {
        const u = me(); if (!u) throw new Error("Not signed in");
        await fb.db.collection("users").doc(u.uid).collection("friendRequests").doc(reqId)
            .set({ status: "declined", handledAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
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
        fb.db.collection("users").doc(u.uid).collection("friendRequests")
            .where("status", "==", "pending").orderBy("createdAt", "desc")
            .onSnapshot((snap) => {
                if (!incoming) return;
                incoming.innerHTML = "";
                if (snap.empty) { incoming.textContent = "No requests"; return; }
                snap.forEach(doc => {
                    const d = doc.data();
                    const row = document.createElement("div");
                    row.className = "card";
                    row.style.marginBottom = "8px";
                    row.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
              <div><b>Request</b> from <code>${d.fromUid}</code></div>
              <div style="display:flex;gap:6px">
                <button class="btn btn-primary" data-a="acc">Accept</button>
                <button class="btn" data-a="dec">Decline</button>
              </div>
            </div>`;
                    row.querySelector('[data-a="acc"]').addEventListener("click", () => acceptRequest(doc.id, d.fromUid));
                    row.querySelector('[data-a="dec"]').addEventListener("click", () => declineRequest(doc.id));
                    incoming.appendChild(row);
                });
            });

        const list = $("#friend-list");
        fb.db.collection("users").doc(u.uid).collection("friends")
            .where("status", "==", "accepted")
            .onSnapshot(async (snap) => {
                if (!list) return;
                list.innerHTML = "";
                if (snap.empty) { list.textContent = "No friends yet."; return; }

                const ids = snap.docs.map(d => d.id);
                for (const fid of ids) {
                    const pd = await fb.db.collection("users").doc(fid).get();
                    const p = pd.data() || {};
                    const el = document.createElement("div");
                    el.className = "card";
                    el.style.marginBottom = "8px";
                    el.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
              <div style="display:flex;align-items:center;gap:10px">
                <img src="${p.photoURL || ""}" alt="" style="width:32px;height:32px;border-radius:999px;object-fit:cover;background:#333">
                <div>
                  <div style="font-weight:800">${p.name || fid}</div>
                  <div class="muted small">${fid}</div>
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
        if (document.getElementById("friend-list")) startFriends();
    });
})();
