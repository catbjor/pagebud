// chat.js
(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const auth = () => window.fb?.auth;
    const db = () => window.fb?.db;

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
        imageUploadBtn: null,
        imageFileInput: null,
        lightbox: null,
        lightboxImg: null,
        emojiPicker: null, // Will be created dynamically
    };

    let me = null;
    let friendUid = null;
    let chatId = null;
    let unsubscribe = null;
    let unsubscribeChatDoc = null;
    let chatDocData = null;
    let friendData = null; // To store friend's profile data
    let typingTimeout = null;
    let activeReactionPicker = { // To track which message the picker is for
        messageId: null,
        bubbleElement: null
    };
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
        bubble.dataset.messageId = msg.id;

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

        if (msg.imageUrl) {
            const img = document.createElement('img');
            img.className = 'message-image';
            img.src = msg.imageUrl;
            img.alt = 'Image from chat';
            img.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent reply-click
                if (els.lightbox && els.lightboxImg) {
                    els.lightboxImg.src = img.src;
                    els.lightbox.style.display = 'flex';
                }
            });
            bubble.appendChild(img);
        } else {
            const textSpan = document.createElement("span");
            textSpan.className = "message-text";
            textSpan.textContent = msg.text;
            bubble.appendChild(textSpan);
        }

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

        bubble.appendChild(timeSpan);

        // --- Message Actions (React, Delete) ---
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'actions-container';

        const reactBtn = document.createElement('button');
        reactBtn.className = 'btn-action btn-react';
        reactBtn.innerHTML = '<i class="fa-regular fa-face-smile"></i>';
        reactBtn.title = 'Add reaction';
        reactBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent reply-click
            showEmojiPicker(bubble, msg.id);
        });
        actionsContainer.appendChild(reactBtn);

        if (isSent) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-action btn-delete';
            deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
            deleteBtn.title = 'Delete message';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteMessage(msg.id);
            });
            actionsContainer.appendChild(deleteBtn);
        }

        bubble.appendChild(actionsContainer);

        // --- Render Reactions ---
        if (msg.reactions && Object.keys(msg.reactions).length > 0) {
            const reactionsContainer = document.createElement('div');
            reactionsContainer.className = 'reactions-container';

            for (const [emoji, uids] of Object.entries(msg.reactions)) {
                if (!uids || uids.length === 0) continue;

                const chip = document.createElement('div');
                chip.className = 'reaction-chip';
                chip.textContent = `${emoji} ${uids.length}`;
                if (uids.includes(me.uid)) {
                    chip.classList.add('reacted-by-me');
                }
                chip.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleReaction(msg.id, emoji);
                });
                reactionsContainer.appendChild(chip);
            }
            bubble.appendChild(reactionsContainer);
        }

        if (isSent) {
            // Add timestamp to bubble for later updates
            if (msg.at?.toMillis) {
                bubble.dataset.timestamp = msg.at.toMillis();
            }

            const friendLastRead = chatData?.lastRead?.[friendUid];
            const messageTimestamp = msg.at;

            // Only show a read receipt if the friend has actually read the message.
            if (friendLastRead && messageTimestamp && messageTimestamp.toDate() <= friendLastRead.toDate()) {
                const receiptSpan = document.createElement("span");
                receiptSpan.className = "read-receipt read";
                receiptSpan.textContent = '✓✓';
                bubble.appendChild(receiptSpan);
            }
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
            // Play sound for new incoming messages after the chat has loaded
            if (isBooted) {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added' && change.doc.data().from === friendUid) {
                        playSound('sound effect folder/chat-received.mp3');
                    }
                });
            }

            els.messagesContainer.innerHTML = ''; // Clear old messages

            if (snapshot.empty) {
                els.messagesContainer.innerHTML = '<div class="chat-loading">No messages yet. Start the conversation!</div>';
                return; // Exit early
            }

            let lastDateStr = null;
            // Reverse the docs to process from oldest to newest for date grouping
            snapshot.docs.reverse().forEach(doc => {
                const msg = { id: doc.id, ...doc.data() };
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

            // Scroll to the bottom. Using a small timeout ensures that the browser
            // has finished rendering the new messages before we try to scroll.
            setTimeout(() => {
                els.messagesContainer.scrollTop = els.messagesContainer.scrollHeight;
            }, 0);

            // Find the latest message to mark as read up to this point
            // The latest message is the first one in the original (un-reversed) snapshot
            const latestMessage = snapshot.docs.length > 0 ? snapshot.docs[0].data() : null;
            markAsRead(latestMessage);

        }, error => {
            console.error("Error listening for messages:", error);
            els.messagesContainer.innerHTML = '<div class="chat-loading" style="color:red;">Could not load messages.</div>';
        });
    }

    // --- Reaction Logic ---
    const EMOJI_OPTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

    function showEmojiPicker(bubbleElement, messageId) {
        if (!els.emojiPicker) return;

        activeReactionPicker.messageId = messageId;
        activeReactionPicker.bubbleElement = bubbleElement;

        const rect = bubbleElement.getBoundingClientRect();
        els.emojiPicker.style.display = 'flex';
        // Position picker above the bubble
        els.emojiPicker.style.top = `${window.scrollY + rect.top - 45}px`;
        els.emojiPicker.style.left = `${window.scrollX + rect.left}px`;
    }

    function hideEmojiPicker() {
        if (els.emojiPicker) {
            els.emojiPicker.style.display = 'none';
        }
        activeReactionPicker.messageId = null;
        activeReactionPicker.bubbleElement = null;
    }

    async function toggleReaction(messageId, emoji) {
        if (!chatId || !me) return;
        const msgRef = db().collection("chats").doc(chatId).collection("messages").doc(messageId);

        hideEmojiPicker(); // Hide picker immediately on interaction

        try {
            await db().runTransaction(async (transaction) => {
                const doc = await transaction.get(msgRef);
                if (!doc.exists) return;

                const reactions = doc.data().reactions || {};
                const uids = reactions[emoji] || [];

                if (uids.includes(me.uid)) { // User is removing their reaction
                    reactions[emoji] = uids.filter(uid => uid !== me.uid);
                    if (reactions[emoji].length === 0) delete reactions[emoji];
                } else { // User is adding a reaction
                    reactions[emoji] = [...uids, me.uid];
                }
                transaction.update(msgRef, { reactions });
            });
        } catch (error) {
            console.error("Failed to toggle reaction:", error);
        }
    }
    // --- End Reaction Logic ---

    // --- Delete Message Logic ---
    async function deleteMessage(messageId) {
        if (!confirm("Delete this message? This cannot be undone.")) {
            return;
        }

        try {
            await db().collection("chats").doc(chatId).collection("messages").doc(messageId).delete();
            // The onSnapshot listener will handle the UI update automatically.
        } catch (error) {
            console.error("Failed to delete message:", error);
            alert("Could not delete message. You may need to update your security rules to allow deleting messages.");
        }
    }
    // --- End Delete Message Logic ---

    // --- Image Sending Logic ---
    function handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = ''; // Reset to allow selecting same file again

        // You could add a visual "processing..." indicator here
        processAndSendImage(file);
    }

    async function processAndSendImage(file) {
        const MAX_SIZE_MB = 5;
        if (file.size > MAX_SIZE_MB * 1024 * 1024) {
            return alert(`Image is too large. Please select a file smaller than ${MAX_SIZE_MB}MB.`);
        }
        try {
            // Resize to a max of 1280px and compress to fit under Firestore's ~1MB limit
            const resizedDataUrl = await resizeImage(file, 1280, 1024 * 1024 * 0.9);
            await executeSend({ imageUrl: resizedDataUrl }, "📷 Image");
        } catch (error) {
            console.error("Image processing failed:", error);
            alert(error.message || "Could not process image. It might be too large or in an unsupported format.");
        }
    }

    function resizeImage(file, maxDimension, targetByteSize) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    let { width, height } = img;
                    if (width > maxDimension || height > maxDimension) {
                        if (width > height) {
                            height = Math.round(height * (maxDimension / width));
                            width = maxDimension;
                        } else {
                            width = Math.round(width * (maxDimension / height));
                            height = maxDimension;
                        }
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                    let quality = 0.9;
                    let dataUrl = canvas.toDataURL('image/jpeg', quality);
                    while (dataUrl.length > targetByteSize && quality > 0.3) {
                        quality -= 0.1;
                        dataUrl = canvas.toDataURL('image/jpeg', quality);
                    }
                    if (dataUrl.length > targetByteSize) return reject(new Error("Image is too large to send, even after compression."));
                    resolve(dataUrl);
                };
                img.onerror = () => reject(new Error("Could not load image file."));
                img.src = event.target.result;
            };
            reader.onerror = () => reject(new Error("Could not read file."));
            reader.readAsDataURL(file);
        });
    }
    // --- End Image Sending Logic ---

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
    async function sendTextMessage(e) {
        e.preventDefault();
        const text = els.chatInput.value.trim();
        if (!text) return;

        els.chatInput.value = '';

        const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();

        const messagePayload = {
            text: text,
        };

        await executeSend(messagePayload, text);
    }

    async function executeSend(payload, lastMessageText) {
        // Final guard: if the form is disabled, do nothing.
        if (els.sendBtn.disabled) return;
        els.sendBtn.disabled = true;

        // --- Clear typing indicator on send ---
        if (typingTimeout) {
            clearTimeout(typingTimeout);
            typingTimeout = null;
            updateMyTypingStatus(false);
        }

        const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();
        const messagePayload = { from: me.uid, at: serverTimestamp, ...payload };
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
                    text: lastMessageText,
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
            if (payload.text) els.chatInput.value = payload.text; // Restore text on failure
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
            // If a receipt already exists, we don't need to do anything.
            if (bubble.querySelector('.read-receipt')) return;

            const timestamp = bubble.dataset.timestamp;
            if (!timestamp) return;

            const messageDate = new Date(parseInt(timestamp, 10));
            // If the message is now read, create and append the receipt.
            if (messageDate <= friendLastReadDate) {
                const receiptSpan = document.createElement("span");
                receiptSpan.className = "read-receipt read";
                receiptSpan.textContent = '✓✓';
                bubble.appendChild(receiptSpan);
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
                align-items: center;
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

        // 4. Create image upload elements
        if (!document.getElementById('imageUploadBtn')) {
            const uploadBtn = document.createElement('button');
            uploadBtn.id = 'imageUploadBtn';
            uploadBtn.className = 'btn-icon';
            uploadBtn.type = 'button';
            uploadBtn.innerHTML = '<i class="fa-solid fa-paperclip"></i>';
            uploadBtn.title = 'Send image';
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.id = 'imageFileInput';
            fileInput.accept = 'image/*';
            fileInput.style.display = 'none';
            chatForm.prepend(uploadBtn, fileInput);
            uploadBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', handleImageUpload);
            els.imageUploadBtn = uploadBtn;
            els.imageFileInput = fileInput;
        }

        // 5. Create and inject the image lightbox
        if (!document.getElementById('imageLightbox')) {
            const lightbox = document.createElement('div');
            lightbox.id = 'imageLightbox';
            lightbox.innerHTML = '<img>';
            document.body.appendChild(lightbox);
            els.lightbox = lightbox;
            els.lightboxImg = lightbox.querySelector('img');

            lightbox.addEventListener('click', () => {
                lightbox.style.display = 'none';
            });
        }

        // --- Create and inject Emoji Picker ---
        if (!els.emojiPicker) {
            const picker = document.createElement('div');
            picker.id = 'emojiPicker';
            picker.innerHTML = EMOJI_OPTIONS.map(emoji =>
                `<span class="emoji-option" data-emoji="${emoji}">${emoji}</span>`
            ).join('');
            document.body.appendChild(picker);
            els.emojiPicker = picker;

            picker.addEventListener('click', (e) => {
                const option = e.target.closest('.emoji-option');
                if (option && activeReactionPicker.messageId) {
                    toggleReaction(activeReactionPicker.messageId, option.dataset.emoji);
                }
            });

            // Hide picker when clicking outside
            document.addEventListener('click', (e) => {
                if (els.emojiPicker.style.display === 'flex' && !e.target.closest('.btn-add-react') && !e.target.closest('#emojiPicker')) {
                    hideEmojiPicker();
                }
            }, true); // Use capture phase to catch click before it bubbles
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
            els.chatForm.removeEventListener('submit', sendTextMessage); // Clean up previous just in case
            els.chatForm.addEventListener('submit', sendTextMessage);
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