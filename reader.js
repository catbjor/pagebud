(function () {
    const container = document.getElementById("epub-container");
    const fontSizeSlider = document.getElementById("fontSize");
    const toggleThemeBtn = document.getElementById("toggleTheme");
    const btnBack = document.getElementById("btnBack");

    const readerSettings = JSON.parse(localStorage.getItem("pb:readerSettings") || "{}");
    const currentBook = JSON.parse(localStorage.getItem("pb:currentRead") || "null");

    if (!currentBook?.fileUrl || currentBook.fileType !== "epub") {
        alert("Ingen EPUB-bok funnet.");
        location.href = "index.html";
        return;
    }

    const renditionSettings = {
        flow: "paginated",
        manager: "continuous",
        width: "100%",
        height: "100%",
    };

    let book = ePub(currentBook.fileUrl);
    let rendition = book.renderTo("epub-container", renditionSettings);

    // Apply theme/font size
    const applyReaderStyle = () => {
        const size = readerSettings.fontSize || 100;
        const theme = readerSettings.theme || "light";

        rendition.themes.register("custom", {
            body: {
                "font-size": `${size}%`,
                "background": theme === "dark" ? "#1d1d1d" : "#fff",
                "color": theme === "dark" ? "#eee" : "#111"
            }
        });
        rendition.themes.select("custom");

        document.body.classList.toggle("dark", theme === "dark");
        fontSizeSlider.value = size;
    };

    // Restore position
    book.ready.then(() => {
        const savedLoc = localStorage.getItem("pb:loc:" + currentBook.id);
        if (savedLoc) {
            rendition.display(savedLoc);
        } else {
            rendition.display();
        }
    });

    // Save progress
    rendition.on("relocated", async (loc) => {
        localStorage.setItem("pb:loc:" + currentBook.id, loc.start.cfi);

        try {
            const user = fb.auth.currentUser;
            if (user) {
                await fb.db.collection("users")
                    .doc(user.uid)
                    .collection("books")
                    .doc(currentBook.id)
                    .update({ lastLocation: loc.start.cfi });
            }
        } catch (err) {
            console.warn("❌ Kunne ikke lagre posisjon til Firestore:", err);
        }
    });


    fontSizeSlider.addEventListener("input", () => {
        readerSettings.fontSize = Number(fontSizeSlider.value);
        localStorage.setItem("pb:readerSettings", JSON.stringify(readerSettings));
        applyReaderStyle();
    });

    toggleThemeBtn.addEventListener("click", () => {
        readerSettings.theme = readerSettings.theme === "dark" ? "light" : "dark";
        localStorage.setItem("pb:readerSettings", JSON.stringify(readerSettings));
        applyReaderStyle();
    });

    btnBack.addEventListener("click", () => {
        location.href = "index.html";
    });

    applyReaderStyle();
})();
