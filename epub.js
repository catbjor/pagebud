const file = epubFileInput.files[0];
if (file) {
    const book = ePub(file);
    book.loaded.metadata.then(meta => {
        if (meta.title) document.getElementById("titleInput").value = meta.title;
        if (meta.creator) document.getElementById("authorInput").value = meta.creator;
    });
    book.loaded.cover.then(coverID => {
        return book.archive.getBlob(coverID);
    }).then(blob => {
        const url = URL.createObjectURL(blob);
        document.getElementById("coverPreview").src = url;
        document.getElementById("coverDataUrl").value = url;
    });
}
