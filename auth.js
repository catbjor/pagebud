// auth.js — username-first signup + email/username login (no layout changes)
document.addEventListener("DOMContentLoaded", () => {
    const viewLogin = document.getElementById('view-login');
    const viewSignup = document.getElementById('view-signup');
    const toSignupBtn = document.getElementById('toSignup');
    const toLoginBtn = document.getElementById('toLogin');

    // Login fields (username or email)
    const emailOrUsernameEl = document.getElementById("emailOrUsername");
    const passEl = document.getElementById("password");
    const remember = document.getElementById("remember");
    const emailForm = document.getElementById("emailForm");
    const forgotLink = document.getElementById("forgotLink");

    // Signup fields (USERNAME now)
    const usernameEl = document.getElementById('username');
    const emailCreateEl = document.getElementById('emailCreate');
    const passCreateEl = document.getElementById('passwordCreate');
    const createForm = document.getElementById('createForm');
    const greetingEl = document.getElementById('greeting');

    // ---- helpers ----
    const auth = () => (window.fb?.auth) || (window.firebase?.auth?.()) || firebase.auth();
    const db = () => (window.fb?.db) || (window.firebase?.firestore?.()) || firebase.firestore();

    function browserLang() {
        const l = (navigator.language || "en").toLowerCase();
        if (l.startsWith("no") || l.startsWith("nb") || l.startsWith("nn")) return "no";
        return "en";
    }

    function normalizeUsername(raw) {
        // keep it simple; allow letters, numbers, underscore, dot; lowercased
        return String(raw || "")
            .trim()
            .replace(/^@+/, "")
            .toLowerCase();
    }

    function randomGreeting(name) {
        const hour = new Date().getHours();
        const bucket = hour < 12 ? 'morning' : (hour < 18 ? 'afternoon' : 'evening');
        const phrases = {
            morning: ["Good morning, {name}!", "Morning, {name} — ready to read?", "Rise and shine, {name}!"],
            afternoon: ["Good afternoon, {name}!", "Nice to see you, {name}. Time to read?", "A perfect time for a chapter, {name}."],
            evening: ["Good evening, {name}!", "Cozy reading time, {name}?", "Unwind with a book, {name}."]
        };
        const list = phrases[bucket];
        return list[Math.floor(Math.random() * list.length)].replace("{name}", name);
    }

    function updateGreeting() {
        const n = (usernameEl.value || "").trim();
        greetingEl.textContent = n ? randomGreeting(n) : "";
    }
    usernameEl.addEventListener('input', updateGreeting);

    // ---- view toggles ----
    toSignupBtn.addEventListener('click', () => {
        viewLogin.style.display = 'none';
        viewLogin.setAttribute('aria-hidden', 'true');
        viewSignup.style.display = '';
        viewSignup.setAttribute('aria-hidden', 'false');
    });

    toLoginBtn.addEventListener('click', () => {
        viewSignup.style.display = 'none';
        viewSignup.setAttribute('aria-hidden', 'true');
        viewLogin.style.display = '';
        viewLogin.setAttribute('aria-hidden', 'false');
    });

    // ---- profile + directory writers ----
    async function ensureUserProfile(u, { displayName, username, email }) {
        const initialLang = browserLang();
        const name = displayName || username || (email ? email.split("@")[0] : "Reader");

        try { if (!u.displayName || u.displayName !== name) await u.updateProfile({ displayName: name }); } catch { }

        try {
            await db().collection('users').doc(u.uid).set({
                displayName: name,
                displayNameLower: name.toLowerCase(),
                username: username || null,
                usernameLower: username ? username.toLowerCase() : null,
                email: email || u.email || null,
                emailLower: (email || u.email || "").toLowerCase(),
                lang: initialLang,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } catch { }
        try { localStorage.setItem("pb_lang", initialLang); } catch { }
        return name;
    }

    async function reserveUsernameTx(usernameLower, payload) {
        const ref = db().collection("usernames").doc(usernameLower);
        return db().runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            if (snap.exists) throw new Error("That username is already taken.");
            tx.set(ref, payload, { merge: false });
        });
    }

    // ---- LOGIN (email or @username) ----
    emailForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
            await auth().setPersistence(
                remember?.checked ? firebase.auth.Auth.Persistence.LOCAL
                    : firebase.auth.Auth.Persistence.SESSION
            );

            const raw = (emailOrUsernameEl.value || "").trim();
            const pwd = passEl.value;

            let emailToUse = null;

            if (raw.includes("@")) {
                // looks like an email
                emailToUse = raw;
            } else {
                // treat as username → lookup in /usernames/{usernameLower}
                const uname = normalizeUsername(raw);
                if (!uname) throw new Error("Enter a username or email.");
                const doc = await db().collection("usernames").doc(uname).get();
                if (!doc.exists) throw new Error("No account found for that username.");
                const data = doc.data() || {};
                emailToUse = data.emailLower || data.email;
                if (!emailToUse) throw new Error("This username isn't linked to an email.");
            }

            const cred = await auth().signInWithEmailAndPassword(emailToUse, pwd);
            await ensureUserProfile(cred.user, { displayName: cred.user.displayName, email: cred.user.email });
            location.href = "index.html";
        } catch (err) {
            alert(err.message || "Sign in failed");
        }
    });

    // ---- Forgot password (supports username) ----
    forgotLink.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            const raw = (emailOrUsernameEl.value || "").trim();
            if (!raw) return alert('Enter your email or username first.');

            let emailToUse = null;
            if (raw.includes("@")) {
                emailToUse = raw;
            } else {
                const uname = normalizeUsername(raw);
                const doc = await db().collection("usernames").doc(uname).get();
                if (!doc.exists) return alert("No account found for that username.");
                emailToUse = doc.data()?.emailLower || doc.data()?.email;
            }
            if (!emailToUse) return alert("That account doesn't have an email.");

            await auth().sendPasswordResetEmail(emailToUse);
            alert('Password reset email sent.');
        } catch (err) {
            alert(err.message || 'Could not send reset email.');
        }
    });

    // ---- SIGNUP (with unique username) ----
    createForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const usernameRaw = (usernameEl.value || '').trim();
        const email = (emailCreateEl.value || '').trim();
        const pass = passCreateEl.value;

        const usernameLower = normalizeUsername(usernameRaw);
        if (!usernameLower) return alert("Please choose a username.");
        if (!/^[a-z0-9._]{3,20}$/.test(usernameLower)) {
            return alert("Username must be 3–20 chars (letters, numbers, . or _).");
        }

        try {
            // Reserve username atomically
            await reserveUsernameTx(usernameLower, {
                uid: "__pending__",
                displayName: usernameRaw,
                displayNameLower: usernameLower,
                emailLower: (email || "").toLowerCase(),
                photoURL: null,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Create auth user
            const cred = await auth().createUserWithEmailAndPassword(email, pass);

            // Write profile + finalize username mapping with real uid
            await ensureUserProfile(cred.user, { displayName: usernameRaw, username: usernameRaw, email });

            await db().collection("usernames").doc(usernameLower).set({
                uid: cred.user.uid,
                displayName: usernameRaw,
                displayNameLower: usernameLower,
                emailLower: (email || "").toLowerCase(),
                photoURL: cred.user.photoURL || null,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            location.href = "index.html";
        } catch (err) {
            // best-effort cleanup if reservation exists and signup failed
            try {
                const ref = db().collection("usernames").doc(usernameLower);
                const snap = await ref.get();
                if (snap.exists && snap.data()?.uid === "__pending__") {
                    await ref.delete();
                }
            } catch { }
            alert(err.message || "Create account failed");
        }
    });
});
