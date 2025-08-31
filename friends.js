// /friends.js
(function () {
    const $ = (s, r = document) => r.querySelector(s);

    async function findUserByEmail(email) {
        const q = await fb.db.collection("users").where("email", "==", email).limit(1).get();
        if (q.empty) return null;
        const d = q.docs[0]; return { uid: d.id, ...d.data() };
    }

    async function sendRequest(toEmail) {
        const me = fb.auth.currentUser; if (!me) return { ok: false, msg: "Not signed in" };
        const to = await findUserByEmail(toEmail);
        if (!to) return { ok: false, msg: "User not found" };
        if (to.uid === me.uid) return { ok: false, msg: "That's you 😅" };

        // Lag en request under mottaker
        await fb.db.collection("users").doc(to.uid).collection("requests").doc(me.uid).set({
            fromUid: me.uid,
            fromEmail: me.email || "",
            fromName: me.displayName || (me.email || "").split("@")[0],
            at: firebase.firestore.FieldValue.serverTimestamp()
        });
        // marker som outgoing hos meg
        await fb.db.collection("users").doc(me.uid).collection("outgoing").doc(to.uid).set({
            toUid: to.uid,
            toEmail: to.email || "",
            toName: to.displayName || (to.email || "").split("@")[0],
            at: firebase.firestore.FieldValue.serverTimestamp()
        });

        return { ok: true, msg: "Request sent ✓" };
    }

    async function accept(uid) {
        const me = fb.auth.currentUser;
        const myRef = fb.db.collection("users").doc(me.uid);
        const frRef = fb.db.collection("users").doc(uid);

        // toveis vennskap
        await myRef.collection("friends").doc(uid).set({ since: firebase.firestore.FieldValue.serverTimestamp() });
        await frRef.collection("friends").doc(me.uid).set({ since: firebase.firestore.FieldValue.serverTimestamp() });

        // rydde requests
        await myRef.collection("requests").doc(uid).delete().catch(() => { });
    }

    async function removeFriend(uid) {
        const me = fb.auth.currentUser;
        await fb.db.collection("users").doc(me.uid).collection("friends").doc(uid).delete();
        await fb.db.collection("users").doc(uid).collection("friends").doc(me.uid).delete();
    }

    function renderIncoming(root, list) {
        if (!list.length) { root.innerHTML = `<div class="muted">No requests</div>`; return; }
        root.innerHTML = list.map(x => `
      <div class="card" style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
        <div><b>${x.fromName || x.fromEmail}</b><div class="muted" style="font-size:.85rem">${x.fromEmail}</div></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" data-acc="${x.fromUid}">Accept</button>
          <button class="btn btn-secondary" data-dec="${x.fromUid}">Decline</button>
        </div>
      </div>
    `).join("");

        root.querySelectorAll("[data-acc]").forEach(b => b.addEventListener("click", async () => {
            await accept(b.dataset.acc);
        }));
        root.querySelectorAll("[data-dec]").forEach(b => b.addEventListener("click", async () => {
            const me = fb.auth.currentUser;
            await fb.db.collection("users").doc(me.uid).collection("requests").doc(b.dataset.dec).delete();
        }));
    }

    function renderFriends(root, list) {
        if (!list.length) { root.innerHTML = `<div class="muted">No friends yet</div>`; return; }
        root.innerHTML = list.map(x => `
      <div class="card" style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
        <div><b>${x.name}</b><div class="muted" style="font-size:.85rem">${x.email || ""}</div></div>
        <button class="btn btn-secondary" data-rem="${x.uid}">Remove</button>
      </div>
    `).join("");

        root.querySelectorAll("[data-rem]").forEach(b => b.addEventListener("click", async () => {
            if (!confirm("Remove friend?")) return;
            await removeFriend(b.dataset.rem);
        }));
    }

    window.startFriends = function () {
        const email = $("#friend-email");
        const sendBtn = $("#send-req");
        const status = $("#req-status");
        const incoming = $("#incoming");
        const list = $("#friend-list");

        sendBtn.addEventListener("click", async () => {
            const v = (email.value || "").trim().toLowerCase();
            if (!v) return;
            status.textContent = "Sending …";
            const res = await sendRequest(v);
            status.textContent = res.msg;
            if (res.ok) email.value = "";
        });

        // live requests
        const me = fb.auth.currentUser;
        fb.db.collection("users").doc(me.uid).collection("requests")
            .orderBy("at", "desc")
            .onSnapshot(s => {
                const arr = []; s.forEach(d => arr.push({ id: d.id, ...d.data() }));
                renderIncoming(incoming, arr);
            });

        // live friends
        fb.db.collection("users").doc(me.uid).collection("friends")
            .onSnapshot(async s => {
                const ids = []; s.forEach(d => ids.push(d.id));
                if (!ids.length) { renderFriends(list, []); return; }

                // hent navn/email for visning
                const out = [];
                for (const uid of ids) {
                    const doc = await fb.db.collection("users").doc(uid).get();
                    const d = doc.data() || {};
                    out.push({ uid, name: d.displayName || (d.email || "").split("@")[0], email: d.email || "" });
                }
                renderFriends(list, out);
            });
    };
})();