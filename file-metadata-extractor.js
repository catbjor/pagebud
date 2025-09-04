// file-metadata-extractor.js
(function () {
    "use strict";

    /**
     * Extracts metadata (title, author) and a cover image from a book file (EPUB or PDF).
     * @param {File} file The book file.
     * @returns {Promise<{title: string|null, author: string|null, coverBlob: Blob|null}>}
     */
    async function extractBookMetadata(file) {
        if (!file) return { title: null, author: null, coverBlob: null };

        let title = null;
        let author = null;
        let coverBlob = null;

        // Handle EPUB
        if (/\.epub$/i.test(file.name) && window.ePub) {
            try {
                const ab = await file.arrayBuffer();
                const book = ePub(ab);
                const [metadata, coverPath] = await Promise.all([
                    book.loaded.metadata,
                    book.loaded.cover
                ]);
                title = metadata.title || null;
                author = metadata.creator || null;
                if (coverPath) {
                    coverBlob = await book.archive.blob(coverPath);
                }
            } catch (e) {
                console.warn("Failed to extract data from EPUB", e);
            }
            // Handle PDF
        } else if (/\.pdf$/i.test(file.name) && window.pdfjsLib) {
            try {
                const ab = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
                const { info } = await pdf.getMetadata();
                title = info.Title || null;
                author = info.Author || null;

                const page = await pdf.getPage(1);
                const vp = page.getViewport({ scale: 1.4 });
                const canvas = document.createElement("canvas");
                canvas.width = vp.width; canvas.height = vp.height;
                await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
                coverBlob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.9));
            } catch (e) {
                console.warn("Failed to extract data from PDF", e);
            }
        }

        return { title, author, coverBlob };
    }

    // Expose globally
    window.PB = window.PB || {};
    window.PB.extractBookMetadata = extractBookMetadata;

})();