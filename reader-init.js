// reader-init.js – load and open book files

document.addEventListener("DOMContentLoaded", () => {
    const auth = (window.fb?.auth ? window.fb.auth() : firebase.auth());

    auth.onAuthStateChanged(user => {
        if (!user) {
            window.location.href = "auth.html";
            return;
        }
        startReader(user);
    });
});

function startReader(user) {
    const params = new URLSearchParams(location.search);
    const bookId = params.get("id");
    if (!bookId) {
        alert("Missing book id");
        return;
    }

    const db = (window.fb?.db || firebase.firestore());
    db.collection("users").doc(user.uid).collection("books").doc(bookId).get()
        .then(snap => {
            if (!snap.exists) {
                alert("Book not found");
                return;
            }
            const d = snap.data();
            const url = d.fileUrl || d.pdfUrl || d.epubUrl;
            const type = d.fileType || (d.pdfUrl ? "pdf" : d.epubUrl ? "epub" : null);
            if (url && type) {
                openBook(url, type);
            } else {
                alert("No file found for this book");
            }
        });
}
