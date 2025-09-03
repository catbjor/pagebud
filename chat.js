// chat.js — 1–1 chat (Firestore) med write-first opprettelse + unread flags + emoji
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);

  // ------- Firebase helpers -------
  function auth() { return (window.fb?.auth) || (window.firebase?.auth?.()) || firebase.auth(); }
  function db() { return (window.fb?.db) || (window.firebase?.firestore?.()) || firebase.firestore(); }

  async function requireUser() {
    const a = auth();
    if (a.currentUser) return a.currentUser;
    return new Promise((res, rej) => {
      const off = a.onAuthStateChanged(u => { off(); u ? res(u) : rej(new Error("Not signed in")); });
    });
  }

  // ------- DOM -------
  const els = {
    list: $("#chatMessages"),
    input: $("#chatInput"),
    send: $("#chatSend"),
    emoji: $("#emojiBtn"),
    picker: $("#emojiPicker") // optional
  };

  // ------- utils -------
  const chatIdFor = (a, b) => [a, b].sort().join("__");
  const nowTS = () => firebase.firestore.FieldValue.serverTimestamp();

  function addMessageBubble(container, msg, meUid) {
    if (!container) return;
    const row = document.createElement("div");
    row.className = "msg-row" + (msg.from === meUid ? " me" : "");
    const b = document.createElement("div");
    b.className = "msg-bubble";
    b.textContent = msg.text || "";
    row.appendChild(b);
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
  }

  // WRITE-FIRST: ikke les først (read kan blokkeres av rules når doc ikke finnes).
  async function ensureChatDoc(chatId, meUid, buddyUid) {
    const ref = db().collection("chats").doc(chatId);

    const base = {
      participants: { [meUid]: true, [buddyUid]: true }, // MAP (støttes av rules)
      createdAt: nowTS(),
      updatedAt: nowTS(),
      lastMessage: null,
      typing: {},
      read: { [meUid]: true, [buddyUid]: true }
    };

    // Skriv alltid en base med merge — dette krever ikke read først
    await ref.set(base, { merge: true });

    // Ekstra “reparasjon” i tilfelle gammel struktur (array etc.)
    try {
      await ref.set({ participants: { [meUid]: true, [buddyUid]: true } }, { merge: true });
    } catch { }

    return ref;
  }

  async function markRead(chatRef, meUid) {
    try {
      await chatRef.set({ read: { [meUid]: true } }, { merge: true });
    } catch { }
  }

  async function boot() {
    const me = await requireUser();

    // buddy from URL (?buddy=UID)
    const params = new URLSearchParams(location.search);
    // etter – støtter flere aliaser
    const buddy = params.get("buddy") || params.get("friend") || params.get("uid");    
    if (!buddy) {
      console.warn("[Chat] Missing ?buddy=UID");
      return;
    }

    const chatId = chatIdFor(me.uid, buddy);
    const chatRef = await ensureChatDoc(chatId, me.uid, buddy);

    // ---- messages live listener (etter at doc finnes) ----
    db().collection("chats").doc(chatId)
      .collection("messages").orderBy("createdAt", "asc")
      .onSnapshot((snap) => {
        if (!els.list) return;
        els.list.innerHTML = "";
        snap.forEach(d => addMessageBubble(els.list, d.data() || {}, me.uid));
      });

    // Markér lest når åpnet og når vindu får fokus
    await markRead(chatRef, me.uid);
    window.addEventListener("focus", () => markRead(chatRef, me.uid));

    // ---- send() ----
    async function send() {
      const text = (els.input?.value || "").trim();
      if (!text) return;
      if (els.send) els.send.disabled = true;

      const msg = {
        from: me.uid,
        to: buddy,
        text,
        type: "text",
        createdAt: nowTS()
      };

      try {
        // 1) lagre melding
        await chatRef.collection("messages").add(msg);

        // 2) oppdater metadata + unread flags
        await chatRef.set({
          updatedAt: nowTS(),
          lastMessage: { text, from: me.uid, createdAt: nowTS() },
          read: { [me.uid]: true, [buddy]: false }
        }, { merge: true });

        els.input.value = "";
      } catch (e) {
        console.warn("[Chat] send failed:", e);
        alert("Could not send. Check connection and Firestore rules.");
      } finally {
        if (els.send) els.send.disabled = false;
      }
    }

    // ---- emoji picker (valgfri) ----
    function setupEmojiPicker() {
      if (!els.emoji || !els.input) return;
      const emojis = ["😀", "😂", "😊", "😍", "🥳", "👍", "🙏", "🔥", "💯", "🎉", "📚", "🧠"];
      let built = false;

      function build() {
        if (built) return;
        built = true;
        let pick = els.picker;
        if (!pick) {
          pick = document.createElement("div");
          pick.id = "emojiPicker";
          pick.className = "emoji-picker";
          document.body.appendChild(pick);
        }
        pick.innerHTML = "";
        emojis.forEach(e => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "e";
          b.textContent = e;
          b.addEventListener("click", () => {
            els.input.value += e;
            pick.style.display = "none";
            els.input.focus();
          });
          pick.appendChild(b);
        });
      }

      function toggle() {
        build();
        const pick = els.picker || document.getElementById("emojiPicker");
        if (!pick) return;
        pick.style.display = (pick.style.display === "grid" ? "none" : "grid");
      }

      els.emoji.addEventListener("click", (e) => {
        e.preventDefault();
        toggle();
      });

      document.addEventListener("click", (e) => {
        const pick = els.picker || document.getElementById("emojiPicker");
        if (!pick) return;
        if (e.target === els.emoji || pick.contains(e.target)) return;
        pick.style.display = "none";
      });
    }

    // Hook events
    els.send?.addEventListener("click", (e) => { e.preventDefault(); send(); });
    els.input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    });

    setupEmojiPicker();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
