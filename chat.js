// chat.js
(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const auth = () => window.fb?.auth;
    const db = () => window.fb?.db;

    const els = {
        headerName: $("#chatFriendName"),
        headerPhoto: $("#chatFriendPhoto"),
        messagesContainer: $("#chatMessages"),
        chatForm: $("#chatForm"),
        chatInput: $("#chatInput"),
        sendBtn: $("#sendBtn"),
    };

    let me = null;
    let friendUid = null;
    let chatId = null;
    let unsubscribe = null;
    let isBooted = false; // Flag to check if chat is fully initialized

    // Get friend's UID from URL (works with ?buddy= or ?friend=)
    function getFriendUid() {
        const params = new URLSearchParams(window.location.search);
        return params.get('buddy') || params.get('friend');
    }

    // Load friend's info into the header
    async function loadFriendHeader(uid) {
        try {
            const userDoc = await db().collection("users").doc(uid).get();
            if (userDoc.exists) {
                const friendData = userDoc.data();
                els.headerName.textContent = friendData.displayName || "Chat";
                els.headerPhoto.src = friendData.photoURL || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            }
        } catch (error) {
            console.error("Failed to load friend info:", error);
            els.headerName.textContent = "Chat";
        }
    }

    // Create a message bubble element
    function createMessageBubble(msg, isSent) {
        const bubble = document.createElement('div');
        bubble.className = `message-bubble ${isSent ? 'sent' : 'received'}`;
        bubble.textContent = msg.text;
        return bubble;
    }

    // Listen for new messages
    function listenForMessages() {
        if (unsubscribe) unsubscribe(); // Stop any previous listener

        const messagesRef = db().collection("chats").doc(chatId).collection("messages").orderBy("at", "desc").limit(50);

        unsubscribe = messagesRef.onSnapshot(snapshot => {
            els.messagesContainer.innerHTML = ''; // Clear old messages

            if (snapshot.empty) {
                els.messagesContainer.innerHTML = '<div class="chat-loading">No messages yet. Start the conversation!</div>';
                return; // Exit early
            }

            // The query is ordered by time descending. We must reverse the docs array
            // to append them in the correct chronological order for display.
            snapshot.docs.reverse().forEach(doc => {
                const msg = doc.data();
                const isSent = msg.from === me.uid;
                const bubble = createMessageBubble(msg, isSent);
                els.messagesContainer.appendChild(bubble);
            });

            // Mark chat as read
            markAsRead();
        }, error => {
            console.error("Error listening for messages:", error);
            els.messagesContainer.innerHTML = '<div class="chat-loading" style="color:red;">Could not load messages.</div>';
        });
    }

    // Mark the chat as read for the current user
    async function markAsRead() {
        if (!chatId || !me) return;
        const chatRef = db().collection("chats").doc(chatId);
        try {
            // Use dot notation for updating a field in a map
            await chatRef.update({
                [`read.${me.uid}`]: true
            });
        } catch (error) {
            // This can fail if the doc doesn't exist yet, which is fine.
        }
    }

    // Handle sending a message
    async function sendMessage(e) {
        e.preventDefault();

        // Final guard: if the form is disabled, do nothing.
        if (els.sendBtn.disabled) return;

        const text = els.chatInput.value.trim();
        if (!text) return;

        els.chatInput.value = '';
        els.sendBtn.disabled = true;

        const messagePayload = {
            from: me.uid,
            text: text,
            at: firebase.firestore.FieldValue.serverTimestamp(),
        };

        const chatRef = db().collection("chats").doc(chatId);
        const messagesRef = chatRef.collection("messages");

        try {
            // Add the new message
            await messagesRef.add(messagePayload);

            // Update the lastMessage and read status on the parent chat doc
            await chatRef.set({
                lastMessage: {
                    text: text,
                    at: firebase.firestore.FieldValue.serverTimestamp(),
                    from: me.uid,
                },
                // Mark as unread for the other participant
                [`read.${friendUid}`]: false,
                [`read.${me.uid}`]: true,
            }, { merge: true });

        } catch (error) {
            console.error("Error sending message:", error);
            alert("Message could not be sent.");
            els.chatInput.value = text; // Restore text on failure
        } finally {
            els.sendBtn.disabled = false;
            els.chatInput.focus();
        }
    }

    // Ensure a chat document exists between two users
    async function ensureChatExists() {
        const chatRef = db().collection("chats").doc(chatId);
        const chatSnap = await chatRef.get();

        if (!chatSnap.exists) {
            try {
                await chatRef.set({
                    participants: {
                        [me.uid]: true,
                        [friendUid]: true
                    },
                    read: {
                        [me.uid]: true,
                        [friendUid]: true,
                    },
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            } catch (error) {
                console.error("Failed to create chat document:", error);
                throw new Error("Could not initialize chat.");
            }
        }
    }

    // Main boot function
    async function boot() {
        // Attach the submit handler IMMEDIATELY.
        // This prevents the page from reloading, which is the core issue.
        if (els.chatForm) {
            els.chatForm.removeEventListener('submit', sendMessage); // Clean up previous just in case
            els.chatForm.addEventListener('submit', sendMessage);
        } else {
            console.error("Critical Error: Chat form not found in HTML. Cannot send messages.");
            return;
        }

        friendUid = getFriendUid();
        if (!friendUid) {
            els.headerName.textContent = "No friend selected";
            els.messagesContainer.innerHTML = '<div class="chat-loading">Go back and select a friend to chat with.</div>';
            els.chatForm.style.display = 'none';
            isBooted = false;
            return;
        }

        els.chatInput.disabled = true;
        els.sendBtn.disabled = true;
        els.chatInput.placeholder = "Connecting...";

        window.onAuthReady.then(async (user) => {
            if (!user) { location.href = `auth.html?redirect=${encodeURIComponent(location.href)}`; return; }
            try {
                me = user;
                // Create a consistent chat ID by sorting UIDs
                chatId = [me.uid, friendUid].sort().join('_');

                await loadFriendHeader(friendUid);
                await ensureChatExists();
                listenForMessages();

                // Re-enable the form now that everything is loaded
                els.chatInput.disabled = false;
                els.sendBtn.disabled = false;
                els.chatInput.placeholder = "Type a message...";
                els.chatInput.focus();

            } catch (error) {
                console.error("Failed to initialize chat session:", error);
                els.messagesContainer.innerHTML = '<div class="chat-loading" style="color:red;">Could not start chat. Please try again.</div>';
                // Keep the form disabled and show an error state
                els.chatInput.placeholder = "Chat unavailable";
            }
        });
    }

    boot();
})();