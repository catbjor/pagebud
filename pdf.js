pdfjsLib.getDocument(file).promise.then(pdf => {
    pdf.getMetadata().then(({ info }) => {
        if (info.Title) document.getElementById("titleInput").value = info.Title;
        if (info.Author) document.getElementById("authorInput").value = info.Author;
    });

    pdf.getPage(1).then(page => {
        const viewport = page.getViewport({ scale: 1 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        page.render({ canvasContext: context, viewport }).promise.then(() => {
            const dataUrl = canvas.toDataURL("image/png");
            document.getElementById("coverPreview").src = dataUrl;
            document.getElementById("coverDataUrl").value = dataUrl;
        });
    });
});
