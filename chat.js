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

            // The CSS uses `flex-direction: column-reverse`, so we don't reverse the snapshot.
            // The query is already `orderBy("at", "desc")`, so newest messages come first.
            // Appending them directly places the newest message at the bottom visually,
            // and the browser handles keeping the view scrolled to the bottom.
            snapshot.docs.forEach(doc => {
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
            // Use a batched write to perform both operations atomically.
            const batch = db().batch();

            // 1. Add the new message to the subcollection.
            const newMsgRef = messagesRef.doc();
            batch.set(newMsgRef, messagePayload);

            // 2. Upsert the parent chat document.
            // Using set({ merge: true }) makes this robust. It will create the chat
            // document if it doesn't exist, or update it if it does.
            batch.set(chatRef, {
                participants: { [me.uid]: true, [friendUid]: true },
                lastMessage: {
                    text: text,
                    at: firebase.firestore.FieldValue.serverTimestamp(),
                    from: me.uid,
                },
                // Overwriting the read map is correct here, as it pertains to the new lastMessage.
                read: { [friendUid]: false, [me.uid]: true },
            }, { merge: true });

            await batch.commit();
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
        try {
            const chatRef = db().collection("chats").doc(chatId);
            // This is an "upsert". It creates the document with the participants
            // if it doesn't exist, or merges the participants field if it does.
            // This avoids a separate `get()` call which can fail on new chats due to security rules.
            await chatRef.set({
                participants: {
                    [me.uid]: true,
                    [friendUid]: true
                }
            }, { merge: true });
        } catch (error) {
            console.error("Failed to create/ensure chat document:", error);
            // This is not a critical failure. If it fails (e.g. security rules),
            // we might still be able to read an existing chat. The robust sendMessage
            // function can create the chat doc later if needed.
        }
    }

    // Apply styles and re-order elements for the sticky footer layout
    function setupChatLayout() {
        // 1. Inject CSS for flexbox layout
        const style = document.createElement('style');
        style.id = 'chat-layout-styles';
        style.textContent = `
            html, body {
                height: 100%;
                margin: 0;
                overflow: hidden; /* Prevent scrolling on the body */
            }
            body {
                display: flex;
                flex-direction: column;
            }
            #chatMessages {
                flex-grow: 1; /* Allow message area to fill space */
                overflow-y: auto; /* Enable scrolling within the message area */
                padding: 1rem;
            }
            #chatForm, nav {
                flex-shrink: 0; /* Prevent form and nav from shrinking */
            }
            /* Style the form itself for a better chat bar layout */
            #chatForm {
                display: flex;
                gap: 8px;
                padding: 8px 12px;
                background: var(--surface);
                border-top: 1px solid var(--border);
            }
            #chatInput {
                flex-grow: 1;
                border-radius: 20px; /* Rounded corners for the input */
                border: 1px solid var(--border);
            }
        `;
        if (!document.getElementById('chat-layout-styles')) {
            document.head.appendChild(style);
        }

        // 2. Re-order elements to ensure form and nav are at the bottom.
        // This moves them to the end of the <body>, and the flexbox CSS handles the rest.
        const body = document.body;
        const chatForm = document.getElementById('chatForm');
        const navbar = document.querySelector('nav'); // Assuming the main navbar is a <nav> tag.

        // Append navbar first, then the chat form, to ensure the chat form is at the very bottom.
        if (navbar) body.appendChild(navbar);
        if (chatForm) body.appendChild(chatForm);
    }

    // Main boot function
    async function boot() {
        setupChatLayout();

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