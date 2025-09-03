< !--chat.js — 1–1 chat(Firestore) + emoji picker + unread flags + friends - guard-- >
  <script>
    (function () {
      "use strict";
  const $ = (s, r = document) => r.querySelector(s);

    // ------- Firebase helpers -------
    function auth() { return (window.fb?.auth) || (window.firebase?.auth?.()) || firebase.auth(); }
    function db()   { return (window.fb?.db)   || (window.firebase?.firestore?.()) || firebase.firestore(); }

    async function requireUser() {
    const a = auth();
    if (a.currentUser) return a.currentUser;
    return new Promise((res, rej) => {
      const off = a.onAuthStateChanged(u => {off(); u ? res(u) : rej(new Error("Not signed in")); });
    });
  }

    // ------- DOM -------
    const els = {
      list:  $("#chatMessages"),
    input: $("#chatInput"),
    send:  $("#chatSend"),
    emoji: $("#emojiBtn"),
  };

  // ------- utils -------
  const chatIdFor = (a, b) => [a, b].sort().join("__");
  const nowTS = () => firebase.firestore.FieldValue.serverTimestamp();
    function scrollToBottom(el) { try {el.scrollTop = el.scrollHeight + 99999; } catch { } }

    // ------- ensure chat doc (participants MAP) -------
    async function ensureChatDoc(meUid, otherUid) {
    const id  = chatIdFor(meUid, otherUid);
    const ref = db().collection("chats").doc(id);
    const snap = await ref.get();

    if (!snap.exists) {
      await ref.set({
        participants: { [meUid]: true, [otherUid]: true }, // MAP (rules krever dette)
        createdAt: nowTS(),
        updatedAt: nowTS(),
        lastMessage: null,
        typing: { [meUid]: false, [otherUid]: false },
        read: { [meUid]: true, [otherUid]: false }
      }, { merge: true });
    return ref;
    }

    // Oppgrader ev. gammel ARRAY -> MAP
    const data = snap.data() || { };
    if (Array.isArray(data.participants)) {
      const map = { }; data.participants.forEach(u => {map[u] = true; });
    await ref.set({participants: map }, {merge: true });
    }
    return ref;
  }

    // ------- render -------
    function renderMsg(doc, meUid) {
    const m = doc.data();
    const mine = m.from === meUid;

    const row = document.createElement("div");
    row.className = "msg-row " + (mine ? "me" : "them");

    const b = document.createElement("div");
    b.className = "msg-bubble";
    b.textContent = m.text || "";
    row.appendChild(b);
    return row;
  }

    // ------- emoji picker -------
    function setupEmojiPicker() {
    if (!els.emoji || !els.input) return;

    const picker = $("#emojiPicker") || (() => {
      const p = document.createElement("div");
    p.id = "emojiPicker";
    // grunnleggende styling, men layout ligger i chat.html CSS
    Object.assign(p.style, {
      position: "absolute",
    right: "12px",
    bottom: "56px",
    display: "none",
    zIndex: "3000"
      });
    document.body.appendChild(p);
    return p;
    })();

    // Fyll emojis én gang
    if (!picker.dataset.ready) {
      picker.dataset.ready = "1";
    const emojis = "😀😁😂🤣😅🙂😊😍😘😎🤓🤔🙄😴😭😡👍👎🙏👏🔥✨⭐🌙🌸🌈🍕🍔🍟🍰☕🍵⚽🏀🎮🎧🎬📚📝✈️🚗🏠💡❤️💯".split("");
      emojis.forEach(e => {
        const b = document.createElement("button");
    b.type = "button";
    b.textContent = e;
    b.style.border = "none";
    b.style.background = "transparent";
    b.style.cursor = "pointer";
    b.style.fontSize = "20px";
    b.style.lineHeight = "1";
        b.addEventListener("click", (ev) => {
      ev.preventDefault(); ev.stopPropagation();
    insertAtCursor(els.input, e + " ");
    picker.style.display = "none";
    els.input.focus();
        });
    picker.appendChild(b);
      });
    }

    els.emoji.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
    picker.style.display = (picker.style.display === "none" || !picker.style.display) ? "grid" : "none";
    const rect = els.emoji.getBoundingClientRect();
    picker.style.right = Math.max(12, window.innerWidth - rect.right + 8) + "px";
    picker.style.bottom = "56px";
    });

    // Lukk ved klikk utenfor
    document.addEventListener("click", (e) => {
      if (!picker.contains(e.target) && e.target !== els.emoji) picker.style.display = "none";
    });
  }

    function insertAtCursor(input, text) {
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end   = input.selectionEnd ?? input.value.length;
    const before = input.value.slice(0, start);
    const after  = input.value.slice(end);
    input.value = before + text + after;
    const pos = start + text.length;
    input.selectionStart = input.selectionEnd = pos;
    input.dispatchEvent(new Event("input"));
  }

    // ------- boot -------
    async function boot() {
    const me = await requireUser();
    const other = new URLSearchParams(location.search).get("buddy");
    if (!other) {alert("Missing buddy uid in ?buddy="); return; }

    // ❗ Guard: krev akseptert vennskap før chat (ellers videresend til Friends)
    try {
      const fdoc = await db().collection('users').doc(me.uid)
    .collection('friends').doc(other).get();
    if (!fdoc.exists || fdoc.data()?.status !== 'accepted') {
      alert("You’re not friends yet. Accept the friend request first.");
    location.href = "friends.html";
    return;
      }
    } catch { }

    // Sørg for gyldig chat-doc i riktig format (MAP)
    const ref = await ensureChatDoc(me.uid, other);

    // Markér lest når vises/åpnes
    const markRead = async () => {
      try {
      await ref.set({ [`read.${me.uid}`]: true, updatedAt: nowTS() }, { merge: true });
      } catch { }
    };
    await markRead();
    document.addEventListener("visibilitychange", () => { if (!document.hidden) markRead(); });

    // Live meldinger
    ref.collection("messages").orderBy("createdAt", "asc").onSnapshot((snap) => {
      els.list.innerHTML = "";
    if (snap.empty) {
      els.list.innerHTML = `<div class="muted" style="padding:8px">No messages yet.</div>`;
      } else {
      snap.forEach(d => els.list.appendChild(renderMsg(d, me.uid)));
      }
      setTimeout(() => {scrollToBottom(els.list); markRead(); }, 0);
    });

    // Send
    async function send() {
      const text = (els.input.value || "").trim();
    if (!text) return;

    els.input.value = "";
    els.input.dispatchEvent(new Event("input"));

    try {
      await ref.collection("messages").add({
        from: me.uid, to: other, text, type: "text", createdAt: nowTS()
      });

    // Unread-flagg på chat-doc (min side lest, andre side ulest)
    await ref.set({
      lastMessage: {text, at: nowTS(), from: me.uid },
    updatedAt: nowTS(),
    [`read.${me.uid}`]: true,
    [`read.${other}`]: false
        }, {merge: true });
      } catch (e) {
      console.error("[Chat] send failed:", e);
    alert(e?.message || "Could not send message (check Firestore rules and that chats/<A__B>.participants is a MAP).");
      }
    }

    els.send?.addEventListener("click", (e) => {e.preventDefault(); send(); });
    els.input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {e.preventDefault(); send(); }
    });

      setupEmojiPicker();
  }

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
        boot();
  }
})();
  </script>
