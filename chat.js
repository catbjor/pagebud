// chat.js
(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const auth = () => window.fb?.auth;
    const db = () => window.fb?.db;

    const els = {
        headerName: $("#chatFriendName"),
        headerPhoto: $("#chatFriendPhoto"),
        typingIndicator: null, // Will be created dynamically
        messagesContainer: $("#chatMessages"),
        chatForm: $("#chatForm"),
        chatInput: $("#chatInput"),
        sendBtn: $("#sendBtn"),
        replyBanner: null, // Will be created dynamically
        replyBannerText: null,
        replyBannerCancel: null,
    };

    let me = null;
    let friendUid = null;
    let chatId = null;
    let unsubscribe = null;
    let unsubscribeChatDoc = null;
    let chatDocData = null;
    let friendData = null; // To store friend's profile data
    let typingTimeout = null;
    let replyContext = null; // To store info about the message we're replying to
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
                friendData = userDoc.data();
                els.headerName.textContent = friendData.displayName || "Chat";
                els.headerPhoto.src = friendData.photoURL || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

                // --- Create and inject typing indicator ---
                if (!els.typingIndicator) {
                    const indicator = document.createElement('div');
                    indicator.id = 'chatTypingIndicator';
                    indicator.className = 'typing-indicator';
                    indicator.innerHTML = '<span></span><span></span><span></span>'; // CSS dots
                    indicator.style.display = 'none';

                    // Append to the container of the name and photo
                    els.headerName.closest('.chat-header-info').appendChild(indicator);
                    els.typingIndicator = indicator;
                }
            }
        } catch (error) {
            console.error("Failed to load friend info:", error);
            els.headerName.textContent = "Chat";
        }
    }

    // Create a message bubble element
    function createMessageBubble(msg, isSent, friendUid, chatData) {
        const bubble = document.createElement("div");
        bubble.className = `message-bubble ${isSent ? "sent" : "received"}`;

        // --- Render Reply Snippet ---
        if (msg.replyTo) {
            const snippet = document.createElement('div');
            snippet.className = 'reply-snippet';

            const author = document.createElement('div');
            author.className = 'reply-author';
            if (msg.replyTo.from === me.uid) {
                author.textContent = 'You';
            } else if (friendData) {
                author.textContent = friendData.displayName;
            } else {
                author.textContent = 'Them';
            }

            const text = document.createElement('div');
            text.className = 'reply-text';
            text.textContent = msg.replyTo.text;

            snippet.appendChild(author);
            snippet.appendChild(text);
            bubble.appendChild(snippet);
        }

        const textSpan = document.createElement("span");
        textSpan.className = "message-text";
        textSpan.textContent = msg.text;

        const timeSpan = document.createElement("span");
        timeSpan.className = "message-timestamp";

        if (msg.at && msg.at.toDate) {
            const date = msg.at.toDate();
            // Format to HH:MM AM/PM without seconds
            timeSpan.textContent = date.toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
            });
        }

        bubble.appendChild(textSpan);
        bubble.appendChild(timeSpan);

        if (isSent) {
            // Add timestamp to bubble for later updates
            if (msg.at?.toMillis) {
                bubble.dataset.timestamp = msg.at.toMillis();
            }

            const receiptSpan = document.createElement("span");
            receiptSpan.className = "read-receipt";

            const friendLastRead = chatData?.lastRead?.[friendUid];
            const messageTimestamp = msg.at;

            // Check if the friend has read this message
            if (friendLastRead && messageTimestamp && messageTimestamp.toDate() <= friendLastRead.toDate()) {
                receiptSpan.classList.add('read');
                receiptSpan.textContent = '✓✓';
            } else {
                receiptSpan.textContent = '✓';
            }
            bubble.appendChild(receiptSpan);
        }

        return bubble;
    }

    // --- Date Separator Helpers ---
    function formatDateSeparator(date) {
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) {
            return "Today";
        }
        if (date.toDateString() === yesterday.toDateString()) {
            return "Yesterday";
        }
        // Fallback for older dates
        return date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    function createDateSeparator(date) {
        const separator = document.createElement('div');
        separator.className = 'date-separator';
        separator.textContent = formatDateSeparator(date);
        return separator;
    }
    // --- End Date Separator Helpers ---

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

            let lastDateStr = null;
            // Reverse the docs to process from oldest to newest for date grouping
            snapshot.docs.reverse().forEach(doc => {
                const msg = doc.data();
                const msgDate = msg.at?.toDate();

                // Check if we need to add a date separator
                if (msgDate) {
                    const msgDateStr = msgDate.toDateString();
                    if (msgDateStr !== lastDateStr) {
                        const separator = createDateSeparator(msgDate);
                        els.messagesContainer.appendChild(separator);
                        lastDateStr = msgDateStr;
                    }
                }

                const isSent = msg.from === me.uid;
                const bubble = createMessageBubble(msg, isSent, friendUid, chatDocData);
                bubble.addEventListener('click', () => setReplyContext(doc));
                els.messagesContainer.appendChild(bubble);
            });

            // Scroll to the bottom to show the newest messages
            els.messagesContainer.scrollTop = els.messagesContainer.scrollHeight;

            // Find the latest message to mark as read up to this point
            // The latest message is the first one in the original (un-reversed) snapshot
            const latestMessage = snapshot.docs.length > 0 ? snapshot.docs[0].data() : null;
            markAsRead(latestMessage);

        }, error => {
            console.error("Error listening for messages:", error);
            els.messagesContainer.innerHTML = '<div class="chat-loading" style="color:red;">Could not load messages.</div>';
        });
    }

    // --- Typing Indicator Logic ---
    async function updateMyTypingStatus(isTyping) {
        if (!chatId || !me) return;
        try {
            const chatRef = db().collection("chats").doc(chatId);
            await chatRef.update({
                [`typing.${me.uid}`]: isTyping
            });
        } catch (error) {
            // Non-critical, can fail if doc doesn't exist yet.
        }
    }

    function handleTypingInput() {
        if (!typingTimeout) {
            updateMyTypingStatus(true);
        }
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            updateMyTypingStatus(false);
            typingTimeout = null;
        }, 3000); // 3 seconds of inactivity
    }
    // --- End Typing Indicator Logic ---

    // --- Reply Handling ---
    function setReplyContext(messageDoc) {
        const msg = messageDoc.data();
        replyContext = {
            messageId: messageDoc.id,
            text: msg.text,
            from: msg.from
        };

        const authorName = msg.from === me.uid ? 'You' : (friendData?.displayName || 'Them');
        els.replyBannerText.innerHTML = `Replying to <strong>${authorName}</strong>: <em>${msg.text}</em>`;
        els.replyBanner.style.display = 'flex';
        els.chatInput.focus();
    }

    function clearReplyContext() {
        replyContext = null;
        els.replyBanner.style.display = 'none';
    }
    // --- End Reply Handling ---

    // Mark the chat as read for the current user
    async function markAsRead(latestMessage) {
        if (!chatId || !me) return;

        const chatRef = db().collection("chats").doc(chatId);
        const updates = {};

        // For global unread badge on friends list
        if (chatDocData?.read?.[me.uid] === false) {
            updates[`read.${me.uid}`] = true;
        }

        // For per-message read receipts
        if (latestMessage && latestMessage.at) {
            const myCurrentLastRead = chatDocData?.lastRead?.[me.uid];
            if (!myCurrentLastRead || latestMessage.at.toDate() > myCurrentLastRead.toDate()) {
                updates[`lastRead.${me.uid}`] = latestMessage.at;
            }
        }

        if (Object.keys(updates).length > 0) {
            try {
                // Using set with merge is safer as it creates the doc/fields if they don't exist.
                await chatRef.set(updates, { merge: true });
            } catch (error) {
                console.warn("Failed to mark chat as read:", error);
            }
        }
    }

    // Handle sending a message
    async function sendMessage(e) {
        e.preventDefault();
        // Final guard: if the form is disabled, do nothing.
        if (els.sendBtn.disabled) return;

        const text = els.chatInput.value.trim();
        if (!text) return;

        // --- Clear typing indicator on send ---
        if (typingTimeout) {
            clearTimeout(typingTimeout);
            typingTimeout = null;
            updateMyTypingStatus(false);
        }

        els.chatInput.value = '';
        els.sendBtn.disabled = true;

        const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();

        const messagePayload = {
            from: me.uid,
            text: text,
            at: serverTimestamp,
        };

        // Add reply context if it exists
        if (replyContext) {
            messagePayload.replyTo = replyContext;
        }

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
                    at: serverTimestamp,
                    from: me.uid,
                },
                // Overwriting the read map is correct here, as it pertains to the new lastMessage.
                read: { [friendUid]: false, [me.uid]: true },
                // Update my lastRead timestamp to the new message's timestamp
                [`lastRead.${me.uid}`]: serverTimestamp
            }, { merge: true });

            await batch.commit();
        } catch (error) {
            console.error("Error sending message:", error);
            alert("Message could not be sent.");
            els.chatInput.value = text; // Restore text on failure
        } finally {
            clearReplyContext(); // Clear reply context whether it succeeds or fails
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

    // Listen to the parent chat document for changes to read status
    function listenToChatDocument() {
        if (unsubscribeChatDoc) unsubscribeChatDoc();

        const chatRef = db().collection("chats").doc(chatId);
        unsubscribeChatDoc = chatRef.onSnapshot(doc => {
            const oldData = chatDocData;
            chatDocData = doc.data() || {};

            // If the friend's last read time has changed, update the UI
            const oldFriendRead = oldData?.lastRead?.[friendUid];
            const newFriendRead = chatDocData?.lastRead?.[friendUid];

            if (!newFriendRead) return; // Nothing to do if we don't have their read time

            // Only update if the timestamp is different
            if (!oldFriendRead || !oldFriendRead.isEqual(newFriendRead)) {
                updateVisibleCheckmarks();
            }

            // --- Typing Indicator Logic ---
            const isFriendTyping = chatDocData.typing?.[friendUid] === true;
            if (els.typingIndicator) {
                if (isFriendTyping) {
                    els.typingIndicator.style.display = 'flex';
                } else {
                    els.typingIndicator.style.display = 'none';
                }
            }
        });
    }

    // Find all sent messages on screen and update their checkmarks
    function updateVisibleCheckmarks() {
        if (!friendUid || !chatDocData) return;

        const friendLastRead = chatDocData.lastRead?.[friendUid];
        if (!friendLastRead) return;

        const friendLastReadDate = friendLastRead.toDate();

        els.messagesContainer.querySelectorAll('.message-bubble.sent').forEach(bubble => {
            const receipt = bubble.querySelector('.read-receipt');
            if (!receipt || receipt.classList.contains('read')) return; // Already marked as read

            const timestamp = bubble.dataset.timestamp;
            if (!timestamp) return;

            const messageDate = new Date(parseInt(timestamp, 10));
            if (messageDate <= friendLastReadDate) {
                receipt.classList.add('read');
                receipt.textContent = '✓✓';
            }
        });
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
            /* Reply Banner above the input form */
            #replyBanner {
                display: none; /* Hidden by default */
                padding: 8px 12px;
                background: var(--surface-alt);
                border-top: 1px solid var(--border);
                font-size: 0.85rem;
                color: var(--muted-fg);
                justify-content: space-between;
                align-items: center;
                gap: 8px;
            }
            #replyBannerText {
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            #replyBannerCancel {
                cursor: pointer;
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

        // 3. Create and inject the reply banner
        if (!document.getElementById('replyBanner')) {
            const banner = document.createElement('div');
            banner.id = 'replyBanner';
            banner.innerHTML = `
                <span id="replyBannerText"></span>
                <i id="replyBannerCancel" class="fa-solid fa-xmark" title="Cancel reply"></i>
            `;
            chatForm.before(banner); // Place it right above the form
            els.replyBanner = banner;
            els.replyBannerText = banner.querySelector('#replyBannerText');
            els.replyBannerCancel = banner.querySelector('#replyBannerCancel');
            els.replyBannerCancel.addEventListener('click', clearReplyContext);
        }

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

        els.chatInput.addEventListener('input', handleTypingInput);

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
                listenToChatDocument();
                listenForMessages();

                // Re-enable the form now that everything is loaded
                els.chatInput.disabled = false;
                els.sendBtn.disabled = false;
                els.chatInput.placeholder = "Type a message...";
                els.chatInput.focus();
                isBooted = true;

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