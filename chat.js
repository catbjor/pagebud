// chat.js
(function () {
    "use strict";
    const $ = (s, r = document) => r.querySelector(s);
    const qp = k => new URL(location.href).searchParams.get(k);

    async function getOrCreateChat(friendUid) {
        const myUid = fb.auth.currentUser.uid;

        // Finn evt. eksisterende chat
        const snap = await fb.db.collection("users").doc(myUid).collection("chats")
            .where("members", "array-contains", friendUid).limit(1).get();

        if (!snap.empty) {
            const d = snap.docs[0];
            return { id: d.id, ...(d.data() || {}) };
        }

        // Opprett chat (samme chatId hos begge)
        const chatId = fb.db.collection("_ids").doc().id;
        const base = {
            members: [myUid, friendUid],
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await fb.db.collection("users").doc(myUid).collection("chats").doc(chatId).set(base);
        await fb.db.collection("users").doc(friendUid).collection("chats").doc(chatId).set(base);

        return { id: chatId, ...base };
    }

    function renderMessage(root, m) {
        const myUid = fb.auth.currentUser.uid;
        const mine = m.uid === myUid;

        const bubble = document.createElement("div");
        bubble.className = `bubble ${mine ? "me" : "them"}`;
        bubble.innerHTML = `
      <div>${(m.text || "").replace(/</g, "&lt;")}</div>
      <div class="meta">${m.at?.toDate ? m.at.toDate().toLocaleString() : ""}</div>
    `;
        root.appendChild(bubble);
        root.scrollTop = root.scrollHeight;
    }

    async function startChat(friendUid) {
        const chat = await getOrCreateChat(friendUid);
        const myUid = fb.auth.currentUser.uid;
        const box = $("#chatBox");

        // Live meldinger
        fb.db.collection("users").doc(myUid).collection("chats").doc(chat.id)
            .collection("messages").orderBy("at")
            .onSnapshot(snap => {
                box.innerHTML = "";
                snap.forEach(d => renderMessage(box, d.data()));
            });

        // Send
        $("#send").addEventListener("click", async () => {
            const text = $("#msg").value.trim();
            if (!text) return;
            $("#msg").value = "";

            const msg = { uid: myUid, text, at: firebase.firestore.FieldValue.serverTimestamp() };

            // Speil til begge:
            const myMsg = fb.db.collection("users").doc(myUid).collection("chats").doc(chat.id).collection("messages").doc();
            const yourMsg = fb.db.collection("users").doc(friendUid).collection("chats").doc(chat.id).collection("messages").doc(myMsg.id);

            await myMsg.set(msg);
            await yourMsg.set(msg);
        });
    }

    function startChatFromURL() {
        const friend = qp("friend");
        if (!friend) { alert("Missing ?friend=UID"); return; }
        startChat(friend).catch(e => alert(e.message || "Chat error"));
    }

    window.startChatFromURL = startChatFromURL;
})();
