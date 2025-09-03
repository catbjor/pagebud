// auth.js — Signup with username + confirm password + eye toggles
// Works with "Option A" Firestore rules you installed.

document.addEventListener("DOMContentLoaded", () => {
    const viewLogin = document.getElementById('view-login');
    const viewSignup = document.getElementById('view-signup');
    const toSignupBtn = document.getElementById('toSignup');
    const toLoginBtn = document.getElementById('toLogin');

    // Login fields
    const emailEl = document.getElementById("email");
    const passEl = document.getElementById("password");
    const remember = document.getElementById("remember");
    const emailForm = document.getElementById("emailForm");
    const forgotLink = document.getElementById('forgotLink');

    // Signup fields
    const usernameEl = document.getElementById('username');
    const emailCreateEl = document.getElementById('emailCreate');
    const passCreateEl = document.getElementById('passwordCreate');
    const passCreateConfirmEl = document.getElementById('passwordCreateConfirm');
    const createForm = document.getElementById('createForm');
    const greetingEl = document.getElementById('greeting');

    const db = fb.db || firebase.firestore();

    function browserLang() {
        const l = (navigator.language || "en").toLowerCase();
        if (l.startsWith("no") || l.startsWith("nb") || l.startsWith("nn")) return "no";
        return "en";
    }

    function randomGreeting(name) {
        const hour = new Date().getHours();
        const buckets = hour < 12 ? 'morning' : (hour < 18 ? 'afternoon' : 'evening');
        const phrases = {
            morning: ["Good morning, {name}!", "Morning, {name} — ready to read?", "Rise and shine, {name}!"],
            afternoon: ["Good afternoon, {name}!", "Nice to see you, {name}. Time to read?", "A perfect time for a chapter, {name}."],
            evening: ["Good evening, {name}!", "Cozy reading time, {name}?", "Unwind with a book, {name}."]
        };
        const list = phrases[buckets];
        return list[Math.floor(Math.random() * list.length)].replace("{name}", name);
    }

    // Live greeting based on username
    usernameEl?.addEventListener('input', () => {
        const n = (usernameEl.value || "").trim();
        if (greetingEl) greetingEl.textContent = n ? randomGreeting(n) : "";
    });

    // ---------- Eye toggles ----------
    function wirePwToggle(input, button) {
        if (!input || !button) return;
        const icon = button.querySelector("i");
        button.addEventListener("click", () => {
            const show = input.type === "password";
            input.type = show ? "text" : "password";
            if (icon) icon.className = show ? "fa-regular fa-eye-slash" : "fa-regular fa-eye";
            button.setAttribute("aria-label", show ? "Hide password" : "Show password");
        });
    }
    wirePwToggle(passEl, document.getElementById("togglePassLogin"));
    wirePwToggle(passCreateEl, document.getElementById("togglePassCreate"));
    wirePwToggle(passCreateConfirmEl, document.getElementById("togglePassCreate2"));

    // ---------- LOGIN ----------
    emailForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
            await fb.auth.setPersistence(
                remember?.checked ? firebase.auth.Auth.Persistence.LOCAL
                    : firebase.auth.Auth.Persistence.SESSION
            );
            const cred = await fb.auth.signInWithEmailAndPassword(emailEl.value.trim(), passEl.value);
            await ensureUserDoc(cred.user); // ensure /users/{uid}
            location.href = "index.html";
        } catch (e) {
            alert(e.message || "Sign in failed");
        }
    });

    forgotLink.addEventListener('click', async (e) => {
        e.preventDefault();
        const email = (emailEl.value || '').trim();
        if (!email) return alert('Enter your email first.');
        try {
            await fb.auth.sendPasswordResetEmail(email);
            alert('Password reset email sent.');
        } catch (err) {
            alert(err.message || 'Could not send reset email.');
        }
    });

    // ---------- SIGNUP ----------
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

    createForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = (usernameEl.value || '').trim();
        const email = (emailCreateEl.value || '').trim();
        const pass = passCreateEl.value;
        const pass2 = passCreateConfirmEl.value;

        if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username)) {
            return alert("Pick a username (3–30 chars, letters/numbers/_/.)");
        }
        if (pass.length < 6) return alert("Password must be at least 6 characters.");
        if (pass !== pass2) return alert("Passwords do not match.");

        try {
            // 1) Create auth user (now authed)
            const cred = await fb.auth.createUserWithEmailAndPassword(email, pass);
            const user = cred.user;

            // 2) Display name = username
            try { await user.updateProfile({ displayName: username }); } catch { }

            // 3) Reserve /usernames/{usernameLower}
            await createUsernameDoc(username, user);

            // 4) Create /users/{uid}
            await ensureUserDoc(user, username);

            // Done
            location.href = "index.html";
        } catch (err) {
            console.error("[Signup] failed:", err);
            if (err?.code === "permission-denied" || String(err?.message || "").includes("PERMISSION_DENIED")) {
                alert("Missing or insufficient permissions. Is the username already taken?");
            } else if (String(err?.message || "").toLowerCase().includes("email already in use")) {
                alert("That email is already in use.");
            } else {
                alert(err.message || "Create account failed");
            }
        }
    });

    // ---------- Helpers ----------
    async function createUsernameDoc(usernameRaw, user) {
        const usernameLower = usernameRaw.toLowerCase();
        const ref = db.collection("usernames").doc(usernameLower);

        // Fail fast if taken
        const exists = await ref.get();
        if (exists.exists) throw new Error("Username is taken. Please choose another.");

        // EXACT allowed fields (Option A rules)
        const payload = {
            uid: user.uid,
            displayName: usernameRaw,
            displayNameLower: usernameLower,
            emailLower: (user.email || "").toLowerCase(),
            photoURL: user.photoURL || null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await ref.set(payload, { merge: false });
    }

    async function ensureUserDoc(user, usernameRaw) {
        const name = (usernameRaw || user.displayName || (user.email || "").split("@")[0] || "Reader").trim();
        const initialLang = browserLang();

        try {
            await (fb.db || firebase.firestore())
                .collection('users').doc(user.uid).set({
                    displayName: name,
                    lang: initialLang,
                    email: user.email || null,
                    photoURL: user.photoURL || null,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
        } catch (e) {
            console.warn("[ensureUserDoc] failed:", e);
        }

        try { localStorage.setItem("pb_lang", initialLang); } catch { }
    }
});
