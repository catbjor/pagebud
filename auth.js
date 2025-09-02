// auth.js
document.addEventListener("DOMContentLoaded", () => {
    const viewLogin = document.getElementById('view-login');
    const viewSignup = document.getElementById('view-signup');
    const toSignupBtn = document.getElementById('toSignup');
    const toLoginBtn = document.getElementById('toLogin');

    const emailEl = document.getElementById("email");
    const passEl = document.getElementById("password");
    const remember = document.getElementById("remember");
    const emailForm = document.getElementById("emailForm");

    const firstNameEl = document.getElementById('firstName');
    const emailCreateEl = document.getElementById('emailCreate');
    const passCreateEl = document.getElementById('passwordCreate');
    const createForm = document.getElementById('createForm');
    const greetingEl = document.getElementById('greeting');
    const forgotLink = document.getElementById('forgotLink');

    function browserLang() {
        const l = (navigator.language || "en").toLowerCase();
        if (l.startsWith("no") || l.startsWith("nb") || l.startsWith("nn")) return "no";
        return "en";
    }

    async function ensureProfile(user, desiredName) {
        const db = fb.db || firebase.firestore();
        let name = (desiredName || user.displayName || "").trim();

        if (!name) {
            try {
                const snap = await db.collection('users').doc(user.uid).get();
                if (snap.exists && snap.data()?.displayName) {
                    name = String(snap.data().displayName).trim();
                }
            } catch { }
        }

        if (!name) {
            const prefix = (user.email || "").split("@")[0] || "Reader";
            name = prefix.charAt(0).toUpperCase() + prefix.slice(1);
        }

        if (!user.displayName || user.displayName !== name) {
            try { await user.updateProfile({ displayName: name }); } catch { }
        }

        const initialLang = browserLang();
        try {
            await db.collection('users').doc(user.uid).set({
                displayName: name,
                lang: initialLang,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } catch { }

        try { localStorage.setItem("pb_lang", initialLang); } catch { }

        return name;
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

    function updateGreeting() {
        const n = (firstNameEl.value || "").trim();
        greetingEl.textContent = n ? randomGreeting(n) : "";
    }

    firstNameEl.addEventListener('input', updateGreeting);

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

    emailForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
            await fb.auth.setPersistence(
                remember?.checked ? firebase.auth.Auth.Persistence.LOCAL
                    : firebase.auth.Auth.Persistence.SESSION
            );
            const cred = await fb.auth.signInWithEmailAndPassword(emailEl.value.trim(), passEl.value);
            await ensureProfile(cred.user);
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

    createForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = (firstNameEl.value || '').trim();
        const email = (emailCreateEl.value || '').trim();
        const pass = passCreateEl.value;
        if (!name) return alert("Please enter your first name.");
        try {
            const cred = await fb.auth.createUserWithEmailAndPassword(email, pass);
            await ensureProfile(cred.user, name);
            location.href = "index.html";
        } catch (err) {
            alert(err.message || "Create account failed");
        }
    });
});
