// buddy-chat.js — shared group chat under buddy_groups/{gid}/messages
(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    // DOM
    const detail = $('#group-detail');        // must have data-id set to gid
    const msgsEl = $('#chat-messages');
    const inputEl = $('#chat-input');
    const sendBtn = $('#send-btn');
    const emojiBtn = $('#emoji-btn');
    const picker = $('#emoji-picker');

    const EMOJIS = ["👍", "❤️", "🔥", "😂", "👏", "😮", "😢", "🤯", "🫶", "🎉", "✅", "⭐️"];
    if (picker) picker.innerHTML = EMOJIS.map(e => `<span class="e" role="button" tabindex="0">${e}</span>`).join("");

    // Firebase helpers
    function auth() { return (window.fb?.auth) || (window.firebase?.auth?.()) || firebase.auth(); }
    function db() { return (window.fb?.db) || (window.firebase?.firestore?.()) || firebase.firestore(); }

    // State
    let unsubMsgs = null;
    let unsubGroup = null;
    let lastMsgId = null;
    let currentGid = "";
    let me = null;
    let amMember = false;

    // Refs
    const groupRef = (gid) => db().collection("buddy_groups").doc(gid);
    const messagesRef = (gid) => groupRef(gid).collection("messages");

    // Utils
    function toast(msg) {
        try {
            const t = document.createElement("div");
            t.className = "toast"; t.textContent = msg;
            document.body.appendChild(t);
            requestAnimationFrame(() => t.classList.add("show"));
            setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 1200);
        } catch { alert(msg); }
    }
    function htmlEscape(s) {
        return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }
    function timeLabel(ts) {
        try {
            const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
            if (!d) return "";
            return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        } catch { return ""; }
    }

    function renderMessages(arr, myUid) {
        msgsEl.innerHTML = arr.map(m => {
            const meSide = m.uid === myUid;
            const reacts = m.reacts
                ? Object.entries(m.reacts).map(([emo, c]) => `<span class="react-chip">${emo} ${c}</span>`).join("")
                : "";
            return `
        <div class="bubble ${meSide ? 'me' : 'them'}" data-id="${m.id}">
          <div class="bubble-text">${htmlEscape(m.text || "")}</div>
          ${reacts ? `<div class="reacts">${reacts}</div>` : ""}
          <div class="meta">${timeLabel(m.t)}</div>
        </div>`;
        }).join("");
        msgsEl.scrollTop = msgsEl.scrollHeight;
        lastMsgId = arr.length ? arr[arr.length - 1].id : null;
    }

    async function bindGroup(gid) {
        // cleanup previous
        unsubMsgs && unsubMsgs(); unsubMsgs = null;
        unsubGroup && unsubGroup(); unsubGroup = null;
        amMember = false;
        lastMsgId = null;

        currentGid = gid || "";
        if (!currentGid) return;

        // Ensure user
        const a = auth();
        me = a.currentUser || await new Promise((res) => {
            const off = a.onAuthStateChanged(u => { off(); res(u || null); });
        });
        if (!me) { toast("Not signed in."); return; }

        // Watch group doc to check membership
        unsubGroup = groupRef(currentGid).onSnapshot(snap => {
            const data = snap.data() || {};
            const members = data.members || {};
            const owner = data.owner || "";
            amMember = !!members[me.uid] || owner === me.uid;

            // Gate send UI based on membership
            if (sendBtn) sendBtn.disabled = !amMember;
            if (inputEl) inputEl.disabled = !amMember;
            if (!amMember) {
                msgsEl.innerHTML = `<div class="muted" style="padding:8px;">You’re not a member of this group.</div>`;
            }
        }, () => { /* ignore */ });

        // Subscribe to shared messages
        unsubMsgs = messagesRef(currentGid)
            .orderBy("t", "asc")
            .onSnapshot(snap => {
                const arr = [];
                snap.forEach(doc => arr.push({ id: doc.id, ...(doc.data() || {}) }));
                renderMessages(arr, me.uid);
            }, err => {
                console.warn("[buddy-chat] messages onSnapshot error:", err);
            });
    }

    // Send text
    async function send() {
        const gid = currentGid;
        if (!gid || !me) return;
        if (!amMember) { toast("Join the group to chat."); return; }

        const text = (inputEl?.value || "").trim();
        if (!text) return;

        try {
            await messagesRef(gid).add({
                text,
                uid: me.uid,
                t: firebase.firestore.FieldValue.serverTimestamp(),
                reacts: {}
            });
            inputEl.value = "";
        } catch (e) {
            console.warn("[buddy-chat] send failed:", e);
            toast("Could not send.");
        }
    }

    // React on last message
    async function react(emoji) {
        const gid = currentGid;
        if (!gid || !me || !lastMsgId || !amMember) return;
        const field = `reacts.${emoji}`;
        try {
            await messagesRef(gid).doc(lastMsgId).set({
                reacts: { [emoji]: firebase.firestore.FieldValue.increment(1) }
            }, { merge: true });
        } catch (e) {
            console.warn("[buddy-chat] react failed:", e);
        }
    }

    // Wire UI
    function wire() {
        sendBtn?.addEventListener("click", (e) => { e.preventDefault(); send(); });
        inputEl?.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
        });

        emojiBtn?.addEventListener("click", (e) => {
            e.preventDefault();
            if (!picker) return;
            picker.style.display = picker.style.display === "grid" ? "none" : "grid";
        });

        picker?.addEventListener("click", (e) => {
            const cell = e.target.closest(".e"); if (!cell) return;
            react(cell.textContent);
            picker.style.display = "none";
        });
        picker?.addEventListener("keydown", (e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            const cell = e.target.closest(".e"); if (!cell) return;
            e.preventDefault();
            react(cell.textContent);
            picker.style.display = "none";
        });

        // Rebind when data-id changes (buddy-chat.html sets it from ?group=)
        new MutationObserver(() => bindGroup(detail?.dataset?.id || ""))
            .observe(detail, { attributes: true, attributeFilter: ["data-id"] });

        // First bind if already present
        if (detail?.dataset?.id) bindGroup(detail.dataset.id);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", wire, { once: true });
    } else {
        wire();
    }
})();
