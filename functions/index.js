import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

admin.initializeApp();
const db = admin.firestore();

export const onChatMessage = functions.firestore
    .document("chats/{chatId}/messages/{msgId}")
    .onCreate(async (snap, ctx) => {
        const msg = snap.data();
        const chatId = ctx.params.chatId;

        const chatDoc = await db.collection("chats").doc(chatId).get();
        if (!chatDoc.exists) return;
        const parts = chatDoc.data().participants || [];
        const receiver = parts.find(uid => uid !== msg.from);
        if (!receiver) return;

        // hent tokens
        const tokensSnap = await db.collection("users").doc(receiver).collection("pushTokens").get();
        const tokens = tokensSnap.docs.map(d => d.id).filter(Boolean);
        if (!tokens.length) return;

        // hent sender-navn
        let titleName = "New message";
        try {
            const uqs = await db.collection("usernames").where("uid", "==", msg.from).limit(1).get();
            if (!uqs.empty) titleName = `Message from @${uqs.docs[0].id}`;
        } catch { }

        const body = msg.type === "text" ? String(msg.text || "").slice(0, 120)
            : msg.type === "image" ? "📷 Image"
                : "📎 File";

        await admin.messaging().sendEachForMulticast({
            tokens,
            notification: { title: titleName, body },
            data: { chatId, from: msg.from || "" }
        });
    });
