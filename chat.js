// chat.js — 1–1 chat (Firestore) + emoji picker, aligned with Firestore rules
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
        typing: $("#typingIndicator")
    };

    // ------- utils -------
    const chatIdFor = (a, b) => [a, b].sort().join("__");
    const nowTS = () => firebase.firestore.FieldValue.serverTimestamp();
    function scrollToBottom(el) { if (!el) return; el.scrollTop = el.scrollHeight + 9999; }
    const esc = s => (s || "").replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

    // ------- ensure chat doc (participants MAP) -------
    async function ensureChatDoc(meUid, otherUid) {
        const id = chatIdFor(meUid, otherUid);
        const ref = db().collection("chats").doc(id);
        const snap = await ref.get();

        if (!snap.exists) {
            // New chat: write with MAP participants — this satisfies your create rule
            await ref.set({
                participants: { [meUid]: true, [otherUid]: true },
                createdAt: nowTS(),
                updatedAt: nowTS(),
                lastMessage: null,
                typing: { [meUid]: false, [otherUid]: false },
                read: { [meUid]: true, [otherUid]: false }
            });
        }
        // IMPORTANT: Do not attempt to “upgrade” older chats (array → map).
        // Rules allow both; rewriting would be blocked by the update rule.
        return ref;
    }

    // ------- render -------
    function renderMsg(doc, meUid) {
        const m = doc.data() || {};
        const mine = m.from === meUid;

        const row = document.createElement("div");
        row.className = "msg-row" + (mine ? " me" : "");

        const bubble = document.createElement("div");
        bubble.className = "msg-bubble";
        bubble.textContent = m.text || "";

        row.appendChild(bubble);
        return row;
    }

    // ------- emoji picker -------
    function setupEmojiPicker() {
        if (!els.emoji || !els.input) return;

        const picker = document.getElementById("emojiPicker") || document.createElement("div");
        picker.id = "emojiPicker";
        if (!picker.parentNode) document.body.appendChild(picker);

        // Populate once
        if (!picker.dataset.ready) {
            picker.dataset.ready = "1";
            const EMOJI = "😀😁😂🤣😅🙂😊😍😘😎🤓🤔🙄😴😭😡👍👎🙏👏🔥✨⭐🌙🌸🌈🍕🍔🍟🍰☕🍵🍺⚽🏀🎮🎧🎬📚📝✈️🚗🏠💡❤️💔💯".split("");
            EMOJI.forEach(e => {
                const b = document.createElement("button");
                b.type = "button";
                b.textContent = e;
                b.style.border = "none";
                b.style.background = "transparent";
                b.style.cursor = "pointer";
                b.style.fontSize = "20px";
                b.style.padding = "2px";
                b.addEventListener("click", ev => {
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
            // position near button
            const r = els.emoji.getBoundingClientRect();
            picker.style.position = "absolute";
            picker.style.right = Math.max(12, window.innerWidth - r.right + 8) + "px";
            picker.style.bottom = "56px";
            picker.style.zIndex = "3000";
            picker.style.border = "1px solid var(--border)";
            picker.style.borderRadius = "12px";
            picker.style.background = "var(--card)";
            picker.style.boxShadow = "0 8px 24px rgba(0,0,0,.15)";
            picker.style.maxWidth = "280px";
            picker.style.maxHeight = "220px";
            picker.style.overflow = "auto";
            picker.style.gridTemplateColumns = "repeat(8, 28px)";
            picker.style.gap = "6px";
            picker.style.padding = "8px";
        });

        document.addEventListener("click", (e) => {
            if (!picker.contains(e.target) && e.target !== els.emoji) picker.style.display = "none";
        });
    }

    function insertAtCursor(input, text) {
        if (!input) return;
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        input.value = input.value.slice(0, start) + text + input.value.slice(end);
        const pos = start + text.length;
        input.selectionStart = input.selectionEnd = pos;
        // kick any listeners
        input.dispatchEvent(new Event("input"));
    }

    // ------- boot -------
    async function boot() {
        const me = await requireUser();
        const other = new URLSearchParams(location.search).get("buddy");
        if (!other) { alert("Missing buddy uid in ?buddy="); return; }

        const chatRef = await ensureChatDoc(me.uid, other);

        // live messages
        chatRef.collection("messages").orderBy("createdAt", "asc").onSnapshot((snap) => {
            els.list.innerHTML = "";
            if (snap.empty) {
                els.list.innerHTML = `<div class="muted" style="padding:8px">No messages yet.</div>`;
            } else {
                snap.forEach(d => els.list.appendChild(renderMsg(d, me.uid)));
            }
            setTimeout(() => scrollToBottom(els.list), 0);
        });

        // send message
        async function send() {
            const text = (els.input.value || "").trim();
            if (!text) return;

            const payload = {
                from: me.uid,
                to: other,
                text,
                type: "text",
                createdAt: nowTS()
            };

            // optimistic clear
            els.input.value = "";
            els.input.dispatchEvent(new Event("input"));

            // create message (matches rules’ allowed keys)
            await chatRef.collection("messages").add(payload);

            // update chat doc meta (allowed keys; participants unchanged)
            await chatRef.set({
                lastMessage: { text, at: nowTS(), from: me.uid },
                updatedAt: nowTS()
            }, { merge: true });
        }

        els.send?.addEventListener("click", e => { e.preventDefault(); send(); });
        els.input?.addEventListener("keydown", e => {
            if (e.key === "Enter") { e.preventDefault(); send(); }
        });

        setupEmojiPicker();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }
})();
