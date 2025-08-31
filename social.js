// social.js
(function () {
    "use strict";
    const $ = (s, r = document) => r.querySelector(s);

    async function sha256(s) {
        const b = new TextEncoder().encode(s);
        const h = await crypto.subtle.digest("SHA-256", b);
        return Array.from(new Uint8Array(h)).map(x => x.toString(16).padStart(2, "0")).join("");
    }

    function me() { return fb.auth.currentUser; }

    async function findUidByEmail(email) {
        const key = await sha256(email.trim().toLowerCase());
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
            at: firebase.firestore.FieldValue.serverTimestamp(),
            status: "pending"
        };
        await fb.db.collection("users").doc(toUid).collection("friendRequests").add(req);
        return true;
    }

    async function acceptRequest(reqId, fromUid) {
        const u = me(); if (!u) throw new Error("Not signed in");

        // 1) marker som accepted
        await fb.db.collection("users").doc(u.uid).collection("friendRequests").doc(reqId)
            .set({ status: "accepted", handledAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });

        // 2) oppdater friends-array hos begge
        const myRef = fb.db.collection("users").doc(u.uid);
        const theirRef = fb.db.collection("users").doc(fromUid);

        await myRef.set({ friends: firebase.firestore.FieldValue.arrayUnion(fromUid) }, { merge: true });
        await theirRef.set({ friends: firebase.firestore.FieldValue.arrayUnion(u.uid) }, { merge: true });
    }

    async function declineRequest(reqId) {
        const u = me(); if (!u) throw new Error("Not signed in");
        await fb.db.collection("users").doc(u.uid).collection("friendRequests").doc(reqId)
            .set({ status: "declined", handledAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }

    // ---------- UI wiring for friends.html ----------
    async function startFriends() {
        const user = me(); if (!user) return;

        // Send request by email
        $("#send-req")?.addEventListener("click", async () => {
            const email = $("#friend-email")?.value || "";
            const status = $("#req-status");
            status.textContent = "Sending…";
            try {
                await sendRequest(email);
                status.textContent = "Request sent ✓";
            } catch (e) {
                status.textContent = e.message || "Failed";
            }
        });

        // Live incoming requests
        const incoming = $("#incoming");
        fb.db.collection("users").doc(user.uid).collection("friendRequests")
            .where("status", "==", "pending")
            .orderBy("at", "desc")
            .onSnapshot((snap) => {
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

        // Friends list
        const list = $("#friend-list");
        fb.db.collection("users").doc(user.uid).onSnapshot(async (meDoc) => {
            const f = (meDoc.data()?.friends || []);
            list.innerHTML = "";
            if (!f.length) { list.textContent = "No friends yet."; return; }
            for (const fid of f) {
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
})();
