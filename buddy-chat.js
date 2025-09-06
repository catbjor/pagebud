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
    const micBtn = $('#mic-btn');
    const recordingIndicator = $('#recording-indicator');
    const recordingTimer = $('#recording-timer');
    const stopRecordingBtn = $('#stop-recording-btn');
    const picker = $('#emoji-picker');

    const EMOJIS = ["👍", "❤️", "🔥", "😂", "👏", "😮", "😢", "🤯", "🫶", "🎉", "✅", "⭐️"];
    if (picker) picker.innerHTML = EMOJIS.map(e => `<span class="e" role="button" tabindex="0">${e}</span>`).join("");

    // Firebase helpers
    function auth() { return (window.fb?.auth) || (window.firebase?.auth?.()) || firebase.auth(); }
    function db() { return (window.fb?.db) || (window.firebase?.firestore?.()) || firebase.firestore(); }
    function storage() { return (window.fb?.storage) || (window.firebase?.storage?.()) || firebase.storage(); }

    function playSound(url) {
        // Check the user's preference before playing a sound.
        if (localStorage.getItem("pb:notifications:sound") === "false") return;

        if (typeof Audio === "undefined") return;
        try {
            const audio = new Audio(url);
            // Don't show console errors if the browser blocks autoplay
            audio.play().catch(() => { });
        } catch (e) {
            console.error("Failed to play sound:", e);
        }
    }

    // State
    let unsubMsgs = null;
    let unsubGroup = null;
    let lastMsgId = null;
    let currentGid = "";
    let me = null;
    let amMember = false;
    let mediaRecorder = null;
    let audioChunks = [];
    let recordingInterval = null;

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
            const messageContent = m.type === 'voice'
                ? `<audio controls src="${htmlEscape(m.audioUrl)}"></audio>`
                : htmlEscape(m.text || "");

            const reacts = m.reacts
                ? Object.entries(m.reacts).map(([emo, c]) => `<span class="react-chip">${emo} ${c}</span>`).join("")
                : "";

            return `
        <div class="bubble ${meSide ? 'me' : 'them'}" data-id="${m.id}">
          <div class="bubble-text">${messageContent}</div>
          ${reacts
                    ? `<div class="reacts">${reacts}</div>`
                    : `<button class="btn-react-bubble" data-msg-id="${m.id}" title="React">👍</button>`
                }
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
                // Play sound for new incoming messages after initial load
                if (lastMsgId) {
                    snap.docChanges().forEach(change => {
                        if (change.type === 'added' && change.doc.data().uid !== me.uid) {
                            playSound('sound effect folder/chat-received.mp3');
                        }
                    });
                }

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

        // This function now only sends text messages
        const text = (inputEl?.value || "").trim();
        if (!text) return;

        try {
            await messagesRef(gid).add({
                text,
                uid: me.uid,
                type: 'text', // Explicitly set message type
                t: firebase.firestore.FieldValue.serverTimestamp(),
                reacts: {}
            });
            inputEl.value = "";
        } catch (e) {
            console.warn("[buddy-chat] send failed:", e);
            toast("Could not send.");
        }
    }

    // --- Voice Note Logic ---
    async function startRecording() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("Your browser doesn't support voice recording.");
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.addEventListener("dataavailable", event => {
                audioChunks.push(event.data);
            });

            mediaRecorder.addEventListener("stop", async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                await uploadAndSendVoiceNote(audioBlob);
                stream.getTracks().forEach(track => track.stop()); // Stop microphone access
            });

            mediaRecorder.start();
            toggleRecordingUI(true);
        } catch (err) {
            console.error("Error accessing microphone:", err);
            alert("Could not access microphone. Please check your browser permissions.");
        }
    }

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
        }
        toggleRecordingUI(false);
    }

    function toggleRecordingUI(isRecording) {
        if (isRecording) {
            inputEl.style.display = 'none';
            sendBtn.style.display = 'none';
            micBtn.style.display = 'none';
            recordingIndicator.style.display = 'flex';
            let seconds = 0;
            recordingTimer.textContent = '00:00';
            recordingInterval = setInterval(() => {
                seconds++;
                const min = Math.floor(seconds / 60).toString().padStart(2, '0');
                const sec = (seconds % 60).toString().padStart(2, '0');
                recordingTimer.textContent = `${min}:${sec}`;
            }, 1000);
        } else {
            inputEl.style.display = '';
            sendBtn.style.display = '';
            micBtn.style.display = '';
            recordingIndicator.style.display = 'none';
            clearInterval(recordingInterval);
        }
    }

    async function uploadAndSendVoiceNote(audioBlob) {
        const gid = currentGid;
        if (!gid || !me || !amMember) return;

        toast("Sending voice note...");
        const messageId = db().collection("buddy_groups").doc().id; // Generate a unique ID
        const filePath = `buddy_chats/${gid}/${messageId}.webm`;
        const fileRef = storage().ref(filePath);

        try {
            const snapshot = await fileRef.put(audioBlob);
            const downloadURL = await snapshot.ref.getDownloadURL();

            await messagesRef(gid).add({
                uid: me.uid,
                type: 'voice',
                audioUrl: downloadURL,
                storagePath: filePath,
                t: firebase.firestore.FieldValue.serverTimestamp(),
            });
        } catch (error) {
            console.error("Failed to upload voice note:", error);
            alert("Could not send voice note.");
        }
    }

    // React on last message
    async function react(emoji, messageId) {
        const gid = currentGid;
        const msgIdToReact = messageId || lastMsgId;
        if (!gid || !me || !msgIdToReact || !amMember) return;

        const field = `reacts.${emoji}`;
        try {
            await messagesRef(gid).doc(msgIdToReact).set({
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

        micBtn?.addEventListener("click", startRecording);
        stopRecordingBtn?.addEventListener("click", stopRecording);

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
