// buddy-chat.js
(function () {
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    const detail = $('#group-detail');
    const msgsEl = $('#chat-messages');
    const inputEl = $('#chat-input');
    const sendBtn = $('#send-btn');
    const emojiBtn = $('#emoji-btn');
    const picker = $('#emoji-picker');
    const EMOJIS = ["👍", "❤️", "🔥", "😂", "👏", "😮", "😢", "🤯", "🫶", "🎉", "✅", "⭐️"];
    if (picker) picker.innerHTML = EMOJIS.map(e => `<span class="e">${e}</span>`).join("");

    let unsub = null;
    let lastMsgId = null;

    function messagesRef(uid, gid) {
        return fb.db.collection("users").doc(uid).collection("groups").doc(gid).collection("messages");
    }

    function bindGroup(gid) {
        unsub && unsub(); unsub = null;
        if (!gid) return;
        const u = fb.auth.currentUser; if (!u) return;

        // sørg for at gruppedokken finnes
        fb.db.collection("users").doc(u.uid).collection("groups").doc(gid).set({ exists: true }, { merge: true });

        unsub = messagesRef(u.uid, gid).orderBy("t").onSnapshot(snap => {
            const arr = [];
            snap.forEach(doc => arr.push({ id: doc.id, ...doc.data() }));
            msgsEl.innerHTML = arr.map(m => {
                const me = m.uid === u.uid;
                const reacts = m.reacts ? Object.entries(m.reacts).map(([emo, c]) => `<span>${emo} ${c}</span>`).join("") : "";
                const time = (m.t && m.t.toDate) ? m.t.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
                return `<div class="bubble ${me ? 'me' : 'them'}" data-id="${m.id}">
          <div>${(m.text || '').replace(/</g, "&lt;")}</div>
          ${reacts ? `<div class="reacts">${reacts}</div>` : ""}
          <div class="meta">${time}</div>
        </div>`;
            }).join("");
            msgsEl.scrollTop = msgsEl.scrollHeight;
            lastMsgId = arr.length ? arr[arr.length - 1].id : null;
        });
    }

    // send
    sendBtn?.addEventListener('click', async () => {
        const gid = detail?.dataset?.id;
        const u = fb.auth.currentUser;
        const text = (inputEl.value || '').trim();
        if (!gid || !u || !text) return;
        await messagesRef(u.uid, gid).add({
            text, uid: u.uid, t: firebase.firestore.FieldValue.serverTimestamp(), reacts: {}
        });
        inputEl.value = "";
    });

    // emoji picker → legg reaksjon på siste melding
    emojiBtn?.addEventListener('click', () => {
        picker.style.display = picker.style.display === 'grid' ? 'none' : 'grid';
    });
    picker?.addEventListener('click', async (e) => {
        const cell = e.target.closest('.e'); if (!cell) return;
        const gid = detail?.dataset?.id;
        const u = fb.auth.currentUser; if (!gid || !u || !lastMsgId) return;
        const field = `reacts.${cell.textContent}`;
        await messagesRef(u.uid, gid).doc(lastMsgId).set({
            reacts: { [cell.textContent]: firebase.firestore.FieldValue.increment(1) }
        }, { merge: true });
        picker.style.display = 'none';
    });

    // observer når bruker åpner/byter gruppe (script.js setter data-id)
    new MutationObserver(() => bindGroup(detail.dataset.id))
        .observe(detail, { attributes: true, attributeFilter: ['data-id'] });

    // Fallback: ved første last hvis den allerede er satt
    if (detail?.dataset?.id) bindGroup(detail.dataset.id);
})();
